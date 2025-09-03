// /backend/api/scan/finish.js
import db from '../../src/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = await req.json?.() || req.body;
    const { activityId, documentId, decision } = body; // body bisa salah satu: activityId ATAU documentId

    // cari current
    const { rows: [cur] } = await db.query(
      `SELECT s.* FROM scans s
       WHERE s.document_id=$1 AND s.end_time IS NULL
       ORDER BY s.start_time DESC LIMIT 1`,
      [documentId || null]
    );
    if (!cur && !activityId)
      return res.status(400).json({ error:'Tidak ada aktivitas yang berjalan' });

    const curId = activityId || cur?.id;

    // tutup aktivitas
    const { rows: [closed] } = await db.query(
      `UPDATE scans SET end_time=now()
       WHERE id=$1
       RETURNING document_id, activity_id, start_time, end_time`,
      [curId]
    );

    // cari next (mengikuti relasi di tabel master)
    const { rows: [next] } = await db.query(
      `SELECT
         CASE
           WHEN pa.is_decision
             THEN CASE WHEN $2='reject' THEN pa.next_on_reject ELSE pa.next_on_accept END
           ELSE pa.next_on_accept
         END AS next_id
       FROM process_activities pa
       WHERE pa.id=$1`,
      [closed.activity_id, decision || 'accept']
    );

    if (next?.next_id) {
      // Masih ada proses berikutnya ⇒ WAITING
      await db.query(`UPDATE documents SET status='WAITING' WHERE id=$1`, [closed.document_id]);
      return res.status(200).json({ done: false, nextActivityId: next.next_id });
    } else {
      // Tidak ada lanjutan ⇒ DONE
      await db.query(`UPDATE documents SET status='DONE' WHERE id=$1`, [closed.document_id]);
      return res.status(200).json({ done: true });
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'finish failed' });
  }
}
