/** 3725 -> "1:02:05", 125 -> "2:05" */
export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  const ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** 95 -> "1h 35m", 40 -> "40m", 0 -> "0m" */
export function formatMinutes(totalMinutes) {
  const m = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(m / 60);
  return h ? `${h}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`;
}

export const PRIORITY_LABELS = { 1: 'High', 2: 'Medium', 3: 'Low' };

/** 'YYYY-MM-DD' -> 'overdue' | 'today' | 'upcoming' | null relative to a given today string. */
export function dueState(dueDate, today) {
  if (!dueDate) return null;
  if (dueDate < today) return 'overdue';
  if (dueDate === today) return 'today';
  return 'upcoming';
}

export function todayString(now = new Date()) {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
