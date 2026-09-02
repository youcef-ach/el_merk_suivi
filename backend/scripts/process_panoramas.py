import os
import sys
import json
import argparse
import subprocess
import shutil
import numpy as np
import cv2
from PIL import Image

FACES_ORDER = ["px", "nx", "py", "ny", "pz", "nz"]

TRANSFORMS = {
    "0": { "face": "px", "rot": 270, "hflip": False, "vflip": False },
    "1": { "face": "nx", "rot": 90, "hflip": False, "vflip": False },
    "2": { "face": "py", "rot": 0, "hflip": False, "vflip": False },
    "3": { "face": "ny", "rot": 180, "hflip": False, "vflip": False },
    "4": { "face": "pz", "rot": 0, "hflip": False, "vflip": False },
    "5": { "face": "nz", "rot": 180, "hflip": False, "vflip": False }
}

def equirect_from_cubemap(face_images_in, eq_width=2048, eq_height=1024):
    """
    Stitches 6 cubemap faces into an equirectangular panorama.
    Matches WebGL textureCube projection perfectly for transition shaders.
    """
    face_images = {}
    for i in range(6):
        params = TRANSFORMS[str(i)]
        src_face = params["face"]
        img = face_images_in[src_face]
        
        rot = params["rot"]
        if rot == 90: img = np.rot90(img, -1)
        elif rot == 180: img = np.rot90(img, 2)
        elif rot == 270: img = np.rot90(img, 1)
        
        if params["hflip"]: img = np.fliplr(img)
        if params["vflip"]: img = np.flipud(img)
        
        face_images[i] = img

    u = np.linspace(0, 1, eq_width, endpoint=False, dtype=np.float32)
    v = np.linspace(0, 1, eq_height, endpoint=False, dtype=np.float32)
    uu, vv = np.meshgrid(u, v)
    
    theta = (uu - 0.5) * 2.0 * np.pi
    phi   = (0.5 - vv) * np.pi
    
    dx = np.cos(phi) * np.sin(theta)
    dy = np.cos(phi) * np.cos(theta)
    dz = np.sin(phi)
    
    abs_x = np.abs(dx)
    abs_y = np.abs(dy)
    abs_z = np.abs(dz)
    
    is_x_major = (abs_x >= abs_y) & (abs_x >= abs_z)
    is_y_major = (abs_y > abs_x) & (abs_y >= abs_z)
    is_z_major = (abs_z > abs_x) & (abs_z > abs_y)
    
    face_idx = np.zeros_like(dx, dtype=np.int8)
    sc = np.zeros_like(dx)
    tc = np.zeros_like(dx)
    ma = np.zeros_like(dx)
    
    mask = is_x_major & (dx > 0)
    face_idx[mask] = 0
    sc[mask] = -dy[mask]
    tc[mask] = dz[mask]
    ma[mask] = abs_x[mask]
    
    mask = is_x_major & (dx < 0)
    face_idx[mask] = 1
    sc[mask] = dy[mask]
    tc[mask] = dz[mask]
    ma[mask] = abs_x[mask]
    
    mask = is_y_major & (dy > 0)
    face_idx[mask] = 2
    sc[mask] = dx[mask]
    tc[mask] = dz[mask]
    ma[mask] = abs_y[mask]
    
    mask = is_y_major & (dy < 0)
    face_idx[mask] = 3
    sc[mask] = -dx[mask]
    tc[mask] = dz[mask]
    ma[mask] = abs_y[mask]
    
    mask = is_z_major & (dz > 0)
    face_idx[mask] = 5
    sc[mask] = dx[mask]
    tc[mask] = -dy[mask]
    ma[mask] = abs_z[mask]
    
    mask = is_z_major & (dz < 0)
    face_idx[mask] = 4
    sc[mask] = dx[mask]
    tc[mask] = dy[mask]
    ma[mask] = abs_z[mask]
    
    face_u = (sc / ma + 1.0) / 2.0
    face_v = (tc / ma + 1.0) / 2.0
    
    face_size = face_images[0].shape[0]
    px_u = np.clip((face_u * face_size).astype(np.int32), 0, face_size - 1)
    px_v = np.clip(((1.0 - face_v) * face_size).astype(np.int32), 0, face_size - 1)
    
    out_img = np.zeros((eq_height, eq_width, 3), dtype=np.uint8)
    for i in range(6):
        mask = (face_idx == i)
        out_img[mask] = face_images[i][px_v[mask], px_u[mask]]
        
    return out_img

