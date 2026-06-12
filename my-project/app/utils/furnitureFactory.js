import * as THREE from 'three';

/**
 * Creates geometric placeholder furniture using basic Three.js primitives.
 * Each function returns a THREE.Group positioned with origin at floor-center.
 */

const mat = (color) => new THREE.MeshBasicMaterial({ color });

export function createFurniture(type, color) {
  switch (type) {
    case 'sofa': return createSofa(color);
    case 'armchair': return createArmchair(color);
    case 'coffee_table': return createCoffeeTable(color);
    case 'dining_table': return createDiningTable(color);
    case 'chair': return createChair(color);
    case 'bed': return createBed(color);
    case 'bookshelf': return createBookshelf(color);
    case 'floor_lamp': return createFloorLamp(color);
    case 'plant': return createPlant(color);
    case 'tv_stand': return createTVStand(color);
    default: return createDefaultBox(color);
  }
}

function createSofa(color) {
  const g = new THREE.Group();
  g.name = 'furniture_sofa';

  // Seat
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 0.4), mat(color));
  seat.position.set(0, 0, 0.25);
  g.add(seat);

  // Back
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.5), mat(new THREE.Color(color).multiplyScalar(0.8)));
  back.position.set(0, -0.35, 0.55);
  g.add(back);

  // Armrests
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.35), mat(new THREE.Color(color).multiplyScalar(0.85)));
  armL.position.set(-0.85, -0.05, 0.5);
  g.add(armL);

  const armR = armL.clone();
  armR.position.x = 0.85;
  g.add(armR);

  // Legs
  const legGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.1, 8);
  const legMat = mat('#333333');
  const positions = [[-0.8, -0.3], [-0.8, 0.3], [0.8, -0.3], [0.8, 0.3]];
  positions.forEach(([x, y]) => {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(x, y, 0.05);
    leg.rotation.x = Math.PI / 2;
    g.add(leg);
  });

  return g;
}

function createArmchair(color) {
  const g = new THREE.Group();
  g.name = 'furniture_armchair';

  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.7, 0.35), mat(color));
  seat.position.set(0, 0, 0.25);
  g.add(seat);

  const back = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.08, 0.5), mat(new THREE.Color(color).multiplyScalar(0.8)));
  back.position.set(0, -0.31, 0.55);
  g.add(back);

  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.25), mat(new THREE.Color(color).multiplyScalar(0.85)));
  armL.position.set(-0.34, -0.05, 0.45);
  g.add(armL);

  const armR = armL.clone();
  armR.position.x = 0.34;
  g.add(armR);

  return g;
}

function createCoffeeTable(color) {
  const g = new THREE.Group();
  g.name = 'furniture_coffee_table';

  const top = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6, 0.04), mat(color));
  top.position.set(0, 0, 0.4);
  g.add(top);

  const legGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.38, 8);
  const legMat = mat('#222222');
  [[-0.42, -0.22], [-0.42, 0.22], [0.42, -0.22], [0.42, 0.22]].forEach(([x, y]) => {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(x, y, 0.19);
    leg.rotation.x = Math.PI / 2;
    g.add(leg);
  });

  return g;
}

function createDiningTable(color) {
  const g = new THREE.Group();
  g.name = 'furniture_dining_table';

  const top = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.05), mat(color));
  top.position.set(0, 0, 0.75);
  g.add(top);

  const legGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.72, 8);
  const legMat = mat(new THREE.Color(color).multiplyScalar(0.7));
  [[-0.6, -0.3], [-0.6, 0.3], [0.6, -0.3], [0.6, 0.3]].forEach(([x, y]) => {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(x, y, 0.36);
    leg.rotation.x = Math.PI / 2;
    g.add(leg);
  });

  return g;
}

function createChair(color) {
  const g = new THREE.Group();
  g.name = 'furniture_chair';

  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.04), mat(color));
  seat.position.set(0, 0, 0.45);
  g.add(seat);

  const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.4), mat(new THREE.Color(color).multiplyScalar(0.85)));
  back.position.set(0, -0.19, 0.67);
  g.add(back);

  const legGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.43, 8);
  const legMat = mat('#333');
  [[-0.17, -0.17], [-0.17, 0.17], [0.17, -0.17], [0.17, 0.17]].forEach(([x, y]) => {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(x, y, 0.215);
    leg.rotation.x = Math.PI / 2;
    g.add(leg);
  });

  return g;
}

