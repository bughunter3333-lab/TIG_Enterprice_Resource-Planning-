#!/usr/bin/env bash
set -euo pipefail

# TIG ERP — production deploy script
# Usage: ./deploy.sh [--pull]

echo "==> TIG ERP Deploy"

# Check .env exists
if [ ! -f .env ]; then
    echo "ERROR: .env file not found. Copy .env.example to .env and fill in values."
    exit 1
fi

# Pull latest images if requested
if [[ "${1:-}" == "--pull" ]]; then
    echo "==> Pulling latest base images..."
    docker compose pull db
fi

# Build and start
echo "==> Building images..."
docker compose build --no-cache

echo "==> Starting services..."
docker compose up -d

echo "==> Waiting for services to be healthy..."
sleep 5
docker compose ps

echo ""
echo "==> Deploy complete!"
echo "    App is running at http://localhost:${PORT:-80}"
echo ""
echo "    To create the first admin user:"
echo "    docker compose exec backend python seed_admin.py"
echo ""
echo "    To view logs:"
echo "    docker compose logs -f"
