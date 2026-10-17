# Taskflow

A task planner and time tracker: Express API + React (Vite) frontend + PostgreSQL.

The application code is finished and tested. **Your job is the platform around it**: containerize it with Docker, provision AWS with Terraform, and automate delivery with GitHub Actions. Follow `LEARNING_PATH.md`.

## What the app needs from its environment

| Thing | Detail |
|---|---|
| Port | Listens on `PORT` (default `3000`) |
| Database | PostgreSQL. Env vars: `DB_HOST`, `DB_PORT` (5432), `DB_NAME`, `DB_USER`, `DB_PASSWORD`, and `DB_SSL=true` for RDS. Or a single `DATABASE_URL`. Defaults point at `localhost` / `taskflow` / `taskflow` / `taskflow` |
| Secret | `JWT_SECRET` is **required** when `NODE_ENV=production` |
| Frontend | The API serves the built React app from `STATIC_DIR` (default `../../frontend/dist` relative to `backend/src`) |
| Health | `GET /health` (liveness, never touches the DB) and `GET /health/db` (checks the database) |
| Startup | Creates its own tables on boot; retries the DB connection for about 30 seconds before exiting |
| Shutdown | Handles `SIGTERM` gracefully (important for ECS deployments) |
| Build info | Optional `APP_VERSION`, `GIT_SHA`, `ENVIRONMENT` show up at `GET /api/info` |

## Run it without Docker

```bash
# backend (needs a Postgres reachable with the env vars above)
cd backend && npm install && npm run dev       # :3000

# frontend (dev server proxies /api to :3000)
cd frontend && npm install && npm run dev      # :5173
```

Tests (no database needed, they use an in-memory Postgres):

```bash
cd backend && npm test
cd frontend && npm test
```

## Layout

```
backend/    Express 5 API: auth, tasks, timer, planner, stats
frontend/   React + Vite single-page app
```
