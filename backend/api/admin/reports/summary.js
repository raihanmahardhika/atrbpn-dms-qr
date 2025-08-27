// Depth: backend/api/admin/reports/summary.js
// -> naik 3x ke backend/, lalu ke src/app.js
import app from '../../../src/app.js';

function setCors(res, origin) {
  const allowList = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (origin && (allowList.length === 0 || allowList.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

export default async function handler(req, res) {
  setCors(res, req.headers.origin);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // Teruskan ke Express (app sudah punya semua rute & middleware)
  return app(req, res);
}
