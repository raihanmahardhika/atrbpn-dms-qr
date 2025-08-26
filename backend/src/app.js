// backend/src/app.js
import express from 'express';
import cors from 'cors';
import router from './routes.js';

const app = express();

// CORS: izinkan domain Firebase kamu
const allow = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : true;

app.use(cors({ origin: allow }));
app.use(express.json({ limit: '2mb' }));

// semua route lama tetap di bawah /api
app.use('/api', router);

export default app;
