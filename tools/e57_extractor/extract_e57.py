#!/usr/bin/env python3
"""
extract_e57.py - Universal Native E57 Asset Extractor
Extracts native embedded 2D camera cubemaps, scan coordinates, quaternions,
and 360 equirectangular panoramas directly from any E57 file.

Usage:
  python extract_e57.py --input path/to/cloud.e57 --output path/to/output_dir
"""

import os
import sys
import json
import argparse
import time
import numpy as np
import cv2

try:
    import pye57
except ImportError:
    print("[ERROR] pye57 is required. Please install via: pip install pye57")
    sys.exit(1)

# Import local core modules
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CORE_DIR = os.path.join(SCRIPT_DIR, "core")
sys.path.append(CORE_DIR)

import cubemap_transforms
from equirect_stitcher import equirect_from_cubemap, apply_face_transform

AXIS_TO_FACE_NAME = {
    "+X": "px",
    "-X": "nx",
    "+Y": "py",
    "-Y": "ny",
    "+Z": "pz",
    "-Z": "nz",
}

CUBE_URL_ORDER = ["+X", "-X", "+Y", "-Y", "+Z", "-Z"]

def load_calibration():
    calib_path = os.path.join(CORE_DIR, "equirect_calibration.json")
    if os.path.exists(calib_path):
        with open(calib_path, "r") as f:
            raw = json.load(f)
            return {int(k): v for k, v in raw.items()}
    return {
        0: {"face": "px", "rot": 270, "hflip": False, "vflip": False},
        1: {"face": "nx", "rot": 90, "hflip": False, "vflip": False},
        2: {"face": "py", "rot": 0, "hflip": False, "vflip": False},
        3: {"face": "ny", "rot": 180, "hflip": False, "vflip": False},
        4: {"face": "pz", "rot": 0, "hflip": False, "vflip": False},
        5: {"face": "nz", "rot": 180, "hflip": False, "vflip": False}
    }

