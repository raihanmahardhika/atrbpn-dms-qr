// backend/api/scan/start.js
import * as DB from '../../src/db.js';

// ---- DB adapter (compatible with your db.js export)
function queryFn() {
  if (typeof DB.query === 'function') return DB.query;
  if (DB.default && typeof DB.default.query === 'function') return DB.default.query.bind(DB.default);
  if (DB.db && typeof DB.db.query === 'function') return DB.db.query.bind(DB.db);
  if (DB.pool && typeof DB.pool.query === 'function') return DB.pool.query.bind(DB.pool);
  if (typeof DB.execute === 'function') return DB.execute;
  return null;
}

// ---- CORS (single-origin echo)
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

// ---- detect FK column in activity_scans
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
    const { documentId, processActivityId, acceptOnly } = body;

    if (!documentId) return res.status(400).json({ error: 'documentId required' });

    const scanCol = await getScanActivityCol(q);

    // 1) fetch document
    const d = await q(`select * from documents where id = $1`, [documentId]);
    const doc = d.rows?.[0];
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    // If this is the first “Terima Dokumen”, just mark WAITING and return
    if (acceptOnly) {
      const toStatus = doc.status && doc.status !== 'OPEN' ? doc.status : 'WAITING';
      await q(
        `update documents
            set status = $2,
                received_at = coalesce(received_at, now()),
                updated_at = now()
          where id = $1`,
        [documentId, toStatus]
      );
      return res.status(200).json({ ok: true, accepted: true, status: toStatus });
    }

    // 2) identify next activity if not passed
    let nextId = processActivityId;
    if (!nextId) {
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
        [documentId, doc.process_id]
      );
      nextId = nx.rows?.[0]?.id || null;
    }
    if (!nextId) {
      // No next activity => already done
      await q(`update documents set status = 'DONE', updated_at = now() where id = $1`, [documentId]);
      return res.status(200).json({ ok: true, initialized: false, status: 'DONE' });
    }

    // 3) compute waitingSeconds since last end_time
    const lastDone = await q(
      `select end_time
         from activity_scans
        where document_id = $1
          and end_time is not null
     order by end_time desc
        limit 1`,
      [documentId]
    );
    let waitingSeconds = 0;
    if (lastDone.rows?.[0]?.end_time) {
      waitingSeconds = Math.max(
        0,
        Math.floor((Date.now() - new Date(lastDone.rows[0].end_time).getTime()) / 1000)
      );
    }

    // 4) start the activity
    const ins = await q(
      `insert into activity_scans (document_id, ${scanCol}, start_time, waiting_seconds, created_at)
       values ($1, $2, now(), $3, now())
       returning id, start_time`,
      [documentId, nextId, waitingSeconds]
    );

    // 5) mark doc IN_PROGRESS
    await q(`update documents set status = 'IN_PROGRESS', updated_at = now() where id = $1`, [documentId]);

    return res.status(200).json({
      ok: true,
      initialized: true,
      activityScanId: ins.rows[0].id,
      startTime: ins.rows[0].start_time,
      waitingSeconds
    });
  } catch (err) {
    console.error('scan/start error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
