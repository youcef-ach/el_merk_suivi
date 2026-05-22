const THREE = require('three');

const metadataQuat = new THREE.Quaternion(0.128, -0.013, -0.021, 0.991); // from cloud_0_scan_10

const group = new THREE.Group();
group.rotation.x = -Math.PI / 2; // R_x(-90)
group.updateMatrixWorld();

const obj = new THREE.Object3D();
obj.quaternion.copy(metadataQuat);
group.add(obj);
group.updateMatrixWorld();

const worldQuat = new THREE.Quaternion();
obj.getWorldQuaternion(worldQuat);

console.log("SceneGraph:", worldQuat.toArray().map(n => n.toFixed(4)));

// Method 4: Mathematical Multiply
const qRx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI/2);
const qNew = qRx.clone().multiply(metadataQuat);
console.log("Math Mult: ", qNew.toArray().map(n => n.toFixed(4)));

// Wait, the mathematical rotation of a frame is Q_rx * Q * Q_rx_inv
const qInv = qRx.clone().invert();
const qFrame = qRx.clone().multiply(metadataQuat).multiply(qInv);
console.log("Frame Rot: ", qFrame.toArray().map(n => n.toFixed(4)));
