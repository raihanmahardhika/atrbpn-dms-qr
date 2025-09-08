// backend/src/routes.js
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from './db.js';
import QRCode from 'qrcode';
import { splitGapWaitingResting } from './utils.js';

const router = express.Router();

/* ===================== Helpers ======================= */

async function getActivities(processId) {
  const r = await query(`
    SELECT id,name,order_no,is_decision,
           decision_accept_label, decision_reject_label,
           next_on_accept, next_on_reject
    FROM process_activities
    WHERE process_id=$1
    ORDER BY order_no ASC
  `,[processId]);
  return r.rows;
}
async function getLastCompletedScan(documentId) {
  const r = await query(`
    SELECT s.*, pa.name, pa.order_no, pa.is_decision, pa.process_id,
           pa.decision_accept_label, pa.decision_reject_label,
           pa.next_on_accept, pa.next_on_reject
    FROM activity_scans s
    LEFT JOIN process_activities pa ON pa.id=s.process_activity_id
    WHERE s.document_id=$1 AND s.end_time IS NOT NULL
    ORDER BY s.end_time DESC LIMIT 1
  `, [documentId]);
  return r.rowCount ? r.rows[0] : null;
}
async function getOpenScan(documentId) {
  const r = await query(`
    SELECT s.*, pa.name, pa.order_no, pa.is_decision, pa.process_id,
           pa.decision_accept_label, pa.decision_reject_label,
           pa.next_on_accept, pa.next_on_reject
    FROM activity_scans s
    LEFT JOIN process_activities pa ON pa.id=s.process_activity_id
    WHERE s.document_id=$1 AND s.end_time IS NULL
    ORDER BY s.start_time DESC LIMIT 1
  `,[documentId]);
  return r.rowCount ? r.rows[0] : null;
}
async function computeNextExpected(document) {
  if (document.status === 'DONE') return { status: 'COMPLETED' };

  const open = await getOpenScan(document.id);
  if (open) return { status:'IN_PROGRESS', current: open };

  const last = await getLastCompletedScan(document.id);
  const acts = document.process_id ? await getActivities(document.process_id) : [];
  let nextAct = null;

  if (!last) {
    nextAct = acts[0] || null;
  } else if (last.next_activity_id) {
    nextAct = acts.find(a => a.id === last.next_activity_id) || null;
  } else {
    const idx = acts.findIndex(a => a.id === last.process_activity_id);
    nextAct = idx >= 0 && idx + 1 < acts.length ? acts[idx+1] : null;
  }

  if (!nextAct && last) return { status: 'COMPLETED', last, activities: acts };
  return { status: 'READY', next: nextAct, activities: acts, last };
}

/* ===================== Basic routes ======================= */

router.get('/health', (_req,res) => res.json({ok:true,time:new Date().toISOString()}));

router.post('/auth/admin/login', async (req,res) => {
  try {
    const { adminId } = req.body;
    if (!adminId) return res.status(400).json({error:'adminId is required'});
    const r = await query('SELECT admin_id,name,office_type,region FROM admins WHERE admin_id=$1',[adminId]);
    if (r.rowCount === 0) return res.status(404).json({error:'Admin ID not found'});
    res.json(r.rows[0]);
  } catch(e){ console.error(e); res.status(500).json({error:'Login failed'}); }
});

router.get('/admin/processes', async (_req,res)=>{
  const r = await query('SELECT id, code, name FROM processes ORDER BY name ASC');
  res.json(r.rows);
});

router.post('/admin/documents', async (req,res)=>{
  try{
    const { adminId, docType, processId } = req.body;
    if (!adminId) return res.status(400).json({error:'adminId is required'});

    const a = await query('SELECT office_type,region FROM admins WHERE admin_id=$1',[adminId]);
    if (a.rowCount === 0) return res.status(400).json({error:'Admin not found'});
    const { office_type, region } = a.rows[0];

    let pid = processId;
    if (!pid && docType) {
      const p = await query('SELECT id FROM processes WHERE name=$1 OR code=$1',[docType]);
      if (p.rowCount) pid = p.rows[0].id;
    }
    if (!pid) return res.status(400).json({error:'processId/docType is required'});

    const id = uuidv4();
    await query(
      'INSERT INTO documents (id,process_id,doc_type,office_type,region) VALUES ($1,$2,$3,$4,$5)',
      [id, pid, docType || '', office_type, region]
    );

    res.json({
      id,
      docType,
      processId: pid,
      officeType: office_type,
      region,
      qrDownloadUrl:`/admin/documents/${id}/qr.png`
    });
  } catch(e){ console.error(e); res.status(500).json({error:'Failed to create document'}); }
});

