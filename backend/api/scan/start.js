// backend/api/scan/start.js
// Node.js 22 ESM on Vercel
import { Pool } from 'pg';
import { randomUUID as uuid } from 'crypto';
import { splitGapWaitingResting } from '../../src/utils.js';

/** ===== DB ===== */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
const q = async (sql, params) => (await pool.query(sql, params)).rows;

/** ===== CORS (single-origin) ===== */
const ORIGINS =
  (process.env.CORS_ORIGIN ||
    'https://atrbpn-dms.web.app,https://atrbpn-dms.firebaseapp.com,http://localhost:5173')
    .split(',').map(s => s.trim()).filter(Boolean);

function setCors(req, res) {
  const origin = req.headers.origin;
  const allow = origin && ORIGINS.includes(origin) ? origin : (ORIGINS[0] || '*');
  res.setHeader('Access-Control-Allow-Origin', allow); // SATU nilai
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

/** ===== Body parser fallback ===== */
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

/** ===== Helpers ===== */
function json(res, code, payload) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

/** ===== Handler ===== */
export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return json(res, 405, { error: 'Method Not Allowed' });

  try {
    const body = await readJson(req);
    const { documentId, processActivityId, acceptOnly } = body || {};
    if (!documentId) return json(res, 400, { error: 'documentId is required' });

    // Dokumen
    const doc = (await q('select * from documents where id = $1', [documentId]))?.[0];
    if (!doc) return json(res, 404, { error: 'Document not found' });

    // Cek ada scan berjalan?
    const open = (await q(
      `select s.id, s.process_activity_id, coalesce(s.activity_name, pa.name) as activity_name
         from activity_scans s
         left join process_activities pa on pa.id = s.process_activity_id
        where s.document_id = $1 and s.end_time is null
        limit 1`, [documentId]
    ))?.[0];
    if (open && acceptOnly !== true) {
      return json(res, 409, { error: `An activity is already in progress: ${open.activity_name}` });
    }

    // Hitung jumlah scan
    const firstCount = (await q(
      'select count(*)::int as c from activity_scans where document_id=$1', [documentId]
    ))?.[0]?.c ?? 0;
    const isFirst = firstCount === 0;

    /** ===== A) Terima Dokumen ===== */
    if (acceptOnly === true || (isFirst && doc.status === 'OPEN')) {
      const nowIso = new Date().toISOString();
      await q(
        `update documents
            set accepted_at = coalesce(accepted_at, $1),
                status      = 'WAITING'
          where id = $2`,
        [nowIso, documentId]
      );
      return json(res, 200, { initialized: true, status: 'WAITING', acceptedAt: nowIso });
    }

    /** ===== B) Mulai Activity ===== */
    if (doc.status === 'DONE') return json(res, 400, { error: 'Process already DONE' });
    if (open) return json(res, 409, { error: `An activity is already in progress: ${open.activity_name}` });

    // Validasi processActivityId (harus milik proses dokumen)
    if (processActivityId) {
      const pa = (await q('select id, process_id, name from process_activities where id=$1', [processActivityId]))?.[0];
      if (!pa) return json(res, 400, { error: 'Invalid processActivityId' });
      if (doc.process_id && pa.process_id !== doc.process_id) {
        return json(res, 400, { error: 'processActivity does not belong to the document process' });
      }
    }

    // Ambil last completed untuk anchor
    const last = (await q(
      `select end_time
         from activity_scans
        where document_id = $1 and end_time is not null
        order by end_time desc
        limit 1`,
      [documentId]
    ))?.[0];

    // ANCHOR: last.end_time || accepted_at || created_at || now()
    const baseAnchor = last?.end_time || doc.accepted_at || doc.created_at || new Date().toISOString();

    // Hitung waiting/resting berbasis WIB
    const parts = splitGapWaitingResting(new Date(baseAnchor), new Date());
    console.log('[scan/start] anchor=', baseAnchor,
                ' waiting=', parts.waitingSeconds, ' resting=', parts.restingSeconds);

    // Nama aktivitas (opsional)
    let activityName = 'Aktivitas';
    if (processActivityId) {
      const paName = (await q('select name from process_activities where id=$1', [processActivityId]))?.[0]?.name;
      if (paName) activityName = paName;
    }

    // Insert scan
    const newId = uuid();
    const ins = await q(
      `insert into activity_scans
         (id, document_id, process_activity_id, activity_name, waiting_seconds, resting_seconds)
       values ($1,$2,$3,$4,$5,$6)
       returning id, start_time`,
      [newId, documentId, processActivityId || null, activityName, parts.waitingSeconds, parts.restingSeconds]
    );

    // Update status dokumen
    await q('update documents set status = $2 where id = $1', [documentId, 'IN_PROGRESS']);

    return json(res, 200, {
      activityId: ins[0].id,
      startTime: ins[0].start_time,
      waitingSeconds: parts.waitingSeconds,
      restingSeconds: parts.restingSeconds
    });
  } catch (e) {
    console.error('scan/start error', e);
    return json(res, 500, { error: 'Internal Server Error' });
  }
}
