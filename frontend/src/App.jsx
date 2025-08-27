import React, { useEffect, useMemo, useState } from "react";

/* =========================
   0) Helper API (minimal)
   - Jika kamu sudah punya apiGet/apiPost sendiri,
     boleh hapus dua fungsi di bawah
   ========================= */
const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, { credentials: "omit" });
  if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    credentials: "omit",
  });
  if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

/* =========================
   1) App
   ========================= */
export default function App() {
  // ----------------- loading overlay -----------------
  const [loading, setLoading] = useState(false);
  const withLoading = async (fn) => {
    setLoading(true);
    try {
      return await fn();
    } finally {
      setLoading(false);
    }
  };
  // wrapper supaya tinggal ganti pemanggilan:
  // ganti semua `apiGet(`/path`)` -> `apiGetL(`/path`)`
  // ganti semua `apiPost(`/path`, data)` -> `apiPostL(`/path`, data)`
  const apiGetL = (path) => withLoading(() => apiGet(path));
  const apiPostL = (path, body) => withLoading(() => apiPost(path, body));

  // ----------------- state contoh halaman -----------------
  const [page, setPage] = useState("home"); // 'home' | 'admin' | 'create' | 'scan'
  const [admin, setAdmin] = useState(null); // { id, office_type, region, ... }
  const [processes, setProcesses] = useState([]);
  const [selectedProcessId, setSelectedProcessId] = useState("");
  const [docCreated, setDocCreated] = useState(null); // { id }

  // ----------- SCAN state (status dokumen) -----------
  const [scanId, setScanId] = useState("");
  const [scanState, setScanState] = useState(null); // respons /scan/state/:id

  // ----------------- effects kecil -----------------
  useEffect(() => {
    // contoh restore admin dari localStorage
    const a = localStorage.getItem("admin");
    if (a) setAdmin(JSON.parse(a));
  }, []);

  // =========================
  // 2) ADMIN: Sign-in (contoh minimal)
  // =========================
  async function adminLogin(adminId) {
    const data = await apiPostL("/auth/admin/login", { adminId });
    setAdmin(data);
    localStorage.setItem("admin", JSON.stringify(data));
    setPage("create");
  }

  // =========================
  // 3) ADMIN: Ambil proses & buat dokumen
  // =========================
  async function fetchProcesses() {
    const rows = await apiGetL("/admin/processes");
    setProcesses(rows || []);
  }

  useEffect(() => {
    if (page === "create") fetchProcesses();
  }, [page]);

  async function createDocument() {
    if (!selectedProcessId) {
      alert("Pilih proses terlebih dahulu");
      return;
    }
    // sesuai logic terakhir: ambil office_type & region dari admin yg login
    const body = {
      processId: selectedProcessId,
      officeType: admin?.office_type,
      region: admin?.region,
    };
    const doc = await apiPostL("/admin/documents", body);
    setDocCreated(doc); // { id }
  }

  // =========================
  // 4) SCAN: ambil status, mulai, selesai
  // =========================
  function isUuidLike(s) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[ab89][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      (s || "").trim()
    );
  }

  async function fetchScanState(id) {
    if (!isUuidLike(id)) {
      alert("QR/ID tidak valid");
      return;
    }
    const st = await apiGetL(`/scan/state/${id}`);
    setScanState(st);
    setScanId(id);
  }

  async function startActivity() {
    if (!scanId) return;
    await apiPostL("/scan/start", { documentId: scanId });
    const st = await apiGetL(`/scan/state/${scanId}`);
    setScanState(st);
  }

  // finish: jika ada decision/nextProcessActivityId, kirimkan sesuai UI-mu
  async function finishActivity({ decision, nextProcessActivityId } = {}) {
    if (!scanId) return;
    const body = { documentId: scanId };
    if (decision) body.decision = decision; // 'accept' / 'reject'
    if (nextProcessActivityId) body.nextProcessActivityId = nextProcessActivityId;

    await apiPostL("/scan/finish", body);
    const st = await apiGetL(`/scan/state/${scanId}`);
    setScanState(st);
  }

  // =========================
  // 5) UI — sederhanakan contoh
  // (Sesuaikan dengan UI kamu; yang penting
  //  pakai apiGetL/apiPostL agar spinner tampil)
  // =========================
  const qrUrl = useMemo(() => {
    if (!docCreated?.id) return "";
    return `${API_BASE}/admin/documents/${docCreated.id}/qr.png`;
  }, [docCreated]);

  return (
    <div className="container">
      {/* NAV sederhana */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setPage("home")}>Home</button>
        <button onClick={() => setPage("scan")}>Scan</button>
        <button onClick={() => setPage("admin")}>Sign In Admin</button>
        <button onClick={() => setPage("create")} disabled={!admin}>
          Create Document
        </button>
      </div>

      {page === "home" && (
        <div className="card">
          <h2>Menu Utama</h2>
          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={() => setPage("admin")}>Sign In Admin</button>
            <button onClick={() => setPage("scan")}>Scan QR</button>
          </div>
        </div>
      )}

      {page === "admin" && (
        <AdminSignIn onSignedIn={adminLogin} loading={loading} />
      )}

      {page === "create" && (
        <div className="card">
          <h3>Generate Dokumen + QR</h3>
          <div style={{ marginTop: 8 }}>
            <label>Proses</label>
            <select
              value={selectedProcessId}
              onChange={(e) => setSelectedProcessId(e.target.value)}
            >
              <option value="">-- pilih --</option>
              {processes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <button
            className="btn-primary"
            onClick={createDocument}
            disabled={loading || !selectedProcessId}
            style={{ marginTop: 12 }}
          >
            {loading ? "Membuat…" : "Generate"}
          </button>

          {docCreated?.id && (
            <div className="card" style={{ marginTop: 16 }}>
              <div>
                <b>ID:</b> {docCreated.id}
              </div>
              <div style={{ marginTop: 12 }}>
                <img
                  src={qrUrl}
                  alt="QR"
                  width={140}
                  height={140}
                  style={{ background: "#fff", padding: 8, borderRadius: 8 }}
                />
              </div>
              <a
                href={qrUrl}
                download="qr.png"
                className="btn"
                style={{ marginTop: 12 }}
              >
                Download QR
              </a>
            </div>
          )}
        </div>
      )}

      {page === "scan" && (
        <div className="card">
          <h3>Scan QR</h3>

          {/* Contoh input manual (ganti dengan komponen kamera milikmu) */}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input
              placeholder="Tempel Document ID di sini"
              value={scanId}
              onChange={(e) => setScanId(e.target.value)}
            />
            <button
              onClick={() => fetchScanState(scanId)}
              disabled={loading || !scanId}
            >
              {loading ? "Memuat…" : "Ambil Status"}
            </button>
          </div>

          {scanState && (
            <div style={{ marginTop: 16 }}>
              <div>
                <b>Dokumen:</b> {scanState.documentId}
              </div>
              <div>
                <b>Aktivitas berikutnya:</b>{" "}
                {scanState.nextActivityName ?? "-"}
              </div>
              <div>
                <b>Waiting sekarang:</b> {scanState.waitingSeconds ?? 0}s
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button
                  className="btn-primary"
                  onClick={startActivity}
                  disabled={loading}
                >
                  {loading ? "Memulai…" : "Mulai"}
                </button>

                <button
                  className="btn-success"
                  onClick={() => finishActivity()}
                  disabled={loading}
                >
                  {loading ? "Menyelesaikan…" : "Selesai"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ------------- LOADING OVERLAY ------------- */}
      {loading && (
        <div className="loading-overlay" role="status" aria-live="polite">
          <div className="spinner" />
          <div className="loading-text">memuat…</div>
        </div>
      )}
    </div>
  );
}

/* =========================
   6) Komponen kecil: Admin Sign-In (contoh)
   ========================= */
function AdminSignIn({ onSignedIn, loading }) {
  const [adminId, setAdminId] = useState("");
  return (
    <div className="card">
      <h3>Sign In Admin</h3>
      <div style={{ marginTop: 8 }}>
        <label>Admin ID</label>
        <input
          value={adminId}
          onChange={(e) => setAdminId(e.target.value)}
          placeholder="Mis: ADM-001"
        />
      </div>
      <button
        className="btn-primary"
        onClick={() => onSignedIn(adminId)}
        disabled={loading || !adminId}
        style={{ marginTop: 12 }}
      >
        {loading ? "Masuk…" : "Masuk"}
      </button>
    </div>
  );
}
