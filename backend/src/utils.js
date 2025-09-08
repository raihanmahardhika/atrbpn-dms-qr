// backend/src/utils.js

// WIB = UTC+7 (tanpa DST)
const TZ_OFFSET_SEC = 7 * 3600;
const DAY = 24 * 3600;
const WORK_START_SEC = 8 * 3600;   // 08:00
const WORK_END_SEC   = 17 * 3600;  // 17:00

// Ubah Date/ISO → detik "lokal" (garis waktu digeser +7h)
// Tujuan: operasi floor/ceil hari mengikuti tengah malam WIB.
function toLocalSeconds(d) {
  // Date.parse / new Date(d).getTime() memberikan epoch UTC (ms)
  return Math.floor(new Date(d).getTime() / 1000) + TZ_OFFSET_SEC;
}

// Dari "detik lokal" (tengah malam WIB) dapatkan DOW (1..5 = weekday)
function isWorkdayLocal(dayLocalSec) {
  // Kembalikan ke UTC ms, lalu ambil UTCDay agar tak terpengaruh zona host
  const utcMs = (dayLocalSec - TZ_OFFSET_SEC) * 1000;
  const dow = new Date(utcMs).getUTCDay(); // 0=Sun..6=Sat
  return dow >= 1 && dow <= 5;             // Mon..Fri
}

// Hitung overlap [a1,a2) dan [b1,b2) pada sumbu "detik lokal"
function overlapSeconds(a1, a2, b1, b2) {
  const s = Math.max(a1, b1);
  const e = Math.min(a2, b2);
  return e > s ? (e - s) : 0;
}

/**
 * Hitung waiting vs resting pada rentang [startDate, endDate)
 * - Waiting: jam 08:00–17:00 WIB, Senin–Jumat
 * - Resting: selain itu (termasuk Sabtu & Minggu penuh)
 * Input boleh Date/ISO string/timestamptz.
 */
export function splitGapWaitingResting(startDate, endDate) {
  let ls = toLocalSeconds(startDate);
  let le = toLocalSeconds(endDate);
  if (!Number.isFinite(ls) || !Number.isFinite(le) || le <= ls) {
    return { waitingSeconds: 0, restingSeconds: 0 };
  }

  let waiting = 0;

  // Hari lokal (dibulatkan ke tengah malam lokal)
  const startDay = Math.floor(ls / DAY) * DAY;
  const endDay   = Math.floor((le - 1) / DAY) * DAY;

  for (let day = startDay; day <= endDay; day += DAY) {
    if (!isWorkdayLocal(day)) continue; // akhir pekan = full resting

    // slot jam kerja hari ini dalam "detik lokal"
    const workStart = day + WORK_START_SEC;
    const workEnd   = day + WORK_END_SEC;

    // akumulasi bagian interval yang jatuh di jam kerja
    waiting += overlapSeconds(ls, le, workStart, workEnd);
  }

  const total = le - ls;
  const resting = Math.max(0, total - waiting);
  return { waitingSeconds: waiting, restingSeconds: resting };
}

export function nowISOString() {
  return new Date().toISOString();
}
