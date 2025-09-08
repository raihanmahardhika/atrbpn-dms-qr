import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useLocation } from "react-router-dom";
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
  const [expandedId, setExpandedId] = useState(null);
  const [details, setDetails] = useState({});     // { [docId]: detailObj }
  const [loadingDetail, setLoadingDetail] = useState(null);
  const [loadingList, setLoadingList] = useState(false);

  // spinner CSS kecil (inline)
  const spinnerCss = `
    @keyframes spin{to{transform:rotate(360deg)}}
    .mini-spinner{
      display:inline-block;
      width:14px;height:14px;
      border:2px solid #e5e7eb;           /* abu-abu muda */
      border-top-color:#0ea5e9;           /* biru kecil */
      border-radius:50%;
      animation:spin .6s linear infinite;
      vertical-align:middle;
      margin-left:8px;
    }
  `;

  function hms(s) {
    if (s == null) return '-';
    const h = Math.floor(s / 3600),
      m = Math.floor((s % 3600) / 60),
      sec = s % 60;
    return [h, m, sec].map((v) => String(v).padStart(2, '0')).join(':');
  }

  // Load list (ringkasan) dengan jeda minimal supaya spinner terlihat
  useEffect(() => {
    (async () => {
      setLoadingList(true);
      const MIN_LOAD_MS = 600; // jeda minimal 600ms
      const t0 = Date.now();
      try {
        const d = await apiGet('/admin/reports/summary');
        const rows = Array.isArray(d) ? d : d?.items || d?.rows || [];
        const elapsed = Date.now() - t0;
        if (elapsed < MIN_LOAD_MS) {
          await new Promise((r) => setTimeout(r, MIN_LOAD_MS - elapsed));
        }
        setSummary(rows);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingList(false);
      }
    })();
  }, []);

  // Ambil detail saat expand
  async function fetchDetail(docId) {
    if (details[docId]) return;
    setLoadingDetail(docId);
    try {
      const d = await apiGet(`/admin/reports/summary?documentId=${docId}`);
      setDetails((prev) => ({ ...prev, [docId]: d }));
    } catch (e) {
      alert(e.message || 'Gagal ambil detail');
    } finally {
      setLoadingDetail(null);
    }
  }

    function viewQr(id) {
    // domain QR sesuai permintaanmu
    const url = `https://atrbpn-dms-qr.vercel.app/api/admin/documents/${id}/qr.png`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

 async function deleteDoc(id) {
  if (!id) return;
  if (!confirm('Hapus dokumen ini beserta riwayat aktivitasnya?')) return;

  const resp = await fetch(`${API}/admin/documents/${id}/delete`, {
    method: 'POST',
    mode: 'cors',
    credentials: 'omit',
    cache: 'no-store',
  });

  const data = (resp.headers.get('content-type')||'').includes('application/json')
    ? await resp.json().catch(() => null)
    : null;

  if (!resp.ok || !data?.deleted) throw new Error(data?.error || `Delete gagal (HTTP ${resp.status})`);

  // update UI lokal
  setSummary(prev => prev.filter(x => x.id !== id));
  if (typeof setDetails === 'function') setDetails(p => { const n = { ...p }; delete n[id]; return n; });
  if (typeof setExpandedId === 'function') setExpandedId(cur => (cur === id ? null : cur));
  if (typeof setDetail === 'function') setDetail(null);

  alert('Dokumen berhasil dihapus.');
}

  function toggleExpand(docId) {
    const next = expandedId === docId ? null : docId;
    setExpandedId(next);
    if (next && !details[next]) fetchDetail(next);
  }

  return (
    <div className="container">
      <style>{spinnerCss}</style>

      <div className="card">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <h2 style={{ margin:0 }}>Ringkasan Terbaru</h2>
          {/* spinner kecil di dalam kotak saat list loading */}
          {loadingList && <span className="mini-spinner" aria-label="loading" />}
        </div>

        <div className="small" style={{ margin: '8px 0', color: '#64748b' }}>
          Klik baris untuk melihat detail dokumen (pushdown).
        </div>

        <table style={{ opacity: loadingList ? 0.85 : 1 }}>
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
            {(Array.isArray(summary) ? summary : []).map((r) => {
              const isOpen = expandedId === r.id;
              const det = details[r.id];

              return (
                <React.Fragment key={r.id}>
                  <tr
                    onClick={() => toggleExpand(r.id)}
                    style={{ cursor: 'pointer' }}
                    title="Klik untuk melihat detail"
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

                  {isOpen && (
                    <tr>
                      <td colSpan={8} style={{ background: '#f8fafc' }}>
                        {loadingDetail === r.id && !det ? (
                          <div className="small" style={{ padding: 12 }}>
                            Memuat detail <span className="mini-spinner" />
                          </div>
                        ) : det ? (
                          <div style={{ padding: 12 }}>
                            <div style={{ marginBottom: 8 }}>
                                <div style={{ margin: '8px 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <button
                                  onClick={(e) => { e.stopPropagation(); viewQr(r.id); }}
                                  className="btn btn-secondary"
                                  title="Lihat QR"
                                >
                                  View QR
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); deleteDoc(r.id); }}
                                  className="btn btn-danger"
                                  title="Hapus dokumen"
                                >
                                  Delete
                                </button>
                              </div>
                              <div>
                                <b>{det.document?.process_name || det.document?.doc_type || '-'}</b>
                                {' • '}Kantor: <b>{det.document?.office_type || '-'}</b>
                                {' • '}Wilayah: <b>{det.document?.region || '-'}</b>
                                {' • '}Status:{' '}
                                <span className="badge">{det.document?.status || '-'}</span>
                              </div>
                              <div className="small" style={{ marginTop: 4 }}>
                                Sedang dikerjakan: <b>{det.state?.current?.name || '-'}</b>
                              </div>
                              <div className="small">
                                Proses berikutnya: <b>{det.state?.next?.name || '-'}</b>
                              </div>
                            </div>

                            <h4 style={{ margin: '8px 0' }}>Log Aktivitas</h4>
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
                                {(det.history || []).map((s) => (
                                  <tr key={s.id}>
                                    <td>{s.start_time ? new Date(s.start_time).toLocaleString() : '-'}</td>
                                    <td>{s.end_time ? new Date(s.end_time).toLocaleString() : '-'}</td>
                                    <td>{s.duration_seconds != null ? `${s.duration_seconds} dtk` : '-'}</td>
                                    <td>{s.waiting_seconds || 0} dtk</td>
                                    <td>{s.resting_seconds || 0} dtk</td>
                                    <td>{s.activity_name || '-'}</td>
                                  </tr>
                                ))}
                                {(det.history || []).length === 0 && (
                                  <tr>
                                    <td colSpan={6} className="small">Belum ada riwayat.</td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="small" style={{ padding: 12, color: '#ef4444' }}>
                            Gagal memuat detail.
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// helper di atas/sekitar komponen
function currentActivityName(st) {
  const c = st?.state?.current || {};
  return (
     c.name ?? c.activity_name ?? c.master_activity_name ?? '-'
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
      await apiPost('/scan/start', {
        documentId: state.document.id,
        acceptOnly: true,          // <- penting untuk beda dari "Mulai"
      });
      await fetchState(state.document.id);    // status -> WAITING
    } catch (e) {
      alert(e.message || 'Gagal menerima dokumen');
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
  const body = { documentId: state.document.id };

  // kirim yang ada: id aktivitas (master) dan/atau id baris scan
  if (state?.state?.current?.id) body.activityId = state.state.current.id;
  if (state?.state?.current?.scan_id) body.activityScanId = state.state.current.scan_id;

  if (decision) body.decision = decision;

  setLoading(true);
  try {
    await apiPost('/scan/finish', body);
    await fetchState(state.document.id);
  } catch (e) {
    alert(e.message || 'Gagal selesai');
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
              <div className="card">
                <button onClick={acceptDocument}>Terima Dokumen</button>
              </div>
            )}

            {showStart && (
              <div className="card">
                <div className="small">Proses berikutnya: <b>{state.state.next?.name || '-'}</b></div>
                <button onClick={async () => {
                  setLoading(true);
                  try {
                    await apiPost('/scan/start', {
                      documentId: state.document.id,
                      processActivityId: state.state.next.id
                    });
                    await fetchState(state.document.id);
                  } finally { setLoading(false); }
                }}>
                  Mulai
                </button>
              </div>
            )}

            {showWorking && (
                <>
                  <div className="small">
                    Sedang dikerjakan: <b>{currentActivityName(state)}</b>
                  </div>
                  {state.state.current?.is_decision ? (
                    <div className="flex">
                      <button onClick={() => finishCurrent('accept')}>
                        {state.state.current.decision_accept_label || 'Lanjut'}
                      </button>
                      <button className="secondary" onClick={() => finishCurrent('reject')}>
                        {state.state.current.decision_reject_label || 'Tolak'}
                      </button>
                    </div>
                  ) : (
                    <button className="secondary" onClick={() => finishCurrent()}>
                      Selesai
                    </button>
                  )}
                </>
              )}

            {showDone && (
              <div className="card">
                <div className="small"><b>Proses selesai.</b> Tidak ada proses lanjutan.</div>
              </div>
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
