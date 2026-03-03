# syntax=docker/dockerfile:1.7

FROM oven/bun:1.2 AS builder
WORKDIR /workspace

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages ./packages

RUN corepack enable
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV ONECLAW_CONFIG_PATH=/config/config.json

RUN addgroup -S oneclaw && adduser -S oneclaw -G oneclaw
RUN mkdir -p /opt/oneclaw /config && chown -R oneclaw:oneclaw /opt/oneclaw /config

COPY --from=builder /workspace/dist/index.js /opt/oneclaw/index.js

USER oneclaw
VOLUME ["/config"]

ENTRYPOINT ["node", "/opt/oneclaw/index.js"]
CMD ["--help"]
