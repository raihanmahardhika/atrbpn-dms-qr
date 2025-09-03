// backend/api/scan/start.js
import * as DB from '../../src/db.js';

// Works whether you export {query} or default.query from src/db.js
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

  const { documentId, processActivityId, acceptOnly } = req.body || {};
  if (!documentId) return res.status(400).json({ error: 'documentId is required' });

  // Fetch document
  const docRows = await query(`select id, process_id, status from documents where id = $1`, [documentId]);
  const doc = docRows?.[0];
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  // Only "Terima Dokumen" — mark as WAITING and exit
  if (acceptOnly) {
    await query(`update documents set status = 'WAITING' where id = $1`, [documentId]);
    return res.status(200).json({ initialized: true, status: 'WAITING' });
  }

  // Don’t start if there’s still an open scan row
  const hasActive = (await query(
    `select id from activity_scans where document_id = $1 and end_time is null limit 1`,
    [documentId]
  ))[0];
  if (hasActive) return res.status(409).json({ error: 'There is an active activity' });

  // Decide which activity to start
  let act = null;

  if (processActivityId) {
    act = (await query(
      `select id, name, order_no from process_activities where id = $1`,
      [processActivityId]
    ))[0];
  } else {
    // Start the very first not-yet-completed activity (by order_no)
    act = (await query(
      `select pa.id, pa.name, pa.order_no
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
      [documentId, doc.process_id]
    ))[0];
  }

  if (!act) return res.status(400).json({ error: 'No next activity to start' });

  // Insert into activity_scans (NO created_at in your table)
  await query(
    `insert into activity_scans
       (document_id, process_activity_id, activity_name, start_time,
        waiting_seconds, duration_seconds, resting_seconds, next_activity_id)
     values ($1, $2, $3, now(), 0, 0, 0, null)`,
    [documentId, act.id, act.name]
  );

  // Put document into IN_PROGRESS
  await query(`update documents set status = 'IN_PROGRESS' where id = $1`, [documentId]);

  return res.status(200).json({
    started: true,
    activity: { id: act.id, name: act.name },
    startTime: new Date().toISOString(),
    waitingSeconds: 0,
    restingSeconds: 0
  });
}
