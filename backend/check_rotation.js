const fs = require('fs');

const rawScans = JSON.parse(fs.readFileSync('raw_scans.json', 'utf8'));
const mergedScans = JSON.parse(fs.readFileSync('scans.json', 'utf8'));

// mergedScans has the matched CSV coordinates + E57 quaternions
// rawScans has the E57 coordinates + E57 quaternions

const getPointE57 = (name) => {
    return rawScans[name].position;
}

const getPointCSV = (name) => {
    const scan = mergedScans.find(s => s['#name'] === name);
    return [scan.x, scan.y, scan.alt];
}

// Find two points that are far apart
const name1 = mergedScans[0]['#name'];
const name2 = mergedScans[Math.floor(mergedScans.length / 2)]['#name'];

const p1_e57 = getPointE57(name1);
const p1_csv = getPointCSV(name1);

const p2_e57 = getPointE57(name2);
const p2_csv = getPointCSV(name2);

console.log("Point 1:");
console.log("E57:", p1_e57);
console.log("CSV:", p1_csv);

console.log("\nPoint 2:");
console.log("E57:", p2_e57);
console.log("CSV:", p2_csv);

const dx_e57 = p2_e57[0] - p1_e57[0];
const dy_e57 = p2_e57[1] - p1_e57[1];
const dz_e57 = p2_e57[2] - p1_e57[2];

const dx_csv = p2_csv[0] - p1_csv[0];
const dy_csv = p2_csv[1] - p1_csv[1];
const dz_csv = p2_csv[2] - p1_csv[2];

console.log("\nVector E57:", [dx_e57, dy_e57, dz_e57]);
console.log("Vector CSV:", [dx_csv, dy_csv, dz_csv]);

const angleE57 = Math.atan2(dy_e57, dx_e57);
const angleCSV = Math.atan2(dy_csv, dx_csv);

console.log("\nAngle E57 (deg):", angleE57 * 180 / Math.PI);
console.log("Angle CSV (deg):", angleCSV * 180 / Math.PI);

const diff = angleCSV - angleE57;
console.log("Rotation Difference (deg):", diff * 180 / Math.PI);
