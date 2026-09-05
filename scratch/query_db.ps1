$sql = 'SELECT "orthoBounds" FROM "Inspection" WHERE id = ''ea87e73c-0e89-4bb7-91f2-073f10e4b934'';'
$proc = New-Object System.Diagnostics.Process
$proc.StartInfo.FileName = "ssh"
$proc.StartInfo.Arguments = "-o StrictHostKeyChecking=no -o BatchMode=yes -i C:/Users/achou/.ssh/id_ed25519_azuride ubuntu@197.140.41.131 `"docker exec -i 3d_tour_db psql -U root -d virtual_tours`""
$proc.StartInfo.UseShellExecute = $false
$proc.StartInfo.RedirectStandardInput = $true
$proc.StartInfo.RedirectStandardOutput = $true
$proc.StartInfo.RedirectStandardError = $true
$proc.Start() | Out-Null
$proc.StandardInput.WriteLine($sql)
$proc.StandardInput.Close()
$out = $proc.StandardOutput.ReadToEnd()
Write-Output $out
