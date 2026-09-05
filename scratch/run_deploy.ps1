$sshArgs = @(
    "-o", "StrictHostKeyChecking=no",
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=20",
    "-i", "C:/Users/achou/.ssh/id_ed25519_azuride",
    "ubuntu@197.140.41.131"
)

$scriptContent = @'
#!/bin/bash
set -e
exec > /home/ubuntu/deploy_gis.log 2>&1

echo "=== [1/4] Extracting GIS update ==="
tar -xzf /home/ubuntu/deploy_gis_tools_update.tar.gz -C /home/ubuntu/app/my-project/

echo "=== [2/4] Building frontend container ==="
cd /home/ubuntu/app
docker build --network host -t app-frontend:latest ./my-project

echo "=== [3/4] Recreating frontend container ==="
docker compose up -d frontend

echo "=== [4/4] Verifying containers ==="
sleep 3
docker compose ps

echo "=== GIS_DEPLOYMENT_SUCCESSFUL ==="
'@

$remoteScript = "cat << 'EOF' > /home/ubuntu/deploy_gis.sh`n$scriptContent`nEOF`nchmod +x /home/ubuntu/deploy_gis.sh`nnohup /home/ubuntu/deploy_gis.sh > /dev/null 2>&1 &`nsleep 1`nps aux | grep deploy_gis"

Write-Output "Sending deploy script to remote VM..."
for ($i = 1; $i -le 3; $i++) {
    try {
        & ssh @sshArgs $remoteScript
        if ($LASTEXITCODE -eq 0) {
            Write-Output "Deployment started successfully in background!"
            break
        }
    } catch {
        Write-Output "Attempt $i failed, retrying in 3s..."
        Start-Sleep -Seconds 3
    }
}
