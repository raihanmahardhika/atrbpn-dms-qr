// backend/api/scan/finish.js
import * as DB from '../../src/db.js';

const query =
  (typeof DB.query === 'function' && DB.query) ||
  (DB.default && typeof DB.default.query === 'function' && DB.default.query.bind(DB.default));

/** ===== CORS (single-origin by request) ===== */
const RAW_ORIGINS =
  process.env.CORS_ORIGIN || process.env.FRONTEND_URL || process.env.WEB_URL || 'https://atrbpn-dms.web.app';
const ALLOWED_ORIGINS = RAW_ORIGINS.split(',').map(s => s.trim()).filter(Boolean);

function setCors(req, res) {
  const origin = req.headers.origin;
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', allow);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

/** ===== Body parser ===== */
async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (req.body && typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch {}
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8') || '';
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')  return res.status(405).json({ error: 'Method not allowed' });

  const body = await readJson(req);
  const { documentId, activityId, activityScanId, decision } = body || {};

  if (!documentId && !activityId && !activityScanId) {
    return res.status(400).json({
      error: 'documentId or activityId (process_activity_id / scan id) or activityScanId is required'
    });
  }

  try {
    // 1) paling presisi: activityScanId langsung
    let open = null;
    if (activityScanId) {
      open = (await query(
        `select s.*
           from activity_scans s
          where s.id = $1
            and s.end_time is null
          limit 1`,
        [activityScanId]
      ))?.[0];
    }

    // 2) kalau ada docId & activityId, kencangkan filter
    if (!open && documentId && activityId) {
      open = (await query(
        `select s.*
           from activity_scans s
          where s.document_id = $1
            and s.end_time is null
            and (s.process_activity_id = $2 or s.id = $2)
          order by s.start_time desc
          limit 1`,
        [documentId, activityId]
      ))?.[0];
    }

    // 3) fallback: docId saja (ambil open terakhir)
    if (!open && documentId) {
      open = (await query(
        `select s.*
           from activity_scans s
          where s.document_id = $1
            and s.end_time is null
          order by s.start_time desc
          limit 1`,
        [documentId]
      ))?.[0];
    }

    // 4) fallback: activityId saja (ambigu → cocokkan ke PA id ATAU scan id)
    if (!open && activityId) {
      open = (await query(
        `select s.*
           from activity_scans s
          where (s.process_activity_id = $1 or s.id = $1)
            and s.end_time is null
          order by s.start_time desc
          limit 1`,
        [activityId]
      ))?.[0];
    }

    if (!open) {
      return res.status(404).json({ error: 'No active activity' });
    }

    // Tutup activity & hitung durasi
    const done = await query(
      `update activity_scans
          set end_time = now(),
              duration_seconds = extract(epoch from (now() - start_time))::int
        where id = $1
        returning document_id`,
      [open.id]
    );
    const docId = done?.[0]?.document_id;

    // Tentukan status dokumen berikutnya
    const proc = (await query(
      `select process_id from documents where id = $1`,
      [docId]
    ))?.[0];

    const next = (await query(
      `select pa.id
         from process_activities pa
         left join activity_scans s
           on s.process_activity_id = pa.id
          and s.document_id = $1
          and s.end_time is not null
        where pa.process_id = $2
        group by pa.id, pa.order_index
        having count(s.id) = 0
        order by pa.order_index asc
        limit 1`,
      [docId, proc.process_id]
    ))?.[0];

    await query(
      `update documents set status = $2 where id = $1`,
      [docId, next ? 'WAITING' : 'DONE']
    );

    return res.status(200).json({
      finished: true,
      done: !next,
      durationSeconds: Math.round((Date.now() - new Date(open.start_time).getTime()) / 1000)
    });
  } catch (e) {
    console.error('finish error', e);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
