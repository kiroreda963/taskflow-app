FROM node:22-alpine AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:22-alpine AS deps
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci

FROM node:22-alpine AS runtime
ARG APP_VERSION=dev
ARG GIT_SHA=local
ENV NODE_ENV=production \
    PORT=3000 \
    STATIC_DIR=/app/public \
    APP_VERSION=${APP_VERSION} \
    GIT_SHA=${GIT_SHA}
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY backend/package.json ./
COPY backend/src ./src
COPY --from=frontend /build/dist ./public

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["node", "src/server.js"]
