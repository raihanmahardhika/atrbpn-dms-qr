import React, { useEffect, useMemo, useState, useCallback } from 'react';
import './app.css';
import { Html5QrcodeScanner } from 'html5-qrcode';

/* ========== API helpers ========== */
const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

async function apiGet(path) {
  const r = await fetch(`${API}${path}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function apiPost(path, body) {
  const r = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Request failed');
  return d;
}

/* ========== Small UI ========== */
function Loading({ show }) {
  if (!show) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: '50%',
        border: '6px solid #fff', borderTopColor: 'transparent',
        animation: 'spin 0.9s linear infinite'
      }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function Header({ title, onBack, right }) {
  return (
    <header>
      <div className="container" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {onBack ? (
          <button
            className="secondary"
            style={{ width: 'auto', padding: '6px 10px' }}
            onClick={onBack}
          >← Back</button>
        ) : null}
        <h1 style={{ marginLeft: onBack ? 8 : 0 }}>{title}</h1>
        <div style={{ marginLeft: 'auto' }}>{right}</div>
      </div>
    </header>
  );
}

/* ========== Home ========== */
function MainMenu({ goto }) {
  return (
    <div>
      <Header
        title="ATR BPN · Document Management System Barcode"
        right={
          <button
            className="secondary"
            style={{ width: 'auto', padding: '6px 10px' }}
            onClick={() => goto('adminSignIn')}
          >
            Sign In Admin
          </button>
        }
      />
      <div className="container">
        <div className="card center">
          <button className="big-btn secondary" onClick={() => goto('guest')}>Scan QR</button>
        </div>
      </div>
    </div>
  );
}

/* ========== Admin ========== */
function AdminSignIn({ onSignedIn, onBack }) {
  const [adminId, setAdminId] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      const admin = await apiPost('/auth/admin/login', { adminId });
      localStorage.setItem('dms_admin', JSON.stringify(admin));
      onSignedIn(admin);
    } catch (e) {
      setErr(e.message || 'Login failed');
    } finally {
      setLoading(false);
    }
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
            {err && <div className="small" style={{ color: '#b91c1c' }}>Error: {err}</div>}
          </form>
        </div>
      </div>
      <Loading show={loading} />
    </div>
  );
}

function NavAdmin({ setTab }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <button onClick={() => setTab('create')}>Create Document</button>
      <button className="secondary" onClick={() => setTab('reports')}>Reports</button>
    </div>
  );
}

function AdminApp({ admin, goto }) {
  const [sub, setSub] = useState('create');
  return (
    <div>
      <Header
        title="Admin Portal"
        onBack={() => goto('menu')}
        right={
          <div className="small">
            Signed in as <b>{admin.name}</b> • {admin.office_type} • {admin.region} &nbsp;
            <button
              className="secondary"
              style={{ width: 'auto', padding: '6px 10px' }}
              onClick={() => { localStorage.removeItem('dms_admin'); goto('menu'); }}
            >Sign Out</button>
          </div>
        }
      />
      {sub === 'create' ? <AdminCreate admin={admin} /> : <Reports />}
      <div className="container">
        <div className="card center">
          <NavAdmin setTab={setSub} />
        </div>
      </div>
    </div>
  );
}

function AdminCreate({ admin }) {
  const [processes, setProcesses] = useState([]);
  const [processId, setProcessId] = useState('');
  const [created, setCreated] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiGet('/admin/processes');
        const list = Array.isArray(data) ? data : (Array.isArray(data?.rows) ? data.rows : []);
        setProcesses(list);
        if (list.length) setProcessId(list[0].id);
      } catch (e) {
        console.error(e);
        setProcesses([]);
      }
    })();
  }, []);

  async function createDoc(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const p = (processes || []).find(x => x.id === processId);
      const docType = p ? p.name : '';
      const data = await apiPost('/admin/documents', {
        adminId: admin.admin_id, processId, docType
      });
      setCreated(data);
    } catch (e) {
      alert(e.message || 'Gagal membuat dokumen');
    } finally {
      setLoading(false);
    }
  }

  function printQr(url) {
    const w = window.open('', '_blank', 'noopener,noreferrer');
    const html = `<!doctype html><html><head><meta charset='utf-8'><title>Print QR</title>
    <style>@page{size:5cm 5cm; margin:0}html,body{height:100%;margin:0}.wrap{width:5cm;height:5cm;display:flex;align-items:center;justify-content:center}img{width:5cm;height:5cm}</style></head>
    <body><div class='wrap'><img id='qr' src='${url}'/></div>
    <script>const img=document.getElementById('qr'); img.onload=()=>{window.focus();window.print();setTimeout(()=>window.close(),300)};<\/script>
    </body></html>`;
    w.document.open(); w.document.write(html); w.document.close();
  }

  return (
    <div className="container">
      <div className="card">
        <h2>Generate Dokumen + QR</h2>
        <form onSubmit={createDoc}>
          <div className="row">
            <div>
              <label>Layanan</label>
              <select value={processId} onChange={e => setProcessId(e.target.value)}>
                {(processes || []).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div />
          </div>
          <button type="submit">Generate</button>
        </form>
      </div>

      {created && (
        <div className="card">
          <h3>Dokumen Dibuat</h3>
          <div className="small">ID: <code className="code">{created.id}</code></div>
          <p className="small">Print QR berikut dan tempel pada dokumen fisik.</p>
          <img
            src={`${API}${created.qrDownloadUrl}`}
            alt="QR"
            style={{ width: 220, height: 220, border: '1px solid #eee', borderRadius: 8 }}
          />
          <div style={{ marginTop: 8 }} className="flex">
            <a href={`${API}${created.qrDownloadUrl}`} download={`qr-${created.id}.png`}>
              <button>Download QR</button>
            </a>
            <button className="secondary" onClick={() => printQr(`${API}${created.qrDownloadUrl}`)}>
              Print QR (5×5 cm)
            </button>
          </div>
        </div>
      )}
      <Loading show={loading} />
    </div>
  );
}

/* ========== Scan helper: extract documentId from many QR formats ========== */
function extractDocumentId(textRaw) {
  if (!textRaw) return null;
  const text = String(textRaw).trim();

  // 1) URL .../document/:id or .../documents/:id
  const m1 = text.match(/\/documents?\/([0-9a-fA-F-]{36})(?:[/?#]|$)/);
  if (m1) return m1[1];

  // 2) URL ...?id=UUID
  const m2 = text.match(/[?&]id=([0-9a-fA-F-]{36})(?:[&#]|$)/);
  if (m2) return m2[1];

  // 3) JSON { documentId: '...' } (or "id")
  try {
    const obj = JSON.parse(text);
    if (obj?.documentId && /^[0-9a-fA-F-]{36}$/.test(obj.documentId)) return obj.documentId;
    if (obj?.id && /^[0-9a-fA-F-]{36}$/.test(obj.id)) return obj.id;
  } catch { /* not JSON */ }

  // 4) Plain UUID
  if (/^[0-9a-fA-F-]{36}$/.test(text)) return text;

  return null;
}

/* ========== QR Scanner ========== */
function QRScanner({ onScan }) {
  const [error, setError] = useState(null);

  useEffect(() => {
    const s = new Html5QrcodeScanner('reader', { fps: 10, qrbox: 250 }, false);
    s.render(
      (text) => { try { onScan(text) } catch (e) { console.error(e) } },
      (err) => setError(err?.toString?.() || 'Scan error')
    );
    return () => { try { s.clear() } catch { } };
  }, [onScan]);

  return (
    <div>
      <div id="reader" style={{ width: '100%' }} />
      {error && <div className="small">Scan status: {error}</div>}
    </div>
  );
}

/* ========== Guest (Scan flow) ========== */
function Guest({ goBack }) {
  const [payload, setPayload] = useState(null); // {documentId}
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(false);

  // Deep-link support: /document/:id atau /documents/:id
  useEffect(() => {
    const path = (window.location.pathname || '').toLowerCase();
    if (path.startsWith('/document/') || path.startsWith('/documents/')) {
      const id = extractDocumentId(window.location.href);
      if (id) {
        setPayload({ documentId: id });
        fetchState(id);
      }
    }
  }, []);

  const handleScan = useCallback((text) => {
    const id = extractDocumentId(text);
    if (!id) { alert('QR tidak valid'); return; }
    setPayload({ documentId: id });
    fetchState(id);
  }, []);

  async function fetchState(id) {
    setLoading(true);
    try {
      const d = await apiGet(`/scan/state/${id}`);
      setState(d);
    } catch (e) {
      console.error(e);
      alert('Dokumen tidak ditemukan / error state');
    } finally {
      setLoading(false);
    }
  }

  // Tahap 1: Terima Dokumen (start tanpa activity)
  async function acceptDocument() {
    if (!state?.document?.id) return;
    setLoading(true);
    try {
      await apiPost('/scan/start', { documentId: state.document.id, processActivityId: null });
      await fetchState(state.document.id);
    } catch (e) {
      alert(e.message || 'Gagal menerima dokumen');
    } finally {
      setLoading(false);
    }
  }

  // Tahap 2: Mulai proses aktual
  async function startActivity() {
    if (!state?.document?.id) return;
    const nextId = state?.state?.next?.id || null;
    if (!nextId) return;
    setLoading(true);
    try {
      await apiPost('/scan/start', { documentId: state.document.id, processActivityId: nextId });
      await fetchState(state.document.id);
    } catch (e) {
      alert(e.message || 'Gagal mulai proses');
    } finally {
      setLoading(false);
    }
  }

  // Tahap 3: Selesai proses (tanpa mengubah decision logic lama)
  async function finishActivity(decisionArg) {
    if (!state?.document?.id) return;
    const body = state?.state?.current?.id
      ? { activityId: state.state.current.id }
      : { documentId: state.document.id };
    if (decisionArg) body.decision = decisionArg;

    setLoading(true);
    try {
      await apiPost('/scan/finish', body);
      await fetchState(state.document.id);
    } catch (e) {
      alert(e.message || 'Gagal menyelesaikan');
    } finally {
      setLoading(false);
    }
  }

  // Dokumen belum pernah diterima jika belum ada scan sama sekali
  const notAcceptedYet = !state?.scans || state.scans.length === 0;

  return (
    <div>
      <Header title="Scan QR" onBack={goBack} />
      <div className="container">
        <div className="card">
          <QRScanner onScan={handleScan} />
          {payload && (
            <div className="small">
              Document ID: <code className="code">{payload.documentId}</code>
            </div>
          )}
        </div>

        {state && (
          <div className="card">
            <div className="small" style={{ marginBottom: 8 }}>
              Layanan: <b>{state.document.doc_type || '-'}</b>{' '}
              • Kantor: <b>{state.document.office_type || '-'}</b>{' '}
              • Wilayah: {state.document.region || '-'}
            </div>

            {notAcceptedYet ? (
              // Hanya tombol Terima Dokumen
              <button onClick={acceptDocument}>Terima Dokumen</button>
            ) : state.state.status === 'COMPLETED' ? (
              <div className="small"><b>Selesai.</b> Tidak ada proses lagi.</div>
            ) : state.state.status === 'IN_PROGRESS' ? (() => {
              const cur = state.state.current;
              const hasDecision = !!(cur?.next_on_accept || cur?.next_on_reject);
              return (
                <div>
                  <div className="small" style={{ marginBottom: 8 }}>
                    Sedang dikerjakan (Proses): <b>{cur.name || cur.activity_name}</b>
                  </div>
                  {hasDecision && cur.is_decision ? (
                    <div className="row">
                      <div>
                        <label>Decision</label>
                        <div className="flex">
                          <button onClick={() => finishActivity('accept')}>
                            {cur.decision_accept_label || 'Lanjut'}
                          </button>
                          <button className="secondary" onClick={() => finishActivity('reject')}>
                            {cur.decision_reject_label || 'Tolak'}
                          </button>
                        </div>
                      </div>
                      <div />
                    </div>
                  ) : (
                    <button className="secondary" onClick={() => finishActivity()}>
                      Selesai
                    </button>
                  )}
                </div>
              );
            })() : (
              // READY → tampilkan hanya “Proses berikutnya” & tombol Mulai (tanpa waiting/resting)
              <div>
                <div className="small" style={{ marginBottom: 8 }}>
                  Proses berikutnya: <b>{state.state.next?.name || '-'}</b>
                </div>
                <button onClick={startActivity}>Mulai</button>
              </div>
            )}
          </div>
        )}
      </div>
      <Loading show={loading} />
    </div>
  );
}

/* ========== Reports ========== */
function Reports() {
  const [summary, setSummary] = useState([]);
  const [inputId, setInputId] = useState('');
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);

  function hms(s) {
    if (s == null) return '-';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return [h, m, sec].map(v => String(v).padStart(2, '0')).join(':');
  }

  async function fetchDetail(id) {
    setLoading(true);
    try {
      const d = await apiGet(`/admin/documents/${id}`);
      setDetail(d);
    } catch {
      alert('Gagal mengambil detail');
    } finally {
      setLoading(false);
    }
  }
  async function fetchSummary() {
    try {
      const d = await apiGet('/admin/reports/summary');
      setSummary(Array.isArray(d) ? d : (d?.rows || []));
    } catch {
      setSummary([]);
    }
  }
  useEffect(() => { fetchSummary() }, []);

  return (
    <div className="container">
      <div className="card">
        <h2>Detail Dokumen</h2>
        <div className="row">
          <div>
            <label>Document ID</label>
            <input value={inputId} onChange={e => setInputId(e.target.value)} placeholder="UUID dokumen" />
          </div>
          <div>
            <label>&nbsp;</label>
            <button onClick={() => fetchDetail(inputId)}>Lihat Detail</button>
          </div>
        </div>

        {detail && (
          <div style={{ marginTop: 12 }}>
            <div style={{ marginBottom: 8 }}>
              <div>
                <b>{detail.document.process_name || detail.document.doc_type || '-'}</b>
                {' • '}Kantor: <b>{detail.document.office_type || '-'}</b>
                {' • '}Wilayah: {detail.document.region || '-'}
              </div>
              <div className="small">
                Overall: <span className="badge">{hms(detail.overallSeconds)}</span>{' '}
                Total Execution: <span className="badge">{hms(detail.totalExecutionSeconds)}</span>{' '}
                Total Waiting: <span className="badge">{hms(detail.totalWaitingSeconds)}</span>{' '}
                Total Resting: <span className="badge">{hms(detail.totalRestingSeconds)}</span>
              </div>
            </div>

            <h4>Log Proses</h4>
            <table>
              <thead>
                <tr>
                  <th>Start</th><th>End</th><th>Durasi</th><th>Waiting</th><th>Resting</th><th>Proses</th>
                </tr>
              </thead>
              <tbody>
                {(detail.scans || []).map(s => (
                  <tr key={s.id}>
                    <td>{new Date(s.start_time).toLocaleString()}</td>
                    <td>{s.end_time ? new Date(s.end_time).toLocaleString() : '-'}</td>
                    <td>{s.duration_seconds ? s.duration_seconds + ' dtk' : '-'}</td>
                    <td>{s.waiting_seconds || 0} dtk</td>
                    <td>{s.resting_seconds || 0} dtk</td>
                    <td>{s.master_activity_name || s.activity_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Ringkasan Terbaru</h2>
        <table>
          <thead>
            <tr>
              <th>ID</th><th>Layanan</th><th>Kantor</th><th>Wilayah</th><th>Status</th>
              <th>Total Exec</th><th>Total Waiting</th><th>Total Resting</th>
            </tr>
          </thead>
          <tbody>
            {(Array.isArray(summary) ? summary : []).map(r => (
              <tr key={r.id}>
                <td className="code">{r.id?.slice(0, 8) || '-'}…</td>
                <td>{r.process_name || r.doc_type}</td>
                <td>{r.office_type || '-'}</td>
                <td>{r.region || '-'}</td>
                <td>{r.status}</td>
                <td>{Math.round((r.total_activity_seconds || 0) / 60)} m</td>
                <td>{Math.round((r.total_waiting_seconds || 0) / 60)} m</td>
                <td>{Math.round((r.total_resting_seconds || 0) / 60)} m</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Loading show={loading} />
    </div>
  );
}

/* ========== App ========== */
export default function App() {
  const [page, setPage] = useState('menu');

  const admin = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('dms_admin') || 'null') } catch { return null }
  }, [page]);

  useEffect(() => {
    if (page === 'adminSignIn' && admin) setPage('admin');
  }, [page, admin]);

  if (page === 'menu') return <MainMenu goto={setPage} />;
  if (page === 'adminSignIn') return <AdminSignIn onSignedIn={() => setPage('admin')} onBack={() => setPage('menu')} />;
  if (page === 'guest') return <Guest goBack={() => setPage('menu')} />;
  if (page === 'admin') {
    if (!admin) return <AdminSignIn onSignedIn={() => setPage('admin')} onBack={() => setPage('menu')} />;
    return <AdminApp admin={admin} goto={setPage} />;
  }
  return null;
}
