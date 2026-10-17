import { Router } from 'express';

import { dateOnly, localDay, parseTzOffset } from '../validate.js';

const DEFAULT_ESTIMATE_MIN = 30;

/**
 * Orders open tasks (overdue -> due today -> priority -> earliest due -> oldest)
 * and fits as many as possible into the available minutes.
 */
export function buildPlan(tasks, availableMin, today) {
  const rank = (t) => {
    if (t.due_date && t.due_date < today) return 0; // overdue
    if (t.due_date === today) return 1;
    return 2;
  };
  const sorted = [...tasks].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      a.priority - b.priority ||
      (a.due_date || '9999-12-31').localeCompare(b.due_date || '9999-12-31') ||
      a.id - b.id,
  );

  const planned = [];
  const overflow = [];
  let used = 0;
  for (const t of sorted) {
    const minutes = t.estimate_min || DEFAULT_ESTIMATE_MIN;
    const item = {
      id: t.id,
      title: t.title,
      priority: t.priority,
      due_date: t.due_date,
      minutes,
      overdue: rank(t) === 0,
      estimated: Boolean(t.estimate_min),
    };
    if (used + minutes <= availableMin) {
      planned.push(item);
      used += minutes;
    } else {
      overflow.push(item);
    }
  }
  return { planned, overflow, plannedMinutes: used, availableMinutes: availableMin };
}

export function insightsRouter(pool) {
  const router = Router();

  router.get('/plan', async (req, res) => {
    const available = Math.min(Math.max(parseInt(req.query.minutes, 10) || 240, 15), 1440);
    const tz = parseTzOffset(req.query.tzOffset);
    const today = localDay(Date.now(), tz);
    const { rows } = await pool.query(
      "SELECT id, title, priority, due_date, estimate_min FROM tasks WHERE user_id = $1 AND status <> 'done'",
      [req.userId],
    );
    const open = rows.map((r) => ({ ...r, due_date: dateOnly(r.due_date) }));
    res.json({ today, ...buildPlan(open, available, today) });
  });

  router.get('/stats', async (req, res) => {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 7, 1), 90);
    const tz = parseTzOffset(req.query.tzOffset);
    const since = new Date(Date.now() - (days + 1) * 86400000);

    const entries = await pool.query(
      `SELECT e.task_id, e.started_at, e.ended_at, t.title
         FROM time_entries e JOIN tasks t ON t.id = e.task_id
        WHERE e.user_id = $1 AND e.started_at >= $2`,
      [req.userId, since],
    );
    const completed = await pool.query(
      'SELECT completed_at FROM tasks WHERE user_id = $1 AND completed_at >= $2',
      [req.userId, since],
    );

    // Pre-fill every day in the window so the chart has no gaps.
    const byDay = new Map();
    for (let i = days - 1; i >= 0; i -= 1) {
      byDay.set(localDay(Date.now() - i * 86400000, tz), { date: null, trackedMinutes: 0, completedTasks: 0 });
    }
    for (const key of byDay.keys()) byDay.get(key).date = key;

    const byTask = new Map();
    const now = Date.now();
    for (const e of entries.rows) {
      const end = e.ended_at ? new Date(e.ended_at).getTime() : now;
      const minutes = Math.max(0, (end - new Date(e.started_at).getTime()) / 60000);
      const day = byDay.get(localDay(e.started_at, tz));
      if (day) {
        day.trackedMinutes += minutes;
        const prev = byTask.get(e.task_id) || { taskId: e.task_id, title: e.title, minutes: 0 };
        prev.minutes += minutes;
        byTask.set(e.task_id, prev);
      }
    }
    for (const c of completed.rows) {
      const day = byDay.get(localDay(c.completed_at, tz));
      if (day) day.completedTasks += 1;
    }

    const daily = [...byDay.values()].map((d) => ({ ...d, trackedMinutes: Math.round(d.trackedMinutes) }));
    res.json({
      days: daily,
      totals: {
        trackedMinutes: daily.reduce((s, d) => s + d.trackedMinutes, 0),
        completedTasks: daily.reduce((s, d) => s + d.completedTasks, 0),
        topTasks: [...byTask.values()]
          .sort((a, b) => b.minutes - a.minutes)
          .slice(0, 5)
          .map((t) => ({ ...t, minutes: Math.round(t.minutes) })),
      },
    });
  });

  return router;
}
