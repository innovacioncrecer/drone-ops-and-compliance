# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY tsconfig.json agent.ts ./
RUN pnpm exec tsc
RUN pnpm prune --prod

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV TRANSCRIPTS_DIR=/app/transcripts

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 doco \
  && useradd --system --uid 1001 --gid doco doco \
  && mkdir -p /app/transcripts \
  && chown -R doco:doco /app/transcripts

COPY --from=builder --chown=doco:doco /app/package.json ./package.json
COPY --from=builder --chown=doco:doco /app/node_modules ./node_modules
COPY --from=builder --chown=doco:doco /app/dist ./dist

USER doco

CMD ["node", "dist/agent.js", "start"]
