// backend/api/[...all].js
import app from '../src/app.js';

export default function handler(req, res) {
  // teruskan semua request /api/** ke Express
  return app(req, res);
}

// (opsional) kalau mau batasi durasi:
// export const config = { maxDuration: 10 };
