"""
equirect_stitcher.py - Vectorized bidirectional cubemap <-> equirectangular converter.
Mirrors standard WebGL textureCube sampling with Z-up scanner-local convention.
"""

import numpy as np
import cv2

def apply_face_transform(img, rot, hflip, vflip):
    if rot != 0:
        k = (4 - (rot // 90)) % 4
        img = np.rot90(img, k=k)
    if hflip:
        img = np.fliplr(img)
    if vflip:
        img = np.flipud(img)
    return img

def equirect_from_cubemap(face_images, eq_width=4096, eq_height=2048):
    u = np.linspace(0, 1, eq_width, endpoint=False, dtype=np.float32)
    v = np.linspace(0, 1, eq_height, endpoint=False, dtype=np.float32)
    uu, vv = np.meshgrid(u, v)

    theta = (uu - 0.5) * 2.0 * np.pi
    phi = (0.5 - vv) * np.pi

    dx = np.cos(phi) * np.sin(theta)
    dy = np.cos(phi) * np.cos(theta)
    dz = np.sin(phi)

    abs_x = np.abs(dx)
    abs_y = np.abs(dy)
    abs_z = np.abs(dz)

    is_x_major = (abs_x >= abs_y) & (abs_x >= abs_z)
    is_y_major = (abs_y > abs_x) & (abs_y >= abs_z)

    face_idx = np.zeros_like(dx, dtype=np.int8)
    sc = np.zeros_like(dx)
    tc = np.zeros_like(dx)
    ma = np.zeros_like(dx)

    # +X (Right)
    mask = is_x_major & (dx > 0)
    face_idx[mask] = 0
    sc[mask] = -dy[mask]
    tc[mask] = dz[mask]
    ma[mask] = abs_x[mask]

    # -X (Left)
    mask = is_x_major & (dx < 0)
    face_idx[mask] = 1
    sc[mask] = dy[mask]
    tc[mask] = dz[mask]
    ma[mask] = abs_x[mask]

    # +Y (Front)
    mask = is_y_major & (dy > 0)
    face_idx[mask] = 2
    sc[mask] = dx[mask]
    tc[mask] = dz[mask]
    ma[mask] = abs_y[mask]

    # -Y (Back)
    mask = is_y_major & (dy < 0)
    face_idx[mask] = 3
    sc[mask] = -dx[mask]
    tc[mask] = dz[mask]
    ma[mask] = abs_y[mask]

    # +Z (Top) -> slot 5
    mask = ~is_x_major & ~is_y_major & (dz > 0)
    face_idx[mask] = 5
    sc[mask] = dx[mask]
    tc[mask] = -dy[mask]
    ma[mask] = abs_z[mask]

    # -Z (Bottom) -> slot 4
    mask = ~is_x_major & ~is_y_major & (dz < 0)
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
        m = (face_idx == i)
        out_img[m] = face_images[i][px_v[m], px_u[m]]

    out_img = np.flipud(out_img)
    return out_img

def equirect_to_cubemap(equirect_img, face_size=2048):
    h, w = equirect_img.shape[:2]
    faces = {}
    face_names = ["px", "nx", "py", "ny", "pz", "nz"]

    u = np.linspace(-1, 1, face_size)
    v = np.linspace(-1, 1, face_size)
    uu, vv = np.meshgrid(u, v)

    for face_name in face_names:
        if face_name == "px":    # +X
            dx = np.ones_like(uu)
            dy = -uu
            dz = -vv
        elif face_name == "nx":  # -X
            dx = -np.ones_like(uu)
            dy = uu
            dz = -vv
        elif face_name == "py":  # +Y
            dx = uu
            dy = np.ones_like(uu)
            dz = -vv
        elif face_name == "ny":  # -Y
            dx = -uu
            dy = -np.ones_like(uu)
            dz = -vv
        elif face_name == "pz":  # +Z (up)
            dx = uu
            dy = vv
            dz = np.ones_like(uu)
        elif face_name == "nz":  # -Z (down)
            dx = uu
            dy = -vv
            dz = -np.ones_like(uu)

        r = np.sqrt(dx**2 + dy**2 + dz**2)
        theta = np.arctan2(dy, dx)
        phi = np.arcsin(np.clip(dz / r, -1.0, 1.0))

        eq_x = ((theta / np.pi + 1.0) * 0.5 * (w - 1)).astype(np.float32) % w
        eq_y = np.clip((0.5 - phi / np.pi) * (h - 1), 0, h - 1).astype(np.float32)

        map_x = eq_x.astype(np.float32)
        map_y = eq_y.astype(np.float32)
        face_img = cv2.remap(equirect_img, map_x, map_y, interpolation=cv2.INTER_LINEAR, borderMode=cv2.BORDER_WRAP)
        faces[face_name] = face_img

    return faces
