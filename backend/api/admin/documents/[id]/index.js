import app from "../../../../src/app.js";

function setCors(res, origin) {
  const allow = (process.env.CORS_ORIGIN || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  if (origin && (allow.length === 0 || allow.includes(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
}

export default async function handler(req, res) {
  setCors(res, req.headers.origin);
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  return app(req, res);
}