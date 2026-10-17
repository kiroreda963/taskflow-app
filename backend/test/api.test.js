import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { newDb } from 'pg-mem';
import request from 'supertest';

process.env.NODE_ENV = 'test';

const { createApp } = await import('../src/app.js');
const { migrate } = await import('../src/db.js');
const { buildPlan } = await import('../src/routes/insights.js');

async function makeApp() {
  const { Pool } = newDb().adapters.createPg();
  const pool = new Pool();
  await migrate(pool);
  return createApp({ pool });
}

async function register(app, email = 'a@example.com') {
  const res = await request(app).post('/api/auth/register').send({ email, password: 'password123' });
  assert.equal(res.status, 201);
  return { Authorization: `Bearer ${res.body.token}` };
}

describe('health', () => {
  it('reports ok without touching the database', async () => {
    const app = await makeApp();
    const res = await request(app).get('/health');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: 'ok' });
  });

  it('reports database status', async () => {
    const app = await makeApp();
    const res = await request(app).get('/health/db');
    assert.equal(res.status, 200);
    assert.equal(res.body.database, 'up');
  });
});

describe('auth', () => {
  let app;
  before(async () => { app = await makeApp(); });

  it('registers, rejects duplicates and logs in', async () => {
    await register(app, 'dup@example.com');
    const dup = await request(app).post('/api/auth/register').send({ email: 'dup@example.com', password: 'password123' });
    assert.equal(dup.status, 409);

    const ok = await request(app).post('/api/auth/login').send({ email: 'dup@example.com', password: 'password123' });
    assert.equal(ok.status, 200);
    assert.ok(ok.body.token);

    const bad = await request(app).post('/api/auth/login').send({ email: 'dup@example.com', password: 'wrongpass1' });
    assert.equal(bad.status, 401);
  });

  it('validates input', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'nope', password: 'short' });
    assert.equal(res.status, 400);
  });

  it('protects task routes', async () => {
    assert.equal((await request(app).get('/api/tasks')).status, 401);
    assert.equal((await request(app).get('/api/tasks').set('Authorization', 'Bearer garbage')).status, 401);
  });
});

describe('tasks', () => {
  let app;
  let auth;
  before(async () => {
    app = await makeApp();
    auth = await register(app);
  });

  it('creates, lists, updates and deletes a task', async () => {
    const created = await request(app).post('/api/tasks').set(auth)
      .send({ title: '  Write report ', priority: 1, due_date: '2026-10-20', estimate_min: 45 });
    assert.equal(created.status, 201);
    assert.equal(created.body.title, 'Write report');
    assert.equal(created.body.due_date, '2026-10-20');

    const list = await request(app).get('/api/tasks').set(auth);
    assert.equal(list.body.length, 1);

    const done = await request(app).patch(`/api/tasks/${created.body.id}`).set(auth).send({ status: 'done' });
    assert.equal(done.status, 200);
    assert.equal(done.body.status, 'done');
    assert.ok(done.body.completed_at);

    const del = await request(app).delete(`/api/tasks/${created.body.id}`).set(auth);
    assert.equal(del.status, 204);
    assert.equal((await request(app).get('/api/tasks').set(auth)).body.length, 0);
  });

  it('rejects invalid payloads', async () => {
    const res = await request(app).post('/api/tasks').set(auth)
      .send({ title: '', priority: 9, due_date: '2026-13-45' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /title/);
    assert.match(res.body.error, /priority/);
    assert.match(res.body.error, /due_date/);
  });

  it("does not expose one user's tasks to another", async () => {
    const t = await request(app).post('/api/tasks').set(auth).send({ title: 'Private' });
    const other = await register(app, 'other@example.com');
    assert.equal((await request(app).get('/api/tasks').set(other)).body.length, 0);
    assert.equal((await request(app).patch(`/api/tasks/${t.body.id}`).set(other).send({ title: 'hax' })).status, 404);
    assert.equal((await request(app).delete(`/api/tasks/${t.body.id}`).set(other)).status, 404);
  });
});

describe('timer', () => {
  it('runs one timer at a time and stops on completion', async () => {
    const app = await makeApp();
    const auth = await register(app);
    const a = (await request(app).post('/api/tasks').set(auth).send({ title: 'A' })).body;
    const b = (await request(app).post('/api/tasks').set(auth).send({ title: 'B' })).body;

    const s1 = await request(app).post('/api/timer/start').set(auth).send({ taskId: a.id });
    assert.equal(s1.status, 201);
    assert.equal(s1.body.active.task_id, a.id);

    const s2 = await request(app).post('/api/timer/start').set(auth).send({ taskId: b.id });
    assert.equal(s2.body.active.task_id, b.id);

    const tasks = (await request(app).get('/api/tasks').set(auth)).body;
    assert.equal(tasks.find((t) => t.id === a.id).status, 'doing');

    await request(app).patch(`/api/tasks/${b.id}`).set(auth).send({ status: 'done' });
    const active = await request(app).get('/api/timer').set(auth);
    assert.equal(active.body.active, null);

    const blocked = await request(app).post('/api/timer/start').set(auth).send({ taskId: b.id });
    assert.equal(blocked.status, 409);
  });
});

describe('plan', () => {
  it('orders overdue, then due today, then priority, and respects the time budget', () => {
    const tasks = [
      { id: 1, title: 'later high', priority: 1, due_date: '2026-11-01', estimate_min: 60 },
      { id: 2, title: 'today low', priority: 3, due_date: '2026-10-17', estimate_min: 30 },
      { id: 3, title: 'overdue', priority: 3, due_date: '2026-10-10', estimate_min: 45 },
      { id: 4, title: 'no date', priority: 2, due_date: null, estimate_min: null },
    ];
    const plan = buildPlan(tasks, 120, '2026-10-17');
    assert.deepEqual(plan.planned.map((t) => t.id), [3, 2, 4]);
    assert.deepEqual(plan.overflow.map((t) => t.id), [1]);
    assert.equal(plan.plannedMinutes, 105);
    assert.equal(plan.planned[0].overdue, true);
  });

  it('is available over the API', async () => {
    const app = await makeApp();
    const auth = await register(app);
    await request(app).post('/api/tasks').set(auth).send({ title: 'X', estimate_min: 20 });
    const res = await request(app).get('/api/plan?minutes=60').set(auth);
    assert.equal(res.status, 200);
    assert.equal(res.body.planned.length, 1);
  });
});

describe('stats', () => {
  it('returns a gap-free daily series', async () => {
    const app = await makeApp();
    const auth = await register(app);
    const t = (await request(app).post('/api/tasks').set(auth).send({ title: 'S' })).body;
    await request(app).post('/api/timer/start').set(auth).send({ taskId: t.id });
    await request(app).post('/api/timer/stop').set(auth);
    await request(app).patch(`/api/tasks/${t.id}`).set(auth).send({ status: 'done' });

    const res = await request(app).get('/api/stats?days=7').set(auth);
    assert.equal(res.status, 200);
    assert.equal(res.body.days.length, 7);
    assert.equal(res.body.totals.completedTasks, 1);
  });
});
