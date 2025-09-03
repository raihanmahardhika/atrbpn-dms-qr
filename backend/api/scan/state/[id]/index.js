// gunakan pola import yang sama seperti di start.js / finish.js
import db from '../../../../src/db.js'; // <— default export, bukan { pool }

export default async function handler(req, res) {
  // CORS minimal (aman walau ada middleware lain)
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { id } = req.query; // UUID dokumen

  try {
    // 1) Dokumen + nama proses
    const docq = await db.query(
      `SELECT d.*, p.name AS process_name
         FROM documents d
         LEFT JOIN processes p ON p.id = d.process_id
        WHERE d.id = $1`,
      [id]
    );
    const document = docq.rows[0];
    if (!document) return res.status(404).json({ error: 'Document not found' });

    // 2) Activity yang sedang berjalan (belum end_time)
    const activeq = await db.query(
      `SELECT s.*, pa.name AS activity_name,
              pa.is_decision,
              pa.decision_accept_label,
              pa.decision_reject_label
         FROM activity_scans s
         JOIN process_activities pa ON pa.id = s.activity_id
        WHERE s.document_id = $1
          AND s.end_time IS NULL
        ORDER BY s.start_time DESC
        LIMIT 1`,
      [id]
    );
    const active = activeq.rows[0] || null;

    // 3) Aktivitas berikutnya = aktivitas proses yang belum punya baris SELESAI
    const nextq = await db.query(
      `SELECT pa.*
         FROM process_activities pa
         LEFT JOIN activity_scans s
           ON s.activity_id = pa.id
          AND s.document_id = $1
          AND s.end_time IS NOT NULL
        WHERE pa.process_id = $2
        GROUP BY pa.id
        HAVING COUNT(s.id) = 0
        ORDER BY pa.order_no ASC
        LIMIT 1`,
      [id, document.process_id]
    );
    const next = nextq.rows[0] || null;

    // 4) waitingNow = sejak end_time terakhir
    const lastDoneQ = await db.query(
      `SELECT end_time
         FROM activity_scans
        WHERE document_id = $1
          AND end_time IS NOT NULL
        ORDER BY end_time DESC
        LIMIT 1`,
      [id]
    );
    let waitingNow = 0;
    if (lastDoneQ.rows[0]?.end_time) {
      waitingNow = Math.max(
        0,
        Math.floor((Date.now() - new Date(lastDoneQ.rows[0].end_time).getTime()) / 1000)
      );
    }

    // 5) Status dari kolom documents.status (fallback infer)
    let status = document.status;
    if (!status) {
      if (active) status = 'IN_PROGRESS';
      else if (next) status = 'WAITING';
      else status = 'DONE';
    }

    // 6) Payload untuk frontend
    return res.status(200).json({
      document: {
        id: document.id,
        doc_type: document.doc_type,
        office_type: document.office_type,
        region: document.region,
        process_id: document.process_id,
        process_name: document.process_name,
        status
      },
      state: {
        status,
        current: active
          ? {
              id: active.activity_id,
              name: active.activity_name,
              is_decision: !!active.is_decision,
              decision_accept_label: active.decision_accept_label || null,
              decision_reject_label: active.decision_reject_label || null
            }
          : null,
        next: next
          ? {
              id: next.id,
              name: next.name,
              is_decision: !!next.is_decision,
              decision_accept_label: next.decision_accept_label || null,
              decision_reject_label: next.decision_reject_label || null
            }
          : null
      },
      waitingNow,
      restingNow: 0
    });
  } catch (err) {
    console.error('scan/state error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
