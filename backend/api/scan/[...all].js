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

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  // ... routing /api/scan/start, /api/scan/state/:id, dst
}
