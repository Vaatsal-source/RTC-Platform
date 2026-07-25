# apps/worker/Dockerfile
FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace files
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY tsconfig.json ./

# Copy packages and app
COPY packages/queue ./packages/queue
COPY apps/worker ./apps/worker

# Install dependencies
RUN pnpm install

# Start worker
CMD ["pnpm", "run", "--filter", "@repo/worker", "dev"]