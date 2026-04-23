import * as THREE from 'three';

// Shared geometries — created once, reused by every area pointer (GPU-efficient)
let _wallGeo = null;
let _handleGeo = null;

function getWallGeo() {
  if (!_wallGeo) _wallGeo = new THREE.PlaneGeometry(1, 1);
  return _wallGeo;
}

function getHandleGeo() {
  if (!_handleGeo) _handleGeo = new THREE.SphereGeometry(0.12, 12, 8);
  return _handleGeo;
}

/**
 * Creates the 3D objects for an Area Pointer:
 * 1. A glowing cylinder (the laser) from the floor up.
 * 2. A text sprite on top with the area name.
 * 3. 4 transparent walls forming a rectangular perimeter.
 * 4. 4 drag handle spheres on each wall midpoint.
 */
export function createAreaPointerGroup(
  name, color, posX, posY, posZ,
  height = 15.0, thickness = 0.04, labelSize = 1.0,
  sizeX = 3.0, sizeY = 3.0, wallHeight = 3.0
) {
  const group = new THREE.Group();
  group.position.set(posX, posY, posZ);

  const parsedColor = new THREE.Color(color);
  const laserHeight = height;

  // ─── 1. Laser Cylinder (Outer Glow) ───────────────────────────
  const geo = new THREE.CylinderGeometry(thickness, thickness, laserHeight, 16);
  geo.translate(0, laserHeight / 2, 0);
  geo.rotateX(Math.PI / 2);

  const mat = new THREE.MeshBasicMaterial({
    color: parsedColor,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
  });
  const cylinder = new THREE.Mesh(geo, mat);
  cylinder.frustumCulled = false;
  cylinder.renderOrder = 999;
  group.add(cylinder);

  // 1.b Inner core
  const coreThickness = Math.max(0.005, thickness * 0.375);
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
    side: THREE.DoubleSide,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.frustumCulled = false;
  core.renderOrder = 999;
  group.add(core);

  // ─── 2. Text Sprite ───────────────────────────────────────────
  const canvas = document.createElement('canvas');
  const ctxInit = canvas.getContext('2d');
  ctxInit.font = 'bold 160px Inter, Arial, sans-serif';
  
  const textWidth = name ? ctxInit.measureText(name).width : 0;
  const canvasWidth = Math.max(256, textWidth + 120);
  const canvasHeight = 256;
  
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d');
  
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 15;
  ctx.roundRect(15, 15, canvasWidth - 30, canvasHeight - 30, 20);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.roundRect(22, 22, canvasWidth - 44, canvasHeight - 44, 15);
  ctx.fill();

  if (name) {
    ctx.font = 'bold 160px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
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
  const baseScaleY = 1.5;
  const baseScaleX = (canvasWidth / canvasHeight) * baseScaleY;
  sprite.scale.set(baseScaleX * labelSize, baseScaleY * labelSize, 1);
  sprite.position.z = laserHeight + (0.8 * labelSize);
  sprite.renderOrder = 1000;
  group.add(sprite);

  // ─── 3. Transparent Walls ─────────────────────────────────────
  const wallContainer = new THREE.Group();
  wallContainer.name = 'wallContainer';
  group.add(wallContainer);

  const handleContainer = new THREE.Group();
  handleContainer.name = 'handleContainer';
  group.add(handleContainer);

  // Create walls + handles (use wallHeight, not laser height)
  _buildWalls(wallContainer, handleContainer, parsedColor, sizeX, sizeY, wallHeight);

  return group;
}

/**
 * Builds (or rebuilds) the 4 walls and 4 drag handles.
 * Walls are PlaneGeometry stretched to correct dimensions.
 * Handles are small spheres at each wall midpoint.
 */
function _buildWalls(wallContainer, handleContainer, parsedColor, sizeX, sizeY, wallHeight) {
  // Clear previous
  while (wallContainer.children.length) wallContainer.remove(wallContainer.children[0]);
  while (handleContainer.children.length) handleContainer.remove(handleContainer.children[0]);

  const wallMat = new THREE.MeshBasicMaterial({
    color: parsedColor,
    transparent: true,
    opacity: 0.10,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const halfX = sizeX / 2;
  const halfY = sizeY / 2;
  const halfH = wallHeight / 2;

  // Wall definitions: vertical planes forming a box perimeter
  // PlaneGeometry(1,1) is in XY plane, normal +Z by default.
  // rotation.x = PI/2 → stands it up into XZ plane (vertical, facing along Y)
  // rotation (PI/2, 0, PI/2) → stands it up into YZ plane (vertical, facing along X)
  const wallDefs = [
    // North wall: at y=+halfY, vertical in XZ plane, width=sizeX, height=wallHeight
    { name: 'north', pos: [0, halfY, halfH], rot: [Math.PI/2, 0, 0],           sx: sizeX, sy: wallHeight, hx: 0, hy: halfY },
    // South wall: at y=-halfY
    { name: 'south', pos: [0, -halfY, halfH], rot: [Math.PI/2, 0, 0],          sx: sizeX, sy: wallHeight, hx: 0, hy: -halfY },
    // East wall: at x=+halfX, vertical in YZ plane — Rz(PI/2) then Ry(PI/2) maps (x,y,0)→(0,x,y)
    { name: 'east',  pos: [halfX, 0, halfH], rot: [0, Math.PI/2, Math.PI/2],   sx: sizeY, sy: wallHeight, hx: halfX, hy: 0 },
    // West wall: at x=-halfX
    { name: 'west',  pos: [-halfX, 0, halfH], rot: [0, Math.PI/2, Math.PI/2],  sx: sizeY, sy: wallHeight, hx: -halfX, hy: 0 },
  ];

  const handleMat = new THREE.MeshBasicMaterial({
    color: parsedColor,
    transparent: true,
    opacity: 0.85,
    depthTest: false,
  });

  wallDefs.forEach(def => {
    // Wall plane
    const wall = new THREE.Mesh(getWallGeo(), wallMat.clone());
    wall.position.set(def.pos[0], def.pos[1], def.pos[2]);
    wall.rotation.set(def.rot[0], def.rot[1], def.rot[2]);
    wall.scale.set(def.sx, def.sy, 1);
    wall.frustumCulled = false;
    wall.renderOrder = 998;
    wall.userData.wallName = def.name;
    wallContainer.add(wall);

    // Drag handle sphere
    const handle = new THREE.Mesh(getHandleGeo(), handleMat.clone());
    handle.position.set(def.hx, def.hy, wallHeight * 0.5); // Mid-height of wall
    handle.frustumCulled = false;
    handle.renderOrder = 1001;
    handle.userData.dragHandle = def.name;
    handleContainer.add(handle);
  });
}

/**
 * Updates wall positions/scales and handle positions WITHOUT recreating geometry.
 * This is the hot-path called during drag — must be extremely fast.
 * 
 * @param {THREE.Group} group - The top-level area pointer group
 * @param {number} sizeX - New X dimension
 * @param {number} sizeY - New Y dimension
 * @param {number} wallHeight - Wall height
 */
export function updateAreaWalls(group, sizeX, sizeY, wallHeight) {
  const wallContainer = group.getObjectByName('wallContainer');
  const handleContainer = group.getObjectByName('handleContainer');
  if (!wallContainer || !handleContainer) return;

  const halfX = sizeX / 2;
  const halfY = sizeY / 2;
  const halfH = wallHeight / 2;

  // Update walls by name
  wallContainer.children.forEach(wall => {
    const n = wall.userData.wallName;
    if (n === 'north') {
      wall.position.set(0, halfY, halfH);
      wall.scale.set(sizeX, wallHeight, 1);
    } else if (n === 'south') {
      wall.position.set(0, -halfY, halfH);
      wall.scale.set(sizeX, wallHeight, 1);
    } else if (n === 'east') {
      wall.position.set(halfX, 0, halfH);
      wall.scale.set(sizeY, wallHeight, 1);
    } else if (n === 'west') {
      wall.position.set(-halfX, 0, halfH);
      wall.scale.set(sizeY, wallHeight, 1);
    }
  });

  // Update handles
  handleContainer.children.forEach(handle => {
    const n = handle.userData.dragHandle;
    if (n === 'north') handle.position.set(0, halfY, halfH);
    else if (n === 'south') handle.position.set(0, -halfY, halfH);
    else if (n === 'east') handle.position.set(halfX, 0, halfH);
    else if (n === 'west') handle.position.set(-halfX, 0, halfH);
  });
}
