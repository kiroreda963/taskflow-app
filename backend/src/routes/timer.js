import { Router } from 'express';

export function timerRouter(pool) {
  const router = Router();

  async function activeTimer(userId) {
    const { rows } = await pool.query(
      `SELECT e.id AS entry_id, e.task_id, e.started_at, t.title
         FROM time_entries e JOIN tasks t ON t.id = e.task_id
        WHERE e.user_id = $1 AND e.ended_at IS NULL
        ORDER BY e.id DESC LIMIT 1`,
      [userId],
    );
    return rows[0] || null;
  }

  router.get('/', async (req, res) => {
    res.json({ active: await activeTimer(req.userId) });
  });

  router.post('/start', async (req, res) => {
    const taskId = Number(req.body?.taskId);
    if (!Number.isInteger(taskId)) return res.status(400).json({ error: 'taskId is required' });

    const task = await pool.query('SELECT id, status FROM tasks WHERE id = $1 AND user_id = $2', [taskId, req.userId]);
    if (!task.rows.length) return res.status(404).json({ error: 'Task not found' });
    if (task.rows[0].status === 'done') return res.status(409).json({ error: 'Task is already done' });

    const now = new Date();
    // Only one timer at a time: stop whatever is running.
    await pool.query('UPDATE time_entries SET ended_at = $1 WHERE user_id = $2 AND ended_at IS NULL', [now, req.userId]);
    await pool.query('INSERT INTO time_entries (user_id, task_id, started_at) VALUES ($1, $2, $3)', [req.userId, taskId, now]);
    if (task.rows[0].status === 'todo') {
      await pool.query("UPDATE tasks SET status = 'doing' WHERE id = $1", [taskId]);
    }
    res.status(201).json({ active: await activeTimer(req.userId) });
  });

  router.post('/stop', async (req, res) => {
    const { rows } = await pool.query(
      'UPDATE time_entries SET ended_at = $1 WHERE user_id = $2 AND ended_at IS NULL RETURNING id',
      [new Date(), req.userId],
    );
    res.json({ stopped: rows.length > 0, active: null });
  });

  return router;
}
