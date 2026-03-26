#!/usr/bin/env bash
set -e
echo "=== Quorum Setup ==="

if [ ! -f "apps/web/.env" ]; then
  cp apps/web/.env.example apps/web/.env
  echo "✓ apps/web/.env oluşturuldu"
else
  echo "✓ apps/web/.env mevcut"
fi

[ ! -f "packages/db/.env" ] && echo "DATABASE_URL=file:../../apps/web/local.db" > packages/db/.env

echo "Installing dependencies..."
pnpm install

echo "Creating database tables..."
cd packages/db && DATABASE_URL="file:../../apps/web/local.db" pnpm db:push && cd ../..

echo "Seeding default datasets..."
cd packages/api && DATABASE_URL="file:../../apps/web/local.db" pnpm tsx seed.ts && cd ../..

echo ""
echo "✓ Setup complete! Run: pnpm dev"
echo "  Web:  http://localhost:3001"