router.get('/admin/documents/:id/qr.png', async (req, res) => {
  try {
    const { id } = req.params;

    // (opsional) validasi id di DB
    // const doc = await query('select id from documents where id = $1', [id]);
    // if (doc.rowCount === 0) return res.status(404).send('document not found');

    const png = await QRCode.toBuffer(id, {
      type: 'png',
      margin: 1,
      width: 512,
      errorCorrectionLevel: 'M',
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(png);
  } catch (err) {
    console.error('[qr.png] error', err);
    return res.status(500).send('failed to generate qr');
  }
});

/* ===================== Scan State/Start/Finish ======================= */

router.get('/scan/state/:documentId', async (req,res)=>{
  try{
    const docq = await query('SELECT * FROM documents WHERE id=$1',[req.params.documentId]);
    if (docq.rowCount === 0) return res.status(404).json({error:'Document not found'});

    const doc = docq.rows[0];
    const state = await computeNextExpected(doc);

    let waitingNow = 0, restingNow = 0;
    if (state.status === 'READY') {
      if (state.last) {
        const parts = splitGapWaitingResting(new Date(state.last.end_time), new Date());
        waitingNow = parts.waitingSeconds; restingNow = parts.restingSeconds;
      } else if (doc.created_at) {
        const parts = splitGapWaitingResting(new Date(doc.created_at), new Date());
        waitingNow = parts.waitingSeconds; restingNow = parts.restingSeconds;
      }
    }
    res.json({
      document: doc,
      state,
      waitingNow,
      restingNow,
      activities: doc.process_id ? await getActivities(doc.process_id) : []
    });
  } catch(e){ console.error(e); res.status(500).json({error:'Failed to get state'}); }
});

router.post('/scan/start', async (req, res) => {
  try {
    const { documentId, processActivityId, acceptOnly } = req.body || {};
    if (!documentId) return res.status(400).json({ error: 'documentId is required' });

    const dq = await query('SELECT * FROM documents WHERE id=$1', [documentId]);
    if (dq.rowCount === 0) return res.status(404).json({ error: 'Document not found' });
    const doc = dq.rows[0];

    // ==== A) TERIMA DOKUMEN ====
    // - Ekspisit: acceptOnly === true  (klik tombol "Terima Dokumen")
    // - Implisit: dokumen masih OPEN & belum ada activity => jadikan WAITING
    const count = await query('SELECT COUNT(*)::int c FROM activity_scans WHERE document_id=$1', [documentId]);
    const isFirstDoc = count.rows[0].c === 0;

    if (acceptOnly === true || (isFirstDoc && doc.status === 'OPEN')) {
      const nowIso = new Date().toISOString();
      await query(
        'UPDATE documents SET accepted_at=$1, status=$2 WHERE id=$3',
        [nowIso, 'WAITING', documentId]
      );
      return res.json({ initialized: true, status: 'WAITING', acceptedAt: nowIso });
    }

    // ==== B) Mulai Activity ====
    if (doc.status === 'DONE') return res.status(400).json({ error: 'Proses sudah selesai' });

    const open = await getOpenScan(documentId);
    if (open) return res.status(400).json({ error: `Masih ada aktivitas berjalan: ${open.activity_name}` });

    const comp = await computeNextExpected(doc);
    if (comp.status === 'COMPLETED') return res.status(400).json({ error: 'Proses sudah selesai' });
    const expected = comp.next ? comp.next.id : null;

    if (!expected && !processActivityId) {
      return res.status(400).json({ error: 'Tidak ada aktivitas berikutnya' });
    }
    if (doc.process_id && expected && processActivityId && processActivityId !== expected) {
      return res.status(400).json({ error: 'Aktivitas tidak sesuai urutan proses' });
    }

    const useActId = processActivityId || expected;

    let activityName = 'Aktivitas';
    if (useActId) {
      const a = await query('SELECT name FROM process_activities WHERE id=$1', [useActId]);
      activityName = a.rowCount ? a.rows[0].name : activityName;
    }

    // === ANCHOR GAP:
    // - Kalau sudah ada activity selesai => pakai end_time terakhir
    // - Kalau belum ada => pakai accepted_at (bukan created_at)
    const last = comp.last;
    const baseAnchor = last?.end_time || doc.accepted_at || doc.created_at;
    if (!baseAnchor) {
      // fallback terakir—mestinya tak terjadi kalau sudah klik "Terima"
      console.warn('[scan/start] missing anchor; using now() as accepted_at');
      await query('UPDATE documents SET accepted_at = now() WHERE id = $1 AND accepted_at IS NULL', [documentId]);
    }

    const parts = splitGapWaitingResting(new Date(baseAnchor || new Date()), new Date());
    console.log('[scan/start] anchor=', baseAnchor, ' waiting=', parts.waitingSeconds, ' resting=', parts.restingSeconds);

    const id = uuidv4();
    const ins = await query(
      `INSERT INTO activity_scans
         (id, document_id, process_activity_id, activity_name, waiting_seconds, resting_seconds)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, start_time`,
      [id, documentId, useActId, activityName, parts.waitingSeconds, parts.restingSeconds]
    );

    // Status dokumen saat ada activity berjalan
    await query('UPDATE documents SET status=$1 WHERE id=$2', ['IN_PROGRESS', documentId]);

    res.json({
      activityId: ins.rows[0].id,
      startTime: ins.rows[0].start_time,
      waitingSeconds: parts.waitingSeconds,
      restingSeconds: parts.restingSeconds
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to start activity' });
  }
});

router.post('/scan/finish', async (req,res)=>{
  try{
    const { activityId, documentId, nextProcessActivityId, decision } = req.body;
    let t;

    if (activityId) {
      t = await query(`
        SELECT s.*, pa.is_decision, pa.next_on_accept, pa.next_on_reject, pa.process_id, pa.order_no
        FROM activity_scans s
        LEFT JOIN process_activities pa ON pa.id=s.process_activity_id
        WHERE s.id=$1`,[activityId]);
    } else if (documentId) {
      t = await query(`
        SELECT s.*, pa.is_decision, pa.next_on_accept, pa.next_on_reject, pa.process_id, pa.order_no
        FROM activity_scans s
        LEFT JOIN process_activities pa ON pa.id=s.process_activity_id
        WHERE s.document_id=$1 AND s.end_time IS NULL
        ORDER BY s.start_time DESC LIMIT 1`,[documentId]);
    } else {
      return res.status(400).json({error:'Provide activityId or documentId'});
    }

    if (t.rowCount === 0) return res.status(404).json({error:'Open activity not found'});

    const row = t.rows[0];
    const end = new Date();
    const duration = Math.round((end - new Date(row.start_time))/1000);

    let setDone = false;

    if (row.is_decision) {
      let mappedNext = null;
      if (decision === 'accept' && row.next_on_accept) mappedNext = row.next_on_accept;
      if (decision === 'reject' && row.next_on_reject) mappedNext = row.next_on_reject;

      const finalNext = nextProcessActivityId || mappedNext;
      await query(
        'UPDATE activity_scans SET end_time=$1, duration_seconds=$2, next_activity_id=$3 WHERE id=$4',
        [end.toISOString(), duration, finalNext || null, row.id]
      );
      if (!finalNext) setDone = true; // tidak ada langkah lanjut → selesai
    } else {
      await query(
        'UPDATE activity_scans SET end_time=$1, duration_seconds=$2 WHERE id=$3',
        [end.toISOString(), duration, row.id]
      );
      const cnt = await query(
        'SELECT COUNT(*)::int c FROM process_activities WHERE process_id=$1 AND order_no > $2',
        [row.process_id, row.order_no]
      );
      if (cnt.rows[0].c === 0) setDone = true;
    }

    if (setDone) {
      await query('UPDATE documents SET status=$1 WHERE id=$2', ['DONE', row.document_id]);
    } else {
      // belum selesai keseluruhan proses → kembali ke fase menunggu
      await query('UPDATE documents SET status=$1 WHERE id=$2', ['WAITING', row.document_id]);
    }


    res.json({
      activityId: row.id,
      endTime: end.toISOString(),
      durationSeconds: duration,
      done: setDone
    });
  } catch(e){
    console.error(e);
    res.status(500).json({error:'Failed to finish activity'});
  }
});

/* ===================== Admin Document Detail ======================= */

router.get('/admin/documents/:id', async (req,res)=>{
  const doc = await query(`
    SELECT d.*, p.name as process_name, p.code as process_code
      FROM documents d
 LEFT JOIN processes p ON p.id=d.process_id
     WHERE d.id=$1`,
    [req.params.id]
  );
  if (doc.rowCount === 0) return res.status(404).json({error:'Document not found'});

  const scans = await query(`
    SELECT s.*, pa.name AS master_activity_name, pa.order_no, pa.is_decision
      FROM activity_scans s
 LEFT JOIN process_activities pa ON pa.id=s.process_activity_id
     WHERE s.document_id=$1
  ORDER BY s.start_time ASC`,
    [req.params.id]
  );

  let overallSeconds = null;
  if (scans.rowCount > 0) {
    const firstStart = new Date(doc.rows[0].created_at);
    const lastEnd = scans.rows.filter(s=>s.end_time).slice(-1)[0]?.end_time;
    if (firstStart && lastEnd) overallSeconds = Math.round((new Date(lastEnd)-firstStart)/1000);
  }

  let totalExec = 0, totalWait = 0, totalRest = 0;
  for (const s of scans.rows) {
    totalExec += s.duration_seconds || 0;
    totalWait += s.waiting_seconds || 0;
    totalRest += s.resting_seconds || 0;
  }

  res.json({
    document: doc.rows[0],
    scans: scans.rows,
    overallSeconds,
    totalExecutionSeconds: totalExec,
    totalWaitingSeconds: totalWait,
    totalRestingSeconds: totalRest
  });
});

/* ===================== Admin Reports (Pushdown in one endpoint) ======================= */
/**
 * GET /admin/reports/summary
 * - Tanpa ?documentId => LIST (ringkas untuk kartu)
 *   query: q, status (OPEN|WAITING|IN_PROGRESS|DONE), limit, offset
 * - Dengan ?documentId => DETAIL (state + history)
 */
router.get('/admin/reports/summary', async (req,res)=>{
  try {
    const documentId = (req.query.documentId || '').toString().trim();

    /* ---------- DETAIL MODE ---------- */
    if (documentId) {
      const docq = await query(`
        SELECT d.*, p.name as process_name
          FROM documents d
     LEFT JOIN processes p ON p.id = d.process_id
         WHERE d.id=$1`,
        [documentId]
      );
      if (docq.rowCount === 0) return res.status(404).json({ error: 'Document not found' });

      const doc = docq.rows[0];
      const comp = await computeNextExpected(doc);

      // waiting/resting now
      let waitingNow = 0, restingNow = 0;
      if (state.status === 'READY') {
        const anchor = state.last?.end_time || doc.accepted_at || doc.created_at;
        if (anchor) {
          const parts = splitGapWaitingResting(new Date(anchor), new Date());
          waitingNow = parts.waitingSeconds; restingNow = parts.restingSeconds;
        }
      }

      // history
      const history = (await query(
        `SELECT s.id,
                s.process_activity_id AS activity_id,
                COALESCE(s.activity_name, pa.name) AS activity_name,
                s.start_time,
                s.end_time,
                s.duration_seconds,
                s.waiting_seconds,
                s.resting_seconds
            FROM activity_scans s
      LEFT JOIN process_activities pa ON pa.id = s.process_activity_id
          WHERE s.document_id = $1
      ORDER BY s.start_time ASC`,
        [documentId]
      )).rows;

      // normalize state like /scan/state
      let status = doc.status;
      if (!status) status = comp.status === 'IN_PROGRESS'
        ? 'IN_PROGRESS'
        : (comp.status === 'READY' ? 'WAITING' : (comp.status === 'COMPLETED' ? 'DONE' : doc.status));

      return res.json({
        mode: 'detail',
        document: { ...doc, status },
        state: {
          status,
          current: comp.current
            ? {
                id: comp.current.process_activity_id,
                scan_id: comp.current.id,
                name: comp.current.activity_name || comp.current.name,
                is_decision: !!comp.current.is_decision,
                decision_accept_label: comp.current.decision_accept_label || null,
                decision_reject_label: comp.current.decision_reject_label || null
              }
            : null,
          next: comp.next
            ? {
                id: comp.next.id,
                name: comp.next.name,
                is_decision: !!comp.next.is_decision,
                decision_accept_label: comp.next.decision_accept_label || null,
                decision_reject_label: comp.next.decision_reject_label || null
              }
            : null
        },
        activities: doc.process_id ? await getActivities(doc.process_id) : [],
        waitingNow,
        restingNow,
        history
      });
    }

    /* ---------- LIST MODE ---------- */
    const qstr   = (req.query.q || '').toString().trim().toLowerCase();
    const status = (req.query.status || '').toString().trim(); // OPEN|WAITING|IN_PROGRESS|DONE
    const limit  = Math.min(parseInt(req.query.limit || '20', 10), 100);
    const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);
    const like   = `%${qstr}%`;

    const rows = await query(
      `
      with cur as (
        select s.document_id,
               coalesce(s.activity_name, pa.name) as current_activity,
               max(s.start_time) as current_started_at
          from activity_scans s
          left join process_activities pa on pa.id = s.process_activity_id
         where s.end_time is null
         group by s.document_id, coalesce(s.activity_name, pa.name)
      ),
      next_for_doc as (
        select d.id as document_id,
               (
                 select pa.name
                   from process_activities pa
              left join activity_scans s
                     on s.process_activity_id = pa.id
                    and s.document_id = d.id
                    and s.end_time is not null
                  where pa.process_id = d.process_id
               group by pa.id, pa.order_no, pa.name
                 having count(s.id) = 0
               order by pa.order_no asc
                  limit 1
               ) as next_activity
          from documents d
      )
      select d.id, d.doc_type, d.office_type, d.region,
             d.status, d.process_id, p.name as process_name,
             c.current_activity, nf.next_activity,
             c.current_started_at as last_event_at,
             coalesce(sum(s.duration_seconds),0)::int  as total_activity_seconds,
             coalesce(sum(s.waiting_seconds),0)::int   as total_waiting_seconds,
             coalesce(sum(s.resting_seconds),0)::int   as total_resting_seconds
        from documents d
        left join processes p on p.id = d.process_id
        left join cur c on c.document_id = d.id
        left join next_for_doc nf on nf.document_id = d.id
        left join activity_scans s on s.document_id = d.id
       where ($1 = '' or lower(d.id::text) like $2
                        or lower(d.doc_type) like $2
                        or lower(d.region) like $2
                        or lower(p.name) like $2)
         and ($3 = '' or d.status = $3)
       group by d.id, p.name, c.current_activity, nf.next_activity, c.current_started_at
       order by last_event_at desc nulls last, d.id desc
       limit $4 offset $5
      `,
      [qstr ? 'x' : '', like, status, limit, offset]
    );

    return res.json({
      mode: 'list',
      items: rows.rows,
      total: rows.rowCount, // (opsional) total sebenarnya bisa query terpisah; cukup rowCount untuk 1 halaman
      limit,
      offset
    });
  } catch (e) {
    console.error('admin/reports/summary error', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Hapus dokumen (hapus scan dulu untuk aman), lalu dokumen
router.delete('/admin/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM activity_scans WHERE document_id = $1', [id]);
    const r = await query('DELETE FROM documents WHERE id = $1 RETURNING id', [id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Document not found' });
    res.json({ deleted: true, id });
  } catch (e) {
    console.error('delete document error', e);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// Fallback kalau FE lebih nyaman pakai POST
router.post('/admin/documents/:id/delete', async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM activity_scans WHERE document_id = $1', [id]);
    const r = await query('DELETE FROM documents WHERE id = $1 RETURNING id', [id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Document not found' });
    res.json({ deleted: true, id });
  } catch (e) {
    console.error('delete document (POST) error', e);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

/* ===================== Export ======================= */

export default router;
