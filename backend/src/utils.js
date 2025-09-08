// backend/src/utils.js

// WIB = UTC+7 (tanpa DST)
const TZ_OFFSET_SEC = 7 * 3600;
const DAY = 24 * 3600;
const WORK_START_SEC = 8 * 3600;  // 08:00
const WORK_END_SEC   = 17 * 3600; // 17:00

// Ubah Date/ISO → detik "lokal" (epoch +7 jam)
// Tujuan: operasi floor/ceil hari mengikuti tengah malam WIB secara presisi.
function toLocalSeconds(d) {
  return Math.floor(new Date(d).getTime() / 1000) + TZ_OFFSET_SEC;
}

// [FIX] Dapatkan DOW lokal LANGSUNG dari "detik lokal".
// Karena dayLocalSec sudah +7h, maka new Date(dayLocalSec*1000).getUTCDay()
// = day-of-week lokal (0=Min..6=Sab)
function isWorkdayLocal(dayLocalSec) {
  const dowLocal = new Date(dayLocalSec * 1000).getUTCDay(); // 0=Min..6=Sab (LOKAL)
  return dowLocal >= 1 && dowLocal <= 5; // Sen..Jum
}

function overlapSeconds(a1, a2, b1, b2) {
  const s = Math.max(a1, b1);
  const e = Math.min(a2, b2);
  return e > s ? (e - s) : 0;
}

/**
 * Hitung waiting vs resting pada rentang [startDate, endDate)
 * - Waiting: jam 08:00–17:00 WIB, Sen–Jum
 * - Resting: selain itu (termasuk Sabtu & Minggu penuh)
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
    if (!isWorkdayLocal(day)) continue; // weekend = full resting

    const workStart = day + WORK_START_SEC; // 08:00 lokal
    const workEnd   = day + WORK_END_SEC;   // 17:00 lokal

    waiting += overlapSeconds(ls, le, workStart, workEnd);
  }

  const total = le - ls;
  const resting = Math.max(0, total - waiting);
  return { waitingSeconds: waiting, restingSeconds: resting };
}

export function nowISOString() {
  return new Date().toISOString();
}
