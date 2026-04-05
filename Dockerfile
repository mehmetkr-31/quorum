FROM node:22-alpine AS base
RUN npm install -g pnpm@10.0.0

FROM base AS deps
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/db/package.json ./packages/db/
COPY packages/api/package.json ./packages/api/
COPY packages/aptos/package.json ./packages/aptos/
COPY packages/auth/package.json ./packages/auth/
COPY packages/env/package.json ./packages/env/
COPY packages/shelby/package.json ./packages/shelby/
COPY packages/mcp/package.json ./packages/mcp/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY --from=deps /app/apps ./apps
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @quorum/web build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/apps/web/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/web/package.json ./package.json

EXPOSE 3000

CMD ["node", "dist/server/server.js"]
