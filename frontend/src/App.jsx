import React, { useEffect, useMemo, useRef, useState } from 'react';
import './app.css';
import { Html5QrcodeScanner } from 'html5-qrcode';

/* =========================
   API BASE + Helpers
   ========================= */
const API =
  import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== 'undefined' && window.__API_BASE__) ||
  'https://atrbpn-dms-qr.vercel.app/api';

async function apiGet(path) {
  const r = await fetch(`${API}${path}`, { credentials: 'omit' });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Request failed');
  return d;
}

async function apiPost(path, body) {
  const r = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'omit',
    body: JSON.stringify(body ?? {})
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Request failed');
  return d;
}

/* =========================
   UI Helpers
   ========================= */
function Header({ title, onBack, right }) {
  return (
    <header>
      <div className="container" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {onBack ? (
          <button
            className="secondary"
            style={{ padding: '6px 10px', borderRadius: 8 }}
            onClick={onBack}
          >
            ← Back
          </button>
        ) : (
          <span />
        )}
        <h1 style={{ margin: 0, fontSize: 20 }}>{title}</h1>
        <div style={{ marginLeft: 'auto' }}>{right}</div>
      </div>
    </header>
  );
}

function Loading({ show }) {
  if (!show) return null;
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.25)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          border: '6px solid #fff',
          borderTopColor: 'transparent',
          animation: 'spin 0.9s linear infinite'
        }}
      />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function QRScanner({ onScan }) {
  const ref = useRef(null);
  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      'reader',
      { fps: 8, qrbox: 280, rememberLastUsedCamera: true },
      false
    );
    scanner.render(
      (text) => {
        try {
          onScan?.(text);
        } catch (e) {
          console.error(e);
        }
      },
      (err) => {
        // diamkan; komponen bawaan menampilkan status
      }
    );
    return () => {
      try {
        scanner.clear();
      } catch {}
    };
  }, [onScan]);
  return <div id="reader" ref={ref} style={{ width: '100%' }} />;
}

/* =========================
   Main Menu
   ========================= */
