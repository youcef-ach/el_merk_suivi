import * as THREE from 'three';

/**
 * Creates a high-definition geodetic survey target texture (concentric calibration rings + crosshairs)
 */
function createSurveyTargetTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const center = size / 2;

  ctx.clearRect(0, 0, size, size);

  // Outer circular dark base
  ctx.beginPath();
  ctx.arc(center, center, center - 8, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(10, 18, 30, 0.92)';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#00f0ff';
  ctx.stroke();

  // 2 opposing quadrants filled with vibrant cyan for survey GCP pattern
  ctx.save();
  ctx.beginPath();
  ctx.arc(center, center, center - 14, 0, Math.PI * 2);
  ctx.clip();

  ctx.fillStyle = 'rgba(0, 240, 255, 0.75)';
  // Quadrant 1 (top-right)
  ctx.beginPath();
  ctx.moveTo(center, center);
  ctx.arc(center, center, center - 14, -Math.PI / 2, 0);
  ctx.closePath();
  ctx.fill();

  // Quadrant 3 (bottom-left)
  ctx.beginPath();
  ctx.moveTo(center, center);
  ctx.arc(center, center, center - 14, Math.PI / 2, Math.PI);
  ctx.closePath();
  ctx.fill();

  ctx.restore();

  // Concentric calibration rings
  const rings = [0.75, 0.5, 0.25];
  rings.forEach((r, idx) => {
    ctx.beginPath();
    ctx.arc(center, center, (center - 14) * r, 0, Math.PI * 2);
    ctx.lineWidth = idx === 1 ? 4 : 2;
    ctx.strokeStyle = idx === 1 ? '#ffffff' : 'rgba(0, 240, 255, 0.8)';
    ctx.stroke();
  });

  // Crosshairs
  ctx.beginPath();
  ctx.moveTo(center, 12);
  ctx.lineTo(center, size - 12);
  ctx.moveTo(12, center);
  ctx.lineTo(size - 12, center);
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  // Center bullseye pin
  ctx.beginPath();
  ctx.arc(center, center, 8, 0, Math.PI * 2);
  ctx.fillStyle = '#ff2a5f';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Creates a high-DPI 3D Billboard label texture displaying 0.00m Datum Benchmark
 */
function createBillboardLabelTexture(customLabel) {
  const width = 512;
  const height = 180;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, width, height);

  // Rounded rectangle container
  const radius = 24;
  ctx.beginPath();
  ctx.roundRect(10, 10, width - 20, height - 20, radius);
  ctx.fillStyle = 'rgba(8, 14, 24, 0.88)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#00f0ff';
  ctx.stroke();

  // Glow line on top
  ctx.beginPath();
  ctx.roundRect(14, 14, width - 28, 4, 2);
  ctx.fillStyle = '#00f0ff';
  ctx.fill();

  // Title: 📍 DATUM BENCHMARK: 0.00m
  ctx.font = 'bold 34px "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#00f0ff';
  ctx.textAlign = 'center';
  ctx.fillText('⌖ DATUM BENCHMARK: 0.00m', width / 2, 70);

  // Subtitle
  ctx.font = '500 22px "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText(customLabel || 'Center Surface Reference • 0.00m Rel', width / 2, 112);

  // Badge Tag
  ctx.font = '600 16px monospace';
  ctx.fillStyle = '#38bdf8';
  ctx.fillText('SURVEY DATUM ORIGIN (0, 0)', width / 2, 144);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * 3D Surveyor Geodetic Datum Benchmark Marker
 * Highlights the center upper surface point (0.00m altitude reference) in 3D photogrammetry surveys.
 */
export class DatumBenchmarkMarker {
  constructor(scene, position = { x: 0, y: 0, z: 0 }, options = {}) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'DatumBenchmarkMarker';
    this.visible = true;

    const posX = Number(position.x) || 0;
    const posY = Number(position.y) || 0;
    const posZ = Number(position.z) || 0;

    // 1. Ground Target Disc (4.0m diameter)
    const targetGeo = new THREE.CircleGeometry(2.0, 48);
    targetGeo.rotateX(-Math.PI / 2);
    this.targetTexture = createSurveyTargetTexture();
    const targetMat = new THREE.MeshBasicMaterial({
      map: this.targetTexture,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: THREE.DoubleSide
    });
    this.targetMesh = new THREE.Mesh(targetGeo, targetMat);
    this.targetMesh.position.set(0, 0.015, 0);
    this.group.add(this.targetMesh);

    // 2. Animated Expanding Radar Pulse Ring
    const pulseGeo = new THREE.RingGeometry(1.8, 2.1, 48);
    pulseGeo.rotateX(-Math.PI / 2);
    this.pulseMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.pulseMesh = new THREE.Mesh(pulseGeo, this.pulseMat);
    this.pulseMesh.position.set(0, 0.02, 0);
    this.group.add(this.pulseMesh);
    this._pulseScale = 1.0;

    // 3. Vertical Surveyor Pin / Antenna Rod
    const rodHeight = 3.2;
    const rodGeo = new THREE.CylinderGeometry(0.04, 0.04, rodHeight, 16);
    const rodMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      metalness: 0.85,
      roughness: 0.15,
      emissive: 0x004050,
      emissiveIntensity: 0.4
    });
    this.rodMesh = new THREE.Mesh(rodGeo, rodMat);
    this.rodMesh.position.set(0, rodHeight / 2, 0);
    this.group.add(this.rodMesh);

    // 4. Glowing Beacon Sphere on Top of Pin
    const beaconGeo = new THREE.SphereGeometry(0.22, 24, 24);
    const beaconMat = new THREE.MeshStandardMaterial({
      color: 0xff0055,
      emissive: 0xff0055,
      emissiveIntensity: 0.9,
      roughness: 0.2
    });
    this.beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
    this.beaconMesh.position.set(0, rodHeight, 0);
    this.group.add(this.beaconMesh);

    // 5. Subtle Point Light at Beacon
    this.beaconLight = new THREE.PointLight(0x00f0ff, 1.2, 10);
    this.beaconLight.position.set(0, rodHeight, 0);
    this.group.add(this.beaconLight);

    // 6. 3D Billboard Label
    this.labelTexture = createBillboardLabelTexture(options.subLabel);
    const spriteMat = new THREE.SpriteMaterial({
      map: this.labelTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });
    this.labelSprite = new THREE.Sprite(spriteMat);
    this.labelSprite.position.set(0, rodHeight + 1.2, 0);
    this.labelSprite.scale.set(6.4, 2.25, 1);
    this.group.add(this.labelSprite);

    // Place group at exact world coordinate
    this.group.position.set(posX, posY, posZ);
    this.scene.add(this.group);
  }

  update(dt = 0.016) {
    if (!this.visible || !this.group) return;

    // Animate the expanding ground pulse ring
    this._pulseScale += dt * 0.9;
    if (this._pulseScale > 2.8) {
      this._pulseScale = 1.0;
    }

    if (this.pulseMesh) {
      this.pulseMesh.scale.set(this._pulseScale, 1, this._pulseScale);
      const progress = (this._pulseScale - 1.0) / 1.8;
      this.pulseMat.opacity = Math.max(0, 0.8 * (1.0 - progress));
    }

    // Subtle breathing glow on the beacon sphere
    if (this.beaconMesh) {
      const t = performance.now() * 0.003;
      const glow = 0.8 + 0.3 * Math.sin(t);
      this.beaconMesh.material.emissiveIntensity = glow;
    }
  }

  setPosition(x, y, z) {
    if (this.group) {
      this.group.position.set(Number(x) || 0, Number(y) || 0, Number(z) || 0);
    }
  }

  getPosition() {
    return this.group ? this.group.position.clone() : new THREE.Vector3();
  }

  setVisible(visible) {
    this.visible = Boolean(visible);
    if (this.group) {
      this.group.visible = this.visible;
    }
  }

  dispose() {
    if (this.group) {
      this.scene.remove(this.group);
      this.group.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      });
      this.group = null;
    }
    if (this.targetTexture) this.targetTexture.dispose();
    if (this.labelTexture) this.labelTexture.dispose();
  }
}
