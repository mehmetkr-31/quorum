# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# ---- deps ----
FROM base AS deps
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/api/package.json packages/api/
COPY packages/auth/package.json packages/auth/
COPY packages/aptos/package.json packages/aptos/
COPY packages/db/package.json packages/db/
COPY packages/env/package.json packages/env/
COPY packages/shelby/package.json packages/shelby/
COPY packages/ui/package.json packages/ui/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# ---- build ----
FROM deps AS builder
WORKDIR /app
COPY . .

ARG DATABASE_URL
ARG APTOS_NODE_URL
ARG QUORUM_CONTRACT_ADDRESS
ARG BETTER_AUTH_SECRET
ARG BETTER_AUTH_URL
ARG SHELBY_BASE_URL
ARG VITE_CONTRACT_ADDRESS
ARG VITE_APTOS_NODE_URL

# Write a minimal .env for the build step (Vite needs VITE_* at build time)
RUN printf "DATABASE_URL=%s\nAPTOS_NODE_URL=%s\nQUORUM_CONTRACT_ADDRESS=%s\nBETTER_AUTH_SECRET=%s\nBETTER_AUTH_URL=%s\nSHELBY_BASE_URL=%s\nVITE_CONTRACT_ADDRESS=%s\nVITE_APTOS_NODE_URL=%s\n" \
    "${DATABASE_URL}" "${APTOS_NODE_URL}" "${QUORUM_CONTRACT_ADDRESS}" "${BETTER_AUTH_SECRET}" \
    "${BETTER_AUTH_URL}" "${SHELBY_BASE_URL}" "${VITE_CONTRACT_ADDRESS}" "${VITE_APTOS_NODE_URL}" \
    > apps/web/.env

RUN pnpm --filter @quorum/web build

# ---- runtime ----
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy the Vinxi/TanStack Start server output
COPY --from=builder /app/apps/web/.output ./.output

EXPOSE 3001

CMD ["node", ".output/server/index.mjs"]
