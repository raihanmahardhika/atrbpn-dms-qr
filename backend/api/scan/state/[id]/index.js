// Adaptor DB yang tahan segala bentuk export dari src/db.js
import * as DB from '../../../../src/db.js';

function resolveQueryFn() {
  // urutan prioritas: named export query → default.query → db.query → pool.query
  if (typeof DB.query === 'function') return DB.query;
  if (DB.default && typeof DB.default.query === 'function') return DB.default.query.bind(DB.default);
  if (DB.db && typeof DB.db.query === 'function') return DB.db.query.bind(DB.db);
  if (DB.pool && typeof DB.pool.query === 'function') return DB.pool.query.bind(DB.pool);
  // beberapa proyek menamai execute
  if (typeof DB.execute === 'function') return DB.execute;
  return null;
}

export default async function handler(req, res) {
  // CORS minimal
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

  const q = resolveQueryFn();
  if (!q) {
    // beri pesan error yang jelas di log
    console.error('DB adapter not found. Exports from src/db.js =', Object.keys(DB));
    return res.status(500).json({ error: 'DB adapter not found' });
  }

  const { id } = req.query; // UUID dokumen

  try {
    // 1) Ambil dokumen + nama proses
    const docq = await q(
      `SELECT d.*, p.name AS process_name
         FROM documents d
         LEFT JOIN processes p ON p.id = d.process_id
        WHERE d.id = $1`,
      [id]
    );
    const document = docq.rows?.[0];
    if (!document) return res.status(404).json({ error: 'Document not found' });

    // 2) Aktivitas yang sedang berjalan (belum end_time)
    const activeq = await q(
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
    const active = activeq.rows?.[0] || null;

    // 3) Aktivitas berikutnya = aktivitas proses yang belum punya baris selesai
    const nextq = await q(
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
    const next = nextq.rows?.[0] || null;

    // 4) waitingNow = detik sejak end_time terakhir
    const lastDoneQ = await q(
      `SELECT end_time
         FROM activity_scans
        WHERE document_id = $1
          AND end_time IS NOT NULL
        ORDER BY end_time DESC
        LIMIT 1`,
      [id]
    );
    let waitingNow = 0;
    if (lastDoneQ.rows?.[0]?.end_time) {
      waitingNow = Math.max(
        0,
        Math.floor((Date.now() - new Date(lastDoneQ.rows[0].end_time).getTime()) / 1000)
      );
    }

    // 5) Status dokumen (pakai kolom documents.status bila ada, jika kosong → infer)
    let status = document.status;
    if (!status) {
      if (active) status = 'IN_PROGRESS';
      else if (next) status = 'WAITING';
      else status = 'DONE';
    }

    // 6) Response untuk frontend
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
