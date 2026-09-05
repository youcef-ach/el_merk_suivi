# PowerShell script to deploy updated backend and frontend to remote server
$ErrorActionPreference = "Stop"

$repoRoot = "c:\Users\achou\Documents\GitHub\el_merk_suivi"
$backendDir = "$repoRoot\backend"
$frontendDir = "$repoRoot\my-project"
$scratchDir = "$repoRoot\scratch"

$backendArchive = "$scratchDir\backend_update.tar.gz"
$frontendArchive = "$scratchDir\frontend_update.tar.gz"

Write-Output "=== [1/4] Creating tarballs for backend and frontend ==="
if (Test-Path $backendArchive) { Remove-Item $backendArchive -Force }
if (Test-Path $frontendArchive) { Remove-Item $frontendArchive -Force }

tar -czf $backendArchive -C $backendDir src dist
tar -czf $frontendArchive -C $frontendDir app

Write-Output "Backend archive size: $([math]::Round((Get-Item $backendArchive).Length / 1024, 1)) KB"
Write-Output "Frontend archive size: $([math]::Round((Get-Item $frontendArchive).Length / 1024, 1)) KB"

Write-Output "=== [2/4] Transferring archives to remote server ==="
function Send-RemoteFile($localPath, $remotePath) {
    $bytes = [System.IO.File]::ReadAllBytes($localPath)
    $proc = New-Object System.Diagnostics.Process
    $proc.StartInfo.FileName = "ssh"
    $proc.StartInfo.Arguments = "-o StrictHostKeyChecking=no -o BatchMode=yes -i C:/Users/achou/.ssh/id_ed25519_azuride ubuntu@197.140.41.131 `"cat > $remotePath && ls -lh $remotePath`""
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
}

Send-RemoteFile $backendArchive "/home/ubuntu/backend_update.tar.gz"
Send-RemoteFile $frontendArchive "/home/ubuntu/frontend_update.tar.gz"

Write-Output "=== [3/4] Extracting & Building backend & frontend Docker containers on server ==="
$remoteDeployCmd = @'
set -e
echo "Extracting backend update..."
tar -xzf /home/ubuntu/backend_update.tar.gz -C /home/ubuntu/app/backend/

echo "Extracting frontend update..."
tar -xzf /home/ubuntu/frontend_update.tar.gz -C /home/ubuntu/app/my-project/

echo "Building backend container..."
cd /home/ubuntu/app
docker build --network host -t app-backend:latest ./backend

echo "Building frontend container..."
docker build --network host -t app-frontend:latest ./my-project

echo "Restarting backend and frontend containers..."
docker compose up -d backend frontend

sleep 3
docker ps --filter "name=3d_tour" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
'@

$b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($remoteDeployCmd))
$runCmd = "echo $b64 | base64 -d | bash"

& ssh -o StrictHostKeyChecking=no -o BatchMode=yes -i C:/Users/achou/.ssh/id_ed25519_azuride ubuntu@197.140.41.131 $runCmd

Write-Output "=== [4/4] Verifying health ==="
& ssh -o StrictHostKeyChecking=no -o BatchMode=yes -i C:/Users/achou/.ssh/id_ed25519_azuride ubuntu@197.140.41.131 "curl -k -s -o /dev/null -w 'HTTP Status: %{http_code}\n' https://localhost/projects"

Write-Output "=== DEPLOYMENT COMPLETE ==="
