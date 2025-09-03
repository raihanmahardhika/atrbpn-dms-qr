// /backend/api/admin/documents/index.js
import db from '../../../src/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { adminId, processId, docType } = await req.json?.() || req.body;
    const { rows: [doc] } = await db.query(
      `INSERT INTO documents (process_id, doc_type, created_by, status)
       VALUES ($1,$2,$3,'OPEN') RETURNING id`,
      [processId, docType, adminId]
    );

    // url QR kamu sudah benar (deep-link ke /documents/:id)
    const qrDownloadUrl = `/api/admin/documents/${doc.id}/qr.png`;
    return res.status(200).json({ id: doc.id, qrDownloadUrl });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'create failed' });
  }
}
