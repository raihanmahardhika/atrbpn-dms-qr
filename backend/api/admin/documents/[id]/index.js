// /backend/api/admin/documents/index.js
import db from '../../../src/db.js';

/** ====== CORS (single-origin by request) ====== */
const RAW =
  process.env.CORS_ORIGIN ||
  'https://atrbpn-dms.web.app,https://atrbpn-dms.firebaseapp.com,http://localhost:5173';
const ALLOWED = RAW.split(',').map(s => s.trim()).filter(Boolean);

function setCors(req, res) {
  const o = req.headers.origin;
  const allow = (o && ALLOWED.includes(o)) ? o : (ALLOWED[0] || '*'); // SATU nilai saja
  res.setHeader('Access-Control-Allow-Origin', allow);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

/** ====== Safe body parser (Vercel/Node) ====== */
async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (req.body && typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch {}
  }
  if (typeof req.json === 'function') {
    try { return await req.json(); } catch {}
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8') || '';
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

export default async function handler(req, res) {
  setCors(req, res);

  if ((req.method || '').toUpperCase() === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if ((req.method || '').toUpperCase() !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const body = await readJson(req);
    const { adminId, processId, docType } = body || {};

    if (!adminId || !processId) {
      return res.status(400).json({ error: 'adminId & processId are required' });
    }

    const { rows: [doc] } = await db.query(
      `INSERT INTO documents (process_id, doc_type, created_by, status)
       VALUES ($1,$2,$3,'OPEN') RETURNING id`,
      [processId, docType || '', adminId]
    );

    const qrDownloadUrl = `/api/admin/documents/${doc.id}/qr.png`;
    return res.status(200).json({ id: doc.id, qrDownloadUrl });
  } catch (e) {
    console.error('admin/documents create error:', e);
    return res.status(500).json({ error: 'create failed' });
  }
}
