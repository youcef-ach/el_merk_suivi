import subprocess

cmd = [
    'ssh',
    '-i', 'C:/Users/achou/.ssh/id_ed25519_azuride',
    '-o', 'StrictHostKeyChecking=no',
    'ubuntu@197.140.41.131',
    'docker exec 3d_tour_db psql -U root -d virtual_tours -c "SELECT id, type, \\"glbModelUrl\\", \\"scansJsonUrl\\" FROM inspections WHERE id = \'3d7fa359-641e-481f-9687-2e39d1c292cb\';"'
]

res = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
print("STDOUT:\n", res.stdout)
print("STDERR:\n", res.stderr)
