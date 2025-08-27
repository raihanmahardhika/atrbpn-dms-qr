// backend/src/app.js
import express from 'express';
import cors from 'cors';
import router from './routes.js';

const appExpress = express();

// ---- CORS allow list from ENV
const allowList = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : ['*'];

// helper: decide if origin is allowed
const isAllowed = (origin) => {
  if (!origin) return true;                 // non-browser callers
  if (allowList.includes('*')) return true;
  return allowList.includes(origin);
};

// ---- PRE-FLIGHT SHORTCIRCUIT (handles ALL OPTIONS safely)
appExpress.use((req, res, next) => {
  const origin = req.headers.origin;

  if (isAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  // echo back requested headers or provide defaults
  const reqHdr = req.headers['access-control-request-headers'];
  res.setHeader('Access-Control-Allow-Headers', reqHdr || 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    // IMPORTANT: end here so routes aren’t executed
    return res.status(204).end();
  }
  return next();
});

// Keep cors() too (nice for non-OPTIONS)
appExpress.use(cors({
  origin: (origin, cb) => cb(null, isAllowed(origin)),
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));

appExpress.use(express.json({ limit: '2mb' }));

// reply empty for favicon requests
appExpress.get('/favicon.ico', (req, res) => res.status(204).end());

// (optional) tiny logger to see what hits the app in Vercel logs
appExpress.use((req, _res, next) => {
  console.log('[API]', req.method, req.url);
  next();
});

appExpress.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// your app routes (POST /auth/admin/login etc.)
appExpress.use('/api', router);

export default appExpress;
