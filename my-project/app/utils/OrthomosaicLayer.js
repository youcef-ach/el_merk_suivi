import * as THREE from 'three';

/**
 * Manages Orthomosaic / Orthoprojection georeferenced plane layer in Three.js
 */
export class OrthomosaicLayer {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;
    this.material = null;
    this.texture = null;
  }

  loadOrtho(imageUrl, bounds = null) {
    this.dispose();

    const texLoader = new THREE.TextureLoader();
    this.texture = texLoader.load(imageUrl);
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.colorSpace = THREE.SRGBColorSpace;

    // Default dimensions if not specified in bounds
    const width = bounds?.widthMeters || 162.67;
    const height = bounds?.heightMeters || 377.28;
    const posX = bounds?.posX ?? -1.61;
    const posY = bounds?.posY ?? -0.05;
    const posZ = bounds?.posZ ?? -9.64;

    const geo = new THREE.PlaneGeometry(width, height);
    this.material = new THREE.MeshStandardMaterial({
      map: this.texture,
      transparent: true,
      opacity: 1.0,
      roughness: 0.9,
      metalness: 0.05,
      side: THREE.DoubleSide,
      depthWrite: false, // Prevent z-fighting with terrain mesh
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(posX, posY, posZ);
    this.mesh.renderOrder = 2; // Render directly above ground

    this.scene.add(this.mesh);
    return this.mesh;
  }

  setOpacity(opacity) {
    if (this.material) {
      this.material.opacity = Math.max(0, Math.min(1, Number(opacity)));
      this.material.needsUpdate = true;
    }
  }

  setVisible(visible) {
    if (this.mesh) {
      this.mesh.visible = Boolean(visible);
    }
  }

  load(imageUrl, options = null) {
    const mesh = this.loadOrtho(imageUrl, options);
    if (options?.opacity !== undefined) {
      this.setOpacity(options.opacity);
    }
    if (options?.elevationOffsetY !== undefined) {
      this.setElevationOffset(options.elevationOffsetY);
    }
    return mesh;
  }

  show() {
    this.setVisible(true);
  }

  hide() {
    this.setVisible(false);
  }

  setElevationOffset(offsetY) {
    if (this.mesh) {
      this.mesh.position.y = Number(offsetY);
    }
  }

  dispose() {
    if (this.mesh && this.scene) {
      this.scene.remove(this.mesh);
      if (this.mesh.geometry) this.mesh.geometry.dispose();
    }
    if (this.material) this.material.dispose();
    if (this.texture) this.texture.dispose();
    this.mesh = null;
    this.material = null;
    this.texture = null;
  }
}
