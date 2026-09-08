# Diriyah Next.js — multi-stage production image (standalone output)
# Requires next.config.mjs → output: 'standalone'

# ── Stage 1: install dependencies ───────────────────────────────────────────
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ── Stage 2: build Next.js + Prisma Client ───────────────────────────────────
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Prisma client for the Linux target used at runtime
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# Dummy URL satisfies Prisma generate (no live DB required at build time)
ENV DATABASE_URL="mysql://atlas_user:atlas_secret@db:3306/atlas_db"

RUN npx prisma generate
RUN npm run build

# ── Stage 3: minimal runner ──────────────────────────────────────────────────
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Public assets + standalone server
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Prisma engines + client (required for server actions / lib/prisma.ts)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/prisma ./prisma

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
