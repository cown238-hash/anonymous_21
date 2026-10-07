# syntax=docker/dockerfile:1

# ---------- Stage 1: install dependencies -------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
# npm 11+ blocks lifecycle scripts unless they are explicitly allowed.
ENV NPM_CONFIG_ALLOW_SCRIPTS=true
RUN npm ci --omit=dev --workspaces --include-workspace-root


# ---------- Stage 2: build ----------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
ENV NPM_CONFIG_ALLOW_SCRIPTS=true
RUN npm ci --workspaces --include-workspace-root

COPY server ./server
COPY client ./client
RUN npm run build


# ---------- Stage 3: production runtime ---------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache libc6-compat openssl curl \
    && addgroup -S nimbus && adduser -S nimbus -G nimbus

ENV NODE_ENV=production \
    PORT=4000 \
    NPM_CONFIG_ALLOW_SCRIPTS=true

COPY --from=deps  /app/node_modules          ./node_modules
COPY --from=build /app/server/dist           ./server/dist
COPY --from=build /app/server/prisma         ./server/prisma
COPY --from=build /app/server/package.json   ./server/package.json
COPY --from=build /app/client/dist           ./client/dist
COPY package.json ./package.json

# Prisma engines for `migrate deploy` at container start.
COPY --from=build /app/node_modules/prisma        ./node_modules/prisma
COPY --from=build /app/node_modules/@prisma       ./node_modules/@prisma
COPY --from=build /app/node_modules/.prisma       ./node_modules/.prisma

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

RUN mkdir -p /app/server/uploads && chown -R nimbus:nimbus /app/server/uploads
USER nimbus

EXPOSE 4000

# Uses the readiness probe so a container is only marked healthy once the
# database is actually reachable.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/api/ready" || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "server/dist/index.js"]