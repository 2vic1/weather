# ─────────────────────────────────────────────────────────────────────
# آسمان‌نگار — AsmanNegar Weather
# Multi-stage Docker build (Bun + Next.js standalone + SQLite)
# ─────────────────────────────────────────────────────────────────────

# ── Stage 1: install dependencies ────────────────────────────────────
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ── Stage 2: build the app ───────────────────────────────────────────
FROM oven/bun:1 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# DATABASE_URL is only needed at build time for PrismaClient
# instantiation during route collection — no real queries are made.
ENV DATABASE_URL="file:/app/db/custom.db"
RUN bun run db:generate && bun run build

# ── Stage 3: minimal runtime ─────────────────────────────────────────
FROM oven/bun:1-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL="file:/app/db/custom.db"

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# SQLite database (already seeded with 596 Iranian cities) + seed assets
COPY --from=builder /app/db ./db
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000
CMD ["bun", "server.js"]
