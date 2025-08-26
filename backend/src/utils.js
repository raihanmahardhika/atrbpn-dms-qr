const TZ_OFFSET_SEC = 7 * 3600;
function toLocalSeconds(d) { return Math.floor(d.getTime() / 1000) + TZ_OFFSET_SEC; }
export function splitGapWaitingResting(startDate, endDate) {
  let ls = toLocalSeconds(startDate), le = toLocalSeconds(endDate);
  if (le <= ls) return { waitingSeconds: 0, restingSeconds: 0 };
  const DAY = 24*3600; let waiting = 0;
  const startDay = Math.floor(ls/DAY)*DAY, endDay = Math.floor((le-1)/DAY)*DAY;
  for (let day=startDay; day<=endDay; day+=DAY) {
    const workStart = day + 8*3600, workEnd = day + 17*3600;
    const s = Math.max(ls, workStart), e = Math.min(le, workEnd);
    if (e > s) waiting += (e - s);
  }
  const total = le - ls; const resting = Math.max(0, total - waiting);
  return { waitingSeconds: waiting, restingSeconds: resting };
}
export function nowISOString(){ return new Date().toISOString(); }
