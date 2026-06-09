import * as THREE from 'three';

/**
 * Traverses a Three.js scene or object and safely disposes of geometries,
 * materials, and textures to prevent memory leaks on component unmount.
 * 
 * @param {THREE.Object3D} scene - The Three.js scene or group to dispose.
 * @param {Array<THREE.Texture>} preserveTextures - Array of textures to ignore during disposal (e.g., dummyTex)
 */
export const disposeScene = (scene, preserveTextures = []) => {
  if (!scene) return;

  scene.traverse((object) => {
    if (!object.isMesh) return;

    // Dispose Geometry
    if (object.geometry) {
      object.geometry.dispose();
    }

    // Dispose Material(s)
    if (object.material) {
      if (Array.isArray(object.material)) {
        object.material.forEach((material) => disposeMaterial(material, preserveTextures));
      } else {
        disposeMaterial(object.material, preserveTextures);
      }
    }
  });

  // Ensure we also clear out the scene conceptually
  scene.clear();
};

/**
 * Safely disposes a material and its associated maps.
 * 
 * @param {THREE.Material} material 
 * @param {Array<THREE.Texture>} preserveTextures 
 */
function disposeMaterial(material, preserveTextures) {
  // Common maps on standard/basic materials
  const maps = [
    'map', 'lightMap', 'bumpMap', 'normalMap', 'specularMap', 'envMap',
    'alphaMap', 'aoMap', 'displacementMap', 'emissiveMap', 'metalnessMap', 'roughnessMap'
  ];

  maps.forEach((mapName) => {
    if (material[mapName]) {
      const texture = material[mapName];
      if (!preserveTextures.includes(texture)) {
        texture.dispose();
      }
    }
  });

  material.dispose();
}
