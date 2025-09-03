// backend/api/scan/finish.js
import * as DB from '../../src/db.js';

const query =
  (typeof DB.query === 'function' && DB.query) ||
  (DB.default && typeof DB.default.query === 'function' && DB.default.query.bind(DB.default));

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN?.split(',')[0] || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { cors(res); return res.status(204).end(); }
  if (req.method !== 'POST')  { cors(res); return res.status(405).json({ error: 'Method not allowed' }); }
  cors(res);

  const { documentId, activityId, decision } = req.body || {};
  if (!documentId && !activityId) {
    return res.status(400).json({ error: 'documentId or activityId is required' });
  }

  // Find the open scan row
  const open = (await query(
    `select s.*
       from activity_scans s
      where ( $1::uuid is not null and s.document_id = $1 )
         or ( $2::uuid is not null and s.process_activity_id = $2 )
        and s.end_time is null
      order by s.start_time desc
      limit 1`,
    [documentId || null, activityId || null]
  ))[0];

  if (!open) return res.status(404).json({ error: 'No active activity' });

  // Close it and compute duration (seconds)
  const done = await query(
    `update activity_scans
        set end_time = now(),
            duration_seconds = extract(epoch from (now() - start_time))::int
      where id = $1
      returning document_id`,
    [open.id]
  );
  const docId = done?.[0]?.document_id;

  // After closing, decide overall doc status:
  // if there is still a next (uncompleted) activity -> WAITING, else DONE
  const docRow = (await query(`select process_id from documents where id = $1`, [docId]))[0];

  const next = (await query(
    `select pa.id
       from process_activities pa
       left join activity_scans s
         on s.process_activity_id = pa.id
        and s.document_id = $1
        and s.end_time is not null
      where pa.process_id = $2
      group by pa.id
      having count(s.id) = 0
      order by pa.order_no asc
      limit 1`,
    [docId, docRow.process_id]
  ))[0];

  await query(
    `update documents set status = $2 where id = $1`,
    [docId, next ? 'WAITING' : 'DONE']
  );

  return res.status(200).json({
    finished: true,
    done: !next,
    durationSeconds: Math.round((Date.now() - new Date(open.start_time).getTime()) / 1000)
  });
}
