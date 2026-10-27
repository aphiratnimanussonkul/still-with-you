# Build stage
FROM node:22-alpine AS builder

# libc6-compat: sharp prebuilt binaries on musl/alpine. See docs/backend-contract-v0.9.md (Jack).
# SHARP_IGNORE_GLOBAL_LIBVIPS forces the @img/sharp-linuxmusl-* binary instead of compiling against system vips.
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=1
RUN apk add --no-cache libc6-compat \
  && npm install -g pnpm@10

WORKDIR /app

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages ./packages
COPY apps/worker ./apps/worker

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build contracts, image-variants (sharp), and worker
RUN pnpm --filter "@still-with-you/contracts" build
RUN pnpm --filter "@still-with-you/image-variants" build
RUN pnpm --filter "@still-with-you/worker" build

# Production stage
FROM node:22-alpine

ENV SHARP_IGNORE_GLOBAL_LIBVIPS=1
RUN apk add --no-cache libc6-compat \
  && npm install -g pnpm@10

WORKDIR /app

# Copy workspace files including lockfile
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/image-variants/package.json ./packages/image-variants/
COPY apps/worker/package.json ./apps/worker/

# Install production dependencies only (includes sharp's linuxmusl binary)
RUN pnpm install --prod --frozen-lockfile

# Copy built files
COPY --from=builder /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=builder /app/packages/image-variants/dist ./packages/image-variants/dist
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist

# Create node user and set ownership
RUN chown -R node:node /app

# Switch to node user
USER node

# Set working directory to worker
WORKDIR /app/apps/worker

# Run the worker
CMD ["node", "dist/index.js"]
