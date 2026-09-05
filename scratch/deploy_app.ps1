# PowerShell script to package app/ and deploy cleanly to remote server
$ErrorActionPreference = "Stop"

$appDir = "c:\Users\achou\Documents\GitHub\el_merk_suivi\my-project"
$archivePath = "c:\Users\achou\Documents\GitHub\el_merk_suivi\scratch\app_update.tar.gz"

Write-Output "=== [1/4] Packaging my-project/app into tar.gz ==="
if (Test-Path $archivePath) { Remove-Item $archivePath -Force }

# Create tarball of app/ folder
tar -czf $archivePath -C $appDir app

$fileSize = (Get-Item $archivePath).Length
Write-Output "Archive created: $archivePath ($([math]::Round($fileSize / 1024, 1)) KB)"

Write-Output "=== [2/4] Transferring archive to remote server ==="
$bytes = [System.IO.File]::ReadAllBytes($archivePath)
$proc = New-Object System.Diagnostics.Process
$proc.StartInfo.FileName = "ssh"
$proc.StartInfo.Arguments = "-o StrictHostKeyChecking=no -o BatchMode=yes -i C:/Users/achou/.ssh/id_ed25519_azuride ubuntu@197.140.41.131 `"cat > /home/ubuntu/app_update.tar.gz && ls -la /home/ubuntu/app_update.tar.gz`""
$proc.StartInfo.UseShellExecute = $false
$proc.StartInfo.RedirectStandardInput = $true
$proc.StartInfo.RedirectStandardOutput = $true
$proc.StartInfo.RedirectStandardError = $true
$proc.Start() | Out-Null
$proc.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
$proc.StandardInput.BaseStream.Flush()
$proc.StandardInput.Close()
$out = $proc.StandardOutput.ReadToEnd()
$err = $proc.StandardError.ReadToEnd()
$proc.WaitForExit()

Write-Output $out
if ($err) { Write-Output "STDERR: $err" }

Write-Output "=== [3/4] Updating DB & Building frontend Docker image on server ==="
$remoteDeployCmd = @'
set -e
echo "Updating Inspection elevationRange in database..."
docker exec 3d_tour_db psql -U root -d virtual_tours -c "UPDATE \"Inspection\" SET \"orthoBounds\" = jsonb_set(\"orthoBounds\", '{elevationRange}', '{\"min\": 0.0, \"max\": 6.2}'::jsonb) WHERE id = 'ea87e73c-0e89-4bb7-91f2-073f10e4b934';"

echo "Extracting code update..."
tar -xzf /home/ubuntu/app_update.tar.gz -C /home/ubuntu/app/my-project/

echo "Building frontend container..."
cd /home/ubuntu/app
docker build --network host -t app-frontend:latest ./my-project
docker compose up -d frontend
sleep 3
docker ps --filter "name=3d_tour_frontend" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
'@

$b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($remoteDeployCmd))
$runCmd = "echo $b64 | base64 -d | bash"

& ssh -o StrictHostKeyChecking=no -o BatchMode=yes -i C:/Users/achou/.ssh/id_ed25519_azuride ubuntu@197.140.41.131 $runCmd

Write-Output "=== [4/4] Verifying health ==="
& ssh -o StrictHostKeyChecking=no -o BatchMode=yes -i C:/Users/achou/.ssh/id_ed25519_azuride ubuntu@197.140.41.131 "curl -k -s -o /dev/null -w 'HTTP Status: %{http_code}\n' https://localhost/engine/ea87e73c-0e89-4bb7-91f2-073f10e4b934"

Write-Output "=== DEPLOYMENT COMPLETE ==="