function createBed(color) {
  const g = new THREE.Group();
  g.name = 'furniture_bed';

  // Mattress
  const mattress = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.0, 0.25), mat(color));
  mattress.position.set(0, 0, 0.35);
  g.add(mattress);

  // Frame
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.1, 0.15), mat('#5C4033'));
  frame.position.set(0, 0, 0.15);
  g.add(frame);

  // Headboard
  const headboard = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.7), mat('#4A3728'));
  headboard.position.set(0, -1.0, 0.55);
  g.add(headboard);

  // Pillows
  const pillowMat = mat('#F5F5DC');
  const pillow1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.12), pillowMat);
  pillow1.position.set(-0.4, -0.7, 0.53);
  g.add(pillow1);

  const pillow2 = pillow1.clone();
  pillow2.position.x = 0.4;
  g.add(pillow2);

  return g;
}

function createBookshelf(color) {
  const g = new THREE.Group();
  g.name = 'furniture_bookshelf';

  const panelMat = mat(color);

  // Side panels
  const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 1.8), panelMat);
  sideL.position.set(-0.45, 0, 0.9);
  g.add(sideL);

  const sideR = sideL.clone();
  sideR.position.x = 0.45;
  g.add(sideR);

  // Back panel
  const backPanel = new THREE.Mesh(new THREE.BoxGeometry(0.87, 0.02, 1.8), mat(new THREE.Color(color).multiplyScalar(0.7)));
  backPanel.position.set(0, -0.14, 0.9);
  g.add(backPanel);

  // Shelves (5 levels)
  for (let i = 0; i < 5; i++) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.87, 0.3, 0.03), panelMat);
    shelf.position.set(0, 0, i * 0.36 + 0.18);
    g.add(shelf);
  }

  return g;
}

function createFloorLamp(color) {
  const g = new THREE.Group();
  g.name = 'furniture_floor_lamp';

  // Base
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.04, 16), mat(color));
  base.position.set(0, 0, 0.02);
  base.rotation.x = Math.PI / 2;
  g.add(base);

  // Pole
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 1.5, 8), mat('#444'));
  pole.position.set(0, 0, 0.79);
  pole.rotation.x = Math.PI / 2;
  g.add(pole);

  // Shade
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.3, 16, 1, true), mat('#F5DEB3'));
  shade.position.set(0, 0, 1.45);
  shade.rotation.x = -Math.PI / 2;
  g.add(shade);

  // Bulb glow
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), mat('#FFF8DC'));
  bulb.position.set(0, 0, 1.38);
  g.add(bulb);

  return g;
}

function createPlant(color) {
  const g = new THREE.Group();
  g.name = 'furniture_plant';

  // Pot
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.25, 12), mat(color));
  pot.position.set(0, 0, 0.125);
  pot.rotation.x = Math.PI / 2;
  g.add(pot);

  // Soil
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.03, 12), mat('#3B2F2F'));
  soil.position.set(0, 0, 0.26);
  soil.rotation.x = Math.PI / 2;
  g.add(soil);

  // Foliage (cluster of spheres)
  const leafMat = mat('#2E8B57');
  const foliagePositions = [
    [0, 0, 0.45], [-0.08, 0.06, 0.5], [0.07, -0.05, 0.48],
    [0.05, 0.08, 0.52], [-0.06, -0.07, 0.47]
  ];
  foliagePositions.forEach(([x, y, z]) => {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), leafMat);
    leaf.position.set(x, y, z);
    g.add(leaf);
  });

  return g;
}

function createTVStand(color) {
  const g = new THREE.Group();
  g.name = 'furniture_tv_stand';

  // Main body
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.4, 0.45), mat(color));
  body.position.set(0, 0, 0.3);
  g.add(body);

  // Legs
  const legGeo = new THREE.BoxGeometry(0.04, 0.3, 0.08);
  const legMat = mat('#555');
  [[-0.7, 0], [0.7, 0]].forEach(([x, y]) => {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(x, y, 0.04);
    g.add(leg);
  });

  return g;
}

function createDefaultBox(color) {
  const g = new THREE.Group();
  g.name = 'furniture_default';
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat(color || '#888888'));
  mesh.position.set(0, 0, 0.25);
  g.add(mesh);
  return g;
}
