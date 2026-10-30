# ─────────────────────────────────────────────────────────────────────
# آسمان‌نگار — AsmanNegar Weather
# Multi-stage Docker build:
#   deps    = Bun (fast, deterministic install via bun.lock)
#   builder = Real Node.js (next build + prisma generate need node runtime;
#             oven/bun images ship NO node — bun's node-shim is unreliable
#             for Next 16 + Turbopack builds)
#   runner  = Node slim (runs Next standalone server.js, the canonical way)
# ─────────────────────────────────────────────────────────────────────

# ── Stage 1: install dependencies ────────────────────────────────────
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ── Stage 2: build the app (real Node.js) ────────────────────────────
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# DATABASE_URL is only needed at build time for PrismaClient
# instantiation during route collection — no real queries are made.
ENV DATABASE_URL="file:/app/db/custom.db" \
    NEXT_TELEMETRY_DISABLED=1
RUN ./node_modules/.bin/prisma generate \
    && npm run build

# ── Stage 3: minimal runtime ─────────────────────────────────────────
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL="file:/app/db/custom.db" \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# SQLite database (already seeded with 596 Iranian cities) + seed assets
COPY --from=builder /app/db ./db
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000
CMD ["node", "server.js"]
