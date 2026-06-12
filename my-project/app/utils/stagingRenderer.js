import * as THREE from 'three';

const FACES = ['py', 'pz', 'px', 'nz', 'nx', 'ny'];

// Set true by diagnostic bake for verbose camera logging
let _diagLog = false;
export function setDiagnosticMode(on) { _diagLog = on; }

function setupFaceCamera(camera, faceIndex) {
  const target = new THREE.Vector3();
  const up = new THREE.Vector3();

  camera.position.set(0, 0, 0);
  camera.rotation.set(0, 0, 0);

  // BoxGeometry faces from the inside with scale(-1, 1, 1) and rotation.x = PI/2:
  // These local-space directions match the cubemap face positions in the
  // texturedBoxObj's local frame. We convert them to world space before passing
  // to camera.lookAt(), which expects world-space coordinates.
  
  switch (faceIndex) {
    case 0:
      up.set(0, 1, 0);
      target.set(-1, 0, 0);
      break;
    case 1:
      up.set(0, 1, 0);
      target.set(1, 0, 0);
      break;
    case 2:
      up.set(0, 0, -1);
      target.set(0, 1, 0);
      break;
    case 3:
      up.set(0, 0, 1);
      target.set(0, -1, 0);
      break;
    case 4:
      up.set(0, 1, 0);
      target.set(0, 0, 1);
      break;
    case 5:
      up.set(0, 1, 0);
      target.set(0, 0, -1);
      break;
  }

  // Convert the local-space 'up' direction to world space.
  // This is CRITICAL because camera.up MUST be in world space before calling lookAt!
  const worldUp = up.clone().transformDirection(camera.parent.matrixWorld);
  camera.up.copy(worldUp);

  // Convert the local-space target to world space, matching what lookAt expects
  camera.lookAt(camera.parent.localToWorld(target));

  if (_diagLog) {
    const worldPos = new THREE.Vector3();
    camera.getWorldPosition(worldPos);
    const lookDir = new THREE.Vector3();
    camera.getWorldDirection(lookDir);
    const up = new THREE.Vector3(0, 1, 0);
    camera.matrixWorld.extractBasis(new THREE.Vector3(), new THREE.Vector3(), up);
    const faceNames = ['py','pz','px','nz','nx','ny'];
    console.log(`[DIAG] Face ${faceNames[faceIndex]} camPos=(${worldPos.x.toFixed(3)},${worldPos.y.toFixed(3)},${worldPos.z.toFixed(3)})`);
    console.log(`[DIAG] Face ${faceNames[faceIndex]} lookDir=(${lookDir.x.toFixed(3)},${lookDir.y.toFixed(3)},${lookDir.z.toFixed(3)})`);
    console.log(`[DIAG] Face ${faceNames[faceIndex]} upVec=(${up.x.toFixed(3)},${up.y.toFixed(3)},${up.z.toFixed(3)})`);
  }
}

async function extractBlobFromRenderTarget(renderer, renderTarget) {
  const width = renderTarget.width;
  const height = renderTarget.height;
  const buffer = new Uint8Array(width * height * 4);
  renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, buffer);

  // Flip Y because WebGL reads bottom-up
  const flippedBuffer = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const flipI = ((height - 1 - y) * width + x) * 4;
      flippedBuffer[flipI] = buffer[i];
      flippedBuffer[flipI + 1] = buffer[i + 1];
      flippedBuffer[flipI + 2] = buffer[i + 2];
      flippedBuffer[flipI + 3] = buffer[i + 3]; // Alpha channel
    }
  }

  // Draw to a canvas to get a Blob (PNG)
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const imgData = new ImageData(new Uint8ClampedArray(flippedBuffer), width, height);
  ctx.putImageData(imgData, 0, 0);

  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

async function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

async function compositeImages(backgroundSrc, foregroundBlob, face) {
  const bgImg = await loadImage(backgroundSrc);
  const fgUrl = URL.createObjectURL(foregroundBlob);
  const fgImg = await loadImage(fgUrl);

  const canvas = document.createElement('canvas');
  canvas.width = bgImg.width;
  canvas.height = bgImg.height;
  const ctx = canvas.getContext('2d');

  // Draw original panorama face
  ctx.drawImage(bgImg, 0, 0);

  // Draw rendered furniture directly over it
  ctx.drawImage(fgImg, 0, 0, canvas.width, canvas.height);
  
  URL.revokeObjectURL(fgUrl);

  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
}

