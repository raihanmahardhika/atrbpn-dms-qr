import express from 'express';
import cors from 'cors';
import router from './routes.js';

const appExpress = express();

const allow = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : true;

appExpress.use(cors({
  origin: allow,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));
appExpress.options('*', cors({ origin: allow })); // preflight

appExpress.use(express.json({ limit: '2mb' }));

appExpress.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));
appExpress.use('/api', router);

export default appExpress;
