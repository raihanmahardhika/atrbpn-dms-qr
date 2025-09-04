// backend/api/scan/start.js
// Runtime: Node.js 22 (ESM)
// npm i pg
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { splitGapWaitingResting } from '../../src/utils.js';

/** ========= DB (Neon) ========= **/
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/** ========= CORS ========= **/
const RAW_ORIGINS =
  process.env.CORS_ORIGIN ||
  process.env.FRONTEND_URL ||
  process.env.WEB_URL ||
  // fallback allow-list (urut penting: pertama jadi default jika origin tak cocok)
  'https://atrbpn-dms.web.app,https://atrbpn-dms.firebaseapp.com,http://localhost:5173';

const ALLOWED = RAW_ORIGINS.split(',').map(s => s.trim()).filter(Boolean);

function setCORS(req, res) {
  const origin = req.headers.origin;
  const allow = origin && ALLOWED.includes(origin) ? origin : (ALLOWED[0] || '*');
  res.setHeader('Access-Control-Allow-Origin', allow); // PENTING: hanya satu nilai
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

/** ========= Utils ========= **/
async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch {}
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8') || '';
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

function json(res, code, payload) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function runTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

/** ========= Handler /api/scan/start ========= **/
async function handleStart(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return json(res, 405, { error: 'Method Not Allowed' });

  const body = await readJson(req);
  const { acceptOnly, documentId, processActivityId } = body || {};

  if (!documentId) return json(res, 400, { error: 'documentId missing' });

  try {
    // ============ MODE: TERIMA DOKUMEN ============
    if (acceptOnly === true) {
      const result = await runTx(async (db) => {
        const dq = await db.query(
          'SELECT id, status, created_at FROM documents WHERE id = $1',
          [documentId]
        );
        if (dq.rowCount === 0) return { ok: false, code: 404, error: 'Document not found' };

        const cur = dq.rows[0];
        // izinkan dari OPEN atau WAITING; tolak selain itu
        if (cur.status !== 'OPEN' && cur.status !== 'WAITING') {
          return {
            ok: false, code: 409,
            error: 'Invalid state to accept',
            currentStatus: cur.status,
          };
        }

        const upd = await db.query(
          `UPDATE documents
              SET status = 'WAITING',
                  created_at = COALESCE(created_at, now())
            WHERE id = $1
        RETURNING id, status, created_at`,
          [documentId]
        );

        return { ok: true, document: upd.rows[0] };
      });

      if (!result.ok) return json(res, result.code, result);
      return json(res, 200, { ok: true, ...result });
    }

    // ============ MODE: MULAI AKTIVITAS ============
    if (!processActivityId) return json(res, 400, { error: 'processActivityId missing' });

    const result = await runTx(async (db) => {
      // Dokumen harus WAITING dan memiliki process_id
      const dq = await db.query(
        'SELECT id, status, process_id, created_at FROM documents WHERE id = $1',
        [documentId]
      );
      if (dq.rowCount === 0) return { ok: false, code: 404, error: 'Document not found' };

      const doc = dq.rows[0];
      if (doc.status !== 'WAITING') {
        return {
          ok: false, code: 409,
          error: 'Document must be in WAITING to start next activity',
          currentStatus: doc.status,
        };
      }

      // Validasi activity milik process yang sama + ambil nama
      const pa = await db.query(
        'SELECT id, process_id, name FROM process_activities WHERE id = $1',
        [processActivityId]
      );
      if (pa.rowCount === 0) return { ok: false, code: 400, error: 'Invalid processActivityId' };
      if (pa.rows[0].process_id !== doc.process_id) {
        return { ok: false, code: 400, error: 'processActivity does not belong to the document process' };
      }
      const activityName = pa.rows[0].name || 'Aktivitas';

      // Pastikan tidak ada activity yang sedang berjalan
      const running = await db.query(
        'SELECT id FROM activity_scans WHERE document_id = $1 AND end_time IS NULL LIMIT 1',
        [documentId]
      );
      if (running.rowCount > 0) {
        return { ok: false, code: 409, error: 'An activity is already in progress for this document' };
      }

      // Ambil end_time terakhir yang selesai (kalau ada)
      const lastDone = await db.query(
        `SELECT end_time
           FROM activity_scans
          WHERE document_id = $1
            AND end_time IS NOT NULL
       ORDER BY end_time DESC
          LIMIT 1`,
        [documentId]
      );
      const baseStart = lastDone.rowCount ? lastDone.rows[0].end_time : (doc.created_at || new Date().toISOString());

      // Hitung waiting/resting WIB (weekday 08-17)
      const parts = splitGapWaitingResting(new Date(baseStart), new Date());
      console.log('[scan/start] gap parts =', { baseStart, waiting: parts.waitingSeconds, resting: parts.restingSeconds });

      // Insert activity scan + set IN_PROGRESS
      const newId = randomUUID();
      const ins = await db.query(
        `INSERT INTO activity_scans
           (id, document_id, process_activity_id, activity_name,
            waiting_seconds, resting_seconds, start_time)
         VALUES ($1, $2, $3, $4, $5, $6, now())
         RETURNING id, start_time`,
        [newId, documentId, processActivityId, activityName, parts.waitingSeconds, parts.restingSeconds]
      );

      await db.query(
        "UPDATE documents SET status = 'IN_PROGRESS' WHERE id = $1",
        [documentId]
      );

      return {
        ok: true,
        activityScanId: ins.rows[0].id,
        startTime: ins.rows[0].start_time,
        waitingSeconds: parts.waitingSeconds,
        restingSeconds: parts.restingSeconds,
        newStatus: 'IN_PROGRESS',
      };
    });

    if (!result.ok) return json(res, result.code, result);
    return json(res, 200, { ok: true, ...result });
  } catch (err) {
    console.error('start error', err);
    return json(res, 500, { error: 'Internal Server Error' });
  }
}

/** ========= Main export ========= **/
export default async function handler(req, res) {
  setCORS(req, res);
  return handleStart(req, res);
}
