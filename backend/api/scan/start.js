// backend/api/scan/start.js
// Node.js 22 on Vercel (ESM)
// npm i pg

import { Pool } from "pg";
import { randomUUID } from "crypto";

/** ====== DB POOL (Neon) ====== **/
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Neon needs SSL
});

/** ====== CORS (single origin by request) ====== **/
const RAW_ORIGINS =
  process.env.CORS_ORIGIN || // boleh comma-separated: "https://a.web.app,https://a.firebaseapp.com"
  process.env.FRONTEND_URL ||
  process.env.WEB_URL ||
  "https://atrbpn-dms.web.app";

const ALLOWED_ORIGINS = RAW_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);

function setCors(req, res) {
  const origin = req.headers.origin;
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  res.setHeader("Access-Control-Allow-Origin", allow); // tepat SATU nilai
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

/** ====== Body Parser (fallback safe) ====== **/
async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (req.body && typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {}
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8") || "";
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** ====== Helpers ====== **/
function json(res, code, payload) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

async function runTx(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw e;
  } finally {
    client.release();
  }
}

/** ====== Core Logic ====== **/
async function handleStart(req, res) {
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return json(res, 405, { error: "Method Not Allowed" });

  const body = (await readJson(req)) || {};
  const { acceptOnly, documentId, processActivityId } = body;

  // Validasi dasar
  if (!documentId) return json(res, 400, { error: "documentId missing" });

  try {
    // Mode 1: Terima Dokumen (OPEN -> WAITING)
    if (acceptOnly === true) {
      const result = await runTx(async (db) => {
        const doc = await db.query(
          "SELECT id, status FROM documents WHERE id = $1",
          [documentId]
        );
        if (doc.rowCount === 0) {
          return { ok: false, code: 404, error: "Document not found" };
        }
        const cur = doc.rows[0];
        if (cur.status !== "OPEN") {
          return {
            ok: false,
            code: 409,
            error: "Invalid state transition: only OPEN can be accepted",
            currentStatus: cur.status,
          };
        }
        const upd = await db.query(
          "UPDATE documents SET status = 'WAITING' WHERE id = $1 RETURNING id, status",
          [documentId]
        );
        return { ok: true, document: upd.rows[0] };
      });

      if (!result.ok) return json(res, result.code, result);
      return json(res, 200, { ok: true, ...result });
    }

    // Mode 2: Mulai Proses (WAITING -> IN_PROGRESS)
    if (!processActivityId) return json(res, 400, { error: "processActivityId missing" });

    const result = await runTx(async (db) => {
      // Ambil dokumen
      const doc = await db.query(
        "SELECT id, status, process_id FROM documents WHERE id = $1",
        [documentId]
      );
      if (doc.rowCount === 0) {
        return { ok: false, code: 404, error: "Document not found" };
      }
      const d = doc.rows[0];

      if (d.status !== "WAITING") {
        return {
          ok: false,
          code: 409,
          error: "Document must be in WAITING to start next activity",
          currentStatus: d.status,
        };
      }

      // Validasi processActivityId milik process yang sama
      const pa = await db.query(
        "SELECT id, process_id FROM process_activities WHERE id = $1",
        [processActivityId]
      );
      if (pa.rowCount === 0) {
        return { ok: false, code: 400, error: "Invalid processActivityId" };
      }
      if (pa.rows[0].process_id !== d.process_id) {
        return {
          ok: false,
          code: 400,
          error: "processActivity does not belong to the document process",
        };
      }

      // Pastikan tidak ada activity yang sedang berjalan (pakai end_time, bukan finished_at)
      const running = await db.query(
        "SELECT id FROM activity_scans WHERE document_id = $1 AND end_time IS NULL LIMIT 1",
        [documentId]
      );
      if (running.rowCount > 0) {
        return {
          ok: false,
          code: 409,
          error: "An activity is already in progress for this document",
        };
      }

      // Catat start activity (set id + start_time sekarang)
      const newId = randomUUID();
      const ins = await db.query(
        "INSERT INTO activity_scans (id, document_id, process_activity_id, start_time) VALUES ($1, $2, $3, now()) RETURNING id",
        [newId, documentId, processActivityId]
      );

      // Update status dokumen
      await db.query("UPDATE documents SET status = 'IN_PROGRESS' WHERE id = $1", [documentId]);

      return {
        ok: true,
        activityScanId: ins.rows[0].id,
        newStatus: "IN_PROGRESS",
      };
    });

    if (!result.ok) return json(res, result.code, result);
    return json(res, 200, { ok: true, ...result });
  } catch (err) {
    console.error("start error", err);
    return json(res, 500, { error: "Internal Server Error" });
  }
}

/** ====== Route Export (this file maps exactly to /api/scan/start) ====== **/
export default async function handler(req, res) {
  setCors(req, res);
  return handleStart(req, res);
}