def process_e57(input_path, output_dir, generate_equirect=True, eq_width=4096, low_res_width=1024, quality=95, start_scan=0, end_scan=None):
    if not os.path.exists(input_path):
        print(f"[ERROR] Input E57 file does not exist: {input_path}")
        return False

    print("=" * 68)
    print("  E57 Native Camera & Panorama Extractor")
    print(f"  Input:  {input_path}")
    print(f"  Output: {output_dir}")
    print("=" * 68)

    cubemaps_dir = os.path.join(output_dir, "cubemaps")
    equirect_dir = os.path.join(output_dir, "equirect")
    equirect_low_dir = os.path.join(output_dir, "equirect_low")

    os.makedirs(cubemaps_dir, exist_ok=True)
    if generate_equirect:
        os.makedirs(equirect_dir, exist_ok=True)
        os.makedirs(equirect_low_dir, exist_ok=True)

    calibration = load_calibration()

    e57 = pye57.E57(input_path)
    root = e57.image_file.root()

    try:
        images2D = root["images2D"]
        total_images = images2D.childCount()
    except Exception as e:
        print(f"[ERROR] Could not access 'images2D' in E57: {e}")
        return False

    scan_count = e57.scan_count
    print(f"[INFO] Scan count: {scan_count} stations ({total_images} native 2D camera images)\n")

    metadata_dict = {}
    scans_array = []

    stop_scan = min(scan_count, end_scan) if end_scan is not None else scan_count

    for scan_idx in range(start_scan, stop_scan):
        t0 = time.time()
        print(f"--> Extracting Native Scan [{scan_idx + 1}/{scan_count}] (scan_{scan_idx})...")
        header = e57.get_header(scan_idx)

        translation = [float(v) for v in header.translation]
        h_rot_raw = [float(v) for v in header.rotation]  # [w, x, y, z]

        h_xyzw = [h_rot_raw[1], h_rot_raw[2], h_rot_raw[3], h_rot_raw[0]]
        inv_q = [-h_xyzw[0], -h_xyzw[1], -h_xyzw[2], h_xyzw[3]]

        face_data = {}
        raw_bgr_faces = {}
        face_filenames = {}

        for j in range(6):
            img_idx = scan_idx * 6 + j
            if img_idx >= total_images:
                break

            img_node = images2D[img_idx]
            pose = img_node["pose"]
            rot = pose["rotation"]
            try:
                quat = rot["quaternion"].value()
            except:
                quat = [rot["x"].value(), rot["y"].value(), rot["z"].value(), rot["w"].value()]

            global_fwd = cubemap_transforms.quat_rotate(quat, [0, 0, 1])
            local_fwd = cubemap_transforms.quat_rotate(inv_q, global_fwd)
            axis = cubemap_transforms.dominant_face(local_fwd)

            rep_node = None
            for r_type in ["sphericalRepresentation", "pinholeRepresentation", "cylindricalRepresentation", "visualReferenceRepresentation"]:
                try:
                    rep_node = img_node[r_type]
                    break
                except Exception:
                    continue

            if rep_node is None:
                continue

            img_blob = None
            for blob_name in ["jpegImage", "pngImage"]:
                try:
                    img_blob = rep_node[blob_name]
                    break
                except Exception:
                    continue

            if img_blob is None:
                continue

            byte_count = img_blob.byteCount()
            img_data = np.zeros(byte_count, dtype=np.uint8)
            img_blob.read(img_data, 0, byte_count)

            img_cv = cv2.imdecode(np.frombuffer(img_data.tobytes(), np.uint8), cv2.IMREAD_COLOR)
            face_data[axis] = img_cv

        transformed_faces = cubemap_transforms.apply_canonical_transforms(face_data)

        for axis in ["+X", "-X", "+Y", "-Y", "+Z", "-Z"]:
            if axis in transformed_faces:
                face_suffix = AXIS_TO_FACE_NAME[axis]
                filename = f"scan_{scan_idx}_{face_suffix}.jpg"
                filepath = os.path.join(cubemaps_dir, filename)

                cv2.imwrite(filepath, transformed_faces[axis], [int(cv2.IMWRITE_JPEG_QUALITY), quality])
                face_filenames[axis] = filename
                raw_bgr_faces[face_suffix] = transformed_faces[axis]

        q_orig = [h_rot_raw[1], h_rot_raw[2], h_rot_raw[3], h_rot_raw[0]]  # [x, y, z, w]
        q_yaw_local = [0.0, 0.0, 1.0, 0.0]
        q_corrected_xyzw = cubemap_transforms.quat_multiply(q_orig, q_yaw_local)
        q_corrected_wxyz = [q_corrected_xyzw[3], q_corrected_xyzw[0], q_corrected_xyzw[1], q_corrected_xyzw[2]]

        equirect_rel_path = None
        equirect_low_rel_path = None

        if generate_equirect and len(raw_bgr_faces) == 6:
            face_images_rgb = {}
            for slot_idx in range(6):
                cfg = calibration[slot_idx]
                face_name = cfg["face"]
                bgr_img = raw_bgr_faces[face_name]
                rgb_img = cv2.cvtColor(bgr_img, cv2.COLOR_BGR2RGB)
                face_images_rgb[slot_idx] = apply_face_transform(
                    rgb_img, cfg["rot"], cfg["hflip"], cfg["vflip"]
                )

            eq_height = eq_width // 2
            eq_img_rgb = equirect_from_cubemap(face_images_rgb, eq_width, eq_height)
            eq_filename = f"scan_{scan_idx}_equirect.jpg"
            eq_path = os.path.join(equirect_dir, eq_filename)
            cv2.imwrite(eq_path, cv2.cvtColor(eq_img_rgb, cv2.COLOR_RGB2BGR), [int(cv2.IMWRITE_JPEG_QUALITY), quality])
            equirect_rel_path = f"equirect/{eq_filename}"

            low_height = low_res_width // 2
            eq_low_rgb = cv2.resize(eq_img_rgb, (low_res_width, low_height), interpolation=cv2.INTER_AREA)
            eq_low_filename = f"scan_{scan_idx}_equirect_low.jpg"
            eq_low_path = os.path.join(equirect_low_dir, eq_low_filename)
            cv2.imwrite(eq_low_path, cv2.cvtColor(eq_low_rgb, cv2.COLOR_RGB2BGR), [int(cv2.IMWRITE_JPEG_QUALITY), 88])
            equirect_low_rel_path = f"equirect_low/{eq_low_filename}"

        scan_id_str = f"scan_{scan_idx}"
        cubemap_urls = [face_filenames.get(ax, None) for ax in CUBE_URL_ORDER]

        metadata_dict[scan_id_str] = {
            "index": scan_idx,
            "position": translation,
            "quaternion_xyzw": q_corrected_xyzw,
            "quaternion_wxyz": q_corrected_wxyz,
            "cubemap_urls": cubemap_urls,
            "equirect_url": equirect_rel_path,
            "equirect_low_url": equirect_low_rel_path
        }

        scans_array.append({
            "#name": scan_id_str,
            "x": translation[0],
            "y": translation[1],
            "alt": translation[2],
            "rotation_quaternion": q_corrected_wxyz
        })

        t_elapsed = time.time() - t0
        print(f"  [OK] scan_{scan_idx} completed in {t_elapsed:.2f}s")

    e57.close()

    with open(os.path.join(output_dir, "scan_metadata.json"), "w") as f:
        json.dump(metadata_dict, f, indent=2)

    with open(os.path.join(output_dir, "scans.json"), "w") as f:
        json.dump(scans_array, f, indent=2)

    print("\n" + "=" * 68)
    print("  EXTRACTION COMPLETE!")
    print(f"  Scans Processed: {stop_scan - start_scan}")
    print(f"  Cubemaps Folder: {cubemaps_dir}")
    if generate_equirect:
        print(f"  Equirect Folder: {equirect_dir}")
        print(f"  Low-Res Panos:   {equirect_low_dir}")
    print(f"  Metadata JSON:   {os.path.join(output_dir, 'scan_metadata.json')}")
    print(f"  Scans JSON:      {os.path.join(output_dir, 'scans.json')}")
    print("=" * 68 + "\n")
    return True

