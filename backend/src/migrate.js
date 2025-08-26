import { query } from './db.js';
import fs from 'fs'; import path from 'path'; import url from 'url';
const __filename = url.fileURLToPath(import.meta.url); const __dirname = path.dirname(__filename);
const raw = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
await query(raw);
console.log('Migration applied.'); process.exit(0);
