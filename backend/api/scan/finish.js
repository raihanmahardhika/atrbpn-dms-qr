// backend/api/scan/finish.js
import pg from "pg";

// ====== CORS helper ======
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
    const { activityId, documentId, decision } = await jsonBody(req);
    if (!activityId && !documentId) {
      res.status(400).json({ error: "activityId or documentId is required" });
      return;
    }

    await client.query("BEGIN");

    // Temukan scan yang sedang berjalan
    let running;
    if (activityId) {
      const { rows } = await client.query(
        `SELECT s.*, d.process_id
         FROM scans s
         JOIN documents d ON d.id = s.document_id
         WHERE s.id = $1`,
        [activityId]
      );
      if (!rows.length) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Activity not found" });
        return;
      }
      running = rows[0];
      if (running.end_time) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "Activity already finished" });
        return;
      }
    } else {
      // cari scan yang belum selesai untuk dokumen tsb
      const { rows } = await client.query(
        `SELECT s.*, d.process_id
         FROM scans s
         JOIN documents d ON d.id = s.document_id
         WHERE s.document_id = $1 AND s.end_time IS NULL
         ORDER BY s.start_time DESC
         LIMIT 1`,
        [documentId]
      );
      if (!rows.length) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "No running activity for document" });
        return;
      }
      running = rows[0];
    }

    // Tutup aktivitas
    const startTs = new Date(running.start_time).getTime();
    const durationSeconds = Math.max(0, Math.floor((Date.now() - startTs) / 1000));

    await client.query(
      `UPDATE scans
       SET end_time = NOW(), duration_seconds = $1
       WHERE id = $2`,
      [durationSeconds, running.id]
    );

    // Tentukan next activity (pakai urutan default; kalau kamu memakai branching decision via kolom next_on_* tinggal aktifkan bagian itu)
    const { rows: curInfo } = await client.query(
      `SELECT pa.id, pa.process_id, pa.order_no, pa.is_decision,
              pa.next_on_accept, pa.next_on_reject
       FROM process_activities pa
       WHERE pa.id = $1`,
      [running.activity_id]
    );
    const cur = curInfo[0];

    let nextActivityId = null;

    // 1) Jika ada branching decision & decision dikirim
    if (cur && cur.is_decision && decision) {
      if (decision === "accept" && cur.next_on_accept) nextActivityId = cur.next_on_accept;
      if (decision === "reject" && cur.next_on_reject) nextActivityId = cur.next_on_reject;
    }

    // 2) Kalau belum dapat, pakai urutan default (order_no berikutnya)
    if (!nextActivityId && cur) {
      const { rows: nextRows } = await client.query(
        `SELECT id
         FROM process_activities
         WHERE process_id = $1 AND order_no > $2
         ORDER BY order_no ASC
         LIMIT 1`,
        [cur.process_id, cur.order_no]
      );
      if (nextRows.length) nextActivityId = nextRows[0].id;
    }

    // Update status dokumen
    if (nextActivityId) {
      // Masuk kembali ke WAITING agar tombol di FE berubah jadi "Mulai"
      await client.query(
        `UPDATE documents SET status = 'WAITING' WHERE id = $1`,
        [running.document_id]
      );
      await client.query("COMMIT");
      res.json({ durationSeconds, done: false });
    } else {
      // Tidak ada kelanjutan -> DONE
      await client.query(
        `UPDATE documents SET status = 'DONE' WHERE id = $1`,
        [running.document_id]
      );
      await client.query("COMMIT");
      res.json({ durationSeconds, done: true });
    }
  } catch (e) {
    try { await pool.query("ROLLBACK"); } catch {}
    console.error(e);
    res.status(500).json({ error: "Internal error", detail: String(e) });
  } finally {
    client.release();
  }
}