function MainMenu({ goto }) {
  return (
    <div>
      <Header
        title="ATR BPN · DMS Barcode"
        right={
          <button
            className="secondary"
            style={{ padding: '6px 10px', borderRadius: 8 }}
            onClick={() => goto('adminSignIn')}
          >
            Sign In Admin
          </button>
        }
      />
      <div className="container">
        <div className="card center">
          <button className="big-btn secondary" onClick={() => goto('guest')}>
            Scan QR
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================
   Admin Sign In + Portal (ringkas)
   ========================= */
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
      onSignedIn?.(admin);
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
            <input
              value={adminId}
              onChange={(e) => setAdminId(e.target.value)}
              placeholder="Admin ID"
            />
            <button type="submit">Masuk</button>
            {err && (
              <div className="small" style={{ color: '#b91c1c' }}>
                Error: {err}
              </div>
            )}
          </form>
        </div>
      </div>
      <Loading show={loading} />
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
        const list = Array.isArray(data) ? data : Array.isArray(data?.rows) ? data.rows : [];
        setProcesses(list);
        if (list.length) setProcessId(list[0].id);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  async function createDoc(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const sel = processes.find((p) => p.id === processId);
      const docType = sel ? sel.name : '';
      const d = await apiPost('/admin/documents', {
        adminId: admin.admin_id,
        processId,
        docType
      });
      setCreated(d);
    } catch (e) {
      alert(e.message || 'Gagal membuat dokumen');
    } finally {
      setLoading(false);
    }
  }

  function printQr(url) {
    const w = window.open('', '_blank', 'noopener,noreferrer');
    const html = `<!doctype html><html><head><meta charset='utf-8'><title>Print QR</title><style>@page{size:5cm 5cm;margin:0}html,body{height:100%;margin:0}.wrap{width:5cm;height:5cm;display:flex;align-items:center;justify-content:center}img{width:5cm;height:5cm}</style></head><body><div class='wrap'><img id='qr' src='${url}'/></div><script>const img=document.getElementById('qr');img.onload=()=>{window.focus();window.print();setTimeout(()=>window.close(),300)};<\/script></body></html>`;
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  return (
    <div className="container">
      <div className="card">
        <h2>Generate Dokumen + QR</h2>
        <form onSubmit={createDoc}>
          <div className="row">
            <div>
              <label>Layanan</label>
              <select value={processId} onChange={(e) => setProcessId(e.target.value)}>
                {processes.map((p) => (
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
          <p className="small">Print atau download QR berikut.</p>
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

  function hms(s) {
    if (s == null) return '-';
    const h = Math.floor(s / 3600),
      m = Math.floor((s % 3600) / 60),
      sec = s % 60;
    return [h, m, sec].map((v) => String(v).padStart(2, '0')).join(':');
  }

  useEffect(() => {
    (async () => {
      try {
        const d = await apiGet('/admin/reports/summary');
        setSummary(Array.isArray(d) ? d : d?.rows || []);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  async function fetchDetail(id) {
    try {
      const d = await apiGet(`/admin/documents/${id}`);
      setDetail(d);
    } catch (e) {
      alert(e.message || 'Gagal ambil detail');
    }
  }

  return (
    <div className="container">
      <div className="card">
        <h2>Detail Dokumen</h2>
        <div className="row">
          <div>
            <label>Document ID</label>
            <input
              value={inputId}
              onChange={(e) => setInputId(e.target.value)}
              placeholder="UUID dokumen"
            />
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
                Overall: <span className="badge">{hms(detail.overallSeconds)}</span> • Total Exec:{' '}
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
              <th>Layanan</th>
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
    </div>
  );
}

function AdminApp({ admin, goto }) {
  const [tab, setTab] = useState('create');
  return (
    <div>
      <Header
        title="Admin Portal"
        right={
          <div className="small">
            Signed in as <b>{admin.name}</b> • {admin.office_type} • {admin.region}&nbsp;
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
      {tab === 'create' ? <AdminCreate admin={admin} /> : <Reports />}
      <div className="container">
        <div className="card center" style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button onClick={() => setTab('create')}>Create Document</button>
          <button className="secondary" onClick={() => setTab('reports')}>
            Reports
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================
   Guest (Scan) — Terima → Mulai → Selesai
   ========================= */
function Guest({ goBack, initialDocumentId }) {
  const [payload, setPayload] = useState(
    initialDocumentId ? { documentId: initialDocumentId } : null
  );
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [scanError, setScanError] = useState("");

  // Fetch state
  async function fetchState(docId) {
    if (!docId) return;
    setLoading(true);
    try {
      const d = await apiGet(`/scan/state/${docId}`);
      setState(d);
    } catch (e) {
      console.error(e);
      alert("Dokumen tidak ditemukan / error state");
    } finally {
      setLoading(false);
    }
  }

  // Inisialisasi via deep-link /documents/:id atau hasil scan awal
  useEffect(() => {
    if (payload?.documentId) fetchState(payload.documentId);
  }, [payload?.documentId]);

  // Parser hasil scan
  function handleScan(text) {
    setScanError("");
    try {
      // deep link: https://.../documents/<uuid>
      const m = text.match(/\/documents\/([0-9a-fA-F-]{36})/);
      if (m) { setPayload({ documentId: m[1] }); return; }

      // UUID mentah
      if (/^[0-9a-fA-F-]{36}$/.test(text)) { setPayload({ documentId: text }); return; }

      // Payload JSON lama { documentId: "..." }
      const obj = JSON.parse(text);
      if (obj?.documentId) { setPayload({ documentId: obj.documentId }); return; }

      setScanError("QR tidak valid");
    } catch {
      setScanError("QR tidak valid");
    }
  }

  // Aksi
  async function acceptDocument() {
    if (!state?.document?.id) return;
    setLoading(true);
    try {
      await apiPost("/scan/start", { documentId: state.document.id }); // terima dokumen
      await fetchState(state.document.id); // status -> WAITING
    } catch (e) {
      alert(e.message || "Gagal menerima dokumen");
    } finally {
      setLoading(false);
    }
  }

  async function startNext() {
    if (!state?.document?.id) return;
    const nextId = state?.state?.next?.id;
    if (!nextId) { alert("Tidak ada proses berikutnya."); return; }
    setLoading(true);
    try {
      await apiPost("/scan/start", {
        documentId: state.document.id,
        processActivityId: nextId
      }); // status -> IN_PROGRESS
      await fetchState(state.document.id);
    } catch (e) {
      alert(e.message || "Gagal mulai");
    } finally {
      setLoading(false);
    }
  }

  async function finishCurrent(decision) {
    if (!state?.document?.id) return;
    const body = state?.state?.current?.id
      ? { activityId: state.state.current.id }
      : { documentId: state.document.id };
    if (decision) body.decision = decision;

    setLoading(true);
    try {
      const r = await apiPost("/scan/finish", body);
      // backend akan set status: WAITING (jika ada next) atau DONE
      await fetchState(state.document.id);
    } catch (e) {
      alert(e.message || "Gagal selesai");
    } finally {
      setLoading(false);
    }
  }

  // Derive tampilan dari status dokumen
  const s = state?.document?.status; // 'OPEN' | 'WAITING' | 'IN_PROGRESS' | 'DONE'
  const doc = state?.document;
  const cur = state?.state?.current;
  const next = state?.state?.next;

  const showReception = s === "OPEN";
  const showStart     = s === "WAITING";
  const showWorking   = s === "IN_PROGRESS";
  const showDone      = s === "DONE";

  return (
    <div>
      <Header
        title="Scan QR"
        right={<button className="secondary" onClick={goBack}>← Back</button>}
      />

      <div className="container">
        <div className="card">
          <QRScanner onScan={handleScan} />
          {payload?.documentId && (
            <div className="small" style={{ marginTop: 8 }}>
              Document ID: <span className="code">{payload.documentId}</span>
            </div>
          )}
          {scanError && (
            <div className="small" style={{ color: "#b91c1c" }}>
              {scanError}
            </div>
          )}
        </div>

        {doc && (
          <div className="card">
            {/* Info dasar selalu tampil */}
            <div className="small" style={{ marginBottom: 8 }}>
              Layanan: <b>{doc.doc_type || "-"}</b>
              {" • "}Kantor: <b>{doc.office_type || "-"}</b>
              {" • "}Wilayah: {doc.region || "-"}
            </div>

            {/* C1: OPEN → Terima Dokumen */}
            {showReception && (
              <button onClick={acceptDocument}>Terima Dokumen</button>
            )}

            {/* C2: WAITING → tampilkan Proses berikutnya + Mulai */}
            {showStart && (
              <>
                <div className="small" style={{ marginBottom: 8 }}>
                  Proses berikutnya: <b>{next?.name || "-"}</b>
                </div>
                <button onClick={startNext}>Mulai</button>
              </>
            )}

            {/* C3: IN_PROGRESS → Sedang dikerjakan + Selesai/Decision */}
            {showWorking && (
              <>
                <div className="small" style={{ marginBottom: 8 }}>
                  Sedang dikerjakan: <b>{cur?.name || cur?.activity_name || "-"}</b>
                </div>
                {cur?.is_decision ? (
                  <div className="flex">
                    <button onClick={() => finishCurrent("accept")}>
                      {cur.decision_accept_label || "Lanjut"}
                    </button>
                    <button className="secondary" onClick={() => finishCurrent("reject")}>
                      {cur.decision_reject_label || "Tolak"}
                    </button>
                  </div>
                ) : (
                  <button className="secondary" onClick={() => finishCurrent()}>
                    Selesai
                  </button>
                )}
              </>
            )}

            {/* C4: DONE → selesai tanpa tombol lain */}
            {showDone && (
              <div className="small"><b>Proses selesai.</b> Tidak ada proses lanjutan.</div>
            )}
          </div>
        )}
      </div>

      {/* Spinner overlay (pakai komponen Loading milikmu) */}
      <Loading show={loading} />
    </div>
  );
}

/* =========================
   APP ROOT
   ========================= */
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
  if (page === 'guest')
    return <Guest goBack={() => setPage('menu')} initialDocumentId={deepLinkDocId} />;
  if (page === 'adminSignIn')
    return <AdminSignIn onSignedIn={() => setPage('admin')} onBack={() => setPage('menu')} />;
  if (page === 'admin') {
    if (!admin)
      return <AdminSignIn onSignedIn={() => setPage('admin')} onBack={() => setPage('menu')} />;
    return <AdminApp admin={admin} goto={setPage} />;
  }
  return null;
}
