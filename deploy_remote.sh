#!/bin/bash
set -e
exec > /home/ubuntu/deploy.log 2>&1

echo "=== [1/4] Setting up build context ==="
cd /home/ubuntu/app
printf "node_modules\ndist\nscripts/test_out\n*.zip\n*.tar.gz\n" > backend/.dockerignore

echo "=== [2/4] Building backend with host network ==="
docker build --network host -t app-backend:latest ./backend

echo "=== [3/4] Building frontend with host network ==="
docker build --network host -t app-frontend:latest ./my-project

echo "=== [4/4] Restarting containers ==="
docker compose up -d backend frontend

sleep 3
docker compose ps

echo "=== DEPLOYMENT_SUCCESSFUL ==="
