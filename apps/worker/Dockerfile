# Build stage
FROM node:20-alpine AS builder

# Install pnpm
RUN npm install -g pnpm@10

WORKDIR /app

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages ./packages
COPY apps/worker ./apps/worker

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build contracts and worker
RUN pnpm --filter "@still-with-you/contracts" build
RUN pnpm --filter "@still-with-you/worker" build

# Production stage
FROM node:20-alpine

# Install pnpm
RUN npm install -g pnpm@10

WORKDIR /app

# Copy workspace files including lockfile
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/contracts/package.json ./packages/contracts/
COPY apps/worker/package.json ./apps/worker/

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Copy built files
COPY --from=builder /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist

# Create node user and set ownership
RUN chown -R node:node /app

# Switch to node user
USER node

# Set working directory to worker
WORKDIR /app/apps/worker

# Run the worker
CMD ["node", "dist/index.js"]
