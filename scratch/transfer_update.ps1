$bytes = [System.IO.File]::ReadAllBytes("c:\Users\achou\Documents\GitHub\el_merk_suivi\build.tar.gz")
$proc = New-Object System.Diagnostics.Process
$proc.StartInfo.FileName = "ssh"
$proc.StartInfo.Arguments = "-o StrictHostKeyChecking=no -o BatchMode=yes -i C:/Users/achou/.ssh/id_ed25519_azuride ubuntu@197.140.41.131 `"cat > /home/ubuntu/build.tar.gz && ls -la /home/ubuntu/build.tar.gz`""
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

