import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createApp } from './app.js';
import { createPool, migrate } from './db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const staticDir = process.env.STATIC_DIR || path.resolve(here, '../../frontend/dist');

const pool = createPool();

async function start() {
  // Retry so the container survives starting before the database is reachable.
  for (let attempt = 1; ; attempt += 1) {
    try {
      await migrate(pool);
      break;
    } catch (err) {
      if (attempt >= 10) throw err;
      console.warn(`Database not ready (attempt ${attempt}): ${err.message}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  const server = createApp({ pool, staticDir }).listen(port, () => {
    console.log(`taskflow listening on :${port}`);
  });

  // ECS sends SIGTERM on deploys/scale-in: stop accepting connections, then exit cleanly.
  const shutdown = () => {
    console.log('SIGTERM received, shutting down');
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
