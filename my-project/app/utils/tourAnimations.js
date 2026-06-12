import * as THREE from 'three';
import gsap from 'gsap';

/**
 * Toggles a Mesh's visibility, animating its material opacity first.
 * 
 * @param {THREE.Mesh} boxMesh - The Three.js mesh to toggle.
 * @param {boolean} isCurrentlyVisible - If true, it fades out and hides.
 * @param {React.Dispatch<React.SetStateAction<boolean>>} setVisibleState - State setter to sync React.
 */
export const toggleBoxFading = (boxMesh, isCurrentlyVisible, setVisibleState) => {
  if (!boxMesh) return;

  if (!isCurrentlyVisible) {
    boxMesh.visible = true;
  }

  boxMesh.material.forEach((mat) => {
    // Kill existing tweens to prevent stuttering
    gsap.killTweensOf(mat);
    
    gsap.to(mat, {
      opacity: isCurrentlyVisible ? 0 : 1,
      duration: 2.5,
      ease: "power2.inOut",
      onComplete: () => { 
        if (isCurrentlyVisible) {
          boxMesh.visible = false;
        }
      }
    });
  });
  
  if (setVisibleState) setVisibleState(!isCurrentlyVisible);
};

const getModelMaterials = (model) => {
  if (!model) return [];
  if (model.userData.materialsCache) return model.userData.materialsCache;
  
  const materials = [];
  model.traverse((child) => {
    if (child.isMesh) {
      if (Array.isArray(child.material)) materials.push(...child.material);
      else if (child.material) materials.push(child.material);
    }
  });
  
  const uniqueMaterials = [...new Set(materials)];
  model.userData.materialsCache = uniqueMaterials;
  return uniqueMaterials;
};

/**
 * Toggles the 3D GLTF Model's visibility via GSAP fading.
 * 
 * @param {THREE.Group|THREE.Object3D} model - The 3D model.
 * @param {boolean} isCurrentlyVisible - Current visibility state.
 * @param {React.Dispatch<React.SetStateAction<boolean>>} setVisibleState - State setter.
 */
export const toggleModelFading = (model, isCurrentlyVisible, setVisibleState) => {
  if (!model) return;
  
  if (!isCurrentlyVisible) {
    if (model) model.visible = true; // Always true for depth occluder
    const materials = getModelMaterials(model);
    materials.forEach((mat) => {
      mat.colorWrite = true;
      mat.transparent = true;
      mat.needsUpdate = true;
    });
  }

  const materials = getModelMaterials(model);
  materials.forEach((mat) => {
    gsap.killTweensOf(mat);
    gsap.to(mat, { 
      opacity: isCurrentlyVisible ? 0 : 1, 
      duration: 2.5, 
      ease: "power2.inOut" 
    });
  });

  if (isCurrentlyVisible) {
    // Model is fading OUT to invisible depth occlusion
    gsap.delayedCall(2.5, () => { 
      if (model) {
        model.visible = true; // Always visible for depth occlusion
        getModelMaterials(model).forEach(mat => {
          mat.colorWrite = false;
          mat.depthWrite = true;
          mat.transparent = true;
          mat.side = THREE.DoubleSide;
          mat.needsUpdate = true;
        });
      }
    });
  } else {
    // Model is fading IN to solid Dollhouse
    gsap.delayedCall(2.5, () => { 
      if (model) {
        getModelMaterials(model).forEach(mat => {
          mat.transparent = false; // Turn OFF transparency once solid to save GPU!
          mat.depthWrite = true;
          mat.colorWrite = true;
          mat.needsUpdate = true;
        });
      }
    });
  }
  
  if (setVisibleState) setVisibleState(!isCurrentlyVisible);
};

/**
 * @typedef {Object} FlightParams
 * @property {THREE.Camera} camera
 * @property {import('three/examples/jsm/controls/OrbitControls').OrbitControls} controls
 * @property {THREE.Vector3} targetPos
 * @property {THREE.Vector3} lookAtDirection
 * @property {THREE.Mesh} currentBox - The panorama box currently displaying the scene (if any).
 * @property {THREE.Mesh} nextBox - The panorama box loading the upcoming scene.
 * @property {THREE.Group} model - The 3D Dollhouse model.
 * @property {THREE.Group} [stagedGroup] - The 3D staged furniture group.
 * @property {boolean} isFirstClick - Flag indicating transitioning from dollhouse (true) or pano-to-pano (false).
 * @property {Function} onComplete - Callback executed safely when animation timeline finishes.
 */

/**
 * Executes a seamless Matterport-quality flight animation.
 * 
 * Dollhouse → Pano: Synchronized dissolve where the model melts into the panorama.
 * Pano → Pano: Smooth cross-dissolve. The current panorama gently fades out,
 *               the 3D model briefly surfaces as a visual bridge (~40% opacity),
 *               and the next panorama smoothly materializes — all heavily overlapping
 *               so there is never a "blank" frame.
 * 
 * @param {FlightParams} params 
 */
