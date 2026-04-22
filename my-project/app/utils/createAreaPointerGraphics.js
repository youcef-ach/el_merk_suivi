import * as THREE from 'three';

/**
 * Creates the 3D objects for an Area Pointer:
 * 1. A glowing cylinder (the laser) from the floor up.
 * 2. A text sprite on top with the area name.
 */
export function createAreaPointerGroup(name, color, posX, posY, posZ, height = 15.0, thickness = 0.04, labelSize = 1.0) {
  const group = new THREE.Group();
  group.position.set(posX, posY, posZ);

  const laserHeight = height; // Point high towards the sky

  // 1. The Laser Cylinder (Glowing Outer)
  const geo = new THREE.CylinderGeometry(thickness, thickness, laserHeight, 16);
  geo.translate(0, laserHeight / 2, 0); // Move origin to base
  geo.rotateX(Math.PI / 2); // Point base->top along Z axis

  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide 
  });
  const cylinder = new THREE.Mesh(geo, mat);
  cylinder.frustumCulled = false;
  cylinder.renderOrder = 999;
  group.add(cylinder);

  // 1.b inner core of laser (Bright Center)
  const coreThickness = Math.max(0.005, thickness * 0.375); // e.g. 0.015 relative to 0.04
  const coreGeo = new THREE.CylinderGeometry(coreThickness, coreThickness, laserHeight, 8);
  coreGeo.translate(0, laserHeight / 2, 0);
  coreGeo.rotateX(Math.PI / 2);

  const coreMat = new THREE.MeshBasicMaterial({ 
    color: 0xffffff, 
    transparent: true, 
    opacity: 0.9, 
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide 
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.frustumCulled = false;
  core.renderOrder = 999;
  group.add(core);

  // 2. The Text Sprite (Dynamic High-Res Canvas)
  const canvas = document.createElement('canvas');
  const ctxInit = canvas.getContext('2d');
  ctxInit.font = 'bold 160px Inter, Arial, sans-serif';
  
  const textWidth = name ? ctxInit.measureText(name).width : 0;
  const canvasWidth = Math.max(256, textWidth + 120); // 60px padding each side
  const canvasHeight = 256;
  
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d');
  
  // Outer glowing border
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 15;
  ctx.roundRect(15, 15, canvasWidth - 30, canvasHeight - 30, 20);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Inner black background
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.roundRect(22, 22, canvasWidth - 44, canvasHeight - 44, 15);
  ctx.fill();

  if (name) {
    ctx.font = 'bold 160px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    // Offset Y slightly since we bumped font size
    ctx.fillText(name, canvasWidth / 2, canvasHeight / 2 + 10);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const spriteMat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    sizeAttenuation: true,
  });
  
  const sprite = new THREE.Sprite(spriteMat);
  
  // Base scale: Since height is 256, let's map height to 1.5 meters.
  // The width will be geometrically proportional.
  const baseScaleY = 1.5;
  const baseScaleX = (canvasWidth / canvasHeight) * baseScaleY;
  
  sprite.scale.set(baseScaleX * labelSize, baseScaleY * labelSize, 1);
  sprite.position.z = laserHeight + (0.8 * labelSize); // Top of the cylinder + padded offset based on size
  sprite.renderOrder = 1000;
  group.add(sprite);

  return group;
}