def main():
    parser = argparse.ArgumentParser(description="Universal Native E57 Cubemap & Telemetry Extractor")
    parser.add_argument("-i", "--input", required=True, help="Path to input .e57 file")
    parser.add_argument("-o", "--output", default=None, help="Output destination folder")
    parser.add_argument("--no-equirect", action="store_true", help="Skip 360 equirectangular generation (cubemaps only)")
    parser.add_argument("--eq-width", type=int, default=4096, help="Full equirectangular width (default: 4096)")
    parser.add_argument("--low-res-width", type=int, default=1024, help="Low-res transition equirectangular width (default: 1024)")
    parser.add_argument("--quality", type=int, default=95, help="JPEG compression quality (1-100, default: 95)")
    parser.add_argument("--start-scan", type=int, default=0, help="Starting scan index (default: 0)")
    parser.add_argument("--end-scan", type=int, default=None, help="Ending scan index (optional)")

    args = parser.parse_args()

    input_path = os.path.abspath(args.input)
    if args.output:
        output_dir = os.path.abspath(args.output)
    else:
        base_name = os.path.splitext(os.path.basename(input_path))[0]
        output_dir = os.path.join(os.path.dirname(input_path), f"extracted_{base_name}")

    process_e57(
        input_path=input_path,
        output_dir=output_dir,
        generate_equirect=not args.no_equirect,
        eq_width=args.eq_width,
        low_res_width=args.low_res_width,
        quality=args.quality,
        start_scan=args.start_scan,
        end_scan=args.end_scan
    )

if __name__ == "__main__":
    main()