/**
 * Main bake function.
 * Renders the staged items from each scan position and composites them over the original panoramas.
 * 
 * @param {THREE.Scene} scene 
 * @param {THREE.WebGLRenderer} renderer 
 * @param {Array} scansData 
 * @param {THREE.Group} stagedGroup 
 * @param {THREE.Object3D} model - The 3D floorplan mesh to act as a depth occluder
 * @param {string} tourId - The ID of the current tour to fetch background images
 * @param {number} maxBakeRadius - Maximum distance (in meters) to bake a scan. Default 5.0
 */
export async function bakeStaging(scene, renderer, scansData, stagedGroup, model, onProgress, tourId, maxBakeRadius = 5.0) {
  if (!stagedGroup || stagedGroup.children.length === 0) {
    alert("No furniture placed to bake!");
    return null;
  }

  // 1. Setup Render Target (High-res for panorama faces)
  const faceResolution = 2048;
  const renderTarget = new THREE.WebGLRenderTarget(faceResolution, faceResolution, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    colorSpace: THREE.SRGBColorSpace,
    depthBuffer: true,
    stencilBuffer: false
  });

  // 2. Hide everything else in the scene, make model a depth-occluder only
  const originalVisibilities = new Map();
  scene.traverse(child => {
    if (child.isMesh || child.isInstancedMesh || child.isGroup) {
      originalVisibilities.set(child, child.visible);
      // Hide if it's not the model and not in stagedGroup
      let isStaged = false;
      let obj = child;
      while (obj) {
        if (obj === stagedGroup) isStaged = true;
        obj = obj.parent;
      }
      
      let isModel = false;
      obj = child;
      while (obj) {
        if (obj === model) isModel = true;
        obj = obj.parent;
      }

      if (!isStaged && !isModel) {
        child.visible = false;
      }
    }
  });

  // Make model depth-write only (transparent visually, but blocks background objects)
  const originalModelMats = [];
  if (model) {
    model.traverse((child) => {
      if (child.isMesh && child.material) {
        originalModelMats.push({
          child: child,
          renderOrder: child.renderOrder,
          frustumCulled: child.frustumCulled
        });
        child.renderOrder = -1; // Force model to render BEFORE furniture
        child.frustumCulled = false; // Guarantee render even if bounding box is off

        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(mat => {
          originalModelMats.push({
            mat: mat,
            colorWrite: mat.colorWrite,
            depthWrite: mat.depthWrite,
            depthTest: mat.depthTest,
            transparent: mat.transparent,
            side: mat.side
          });
          
          mat.colorWrite = false;
          mat.depthWrite = true;
          mat.depthTest = true;
          mat.transparent = false; // Must be false to guarantee it writes to depth buffer during Opaque pass
          mat.side = THREE.DoubleSide;
          mat.needsUpdate = true;
        });
      }
    });
  }

  // Remember clear color and scene background
  const originalClearColor = new THREE.Color();
  renderer.getClearColor(originalClearColor);
  const originalClearAlpha = renderer.getClearAlpha();
  const originalSceneBackground = scene.background;
  
  // Set clear to transparent for alpha mask
  renderer.setClearColor(0x000000, 0);
  scene.background = null;

  const bakedTexturesMap = new Map(); // key: "scanId_face", value: blob URL
  
  // Filter scans that are within the maxBakeRadius of any staged item
  const stagedPositions = stagedGroup.children.map(child => {
    const worldPos = new THREE.Vector3();
    child.getWorldPosition(worldPos);
    return worldPos;
  });

  const scansToBake = scansData.filter(scan => {
    const pos = scan.realPosition;
    return stagedPositions.some(sp => pos.distanceTo(sp) <= maxBakeRadius);
  });

  const totalScans = scansToBake.length * 6;
  let completed = 0;

  for (const scan of scansToBake) {
    const pos = scan.realPosition;
    
    // Replicate the exact panoramaGroup and texturedBox hierarchy from useTourData.js
    const groupQuat = new THREE.Quaternion(scan.rotation_quaternion[1], scan.rotation_quaternion[2], scan.rotation_quaternion[3], scan.rotation_quaternion[0]);
    
    const panoramaGroupObj = new THREE.Object3D();
    panoramaGroupObj.position.copy(pos);
    panoramaGroupObj.quaternion.copy(groupQuat);
    panoramaGroupObj.rotateZ(Math.PI / 2);
    
    const texturedBoxObj = new THREE.Object3D();
    texturedBoxObj.rotation.x = Math.PI / 2;
    // We intentionally omit scale(-1, 1, 1) here so the camera projection isn't inverted.
    // Instead, setupFaceCamera looks at the pre-calculated mirrored face coordinates.
    panoramaGroupObj.add(texturedBoxObj);
    scene.add(panoramaGroupObj); // Add to scene to calculate world matrices properly
    
    // Ensure world matrices are up-to-date before setting up cameras
    panoramaGroupObj.updateMatrixWorld(true);

    if (_diagLog) {
      console.log(`[DIAG] Scan ${scan.id}: baking from position (${pos.x.toFixed(3)}, ${pos.y.toFixed(3)}, ${pos.z.toFixed(3)})`);
      if (scan.snappedPosition) {
        const sp = scan.snappedPosition;
        console.log(`[DIAG]   snappedPosition would be (${sp.x.toFixed(3)}, ${sp.y.toFixed(3)}, ${sp.z.toFixed(3)}) — diff: ${pos.distanceTo(sp).toFixed(3)} units`);
      }
    }

    for (let i = 0; i < FACES.length; i++) {
      const faceName = FACES[i];

      const faceCam = new THREE.PerspectiveCamera(90, 1, 0.1, 1000);
      texturedBoxObj.add(faceCam);
      setupFaceCamera(faceCam, i);

      renderer.setRenderTarget(renderTarget);
      renderer.render(scene, faceCam);

      if (_diagLog) {
        // Check if any bright pixels were rendered
        const w = renderTarget.width, h = renderTarget.height;
        const buf = new Uint8Array(w * h * 4);
        renderer.readRenderTargetPixels(renderTarget, 0, 0, w, h, buf);
        let brightPixels = 0;
        for (let p = 0; p < buf.length; p += 4) {
          const r = buf[p], g = buf[p+1], b = buf[p+2], a = buf[p+3];
          if (a > 128 && (r > 200 || g > 200 || b > 200)) {
            brightPixels++;
          }
        }
        console.log(`[DIAG] Face ${faceName}: bright non-transparent pixels in FG = ${brightPixels}`);
        if (brightPixels === 0) {
          console.log(`[DIAG]   ⚠ NO spheres rendered! Checking render target center pixel (${w/2},${h/2}): rgba(${buf[((h/2)*w + w/2)*4]},${buf[((h/2)*w + w/2)*4+1]},${buf[((h/2)*w + w/2)*4+2]},${buf[((h/2)*w + w/2)*4+3]})`);
        }
      }

      // Extract PNG blob of just the furniture
      const fgBlob = await extractBlobFromRenderTarget(renderer, renderTarget);
      
      // Composite over original image
      const baseUrl = tourId
        ? `http://localhost:9000/virtual-inspections/inspections/${tourId}/`
        : `/`;
      const bgSrc = `${baseUrl}images/${scan.id}_${faceName}.jpg`;
      const finalBlob = await compositeImages(bgSrc, fgBlob, faceName);
      const url = URL.createObjectURL(finalBlob);
      
      bakedTexturesMap.set(`${scan.id}_${faceName}`, url);

      completed++;
      if (onProgress) onProgress(completed / totalScans);

      texturedBoxObj.remove(faceCam);
    }
    
    scene.remove(panoramaGroupObj);
  }

  // 3. Restore scene state
  scene.traverse(child => {
    if (originalVisibilities.has(child)) {
      child.visible = originalVisibilities.get(child);
    }
  });

  if (model) {
    originalModelMats.forEach(saved => {
      if (saved.child !== undefined) {
        saved.child.renderOrder = saved.renderOrder;
        saved.child.frustumCulled = saved.frustumCulled;
      }
      if (saved.mat !== undefined) {
        saved.mat.colorWrite = saved.colorWrite;
        saved.mat.depthWrite = saved.depthWrite;
        if (saved.depthTest !== undefined) saved.mat.depthTest = saved.depthTest;
        saved.mat.transparent = saved.transparent;
        saved.mat.side = saved.side;
        saved.mat.needsUpdate = true;
      }
    });
  }

  renderer.setClearColor(originalClearColor, originalClearAlpha);
  scene.background = originalSceneBackground;
  renderer.setRenderTarget(null);

  // Free render target
  renderTarget.dispose();

  return bakedTexturesMap;
}
