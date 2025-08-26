import dotenv from 'dotenv';
import path from 'path';
import url from 'url';
import pg from 'pg';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: (process.env.PG_SSL || 'true') !== 'false' ? { rejectUnauthorized: false } : false
});

try {
  const u = new URL(process.env.DATABASE_URL);
  console.log('[DB] pg tcp ->', u.hostname, u.pathname.slice(1));
} catch {}

export const query = async (text, params = []) => (await pool.query(text, params));
