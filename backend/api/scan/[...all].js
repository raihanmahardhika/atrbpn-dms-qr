import finishHandler from './finish.js';
// ===== CORS (fix) =====
const ALLOWED_ORIGINS = [
  'https://atrbpn-dms.web.app',
  'https://atrbpn-dms.firebaseapp.com',
  'http://localhost:5173', // dev (opsional)
];

function setCors(req, res) {
  const reqOrigin = req.headers.origin;
  // pilih origin yang cocok (satu saja)
  const allow =
    reqOrigin && ALLOWED_ORIGINS.includes(reqOrigin)
      ? reqOrigin
      : ALLOWED_ORIGINS[0]; // fallback utk curl/postman

  res.setHeader('Access-Control-Allow-Origin', allow);
  res.setHeader('Vary', 'Origin'); // penting utk cache/proxy
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

// di handler utama:
export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  // path tanpa query (lebih aman pakai URL)
  const path = new URL(req.url, 'http://x').pathname;

  if (path === '/api/scan/finish') {
    // delegasikan ke handler spesifik finish.js
    return finishHandler(req, res);
  }

  // biarkan /api/scan/start ditangani oleh start.js (route spesifik)
  return res.status(404).json({ error: 'Not Found' });
}