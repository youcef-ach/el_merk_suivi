import os
import glob

# Path to the app directory
app_dir = r"c:\Users\achou\Documents\GitHub\el_merk_suivi\my-project\app"

# Replacement map
replacements = {
    "http://197.140.9.103:3000": "http://197.140.9.103/api",
    "http://197.140.9.103:9000": "http://197.140.9.103"
}

# Recursively find all js, jsx, ts, tsx files
files = []
for ext in ('*.js', '*.jsx', '*.ts', '*.tsx'):
    files.extend(glob.glob(os.path.join(app_dir, '**', ext), recursive=True))

for file_path in files:
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    modified = False
    for old_url, new_url in replacements.items():
        if old_url in content:
            content = content.replace(old_url, new_url)
            modified = True
            
    if modified:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {file_path}")

print("Replacement complete.")
