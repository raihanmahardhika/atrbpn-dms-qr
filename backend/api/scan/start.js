// backend/api/scan/start.js
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

  const { documentId, activityId, acceptOnly } = req.body || {};
  if (!documentId) return res.status(400).json({ error: 'documentId is required' });

  const doc = (await query(
    `select id, process_id, status from documents where id = $1`,
    [documentId]
  ))[0];
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  // 1) Terima Dokumen saja (OPEN -> WAITING)
  if (acceptOnly) {
    await query(`update documents set status = 'WAITING' where id = $1`, [documentId]);
    return res.status(200).json({ ok: true, status: 'WAITING' });
  }

  // 2) tidak boleh start kalau masih ada activity aktif
  const active = (await query(
    `select id from activity_scans where document_id = $1 and end_time is null limit 1`,
    [documentId]
  ))[0];
  if (active) return res.status(409).json({ error: 'There is an active activity' });

  // 3) tentukan activity yang akan dimulai
  let act = null;
  if (activityId) {
    act = (await query(`select id, name, process_id, order_no from process_activities where id = $1`, [activityId]))[0];
  } else {
    // fallback: cari dari last done -> next by order
    const lastDone = (await query(
      `select pa.order_no
         from activity_scans s
         join process_activities pa on pa.id = s.process_activity_id
        where s.document_id = $1 and s.end_time is not null
        order by s.end_time desc limit 1`, [documentId]
    ))[0];
    if (lastDone) {
      act = (await query(
        `select id, name, order_no
           from process_activities
          where process_id = $1 and order_no > $2
          order by order_no asc limit 1`,
        [doc.process_id, lastDone.order_no]
      ))[0];
    } else {
      act = (await query(
        `select id, name, order_no
           from process_activities
          where process_id = $1
          order by order_no asc limit 1`,
        [doc.process_id]
      ))[0];
    }
  }
  if (!act) return res.status(400).json({ error: 'No next activity to start' });

  // 4) insert activity_scans (pakai kolom sesuai skema kamu)
  await query(
    `insert into activity_scans
       (document_id, activity_name, start_time, process_activity_id,
        waiting_seconds, duration_seconds, resting_seconds, next_activity_id)
     values ($1, $2, now(), $3, 0, 0, 0, null)`,
    [documentId, act.name, act.id]
  );

  // 5) dokumen → IN_PROGRESS
  await query(`update documents set status = 'IN_PROGRESS' where id = $1`, [documentId]);

  return res.status(200).json({ ok: true, started: { id: act.id, name: act.name } });
}
