import fs from 'node:fs';
import path from 'node:path';

import express from 'express';
import helmet from 'helmet';

import { requireAuth } from './auth.js';
import { authRouter } from './routes/auth.js';
import { insightsRouter } from './routes/insights.js';
import { tasksRouter } from './routes/tasks.js';
import { timerRouter } from './routes/timer.js';

export function createApp({ pool, staticDir } = {}) {
  const app = express();
  app.disable('x-powered-by');
  // The app sits behind an ALB: trust one proxy hop so rate limiting sees real client IPs.
  app.set('trust proxy', 1);
  app.use(
    helmet({
      // The demo ALB serves plain HTTP; HSTS / upgrade-insecure-requests would break asset loading.
      hsts: false,
      contentSecurityPolicy: { useDefaults: true, directives: { 'upgrade-insecure-requests': null } },
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  // Liveness: used by the ALB target group and the Docker HEALTHCHECK. Must not touch the DB.
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/health/db', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', database: 'up' });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'down' });
    }
  });
  app.get('/api/info', (_req, res) =>
    res.json({
      name: 'taskflow',
      version: process.env.APP_VERSION || 'dev',
      gitSha: process.env.GIT_SHA || 'local',
      environment: process.env.ENVIRONMENT || 'local',
      containerId: process.env.HOSTNAME || 'unknown',
    }),
  );

  app.use('/api/auth', authRouter(pool));
  app.use('/api/tasks', requireAuth, tasksRouter(pool));
  app.use('/api/timer', requireAuth, timerRouter(pool));
  app.use('/api', requireAuth, insightsRouter(pool));

  // Serve the built React app (single container = simpler ECS service).
  if (staticDir && fs.existsSync(staticDir)) {
    app.use(express.static(staticDir, { index: 'index.html', maxAge: '1h' }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
      return res.sendFile(path.join(path.resolve(staticDir), 'index.html'));
    });
  }

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
