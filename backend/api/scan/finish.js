// backend/api/scan/state/[id]/index.js
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
const q = async (sql, params) => (await pool.query(sql, params)).rows;

/** ===== CORS ===== */
const RAW_ORIGINS =
  process.env.CORS_ORIGIN || process.env.FRONTEND_URL || process.env.WEB_URL || 'https://atrbpn-dms.web.app';
const ALLOWED = RAW_ORIGINS.split(',').map(s => s.trim()).filter(Boolean);
function setCORS(req, res) {
  const origin = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin', ALLOWED.includes(origin) ? origin : ALLOWED[0]);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function json(res, code, payload) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  setCORS(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return json(res, 405, { error: 'Method Not Allowed' });

  // Ambil :id aman di serverless
  const id = new URL(req.url, 'http://x').pathname.split('/').pop();

  try {
    // Dokumen
    const doc = (await q(
      `select d.id, d.doc_type, d.office_type, d.region, d.process_id, d.status,
              p.name as process_name
         from documents d
         left join processes p on p.id = d.process_id
        where d.id = $1`,
      [id]
    ))?.[0];
    if (!doc) return json(res, 404, { error: 'Document not found' });

    // Current activity (end_time is null)
    const cur = (await q(
      `select s.id as scan_id,
              s.process_activity_id as activity_id,
              coalesce(s.activity_name, pa.name) as name,
              pa.is_decision,
              pa.decision_accept_label,
              pa.decision_reject_label,
              s.start_time
         from activity_scans s
         left join process_activities pa on pa.id = s.process_activity_id
        where s.document_id = $1
          and s.end_time is null
        order by s.start_time desc
        limit 1`,
      [id]
    ))?.[0] ?? null;

    // Next activity (yang belum completed), urut pakai order_no
    const next = (await q(
      `select pa.id, pa.name, pa.is_decision, pa.decision_accept_label, pa.decision_reject_label
         from process_activities pa
         left join activity_scans s
           on s.process_activity_id = pa.id
          and s.document_id = $1
          and s.end_time is not null
        where pa.process_id = $2
        group by pa.id, pa.name, pa.is_decision, pa.decision_accept_label, pa.decision_reject_label, pa.order_no
        having count(s.id) = 0
        order by pa.order_no asc
        limit 1`,
      [id, doc.process_id]
    ))?.[0] ?? null;

    // Waiting seconds sejak last completed
    const lastDone = (await q(
      `select end_time
         from activity_scans
        where document_id = $1
          and end_time is not null
        order by end_time desc
        limit 1`,
      [id]
    ))?.[0];
    const waitingNow = lastDone?.end_time
      ? Math.max(0, Math.floor((Date.now() - new Date(lastDone.end_time).getTime()) / 1000))
      : 0;

    // Status
    let status = doc.status;
    if (!status) {
      if (cur) status = 'IN_PROGRESS';
      else if (next) status = 'WAITING';
      else status = 'DONE';
    }

    return json(res, 200, {
      document: {
        id: doc.id,
        doc_type: doc.doc_type,
        office_type: doc.office_type,
        region: doc.region,
        process_id: doc.process_id,
        process_name: doc.process_name,
        status
      },
      state: {
        status,
        current: cur
          ? {
              id: cur.activity_id,
              scan_id: cur.scan_id,
              name: cur.name,
              is_decision: !!cur.is_decision,
              decision_accept_label: cur.decision_accept_label || null,
              decision_reject_label: cur.decision_reject_label || null
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
    console.error('state error', err);
    return json(res, 500, { error: 'Internal Server Error' });
  }
}
