#!/bin/bash
set -e
exec > /home/ubuntu/deploy_frontend.log 2>&1

echo "=== [1/3] Extracting updated frontend files ==="
tar -xzf /home/ubuntu/deploy_auth_fix.tar.gz -C /home/ubuntu/app/

echo "=== [2/3] Building frontend with host network ==="
cd /home/ubuntu/app
docker build --network host -t app-frontend:latest ./my-project

echo "=== [3/3] Recreating frontend container ==="
docker compose up -d frontend

sleep 3
docker compose ps

echo "=== FRONTEND_DEPLOYMENT_SUCCESSFUL ==="
