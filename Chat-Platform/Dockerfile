# syntax=docker/dockerfile:1
#
# One Dockerfile for the three Node services (api | websocket | worker):
#   docker build --build-arg APP=api --build-arg ENTRY=src/server.ts -t syncgrid-api .
#
# The monorepo is the build context because services depend on workspace packages
# (@repo/database, @repo/queue, @repo/shared-types, …) which are consumed as TypeScript source.

FROM node:22-alpine AS base
RUN npm install -g pnpm@11.6.0
WORKDIR /repo

FROM base AS service
ARG APP
ARG ENTRY=src/index.ts
ENV NODE_ENV=production ENTRY=${ENTRY}

COPY . .
# Install only what this service (and the workspace packages it uses) needs, no devDependencies.
RUN pnpm install --frozen-lockfile --prod --filter "@repo/${APP}..." && mkdir -p /data/uploads && chown -R node:node /data /repo/apps/${APP}

USER node
WORKDIR /repo/apps/${APP}
# `exec` so Node is PID 1's child-less process and receives SIGTERM for graceful shutdown.
CMD ["sh", "-c", "exec node_modules/.bin/tsx $ENTRY"]
