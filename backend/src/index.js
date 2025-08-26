import dns from 'node:dns';
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import router from './routes.js';
import './db.js';

dotenv.config();
const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*' }));
app.use(express.json({ limit: '2mb' }));

app.use('/api', router);

const port = process.env.PORT || 4000;
app.listen(port, () => console.log('Backend listening on http://localhost:' + port));
