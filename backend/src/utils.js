// backend/src/utils.js

// WIB (UTC+7)
const TZ_OFFSET_SEC = 7 * 3600;

// Konversi Date -> detik lokal (epoch + offset)
// dipakai supaya floor/naik hari mengacu ke tengah malam lokal
function toLocalSeconds(d) {
  return Math.floor(new Date(d).getTime() / 1000) + TZ_OFFSET_SEC;
}

// Cek apakah dayLocalSec (tengah malam lokal) termasuk hari kerja (Senin–Jumat)
function isWorkdayLocal(dayLocalSec) {
  // ubah kembali ke UTC untuk mendapatkan day-of-week yang benar via getUTCDay()
  const utcMs = (dayLocalSec - TZ_OFFSET_SEC) * 1000;
  const dow = new Date(utcMs).getUTCDay(); // 0=Sun..6=Sat
  return dow >= 1 && dow <= 5; // Mon..Fri
}

/**
 * Hitung waiting vs resting pada rentang [startDate, endDate):
 * - Waiting: hanya jam kerja 08:00–17:00 pada hari kerja (Senin–Jumat)
 * - Resting: di luar jam kerja + weekend penuh
 * - Zona waktu: WIB (UTC+7)
 */
export function splitGapWaitingResting(startDate, endDate) {
  let ls = toLocalSeconds(startDate);
  let le = toLocalSeconds(endDate);
  if (le <= ls) return { waitingSeconds: 0, restingSeconds: 0 };

  const DAY = 24 * 3600;
  let waiting = 0;

  // Hari lokal (dibulatkan ke tengah malam lokal)
  const startDay = Math.floor(ls / DAY) * DAY;
  const endDay = Math.floor((le - 1) / DAY) * DAY;

  for (let day = startDay; day <= endDay; day += DAY) {
    // Hanya hitung overlap jam kerja jika HARI KERJA
    if (isWorkdayLocal(day)) {
      const workStart = day + 8 * 3600;   // 08:00 lokal
      const workEnd   = day + 17 * 3600;  // 17:00 lokal

      // Overlap [ls, le) ∩ [workStart, workEnd)
      const s = Math.max(ls, workStart);
      const e = Math.min(le, workEnd);
      if (e > s) waiting += (e - s);
    }
  }

  const total = le - ls;
  const resting = Math.max(0, total - waiting);
  return { waitingSeconds: waiting, restingSeconds: resting };
}

export function nowISOString() {
  return new Date().toISOString();
}
