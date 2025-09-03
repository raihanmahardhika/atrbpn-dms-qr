// backend/api/scan/finish.js
import { query } from '../../src/db.js';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { cors(res); return res.status(204).end(); }
  if (req.method !== 'POST') { cors(res); return res.status(405).json({ error: 'Method not allowed' }); }
  cors(res);

  const { documentId } = req.body || {};
  if (!documentId) return res.status(400).json({ error: 'documentId is required' });

  // Ambil dokumen
  const doc = (await query(
    `select id, process_id from documents where id = $1`,
    [documentId]
  ))[0];
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  // Ambil activity yang masih aktif
  const cur = (await query(
    `select s.id, s.start_time, s.process_activity_id, s.activity_name, pa.order_no
       from activity_scans s
       join process_activities pa on pa.id = s.process_activity_id
      where s.document_id = $1 and s.end_time is null
      order by s.start_time desc
      limit 1`,
    [documentId]
  ))[0];

  if (!cur) return res.status(409).json({ error: 'No active activity' });

  // Hitung durasi (detik)
  const { sec: durationSeconds } = (await query(
    `select extract(epoch from (now() - $1))::int as sec`,
    [cur.start_time]
  ))[0];

  // Tentukan next activity berdasarkan order_no
  const next = (await query(
    `select id, name
       from process_activities
      where process_id = $1 and order_no > $2
      order by order_no asc
      limit 1`,
    [doc.process_id, cur.order_no]
  ))[0] || null;

  // Tutup activity aktif
  await query(
    `update activity_scans
        set end_time = now(),
            duration_seconds = $1,
            next_activity_id = $2
      where id = $3`,
    [durationSeconds, next ? next.id : null, cur.id]
  );

  // Update status dokumen
  if (next) {
    await query(`update documents set status = 'WAITING' where id = $1`, [documentId]);
  } else {
    await query(`update documents set status = 'DONE' where id = $1`, [documentId]);
  }

  return res.status(200).json({
    finished: true,
    activity: { id: cur.process_activity_id, name: cur.activity_name },
    durationSeconds,
    next: next ? { id: next.id, name: next.name } : null,
    done: !next
  });
}
