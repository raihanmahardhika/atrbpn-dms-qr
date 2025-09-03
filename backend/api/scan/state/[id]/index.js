// backend/api/scan/state/[id]/index.js
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

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const id = req.query?.id || (req.url.match(/\/state\/([^/]+)/)?.[1]);
  if (!id) {
    res.status(400).json({ error: "Invalid document id" });
    return;
  }

  const client = await pool.connect();
  try {
    // Dokumen + status
    const { rows: docRows } = await client.query(
      `SELECT id, process_id, doc_type, office_type, region, status
       FROM documents WHERE id = $1`,
      [id]
    );
    if (!docRows.length) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    const doc = docRows[0];

    // Cek activity yang berjalan (jika ada)
    const { rows: runningRows } = await client.query(
      `SELECT s.id, s.activity_id, s.start_time
       FROM scans s
       WHERE s.document_id = $1 AND s.end_time IS NULL
       ORDER BY s.start_time DESC
       LIMIT 1`,
      [id]
    );
    let current = null;
    if (runningRows.length) {
      const run = runningRows[0];
      const { rows: act } = await client.query(
        `SELECT id, name, is_decision, decision_accept_label, decision_reject_label
         FROM process_activities WHERE id = $1`,
        [run.activity_id]
      );
      if (act.length) {
        current = {
          id: act[0].id,
          name: act[0].name,
          is_decision: !!act[0].is_decision,
          decision_accept_label: act[0].decision_accept_label || null,
          decision_reject_label: act[0].decision_reject_label || null,
        };
      }
    }

    // Tentukan "next" (untuk status OPEN/WAITING atau setelah selesai activity)
    let next = null;
    if (!current) {
      if (doc.status === "OPEN" || doc.status === "WAITING") {
        // activity pertama
        const { rows: first } = await client.query(
          `SELECT id, name
           FROM process_activities
           WHERE process_id = $1
           ORDER BY order_no ASC
           LIMIT 1`,
          [doc.process_id]
        );
        if (first.length) next = { id: first[0].id, name: first[0].name };
      } else if (doc.status === "IN_PROGRESS") {
        // fallback: cari activity terakhir yang sudah selesai lalu ambil berikutnya
        const { rows: lastDone } = await client.query(
          `SELECT pa.order_no
           FROM scans s
           JOIN process_activities pa ON pa.id = s.activity_id
           WHERE s.document_id = $1 AND s.end_time IS NOT NULL
           ORDER BY s.end_time DESC
           LIMIT 1`,
          [id]
        );
        if (lastDone.length) {
          const order = lastDone[0].order_no;
          const { rows: nx } = await client.query(
            `SELECT id, name
             FROM process_activities
             WHERE process_id = $1 AND order_no > $2
             ORDER BY order_no ASC
             LIMIT 1`,
            [doc.process_id, order]
          );
          if (nx.length) next = { id: nx[0].id, name: nx[0].name };
        }
      }
    }

    // waiting/resting saat ini (informasi ringan; boleh 0)
    let waitingNow = 0;
    let restingNow = 0;

    if (!current && (doc.status === "OPEN" || doc.status === "WAITING")) {
      // dari reception ke start berikutnya => waiting time saat ini tidak dihitung detail (0)
      waitingNow = 0;
    }
    if (current) {
      restingNow = 0;
    }

    // Map status FE
    let stateStatus = "OPEN";
    if (doc.status === "WAITING") stateStatus = "WAITING";
    else if (doc.status === "IN_PROGRESS") stateStatus = current ? "IN_PROGRESS" : "WAITING";
    else if (doc.status === "DONE") stateStatus = "COMPLETED";

    res.json({
      document: {
        id: doc.id,
        doc_type: doc.doc_type,
        office_type: doc.office_type,
        region: doc.region,
      },
      state: {
        status: stateStatus,
        current,
        next,
      },
      waitingNow,
      restingNow,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal error", detail: String(e) });
  } finally {
    client.release();
  }
}
