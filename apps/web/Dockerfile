# syntax=docker/dockerfile:1
# Build context is the monorepo root:  docker build -f apps/web/Dockerfile .

FROM node:22-alpine AS build
RUN npm install -g pnpm@11.6.0
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter "@repo/web..."

# Vite inlines these at build time — they are the URLs the *browser* uses.
ARG VITE_API_URL=http://localhost:5000/api
ARG VITE_WS_URL=ws://localhost:8080
ENV VITE_API_URL=${VITE_API_URL} VITE_WS_URL=${VITE_WS_URL}
RUN pnpm --filter @repo/web build

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