export const executeFlightAnimation = ({
  camera,
  controls,
  targetPos,
  lookAtDirection,
  currentBox,
  nextBox,
  model,
  stagedGroup,
  isFirstClick,
  onComplete
}) => {
  const modelsToFade = [];
  if (model) modelsToFade.push(model);
  if (stagedGroup) modelsToFade.push(stagedGroup);

  // 1. Kill all competing GSAP tweens
  nextBox.material.forEach(mat => gsap.killTweensOf(mat));
  if (!isFirstClick && currentBox) {
    currentBox.material.forEach(mat => gsap.killTweensOf(mat));
  }
  modelsToFade.forEach(m => {
    getModelMaterials(m).forEach(mat => gsap.killTweensOf(mat));
  });

  // 2. Lock starting states
  nextBox.visible = true;
  nextBox.material.forEach(mat => { mat.opacity = 0; });

  if (!isFirstClick) {
    currentBox.visible = true;
    currentBox.material.forEach(mat => { mat.opacity = 1; });

    modelsToFade.forEach(m => {
      m.visible = true;
      getModelMaterials(m).forEach(mat => {
        mat.opacity = 0;
        mat.colorWrite = true;
        mat.transparent = true;
        mat.needsUpdate = true;
      });
    });
  }

  // 3. Build the Master Timeline
  const tl = gsap.timeline({ onComplete });

  if (isFirstClick) {
    // ──────────────────────────────────────
    // DOLLHOUSE → PANO  (1.2s total)
    // Smooth dive-in with synchronized dissolve
    // ──────────────────────────────────────
    const FLIGHT = 1.2;

    tl.to(camera.position, {
      x: targetPos.x,
      y: targetPos.y,
      z: targetPos.z,
      duration: FLIGHT,
      ease: "power3.inOut",
      onUpdate: () => {
        const t = new THREE.Vector3()
          .copy(camera.position)
          .add(lookAtDirection.clone().multiplyScalar(0.0001));
        controls.target.copy(t);
      }
    }, 0);

    // Model dissolves out while panorama materializes — synchronized
    modelsToFade.forEach(m => {
      getModelMaterials(m).forEach(mat => {
        mat.colorWrite = true;
        mat.transparent = true; // Enable transparency specifically for this fade
        mat.needsUpdate = true;
        tl.to(mat, { opacity: 0, duration: 1.0, ease: "power2.in" }, 0.1);
      });
    });
    nextBox.material.forEach(mat => {
      tl.to(mat, { opacity: 1, duration: 1.0, ease: "power2.out" }, 0.1);
    });

  } else {
    // ──────────────────────────────────────
    // PANO → PANO  (clean 2-phase transition)
    //
    // Phase 1 (0.0s – 0.7s): Parallel
    //   • Current panorama fades OUT  (1 → 0)
    //   • 3D model fades IN           (0 → 1)
    //
    // Phase 2 (0.7s – 1.4s): Immediately follows, parallel
    //   • 3D model fades OUT          (1 → 0)
    //   • Next panorama fades IN      (0 → 1)
    //
    // No time gap — Phase 2 starts the instant Phase 1 ends.
    // ──────────────────────────────────────
    const PHASE = 0.7;          // Duration of each phase
    const FLIGHT = PHASE * 2;   // Total camera flight = both phases

    // Camera flight spans the full duration
    tl.to(camera.position, {
      x: targetPos.x,
      y: targetPos.y,
      z: targetPos.z,
      duration: FLIGHT,
      ease: "power3.inOut",
      onUpdate: () => {
        const t = new THREE.Vector3()
          .copy(camera.position)
          .add(lookAtDirection.clone().multiplyScalar(0.0001));
        controls.target.copy(t);
      }
    }, 0);

    // ── Phase 1: Current pano OUT + Model IN ──
    if (currentBox) {
      currentBox.material.forEach(mat => {
        tl.to(mat, { opacity: 0, duration: PHASE, ease: "power2.inOut" }, 0);
      });
    }
    modelsToFade.forEach(m => {
      getModelMaterials(m).forEach(mat => {
        mat.colorWrite = true;
        mat.transparent = true;
        mat.needsUpdate = true;
        tl.to(mat, { opacity: 1, duration: PHASE, ease: "power2.inOut" }, 0);
      });
    });

    // ── Phase 2: Model OUT + Next pano IN ──
    modelsToFade.forEach(m => {
      getModelMaterials(m).forEach(mat => {
        // Needs transparency to fade out again
        mat.transparent = true;
        mat.needsUpdate = true;
        tl.to(mat, { opacity: 0, duration: PHASE, ease: "power2.inOut" }, PHASE);
      });
    });
    nextBox.material.forEach(mat => {
      tl.to(mat, { opacity: 1, duration: PHASE, ease: "power2.inOut" }, PHASE);
    });
  }

  return tl;
};
