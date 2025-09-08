// backend/api/admin/[...all].js
import app from '../../src/app.js';

const RAW =
  process.env.CORS_ORIGIN ||
  'https://atrbpn-dms.web.app,https://atrbpn-dms.firebaseapp.com,http://localhost:5173';

const ALLOWED = RAW.split(',').map(s => s.trim()).filter(Boolean);

function setCors(req, res) {
  const origin = req.headers.origin;
  const allow = origin && ALLOWED.includes(origin) ? origin : (ALLOWED[0] || '*');
  res.setHeader('Access-Control-Allow-Origin', allow);     // <- SATU nilai saja
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

export default function handler(req, res) {
  setCors(req, res);

  // Preflight harus diakhiri di sini agar selalu ada header CORS
  if ((req.method || '').toUpperCase() === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  // teruskan ke Express (yang juga punya CORS—tidak masalah)
  return app(req, res);
}
