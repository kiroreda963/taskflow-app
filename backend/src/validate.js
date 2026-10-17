const PRIORITIES = [1, 2, 3]; // 1 = high, 2 = medium, 3 = low
const STATUSES = ['todo', 'doing', 'done'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/**
 * Validates a task payload. With partial=true only provided fields are checked/returned.
 * Returns { errors: string[], values: object }.
 */
export function parseTaskInput(body, { partial = false } = {}) {
  const errors = [];
  const values = {};
  const b = body && typeof body === 'object' ? body : {};
  const has = (k) => Object.prototype.hasOwnProperty.call(b, k);

  if (has('title') || !partial) {
    const title = typeof b.title === 'string' ? b.title.trim() : '';
    if (!title || title.length > 200) errors.push('title must be 1-200 characters');
    else values.title = title;
  }
  if (has('notes')) {
    if (typeof b.notes !== 'string' || b.notes.length > 2000) errors.push('notes must be a string up to 2000 characters');
    else values.notes = b.notes;
  }
  if (has('priority')) {
    if (!PRIORITIES.includes(b.priority)) errors.push('priority must be 1, 2 or 3');
    else values.priority = b.priority;
  }
  if (has('status')) {
    if (!STATUSES.includes(b.status)) errors.push('status must be todo, doing or done');
    else values.status = b.status;
  }
  if (has('due_date')) {
    if (b.due_date !== null && !isValidDate(b.due_date)) errors.push('due_date must be YYYY-MM-DD or null');
    else values.due_date = b.due_date;
  }
  if (has('estimate_min')) {
    const e = b.estimate_min;
    if (e !== null && !(Number.isInteger(e) && e >= 1 && e <= 1440)) errors.push('estimate_min must be an integer 1-1440 or null');
    else values.estimate_min = e;
  }
  return { errors, values };
}

/** Normalizes a DATE value (string from pg, or Date from test DBs) to 'YYYY-MM-DD' or null. */
export function dateOnly(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

export function parseTzOffset(raw) {
  const n = Number(raw);
  // minutes, same sign convention as JS Date.getTimezoneOffset() (UTC+3 => -180)
  return Number.isFinite(n) && Math.abs(n) <= 14 * 60 ? Math.trunc(n) : 0;
}

/** 'YYYY-MM-DD' for a timestamp in the user's local timezone. */
export function localDay(ts, tzOffsetMin) {
  return new Date(new Date(ts).getTime() - tzOffsetMin * 60000).toISOString().slice(0, 10);
}
