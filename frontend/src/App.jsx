import React, { useEffect, useMemo, useState} from 'react'
import './app.css'
import { Html5QrcodeScanner } from 'html5-qrcode'

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api'
async function apiGet(path){ const r=await fetch(`${API}${path}`); if(!r.ok) throw new Error(await r.text()); return r.json(); }
async function apiPost(path,body){ const r=await fetch(`${API}${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.error||'Request failed'); return d; }

function Header({ title, right, onBack }) {
  return (
    <header>
      <div className="container" style={{ display:'flex', gap:12, alignItems:'center' }}>
        {onBack && (
          <button className="back-btn" onClick={onBack} aria-label="Kembali">← Back</button>
        )}
        <h1 style={{ margin:0 }}>{title}</h1>
        <div style={{ marginLeft:'auto' }}>{right}</div>
      </div>
    </header>
  );
}
function MainMenu({ goto }) {
  return (
    <div>
      <Header
        title="ATR BPN · Document Management System Barcode"
        right={<button className="small-btn secondary" onClick={() => goto('adminSignIn')}>Admin</button>}
      />
      <div className="container">
        <div className="card center">
          <button className="big-btn" onClick={() => goto('guest')}>Scan QR</button>
        </div>
      </div>
    </div>
  );
}

function AdminSignIn({ onSignedIn, onBack }) {
  const [adminId, setAdminId] = React.useState('');
  const [err, setErr] = React.useState('');

  async function submit(e){
    e.preventDefault();
    setErr('');
    try{
      const admin = await apiPost('/auth/admin/login', { adminId });
      localStorage.setItem('dms_admin', JSON.stringify(admin));
      onSignedIn(admin);
    }catch(e){ setErr(e.message || 'Login failed'); }
  }

  return (
    <div>
      <Header title="Sign In Admin" onBack={onBack} />
      <div className="container">
        <div className="card">
          <form onSubmit={submit}>
            <label>Admin ID</label>
            <input value={adminId} onChange={e => setAdminId(e.target.value)} />
            <button type="submit">Masuk</button>
            {err && <div className="small" style={{color:'#b91c1c'}}>Error: {err}</div>}
          </form>
        </div>
      </div>
    </div>
  );
}

function NavAdmin({ setTab }){ return (<div style={{display:'flex',gap:8}}><button onClick={()=>setTab('create')}>Create Document</button><button className="secondary" onClick={()=>setTab('reports')}>Reports</button></div>) }

function AdminApp({ admin, goto }) {
  const [sub, setSub] = React.useState('create');
  return (
    <div>
      <Header
        title="Admin Portal"
        onBack={() => goto('menu')}
        right={
          <div className="small">
            Signed in as <b>{admin.name}</b> • {admin.office_type} • {admin.region}
            &nbsp;
            <button className="secondary" onClick={() => { localStorage.removeItem('dms_admin'); goto('menu'); }}>
              Sign Out
            </button>
          </div>
        }
      />
      {sub==='create' ? <AdminCreate admin={admin}/> : <Reports/>}
      <div className="container">
        <div className="card center">
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>setSub('create')}>Create Document</button>
            <button className="secondary" onClick={()=>setSub('reports')}>Reports</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminCreate({ admin }){
  const [processes,setProcesses]=useState([]); const [processId,setProcessId]=useState(''); const [created,setCreated]=useState(null);
  useEffect(()=>{(async()=>{try{const data=await apiGet('/admin/processes'); const list=Array.isArray(data)?data:(Array.isArray(data?.rows)?data.rows:[]); setProcesses(list); if(list.length) setProcessId(list[0].id);}catch(e){console.error(e); setProcesses([])}})()},[]);
  async function createDoc(e){e.preventDefault(); const p=(Array.isArray(processes)?processes:[]).find(x=>x.id===processId); const docType=p?p.name:''; const data=await apiPost('/admin/documents',{adminId:admin.admin_id,processId,docType}); setCreated(data)}
  function printQr(url){ const w=window.open('','_blank','noopener,noreferrer'); const html=`<!doctype html><html><head><meta charset='utf-8'><title>Print QR</title><style>@page{size:5cm 5cm; margin:0}html,body{height:100%;margin:0}.wrap{width:5cm;height:5cm;display:flex;align-items:center;justify-content:center}img{width:5cm;height:5cm}</style></head><body><div class='wrap'><img id='qr' src='${url}'/></div><script>const img=document.getElementById('qr'); img.onload=()=>{window.focus();window.print();setTimeout(()=>window.close(),300)};<\/script></body></html>`; w.document.open(); w.document.write(html); w.document.close(); }
  return (<div className="container"><div className="card"><h2>Generate Dokumen + QR</h2><form onSubmit={createDoc}><div className="row"><div><label>Proses</label><select value={processId} onChange={e=>setProcessId(e.target.value)}>{(Array.isArray(processes)?processes:[]).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div><div/></div><button type="submit">Generate</button></form></div>{created && (<div className="card"><h3>Dokumen Dibuat</h3><div className="small">ID: <code className="code">{created.id}</code></div><p className="small">Print QR berikut dan tempel pada dokumen fisik.</p><img src={`${API}${created.qrDownloadUrl}`} alt="QR" style={{width:220,height:220,border:'1px solid #eee',borderRadius:8}}/><div style={{marginTop:8}} className="flex"><a href={`${API}${created.qrDownloadUrl}`} download={`qr-${created.id}.png`}><button>Download QR</button></a><button className="secondary" onClick={()=>printQr(`${API}${created.qrDownloadUrl}`)}>Print QR (5×5 cm)</button></div></div>)}</div>)
}

function QRScanner({ onScan }){
  const [stopped, setStopped] = useState(false);

  useEffect(() => {
    if (stopped) return;
    const scanner = new Html5QrcodeScanner(
      "reader",
      {
        fps: 10,
        qrbox: 250,
        // opsional: bantu HP memilih kamera belakang
        rememberLastUsedCamera: true,
      },
      /* verbose */ false
    );

    scanner.render(
      (text) => {
        // sukses → hentikan kamera & teruskan ke parent
        try { onScan(text); } catch {}
        setStopped(true);
        scanner.clear().catch(() => {});
      }
      // ⬇ HAPUS error callback agar tidak spam:
      // , (err) => {}
    );

    return () => { try { scanner.clear(); } catch {} };
  }, [onScan, stopped]);

  return (
    <div>
      {!stopped && <div id="reader" style={{ width: '100%' }} />}
      {/* Tidak perlu menampilkan error per-frame */}
    </div>
  );
}


function Guest({ goBack }){
  const [payload,setPayload]=useState(null);
  const [state,setState]=useState(null);

  // ⬇⬇ tambah: state loading
  const [loading, setLoading] = useState(false);
  const withLoading = async (fn) => {
    setLoading(true);
    try { return await fn(); }
    finally { setLoading(false); }
  };

  const [accepted, setAccepted] = useState(false);
  const acceptedKey = (id) => `dms.accepted:${id}`;
  // ⬆⬆

  function handleScan(text){
    try{
      const obj=JSON.parse(text);
      if(obj.documentId){ setPayload(obj); fetchState(obj.documentId); }
      else alert('QR tidak valid');
    } catch {
      if(/^[0-9a-fA-F-]{36}$/.test(text)){ setPayload({documentId:text}); fetchState(text); }
      else alert('QR tidak valid');
    }
  }

  async function fetchState(id){
    await withLoading(async () => {
      try{
        const d=await apiGet(`/scan/state/${id}`);
        setState(d);
      }catch(e){
        console.error(e);
        alert('Dokumen tidak ditemukan / error state');
      }
    });
  }

    async function startActivity(){
    if(!state?.document?.id) return;
    await withLoading(async () => {
      try {
        const res = await apiPost('/scan/start', {
          documentId: state.document.id,
          processActivityId: state.state?.next?.id || null
        });

        if (res.initialized) {
          // baru saja “Terima dokumen” → tampilkan info bar
          setAccepted(true);
          sessionStorage.setItem(acceptedKey(state.document.id), '1');
          alert('Dokumen diterima. Waiting time dimulai.');
        } else {
          alert(`Mulai: ${new Date(res.startTime).toLocaleString()} • Waiting: ${res.waitingSeconds}s • Resting: ${res.restingSeconds}s`);
        }
        await fetchState(state.document.id);
      } catch (e) {
        alert(e.message || 'Gagal mulai');
      }
    });
  }


  async function finishActivity(decisionArg){
    const decision = (decisionArg==='accept'||decisionArg==='reject') ? decisionArg : undefined;
    if(!state?.document?.id) return;

    await withLoading(async () => {
      const body = state?.state?.current?.id ? { activityId: state.state.current.id } : { documentId: state.document.id };
      if (decision) body.decision = decision;
      const res = await apiPost('/scan/finish', body);
      alert(`Selesai. Durasi: ${res.durationSeconds}s${res.done?' • Proses selesai.':''}`);
      await fetchState(state.document.id);
    });
  }

  return (<div>
    <Header title="Scan QR" onBack={goBack} />
    <div className="container">
      <div className="card">
        <QRScanner onScan={handleScan} />
        {payload && <div className="small">Document ID: <code className="code">{payload.documentId}</code></div>}
      </div>

      {state && (
        <div className="card">
          <div className="small" style={{marginBottom:8}}>
            Proses: <b>{state.document.doc_type || '-'}</b>
            • Kantor: <b>{state.document.office_type||'-'}</b>
            • Wilayah: {state.document.region||'-'}
          </div>

          {state.state.status === 'COMPLETED' ? (
            <div className="small"><b>Proses selesai.</b> Tidak ada aktivitas lanjutan.</div>
          ) : state.state.status === 'IN_PROGRESS' ? (()=>{
            const cur = state.state.current;
            const hasMapping = !!(cur?.next_on_accept || cur?.next_on_reject);
            return (
              <div>
                <div className="small" style={{marginBottom:8}}>Sedang dikerjakan: <b>{cur.name || cur.activity_name}</b></div>
                {cur.is_decision && hasMapping ? (
                  <div className="row">
                    <div>
                      <label>Decision</label>
                      <div className="flex">
                        <button onClick={()=>finishActivity('accept')} disabled={loading}>
                          {loading ? 'Memproses…' : (cur.decision_accept_label || 'Lanjut')}
                        </button>
                        <button className="secondary" onClick={()=>finishActivity('reject')} disabled={loading}>
                          {loading ? 'Memproses…' : (cur.decision_reject_label || 'Tolak')}
                        </button>
                      </div>
                    </div>
                    <div/>
                  </div>
                ) : null}
                {!cur.is_decision && (
                  <button className="secondary" onClick={(e)=>{ e.preventDefault(); finishActivity(); }} disabled={loading}>
                    {loading ? 'Menyelesaikan…' : 'Selesai'}
                  </button>
                )}
              </div>
            );
          })() : (
              <div>
                {accepted && (
                  <div className="small" style={{marginBottom:8}}>
                    Aktivitas berikutnya: <b>{state.state.next?.name || '-'}</b>
                    {' '}• Waiting: <span className="badge">{state.waitingNow||0}s</span>
                    {' '}• Resting: <span className="badge">{state.restingNow||0}s</span>
                  </div>
                )}
                <button onClick={startActivity} disabled={loading}>
                  {loading ? 'Memulai…' : 'Mulai'}
                </button>
              </div>
            )}
        </div>
      )}
    </div>

    {/* overlay spinner (khusus halaman Scan) */}
    {loading && (
      <div className="dms-loading" role="status" aria-live="polite">
        <div className="dms-spinner" />
        <div className="dms-loading-text">memuat…</div>
      </div>
    )}
  </div>)
}

function Reports() {
  const [summary, setSummary] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [cache, setCache] = useState({});       // { [id]: detail }
  const [loadingId, setLoadingId] = useState(null);
  const [errId, setErrId] = useState(null);

  const hms = (s) => {
    if (s == null) return '-';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return [h, m, sec].map(v => String(v).padStart(2, '0')).join(':');
  };

  useEffect(() => {
    (async () => {
      try {
        const d = await apiGet('/admin/reports/summary');
        setSummary(Array.isArray(d) ? d : (d?.rows || []));
      } catch (e) {
        console.error('Load summary failed:', e);
      }
    })();
  }, []);

  async function onRowClick(id) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    setErrId(null);
    if (!cache[id]) {
      setLoadingId(id);
      try {
        const detail = await apiGet(`/admin/documents/${id}`);
        setCache(prev => ({ ...prev, [id]: detail }));
      } catch (e) {
        console.error('Load detail failed:', e);
        setErrId(id);
      } finally {
        setLoadingId(null);
      }
    }
  }

  const renderDetail = (detail) => {
    if (!detail) return null;
    return (
      <div className="detail-box">
        <div style={{ marginBottom: 8 }}>
          <div>
            <b>{detail.document.process_name || detail.document.doc_type || '-'}</b>
            {' '}• Kantor: <b>{detail.document.office_type || '-'}</b>
            {' '}• Wilayah: {detail.document.region || '-'}
          </div>
          <div className="small">
            Overall: <span className="badge">{hms(detail.overallSeconds)}</span>{' '}
            • Total Execution: <span className="badge">{hms(detail.totalExecutionSeconds)}</span>{' '}
            • Total Waiting: <span className="badge">{hms(detail.totalWaitingSeconds)}</span>{' '}
            • Total Resting: <span className="badge">{hms(detail.totalRestingSeconds)}</span>
          </div>
        </div>

        <h4>Log Aktivitas</h4>
        <table>
          <thead>
            <tr>
              <th>Start</th><th>End</th><th>Durasi</th>
              <th>Waiting</th><th>Resting</th><th>Aktivitas</th>
            </tr>
          </thead>
          <tbody>
            {(detail.scans || []).map(s => (
              <tr key={s.id}>
                <td>{new Date(s.start_time).toLocaleString()}</td>
                <td>{s.end_time ? new Date(s.end_time).toLocaleString() : '-'}</td>
                <td>{s.duration_seconds ? `${s.duration_seconds} dtk` : '-'}</td>
                <td>{s.waiting_seconds || 0} dtk</td>
                <td>{s.resting_seconds || 0} dtk</td>
                <td>{s.master_activity_name || s.activity_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="container">
      <div className="card">
        <h2>Ringkasan Terbaru</h2>
        <table className="clickable">
          <thead>
            <tr>
              <th>ID</th><th>Proses</th><th>Kantor</th><th>Wilayah</th>
              <th>Status</th><th>Total Exec</th><th>Total Waiting</th><th>Total Resting</th>
            </tr>
          </thead>
          <tbody>
            {(summary || []).map(r => (
              <React.Fragment key={r.id}>
                <tr
                  className={"row-click" + (expandedId === r.id ? " active" : "")}
                  onClick={() => onRowClick(r.id)}
                >
                  <td className="code">{r.id?.slice(0, 8) || '-'}…</td>
                  <td>{r.process_name || r.doc_type}</td>
                  <td>{r.office_type || '-'}</td>
                  <td>{r.region || '-'}</td>
                  <td>{r.status}</td>
                  <td>{Math.round((r.total_activity_seconds || 0) / 60)} m</td>
                  <td>{Math.round((r.total_waiting_seconds || 0) / 60)} m</td>
                  <td>{Math.round((r.total_resting_seconds || 0) / 60)} m</td>
                </tr>

                {expandedId === r.id && (
                  <tr className="expand">
                    <td colSpan={8}>
                      {loadingId === r.id && <div className="spinner small">Loading…</div>}
                      {errId === r.id && (
                        <div className="small" style={{ color: '#b91c1c' }}>
                          Gagal memuat detail dokumen.
                        </div>
                      )}
                      {cache[r.id] && renderDetail(cache[r.id])}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        <div className="small" style={{ marginTop: 8 }}>
          Klik baris untuk melihat detail & log aktivitas.
        </div>
      </div>
    </div>
  );
}

export default function App(){
  const [page,setPage] = React.useState('menu');
  const admin = React.useMemo(()=>{ try{ return JSON.parse(localStorage.getItem('dms_admin')||'null') } catch { return null } },[page]);
  React.useEffect(()=>{ if(page==='adminSignIn' && admin) setPage('admin') },[page,admin]);

  if(page==='menu') return <MainMenu goto={setPage}/>;
  if(page==='adminSignIn') return <AdminSignIn onSignedIn={()=>setPage('admin')} onBack={()=>setPage('menu')} />;
  if(page==='guest') return <Guest goBack={() => setPage('menu')} />;
  if(page==='admin'){
    if(!admin) return <AdminSignIn onSignedIn={()=>setPage('admin')} onBack={()=>setPage('menu')} />;
    return <AdminApp admin={admin} goto={setPage}/>;
  }
  return null;
}
