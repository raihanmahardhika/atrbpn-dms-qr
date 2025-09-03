// /backend/api/scan/state/[id]/index.js
import db from '../../../../src/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  try {
    const { id } = req.query || req.params;

    const { rows: [doc] } = await db.query(
      `SELECT d.id, d.doc_type, d.office_type, d.region, d.status, d.process_id
       FROM documents d WHERE d.id=$1`, [id]
    );
    if (!doc) return res.status(404).json({ error:'Not found' });

    // cari current running
    const { rows: [cur] } = await db.query(
      `SELECT s.*, pa.name AS activity_name, pa.is_decision, pa.decision_accept_label, pa.decision_reject_label,
              pa.next_on_accept, pa.next_on_reject
       FROM scans s
       LEFT JOIN process_activities pa ON pa.id = s.activity_id
       WHERE s.document_id=$1 AND s.end_time IS NULL
       ORDER BY s.start_time DESC LIMIT 1`,
      [id]
    );

    // next activity (kalau belum mulai)
    const { rows: [first] } = await db.query(
      `SELECT pa.id, pa.name
       FROM process_activities pa
       WHERE pa.process_id=$1
       ORDER BY pa.order_no ASC
       LIMIT 1`,
      [doc.process_id]
    );

    let next = null;
    if (!cur && doc.status !== 'DONE') {
      next = first ? { id: first.id, name: first.name } : null;
    }

    return res.status(200).json({
      document: {
        id: doc.id,
        doc_type: doc.doc_type,
        office_type: doc.office_type,
        region: doc.region,
        status: doc.status
      },
      state: {
        current: cur ? {
          id: cur.id,
          activityId: cur.activity_id,
          name: cur.activity_name,
          is_decision: cur.is_decision,
          decision_accept_label: cur.decision_accept_label,
          decision_reject_label: cur.decision_reject_label,
          next_on_accept: cur.next_on_accept,
          next_on_reject: cur.next_on_reject
        } : null,
        next
      }
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'state failed' });
  }
}
