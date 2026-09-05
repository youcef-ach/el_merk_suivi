#!/bin/bash
set -e
exec > /home/ubuntu/deploy_datum.log 2>&1

echo "=== [1/4] Extracting datum update ==="
tar -xzf /home/ubuntu/deploy_datum_update.tar.gz -C /home/ubuntu/app/

echo "=== [2/4] Building frontend container ==="
cd /home/ubuntu/app
docker build --network host -t app-frontend:latest ./my-project

echo "=== [3/4] Recreating frontend container ==="
docker compose up -d frontend

echo "=== [4/4] Verifying containers ==="
sleep 3
docker compose ps

echo "=== DATUM_DEPLOYMENT_SUCCESSFUL ==="