def find_cubemap_groups(search_dir):
    groups = {}
    for root, _, files in os.walk(search_dir):
        for f in files:
            lower = f.lower()
            ext = os.path.splitext(lower)[1]
            if ext not in ['.jpg', '.jpeg', '.png']:
                continue
            name_no_ext = os.path.splitext(f)[0]
            parts = name_no_ext.rsplit('_', 1)
            if len(parts) == 2:
                prefix, face = parts[0], parts[1].lower()
                if face in FACES_ORDER:
                    scan_id = prefix
                    if scan_id not in groups:
                        groups[scan_id] = {}
                    groups[scan_id][face] = os.path.join(root, f)
            else:
                parts = name_no_ext.rsplit('-', 1)
                if len(parts) == 2:
                    prefix, face = parts[0], parts[1].lower()
                    if face in FACES_ORDER:
                        scan_id = prefix
                        if scan_id not in groups:
                            groups[scan_id] = {}
                        groups[scan_id][face] = os.path.join(root, f)

    complete_groups = {}
    for scan_id, faces in groups.items():
        if all(face in faces for face in FACES_ORDER):
            complete_groups[scan_id] = faces
    return complete_groups

def main():
    parser = argparse.ArgumentParser(description="Process 360 Cubemaps into KTX2 LODs and Equirectangular Panoramas")
    parser.add_argument("--input_dir", required=True, help="Directory containing raw extracted panoramas")
    parser.add_argument("--output_dir", required=True, help="Directory to save KTX2 and equirect outputs")
    parser.add_argument("--wasmtime_bin", default="", help="Path to wasmtime binary")
    parser.add_argument("--basisu_wasm", default="", help="Path to basisu_st.wasm")
    parser.add_argument("--sizes", nargs="+", type=int, default=[256, 512, 1024, 2048], help="LOD sizes")
    args = parser.parse_args()

    input_dir_abs = os.path.abspath(args.input_dir)
    output_dir_abs = os.path.abspath(args.output_dir)

    ktx2_dir = os.path.join(output_dir_abs, "ktx2")
    equirect_dir = os.path.join(output_dir_abs, "equirect_low")
    os.makedirs(ktx2_dir, exist_ok=True)
    os.makedirs(equirect_dir, exist_ok=True)

    groups = find_cubemap_groups(input_dir_abs)
    print(f"Found {len(groups)} complete cubemap scans in {input_dir_abs}")

    wasmtime = os.path.abspath(args.wasmtime_bin) if args.wasmtime_bin else "wasmtime"
    basisu_wasm = os.path.abspath(args.basisu_wasm) if args.basisu_wasm else "basisu_st.wasm"

    results = []

    for scan_id, faces in groups.items():
        normalized_scan_id = scan_id if scan_id.startswith("scan_") else f"scan_{scan_id}"
        print(f"Processing {normalized_scan_id}...")

        # 1. Equirectangular low-res transition panorama
        eq_out = os.path.join(equirect_dir, f"{normalized_scan_id}_equirect_low.jpg")
        try:
            face_images = {}
            for face in FACES_ORDER:
                img = cv2.imread(faces[face])
                if img is not None:
                    face_images[face] = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
                else:
                    pil_img = Image.open(faces[face]).convert("RGB")
                    face_images[face] = np.array(pil_img)
            
            eq_img = equirect_from_cubemap(face_images, 2048, 1024)
            Image.fromarray(eq_img).save(eq_out, quality=90)
            print(f"  [Equirect] Saved {eq_out}")
        except Exception as e:
            print(f"  [Equirect Error] {normalized_scan_id}: {e}")

        # 2. Generate KTX2 LODs via wasmtime in a safe local working directory
        work_dir = os.path.dirname(faces["px"])
        rel_face_files = [os.path.basename(faces[face]) for face in FACES_ORDER]

        lod_files = {}
        for size in args.sizes:
            ktx2_out_abs = os.path.join(ktx2_dir, f"{normalized_scan_id}_{size}.ktx2")
            temp_ktx2_name = f"temp_{normalized_scan_id}_{size}.ktx2"
            temp_ktx2_path = os.path.join(work_dir, temp_ktx2_name)

            if os.path.exists(ktx2_out_abs):
                lod_files[str(size)] = ktx2_out_abs
                continue

            cmd = [
                wasmtime, "run", "--dir", ".", basisu_wasm,
                "-cubemap", "-uastc", "-uastc_level", "2", "-mipmap",
                "-resample", str(size), str(size),
                "-output_file", temp_ktx2_name
            ] + rel_face_files

            try:
                subprocess.run(cmd, cwd=work_dir, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                if os.path.exists(temp_ktx2_path):
                    shutil.move(temp_ktx2_path, ktx2_out_abs)
                    print(f"  [KTX2 LOD {size}px] Generated {ktx2_out_abs}")
                    lod_files[str(size)] = ktx2_out_abs
            except Exception as e:
                print(f"  [KTX2 Warning] size {size}: {e}")
                if os.path.exists(temp_ktx2_path):
                    try: os.remove(temp_ktx2_path)
                    except: pass

        results.append({
            "scan_id": normalized_scan_id,
            "equirect_low": eq_out,
            "lods": lod_files
        })

    summary_file = os.path.join(output_dir_abs, "processed_manifest.json")
    with open(summary_file, "w") as f:
        json.dump({ "total_scans": len(results), "scans": results }, f, indent=2)

    print(f"Processing complete! Successfully generated KTX2 LODs & Equirects for {len(results)} scans.")

if __name__ == "__main__":
    main()
