import React, { useEffect, useMemo, useRef, useState } from 'react';
import './app.css';
import { Html5QrcodeScanner } from 'html5-qrcode';

/* ============== API helpers ============== */
const API =
  import.meta.env.VITE_API_BASE_URL ||
  'http://localhost:4000/api';

async function apiGet(path) {
  const r = await fetch(`${API}${path}`, { credentials: 'omit' });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function apiPost(path, body) {
  const r = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'omit',
    body: JSON.stringify(body ?? {}),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Request failed');
  return d;
}

/* ============== UI atoms ============== */
function Header({ title, right, onBack }) {
  return (
    <header>
      <div className="container" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {onBack && (
          <button className="secondary" onClick={onBack} style={{ marginRight: 12 }}>
            ← Back
          </button>
        )}
        <h1 style={{ margin: 0 }}>{title}</h1>
        <div style={{ marginLeft: 'auto' }}>{right}</div>
      </div>
    </header>
  );
}

function Loading({ show }) {
  if (!show) return null;
  return (
    <div className="loading-overlay">
      <div className="spinner" />
    </div>
  );
}

/* ============== QR scanner ============== */
function QRScanner({ onScan }) {
  const idRef = useRef(`qr-reader-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    const scanner = new Html5QrcodeScanner(idRef.current, { fps: 10, qrbox: 300 }, false);
    scanner.render(
      (text) => {
        try {
          onScan(text);
        } catch (e) {
          console.error(e);
        }
      },
      (err) => {
        // abaikan noise
      }
    );
    return () => {
      try {
        scanner.clear();
      } catch {}
    };
  }, [onScan]);

  return <div id={idRef.current} style={{ width: '100%' }} />;
}

/* ============== Main menu ============== */
function MainMenu({ goto }) {
  return (
    <div>
      <Header
        title="ATR BPN · Document Management System Barcode"
        right={
          <button className="secondary small" onClick={() => goto('adminSignIn')}>
            Sign In Admin
          </button>
        }
      />
      <div className="container">
        <div className="card center">
          <button className="big-btn" onClick={() => goto('guest')}>
            Scan QR
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============== Admin ============== */
function AdminSignIn({ onSignedIn, onBack }) {
  const [adminId, setAdminId] = useState('');
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setErr('');
    try {
      const admin = await apiPost('/auth/admin/login', { adminId });
      localStorage.setItem('dms_admin', JSON.stringify(admin));
      onSignedIn(admin);
    } catch (e) {
      setErr(e.message || 'Login failed');
    }
  }

  return (
    <div>
      <Header title="Sign In Admin" onBack={onBack} />
      <div className="container">
        <div className="card">
          <form onSubmit={submit}>
            <label>Admin ID</label>
            <input value={adminId} onChange={(e) => setAdminId(e.target.value)} />
            <button type="submit">Masuk</button>
            {err && <div className="small" style={{ color: '#b91c1c' }}>Error: {err}</div>}
          </form>
        </div>
      </div>
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
            Signed in as <b>{admin.name}</b> • {admin.office_type} • {admin.region}{' '}
            <button
              className="secondary"
              onClick={() => {
                localStorage.removeItem('dms_admin');
                goto('menu');
              }}
            >
              Sign Out
            </button>
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
  const [loading, setLoading] = useState(false);
  const [processes, setProcesses] = useState([]);
  const [processId, setProcessId] = useState('');
  const [created, setCreated] = useState(null);

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
      const p = (Array.isArray(processes) ? processes : []).find((x) => x.id === processId);
      const docType = p ? p.name : '';
      const data = await apiPost('/admin/documents', {
        adminId: admin.admin_id,
        processId,
        docType,
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
    <style>@page{size:5cm 5cm; margin:0}html,body{height:100%;margin:0}
    .wrap{width:5cm;height:5cm;display:flex;align-items:center;justify-content:center}
    img{width:5cm;height:5cm}</style></head><body>
    <div class='wrap'><img id='qr' src='${url}'/></div>
    <script>const img=document.getElementById('qr');img.onload=()=>{window.focus();window.print();setTimeout(()=>window.close(),300)};<\/script>
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
              <label>Proses</label>
              <select value={processId} onChange={(e) => setProcessId(e.target.value)}>
                {(Array.isArray(processes) ? processes : []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
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
          <div className="small">
            ID: <code className="code">{created.id}</code>
          </div>
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

function Reports() {
  const [summary, setSummary] = useState([]);
  const [inputId, setInputId] = useState('');
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);

  function hms(s) {
    if (s == null) return '-';
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return [h, m, sec].map((v) => String(v).padStart(2, '0')).join(':');
  }
  async function fetchDetail(id) {
    if (!id) return;
    setLoading(true);
    try {
      const d = await apiGet(`/admin/documents/${id}`);
      setDetail(d);
    } catch (e) {
      alert(e.message || 'Gagal mengambil detail');
    } finally {
      setLoading(false);
    }
  }
  async function fetchSummary() {
    try {
      const d = await apiGet('/admin/reports/summary');
      setSummary(Array.isArray(d) ? d : d?.rows || []);
    } catch (e) {
      console.error(e);
    }
  }
  useEffect(() => { fetchSummary(); }, []);

  return (
    <div className="container">
      <div className="card">
        <h2>Detail Dokumen</h2>
        <div className="row">
          <div>
            <label>Document ID</label>
            <input value={inputId} onChange={(e) => setInputId(e.target.value)} placeholder="UUID dokumen" />
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
                <b>{detail.document.process_name || detail.document.doc_type || '-'}</b> • Kantor:{' '}
                <b>{detail.document.office_type || '-'}</b> • Wilayah: {detail.document.region || '-'}
              </div>
              <div className="small">
                Overall: <span className="badge">{hms(detail.overallSeconds)}</span> • Total Execution:{' '}
                <span className="badge">{hms(detail.totalExecutionSeconds)}</span> • Total Waiting:{' '}
                <span className="badge">{hms(detail.totalWaitingSeconds)}</span> • Total Resting:{' '}
                <span className="badge">{hms(detail.totalRestingSeconds)}</span>
              </div>
            </div>
            <h4>Log Aktivitas</h4>
            <table>
              <thead>
                <tr>
                  <th>Start</th>
                  <th>End</th>
                  <th>Durasi</th>
                  <th>Waiting</th>
                  <th>Resting</th>
                  <th>Aktivitas</th>
                </tr>
              </thead>
              <tbody>
                {(detail.scans || []).map((s) => (
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
              <th>ID</th>
              <th>Proses</th>
              <th>Kantor</th>
              <th>Wilayah</th>
              <th>Status</th>
              <th>Total Exec</th>
              <th>Total Waiting</th>
              <th>Total Resting</th>
            </tr>
          </thead>
          <tbody>
            {(Array.isArray(summary) ? summary : []).map((r) => (
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

/* ============== Guest (scan) ============== */
function Guest({ goBack, initialDocumentId }) {
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState(initialDocumentId ? { documentId: initialDocumentId } : null);
  const [state, setState] = useState(null);
  const [acceptedFirst, setAcceptedFirst] = useState(false); // after "Terima Dokumen", before new state arrives

  // ---------- helpers ----------
  const docId = state?.document?.id || payload?.documentId || null;
  const hasScans = (state?.scans?.length ?? 0) > 0;
  const status = state?.state?.status;               // 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | undefined
  const hasCurrent = !!state?.state?.current;
  const nextName = state?.state?.next?.name || '(memuat...)';
  const curName  = state?.state?.current?.name || state?.state?.current?.activity_name || '(memuat...)';

  function setScannedId(id) {
    setPayload({ documentId: id });
    fetchState(id);
  }

  async function fetchState(id) {
    if (!id) return;
    setLoading(true);
    try {
      const d = await apiGet(`/scan/state/${id}`);
      setState(d);
    } catch (e) {
      console.error('[fetchState]', e);
      // Biarkan action area tetap ada – user masih bisa mencoba lagi
    } finally {
      setLoading(false);
    }
  }

  const handleScan = (text) => {
    try {
      const obj = JSON.parse(text);
      if (obj?.documentId) return setScannedId(obj.documentId);
    } catch {}
    if (/^[0-9a-fA-F-]{36}$/.test(text)) return setScannedId(text);
    if (typeof text === 'string') {
      const m = text.match(/\/documents\/([0-9a-fA-F-]{36})/);
      if (m) return setScannedId(m[1]);
    }
    alert('QR tidak valid');
  };

  async function startActivityFirst() {
    // TERIMA DOKUMEN (start pertama tanpa aktivitas)
    if (!docId) return;
    setAcceptedFirst(true);      // tahan UI pada mode pasca-terima
    setLoading(true);
    try {
      await apiPost('/scan/start', { documentId: docId, processActivityId: null });
      await fetchState(docId);   // akan mengubah status menjadi OPEN (tanpa current) → tampil tombol Mulai
    } catch (e) {
      console.error('[startActivityFirst]', e);
      alert(e.message || 'Gagal menerima dokumen');
      setAcceptedFirst(false);   // rollback agar tombol Terima Dokumen muncul lagi
    } finally {
      setLoading(false);
    }
  }

  async function startActivityNext() {
    if (!docId) return;
    setLoading(true);
    try {
      const pid = state?.state?.next?.id ?? null;
      await apiPost('/scan/start', { documentId: docId, processActivityId: pid });
      await fetchState(docId);
    } catch (e) {
      console.error('[startActivityNext]', e);
      alert(e.message || 'Gagal mulai proses');
    } finally {
      setLoading(false);
    }
  }

  async function finishActivity(decisionArg) {
    if (!docId) return;
    setLoading(true);
    try {
      const body = state?.state?.current?.id
        ? { activityId: state.state.current.id }
        : { documentId: docId };
      if (decisionArg === 'accept' || decisionArg === 'reject') body.decision = decisionArg;
      await apiPost('/scan/finish', body);
      await fetchState(docId);
    } catch (e) {
      console.error('[finishActivity]', e);
      alert(e.message || 'Gagal menyelesaikan proses');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialDocumentId) setScannedId(initialDocumentId);
  }, [initialDocumentId]);

  // ---------- UI ----------
  return (
    <div>
      <Header title="Scan QR" onBack={goBack} />
      <div className="container">
        {/* Scanner card (tetap selalu ada di atas) */}
        <div className="card">
          <QRScanner onScan={handleScan} />
          {payload && (
            <div className="small" style={{ marginTop: 8 }}>
              Document ID: <span className="code">{payload.documentId}</span>
            </div>
          )}
        </div>

        {/* ACTION AREA – finite state dengan fallback supaya tidak pernah "blank" */}

        {/* A. Belum ada state sama sekali (baru scan) → Terima Dokumen */}
        {payload && !state && !acceptedFirst && (
          <div className="card">
            <div className="small" style={{ marginBottom: 8 }}>
              Layanan: <b>-</b> • Kantor: <b>-</b> • Wilayah: -
            </div>
            <button onClick={startActivityFirst}>Terima Dokumen</button>
          </div>
        )}

        {/* B. Habis klik Terima, state belum balik → tampil info + (opsional) Mulai ketika sudah ada next */}
        {acceptedFirst && !state && (
          <div className="card">
            <div className="small" style={{ marginBottom: 8 }}>
              Dokumen diterima. Memuat status proses…
            </div>
          </div>
        )}

        {/* C. Sudah ada state */}
        {state && (
          <>
            {/* C1. Pertama kali (OPEN, belum ada current, belum ada scan) → tombol Terima Dokumen */}
            {status === 'OPEN' && !hasCurrent && !hasScans && (
              <div className="card">
                <div className="small" style={{ marginBottom: 8 }}>
                  Layanan: <b>{state.document.doc_type || '-'}</b> • Kantor: <b>{state.document.office_type || '-'}</b> • Wilayah: {state.document.region || '-'}
                </div>
                <button onClick={startActivityFirst}>Terima Dokumen</button>
              </div>
            )}

            {/* C2. OPEN tanpa current (setelah terima, atau antar-aktivitas) → tombol Mulai */}
            {status === 'OPEN' && !hasCurrent && hasScans && (
              <div className="card">
                <div className="small" style={{ marginBottom: 8 }}>
                  Layanan: <b>{state.document.doc_type || '-'}</b> • Kantor: <b>{state.document.office_type || '-'}</b> • Wilayah: {state.document.region || '-'}
                </div>
                <div className="small" style={{ marginBottom: 8 }}>
                  Proses berikutnya: <b>{nextName}</b>
                </div>
                <button onClick={startActivityNext}>Mulai</button>
              </div>
            )}

            {/* C3. IN_PROGRESS → tombol Selesai (atau decision) */}
            {status === 'IN_PROGRESS' && hasCurrent && (
              <div className="card">
                <div className="small" style={{ marginBottom: 8 }}>
                  Layanan: <b>{state.document.doc_type || '-'}</b> • Kantor: <b>{state.document.office_type || '-'}</b> • Wilayah: {state.document.region || '-'}
                </div>
                <div className="small" style={{ marginBottom: 8 }}>
                  Sedang dikerjakan: <b>{curName}</b>
                </div>

                {state.state.current.is_decision ? (
                  <div className="row">
                    <div>
                      <label>Decision</label>
                      <div className="flex">
                        <button onClick={() => finishActivity('accept')}>
                          {state.state.current.decision_accept_label || 'Lanjut'}
                        </button>
                        <button className="secondary" onClick={() => finishActivity('reject')}>
                          {state.state.current.decision_reject_label || 'Tolak'}
                        </button>
                      </div>
                    </div>
                    <div />
                  </div>
                ) : (
                  <button className="secondary" onClick={() => finishActivity()}>Selesai</button>
                )}
              </div>
            )}

            {/* C4. COMPLETED */}
            {status === 'COMPLETED' && (
              <div className="card">
                <div className="small"><b>Proses selesai.</b> Tidak ada aktivitas lanjutan.</div>
              </div>
            )}
          </>
        )}
      </div>

      <Loading show={loading} />
    </div>
  );
}

/* ============== App root ============== */
export default function App() {
  const [page, setPage] = useState('menu');
  const [deepLinkDocId, setDeepLinkDocId] = useState(null);

  const admin = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('dms_admin') || 'null');
    } catch {
      return null;
    }
  }, [page]);

  // deep-link: /documents/:id → buka Guest dengan initialDocumentId
  useEffect(() => {
    const m = window.location.pathname.match(/^\/documents\/([0-9a-fA-F-]{36})$/);
    if (m) {
      setDeepLinkDocId(m[1]);
      setPage('guest');
    }
  }, []);

  if (page === 'menu') return <MainMenu goto={setPage} />;
  if (page === 'guest') return <Guest goBack={() => setPage('menu')} initialDocumentId={deepLinkDocId} />;
  if (page === 'adminSignIn') return <AdminSignIn onSignedIn={() => setPage('admin')} onBack={() => setPage('menu')} />;
  if (page === 'admin') {
    if (!admin) return <AdminSignIn onSignedIn={() => setPage('admin')} onBack={() => setPage('menu')} />;
    return <AdminApp admin={admin} goto={setPage} />;
  }
  return null;
}
