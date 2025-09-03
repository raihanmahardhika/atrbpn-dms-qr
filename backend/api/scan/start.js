// /backend/api/scan/start.js
import db from '../../src/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const body = await req.json?.() || req.body;
    const { documentId, processActivityId } = body;

    // ada yang masih jalan?
    const { rows: [running] } = await db.query(
      `SELECT id FROM scans WHERE document_id=$1 AND end_time IS NULL
       ORDER BY start_time DESC LIMIT 1`, [documentId]
    );
    if (running) return res.status(400).json({ error:'Masih ada aktivitas berjalan' });

    // a) TERIMA DOKUMEN (tidak ada activityId)
    if (!processActivityId) {
      await db.query(`UPDATE documents SET status='WAITING' WHERE id=$1`, [documentId]);
      return res.status(200).json({ initialized: true });
    }

    // b) MULAI AKTIVITAS
    await db.query(
      `INSERT INTO scans (document_id, activity_id, start_time)
       VALUES ($1,$2,now())`,
      [documentId, processActivityId]
    );
    await db.query(`UPDATE documents SET status='IN_PROGRESS' WHERE id=$1`, [documentId]);

    return res.status(200).json({ started: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'start failed' });
  }
}
