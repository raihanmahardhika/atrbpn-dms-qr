// backend/api/scan/finish.js
import * as DB from '../../src/db.js';

function queryFn() {
  if (typeof DB.query === 'function') return DB.query;
  if (DB.default && typeof DB.default.query === 'function') return DB.default.query.bind(DB.default);
  if (DB.db && typeof DB.db.query === 'function') return DB.db.query.bind(DB.db);
  if (DB.pool && typeof DB.pool.query === 'function') return DB.pool.query.bind(DB.pool);
  if (typeof DB.execute === 'function') return DB.execute;
  return null;
}

const ORIGINS =
  (process.env.CORS_ORIGIN || process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

function setCORS(req, res) {
  const caller = req.headers.origin;
  let allow = '*';
  if (ORIGINS.length === 1) allow = ORIGINS[0];
  else if (caller && ORIGINS.includes(caller)) allow = caller;
  else if (ORIGINS.length > 0) allow = ORIGINS[0];

  res.setHeader('Access-Control-Allow-Origin', allow);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

async function getScanActivityCol(q) {
  const candidates = ['activity_id', 'process_activity_id', 'master_activity_id'];
  const r = await q(
    `select column_name
       from information_schema.columns
      where table_name = 'activity_scans'
        and column_name = any($1::text[])`,
    [candidates]
  );
  return r.rows.length ? r.rows[0].column_name : 'activity_id';
}

export default async function handler(req, res) {
  setCORS(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const q = queryFn();
  if (!q) return res.status(500).json({ error: 'DB adapter not found' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { documentId, activityId, decision } = body; // decision optional ('accept'/'reject') if your flow needs it
    if (!documentId) return res.status(400).json({ error: 'documentId required' });

    const scanCol = await getScanActivityCol(q);

    // resolve the active row to finish
    let cur;
    if (activityId) {
      const r = await q(
        `select *
           from activity_scans
          where document_id = $1
            and ${scanCol} = $2
            and end_time is null
          order by start_time desc
          limit 1`,
        [documentId, activityId]
      );
      cur = r.rows?.[0];
    } else {
      const r = await q(
        `select *
           from activity_scans
          where document_id = $1
            and end_time is null
          order by start_time desc
          limit 1`,
        [documentId]
      );
      cur = r.rows?.[0];
    }

    if (!cur) return res.status(404).json({ error: 'No active activity' });

    // finish it
    const upd = await q(
      `update activity_scans
          set end_time = now(),
              duration_seconds = extract(epoch from (now() - start_time))::int,
              updated_at = now()
        where id = $1
        returning duration_seconds`,
      [cur.id]
    );

    // is there a next activity?
    const doc = await q(`select process_id from documents where id = $1`, [documentId]);
    const processId = doc.rows?.[0]?.process_id;

    const nx = await q(
      `select pa.id
         from process_activities pa
    left join activity_scans s
           on s.${scanCol} = pa.id
          and s.document_id = $1
          and s.end_time is not null
        where pa.process_id = $2
     group by pa.id
       having count(s.id) = 0
     order by pa.order_no asc
        limit 1`,
      [documentId, processId]
    );

    let status = 'DONE';
    if (nx.rows?.length) status = 'WAITING';

    await q(`update documents set status = $2, updated_at = now() where id = $1`, [documentId, status]);

    return res.status(200).json({
      ok: true,
      done: status === 'DONE',
      durationSeconds: upd.rows?.[0]?.duration_seconds ?? null,
      nextStatus: status
    });
  } catch (err) {
    console.error('scan/finish error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
