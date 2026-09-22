# ---------- stage 1: build the web client ----------
FROM node:22-bookworm-slim AS web
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---------- stage 2: install server deps ----------
FROM node:22-bookworm-slim AS deps
WORKDIR /app/server
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY server/package*.json ./
RUN npm ci --omit=dev

# ---------- stage 3: runtime ----------
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=4000 DATA_DIR=/data
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /data && chown -R node:node /data

COPY --from=deps  /app/server/node_modules ./node_modules
COPY server/package.json ./package.json
COPY server/src ./src
COPY --from=web   /app/web/dist ./public

USER node
VOLUME ["/data"]
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=4s --start-period=10s --retries=3 \
  CMD curl -fsS http://127.0.0.1:4000/api/health || exit 1

CMD ["node", "src/index.js"]
