// This ensures ALL methods (incl. OPTIONS) under /api/auth/**
// are routed to your Express app on Vercel.
import app from '../../src/app.js';

export default function handler(req, res) {
  return app(req, res);
}

// optional
// export const config = { runtime: 'nodejs20.x' };
