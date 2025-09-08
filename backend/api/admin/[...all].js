// backend/api/admin/[...all].js
import app from '../../src/app.js';

// allow-list bisa ambil dari ENV; fallback ke dua domain frontend + localhost
const RAW =
  process.env.CORS_ORIGIN ||
  'https://atrbpn-dms.web.app,https://atrbpn-dms.firebaseapp.com,http://localhost:5173';

const ALLOWED = RAW.split(',').map(s => s.trim()).filter(Boolean);

function setCors(req, res) {
  const origin = req.headers.origin;
  const allow = origin && ALLOWED.includes(origin) ? origin : ALLOWED[0] || '*';
  // PENTING: hanya SATU nilai
  res.setHeader('Access-Control-Allow-Origin', allow);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

export default function handler(req, res) {
  setCors(req, res);

  // Preflight dijawab di sini supaya selalu ada ACAO
  if ((req.method || '').toUpperCase() === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  // Teruskan ke Express (app.js sudah punya middleware CORS juga — tidak masalah double)
  return app(req, res);
}
