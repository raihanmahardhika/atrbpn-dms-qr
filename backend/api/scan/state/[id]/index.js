// backend/api/scan/state/[id]/index.js
import * as DB from '../../../../src/db.js';

// --- DB adapter (works with many export shapes)
function queryFn() {
  if (typeof DB.query === 'function') return DB.query;
  if (DB.default && typeof DB.default.query === 'function') return DB.default.query.bind(DB.default);
  if (DB.db && typeof DB.db.query === 'function') return DB.db.query.bind(DB.db);
  if (DB.pool && typeof DB.pool.query === 'function') return DB.pool.query.bind(DB.pool);
  if (typeof DB.execute === 'function') return DB.execute;
  return null;
}

// --- CORS util: allow a single origin from a whitelist
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
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// --- Figure out the foreign key column name in activity_scans
async function getScanActivityCol(q) {
  const candidates = ['activity_id', 'process_activity_id', 'master_activity_id'];
  const r = await q(
    `select column_name
       from information_schema.columns
      where table_name = 'activity_scans'
        and column_name = any($1::text[])`,
    [candidates]
  );
  if (r.rows.length) return r.rows[0].column_name;
  // sensible default
  return 'activity_id';
}

export default async function handler(req, res) {
  setCORS(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const q = queryFn();
  if (!q) {
    console.error('DB adapter not found. Exports =', Object.keys(DB));
    return res.status(500).json({ error: 'DB adapter not found' });
  }

  const { id } = req.query; // document UUID

  try {
    const scanCol = await getScanActivityCol(q); // e.g. "process_activity_id"

    // 1) document + process name + status (if any)
    const docQ = await q(
      `select d.*, p.name as process_name
         from documents d
         left join processes p on p.id = d.process_id
        where d.id = $1`,
      [id]
    );
    const document = docQ.rows?.[0];
    if (!document) return res.status(404).json({ error: 'Document not found' });

    // 2) current active activity (no end_time)
    const activeQ = await q(
      `select s.*,
              pa.name as activity_name,
              pa.is_decision,
              pa.decision_accept_label,
              pa.decision_reject_label,
              s.${scanCol} as activity_id
         from activity_scans s
         join process_activities pa on pa.id = s.${scanCol}
        where s.document_id = $1
          and s.end_time is null
        order by s.start_time desc
        limit 1`,
      [id]
    );
    const active = activeQ.rows?.[0] || null;

    // 3) next activity (first that has no completed row)
    const nextQ = await q(
      `select pa.*
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
      [id, document.process_id]
    );
    const next = nextQ.rows?.[0] || null;

    // 4) waiting seconds since last completed activity
    const lastDoneQ = await q(
      `select end_time
         from activity_scans
        where document_id = $1
          and end_time is not null
        order by end_time desc
        limit 1`,
      [id]
    );
    let waitingNow = 0;
    if (lastDoneQ.rows?.[0]?.end_time) {
      waitingNow = Math.max(
        0,
        Math.floor((Date.now() - new Date(lastDoneQ.rows[0].end_time).getTime()) / 1000)
      );
    }

    // 5) status
    let status = document.status;
    if (!status) {
      if (active) status = 'IN_PROGRESS';
      else if (next) status = 'WAITING';
      else status = 'DONE';
    }

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
