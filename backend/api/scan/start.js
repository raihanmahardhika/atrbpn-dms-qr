// backend/api/scan/start.js
import pg from "pg";

// ====== CORS helper (inline) ======
function setCors(req, res) {
  const origins = (process.env.CORS_ORIGIN || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  const origin = req.headers.origin || "";
  const allow = origins.length ? origins.includes(origin) : true;

  if (allow) res.setHeader("Access-Control-Allow-Origin", origin || "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "content-type,authorization"
  );
}

// ====== PG pool ======
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.PG_SSL === "true"
      ? { rejectUnauthorized: false }
      : undefined,
});

async function jsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  return await new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const client = await pool.connect();
  try {
    const { documentId, processActivityId, acceptOnly } = await jsonBody(req);
    if (!documentId) {
      res.status(400).json({ error: "documentId is required" });
      return;
    }

    await client.query("BEGIN");

    // Ambil dokumen
    const { rows: docRows } = await client.query(
      `SELECT id, process_id, status FROM documents WHERE id = $1`,
      [documentId]
    );
    if (!docRows.length) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Document not found" });
      return;
    }
    const doc = docRows[0];

    // 1) Terima Dokumen saja (reception)
    if (acceptOnly) {
      // Hanya transisi OPEN -> WAITING (biar tombol "Terima Dokumen" ke "Mulai")
      if (doc.status === "OPEN") {
        await client.query(
          `UPDATE documents SET status = 'WAITING' WHERE id = $1`,
          [documentId]
        );
      }
      await client.query("COMMIT");
      res.json({ initialized: true });
      return;
    }

    // 2) Mulai proses real (start activity)
    // Tentukan activity yang akan dimulai.
    let actId = processActivityId;
    if (!actId) {
      // kalau tidak dikirim, pilih activity pertama (order_no paling kecil) di proses tsb
      const { rows: nextRows } = await client.query(
        `SELECT id
         FROM process_activities
         WHERE process_id = $1
         ORDER BY order_no ASC
         LIMIT 1`,
        [doc.process_id]
      );
      if (!nextRows.length) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "No activities defined for process" });
        return;
      }
      actId = nextRows[0].id;
    }

    // Pastikan tidak ada activity berjalan (end_time IS NULL)
    const { rows: runningRows } = await client.query(
      `SELECT id FROM scans
       WHERE document_id = $1 AND end_time IS NULL
       ORDER BY start_time DESC
       LIMIT 1`,
      [documentId]
    );
    if (runningRows.length) {
      // Sudah ada yang berjalan, tidak boleh start baru
      await client.query("ROLLBACK");
      res.status(409).json({ error: "An activity is already running" });
      return;
    }

    // Hitung waiting time (durasi dari selesai aktivitas terakhir / dari reception)
    // Ambil end_time terakhir (kalau ada)
    const { rows: lastDone } = await client.query(
      `SELECT end_time
       FROM scans
       WHERE document_id = $1 AND end_time IS NOT NULL
       ORDER BY end_time DESC
       LIMIT 1`,
      [documentId]
    );
    let waitingSeconds = 0;
    if (lastDone.length) {
      const lastEnd = new Date(lastDone[0].end_time).getTime();
      waitingSeconds = Math.max(0, Math.floor((Date.now() - lastEnd) / 1000));
    }

    // Mulai activity
    await client.query(
      `INSERT INTO scans (document_id, activity_id, start_time, waiting_seconds, resting_seconds)
       VALUES ($1, $2, NOW(), $3, 0)`,
      [documentId, actId, waitingSeconds]
    );

    // Update status dokumen
    await client.query(
      `UPDATE documents SET status = 'IN_PROGRESS' WHERE id = $1`,
      [documentId]
    );

    await client.query("COMMIT");
    res.json({
      initialized: false,
      startTime: new Date().toISOString(),
      waitingSeconds,
      restingSeconds: 0,
    });
  } catch (e) {
    try { await pool.query("ROLLBACK"); } catch {}
    console.error(e);
    res.status(500).json({ error: "Internal error", detail: String(e) });
  } finally {
    client.release();
  }
}
