import { Router } from 'express';

import { dateOnly, parseTaskInput } from '../validate.js';

/** Sum of tracked seconds per task id from time_entries rows. */
export function trackedByTask(entries, now = Date.now()) {
  const totals = new Map();
  for (const e of entries) {
    const end = e.ended_at ? new Date(e.ended_at).getTime() : now;
    const secs = Math.max(0, Math.round((end - new Date(e.started_at).getTime()) / 1000));
    totals.set(e.task_id, (totals.get(e.task_id) || 0) + secs);
  }
  return totals;
}

export function formatTask(row, totals) {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    priority: row.priority,
    status: row.status,
    due_date: dateOnly(row.due_date),
    estimate_min: row.estimate_min,
    created_at: row.created_at,
    completed_at: row.completed_at,
    tracked_seconds: totals.get(row.id) || 0,
  };
}

export function tasksRouter(pool) {
  const router = Router();

  router.get('/', async (req, res) => {
    const { status } = req.query;
    const params = [req.userId];
    let where = 'user_id = $1';
    if (['todo', 'doing', 'done'].includes(status)) {
      params.push(status);
      where += ' AND status = $2';
    }
    const tasks = await pool.query(
      `SELECT * FROM tasks WHERE ${where} ORDER BY priority ASC, due_date ASC, id ASC`,
      params,
    );
    const entries = await pool.query(
      'SELECT task_id, started_at, ended_at FROM time_entries WHERE user_id = $1',
      [req.userId],
    );
    const totals = trackedByTask(entries.rows);
    res.json(tasks.rows.map((t) => formatTask(t, totals)));
  });

  router.post('/', async (req, res) => {
    const { errors, values } = parseTaskInput(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });
    const { rows } = await pool.query(
      `INSERT INTO tasks (user_id, title, notes, priority, due_date, estimate_min)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        req.userId,
        values.title,
        values.notes ?? '',
        values.priority ?? 2,
        values.due_date ?? null,
        values.estimate_min ?? null,
      ],
    );
    res.status(201).json(formatTask(rows[0], new Map()));
  });

  router.patch('/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
    const { errors, values } = parseTaskInput(req.body, { partial: true });
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });
    if (!Object.keys(values).length) return res.status(400).json({ error: 'No fields to update' });

    const current = await pool.query('SELECT * FROM tasks WHERE id = $1 AND user_id = $2', [id, req.userId]);
    if (!current.rows.length) return res.status(404).json({ error: 'Task not found' });

    const sets = [];
    const params = [];
    for (const [key, value] of Object.entries(values)) {
      params.push(value);
      sets.push(`${key} = $${params.length}`);
    }
    if (values.status === 'done' && current.rows[0].status !== 'done') {
      params.push(new Date());
      sets.push(`completed_at = $${params.length}`);
      // Finishing a task stops any timer running on it.
      await pool.query(
        'UPDATE time_entries SET ended_at = $1 WHERE task_id = $2 AND user_id = $3 AND ended_at IS NULL',
        [new Date(), id, req.userId],
      );
    } else if (values.status && values.status !== 'done') {
      sets.push('completed_at = NULL');
    }
    params.push(id, req.userId);
    const { rows } = await pool.query(
      `UPDATE tasks SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND user_id = $${params.length} RETURNING *`,
      params,
    );
    const entries = await pool.query(
      'SELECT task_id, started_at, ended_at FROM time_entries WHERE task_id = $1',
      [id],
    );
    res.json(formatTask(rows[0], trackedByTask(entries.rows)));
  });

  router.delete('/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
    const { rows } = await pool.query(
      'DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.userId],
    );
    if (!rows.length) return res.status(404).json({ error: 'Task not found' });
    res.status(204).end();
  });

  return router;
}
