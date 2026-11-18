# syntax=docker/dockerfile:1

FROM node:26-trixie-slim AS deps
WORKDIR /app
# npm ci runs an implicit `node-gyp rebuild` for better-sqlite3 (it has a
# binding.gyp), and node-gyp needs Python and make even when the package's
# bundled prebuild means nothing is compiled. g++ covers the source-build
# fallback. These tools stay in this stage; the runner image never sees them.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM node:26-trixie-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p public && npm run build

FROM node:26-trixie-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN mkdir -p /app/data && chown -R node:node /app

USER node

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
# COPY --from=builder --chown=node:node /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
