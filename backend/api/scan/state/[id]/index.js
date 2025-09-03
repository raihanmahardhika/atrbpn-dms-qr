// backend/api/scan/state/[id]/index.js
import { query } from '../../../../src/db.js';

function ok(res, data) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.status(200).json(data);
}
function bad(res, code, msg) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(code).json({ error: msg });
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'GET') return bad(res, 405, 'Method not allowed');

  const { id } = req.query; // document id

  // 1) ambil dokumen
  const doc = (await query(
    `select id, doc_type, office_type, region, status, process_id
     from documents where id = $1`,
    [id]
  ))[0];
  if (!doc) return bad(res, 404, 'Document not found');

  // 2) aktif (sedang berjalan) & terakhir selesai
  const active = (await query(
    `select s.id, s.activity_name, s.process_activity_id, s.start_time,
            pa.order_no
     from activity_scans s
     join process_activities pa on pa.id = s.process_activity_id
     where s.document_id = $1 and s.end_time is null
     order by s.start_time desc limit 1`,
    [id]
  ))[0] || null;

  const lastDone = (await query(
    `select s.id, s.activity_name, s.process_activity_id, s.end_time,
            pa.order_no
     from activity_scans s
     join process_activities pa on pa.id = s.process_activity_id
     where s.document_id = $1 and s.end_time is not null
     order by s.end_time desc
     limit 1`,
    [id]
  ))[0] || null;

  // 3) hitung next activity (kalau tidak sedang IN_PROGRESS)
  let next = null;
  if (!active && doc.status !== 'DONE') {
    if (lastDone) {
      next = (await query(
        `select id, name
           from process_activities
          where process_id = $1 and order_no > $2
          order by order_no asc limit 1`,
        [doc.process_id, lastDone.order_no]
      ))[0] || null;
    } else {
      // belum ada activity sama sekali → ambil order_no paling kecil
      next = (await query(
        `select id, name
           from process_activities
          where process_id = $1
          order by order_no asc limit 1`,
        [doc.process_id]
      ))[0] || null;
    }
  }

  // 4) flag UI
  const state = {
    document: {
      id: doc.id,
      doc_type: doc.doc_type,
      office_type: doc.office_type,
      region: doc.region,
      status: doc.status,
    },
    current: active ? { id: active.process_activity_id, name: active.activity_name } : null,
    next: next ? { id: next.id, name: next.name } : null,
    showReception: doc.status === 'OPEN',
    showStart: doc.status === 'WAITING',
    showFinish: doc.status === 'IN_PROGRESS',
    showDone: doc.status === 'DONE',
  };

  return ok(res, state);
}
