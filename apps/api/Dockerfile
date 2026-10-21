# Build stage
FROM node:20-alpine AS builder

# Install pnpm
RUN npm install -g pnpm@8

WORKDIR /app

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages ./packages
COPY apps/api ./apps/api

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build contracts and API
RUN pnpm --filter "@still-with-you/contracts" build
RUN pnpm --filter "@still-with-you/api" build

# Production stage
FROM node:20-alpine

# Install pnpm
RUN npm install -g pnpm@8

WORKDIR /app

# Copy workspace files including lockfile
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/contracts/package.json ./packages/contracts/
COPY apps/api/package.json ./apps/api/

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Copy built files
COPY --from=builder /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Create node user and set ownership
RUN chown -R node:node /app

# Switch to node user
USER node

# Set working directory to API
WORKDIR /app/apps/api

# Expose port
EXPOSE 3000

# Run the API
CMD ["node", "dist/index.js"]
