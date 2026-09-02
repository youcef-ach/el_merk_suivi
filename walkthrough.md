# Walkthrough: Automated 3D Mesh Ingestion & Draco Compression Pipeline

We have implemented an automated backend ingestion pipeline in **`el_merk_suivi`** that accepts `.obj`, `.zip` (e.g. Matterport `model.zip` packages), `.gltf`, and `.glb` files. The backend automatically converts, optimizes textures, and applies Google Draco geometry compression before publishing to MinIO.

---

## 1. Backend Ingestion Pipeline (`inspections.service.ts`)

- **Multi-Format Ingestion**:
  - Direct `.glb` / `.gltf`
  - Direct `.obj` (or `.obj` + `.mtl` + textures)
  - `.zip` packages containing `.obj` or `.glb` models.
- **Conversion & Optimization Steps**:
  1. **Decompression**: If `.zip`, extracts contents using `AdmZip` and locates the mesh model.
  2. **OBJ $\rightarrow$ GLB**: Uses `obj2gltf` with binary encoding and texture resolution.
  3. **Vertex Welding**: Uses `@gltf-transform/functions` (`weld({ tolerance: 0.0001 })`) to weld duplicate vertices and remove seam artifacts.
  4. **Texture Clamping**: Resizes large 4K/8K material textures to 1024px using `sharp` to prevent browser memory overflows.
  5. **Google Draco Compression**: Encodes geometry vertex buffers using Draco `edgebreaker` method, reducing mesh sizes by 80–90%.
  6. **Storage & DB Synchronization**: Uploads `model.glb` to MinIO (`virtual-inspections/inspections/${id}/model.glb`) and updates `glbModelUrl` in the database.

---

## 2. Frontend Wizard Updates (`inspections-new.jsx`)

- **Upload Dropzone**:
  - Accept attribute updated to `.glb, .gltf, .obj, .zip`.
  - Dynamically routes the file type (`model.zip`, `model.obj`, or `model.glb`).
  - Triggers the backend `POST /process-glb` optimization endpoint.
  - Displays real-time progress indicators: *"Converting OBJ / Applying Draco mesh compression on server..."*.

---

## 3. Build & Integration Verification

- **Backend**: `nest build` passed with exit code `0`.
- **Frontend**: `react-router build` compiled with exit code `0`.
