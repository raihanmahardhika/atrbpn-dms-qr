// backend/api/admin/[...all].js
import app from '../../src/app.js';

// whitelist origin
const RAW =
  process.env.CORS_ORIGIN ||
  'https://atrbpn-dms.web.app,https://atrbpn-dms.firebaseapp.com,http://localhost:5173';

const ALLOWED = RAW.split(',').map(s => s.trim()).filter(Boolean);

function setCors(req, res) {
  const o = req.headers.origin;
  const allow = (o && ALLOWED.includes(o)) ? o : (ALLOWED[0] || '*');

  // PENTING: hanya SATU nilai ACAO
  res.setHeader('Access-Control-Allow-Origin', allow);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

export default function handler(req, res) {
  setCors(req, res);

  // preflight short-circuit untuk SEMUA path /api/admin/**
  if ((req.method || '').toUpperCase() === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  // teruskan ke Express app (routes.js)
  return app(req, res);
}
