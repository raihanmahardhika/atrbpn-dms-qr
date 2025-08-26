import { query } from './db.js';
import { v4 as uuidv4 } from 'uuid';

function getRows(result) {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.rows)) return result.rows;
  return [];
}
function getCount(result) {
  const rows = getRows(result);
  const row = rows[0] || {};
  const val = row.c ?? row.count ?? row['?column?'] ?? Object.values(row)[0] ?? 0;
  return Number(val) || 0;
}

async function upsertProcess(code, name, acts) {
  const r = await query('SELECT id FROM processes WHERE code=$1', [code]);
  const rows = getRows(r);
  const pid = rows.length ? rows[0].id : uuidv4();

  if (!rows.length) {
    await query('INSERT INTO processes(id,code,name) VALUES ($1,$2,$3)', [pid, code, name]);
  } else {
    await query('UPDATE processes SET name=$2 WHERE id=$1', [pid, name]);
  }

  const ex = await query('SELECT COUNT(*)::int c FROM process_activities WHERE process_id=$1', [pid]);
  const cnt = getCount(ex);
  if (cnt === 0) {
    let o = 1;
    for (const a of acts) {
      await query(
        'INSERT INTO process_activities (id,process_id,name,order_no,is_mandatory,is_decision) VALUES ($1,$2,$3,$4,$5,$6)',
        [uuidv4(), pid, a.name, o++, true, !!a.is_decision]
      );
    }
  }
  return pid;
}

async function upsertAdmin(id, name, office, region) {
  const r = await query('SELECT 1 FROM admins WHERE admin_id=$1', [id]);
  const rows = getRows(r);
  if (!rows.length) {
    await query('INSERT INTO admins(admin_id,name,office_type,region) VALUES ($1,$2,$3,$4)', [id, name, office, region]);
  } else {
    await query('UPDATE admins SET name=$2, office_type=$3, region=$4 WHERE admin_id=$1', [id, name, office, region]);
  }
}

async function setDecisionSelfLoop(processId, decisionName, labels, acceptNextName) {
  const acts = await query('SELECT id,name FROM process_activities WHERE process_id=$1 ORDER BY order_no', [processId]);
  const rows = getRows(acts);
  const find = (n) => rows.find((a) => a.name === n)?.id;
  const decisionId = find(decisionName);
  const acceptId = find(acceptNextName);
  if (decisionId) {
    await query(
      `UPDATE process_activities
       SET is_decision=TRUE,
           decision_accept_label=$1,
           decision_reject_label=$2,
           next_on_accept=$3,
           next_on_reject=$4
       WHERE id=$5`,
      [labels.accept, labels.reject, acceptId || null, decisionId, decisionId]
    );
  }
}

(async () => {
  try {
    const pemId = await upsertProcess('PEM','Pemecahan',[
      {name:'Verifikasi Berkas', is_decision:true},
      {name:'Pengukuran'},
      {name:'Penerbitan Dokumen'},
    ]);
    const phtId = await upsertProcess('PHT','Penghapusan Hak Tanggungan',[
      {name:'Validasi Dokumen', is_decision:true},
      {name:'Proses Pencoretan'},
      {name:'Penyerahan Dokumen'},
    ]);
    await upsertAdmin('ADM001','Admin Kantah Jakarta','Kantah','Jakarta Selatan');
    await upsertAdmin('ADM002','Admin Kanwil Jabar','Kanwil','Jawa Barat');
    await setDecisionSelfLoop(pemId,'Verifikasi Berkas',{accept:'Verifikasi berhasil',reject:'Verifikasi ditolak'},'Pengukuran');
    await setDecisionSelfLoop(phtId,'Validasi Dokumen',{accept:'Validasi berhasil',reject:'Validasi ditolak'},'Proses Pencoretan');
    console.log('Seed done.'); process.exit(0);
  } catch (e) { console.error('Seed failed:', e); process.exit(1); }
})();
