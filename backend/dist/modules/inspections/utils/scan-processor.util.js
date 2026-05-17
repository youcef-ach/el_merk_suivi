"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processScans = exports.RC_DUPLICATE_TOLERANCE = void 0;
exports.RC_DUPLICATE_TOLERANCE = 0.05;
const getDistance = (p1, p2) => {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) +
        Math.pow(p1.y - p2.y, 2) +
        Math.pow(p1.z - p2.z, 2));
};
const getSignature = (pointIndex, allPoints) => {
    let distances = [];
    for (let i = 0; i < allPoints.length; i++) {
        if (i !== pointIndex) {
            distances.push(getDistance(allPoints[pointIndex].pos, allPoints[i].pos));
        }
    }
    distances.sort((a, b) => a - b);
    const maxDist = distances[distances.length - 1] || 1;
    return distances.map((d) => d / maxDist);
};
const processScans = (mpRawData, rcRawData) => {
    const mpPoints = Object.entries(mpRawData).map(([name, data]) => ({
        name: name,
        pos: { x: data.position[0], y: data.position[1], z: data.position[2] },
        quaternion: data.rotation_quaternion,
    }));
    const uniqueRcData = [];
    rcRawData.forEach((rcItem) => {
        const rcPos = { x: rcItem.x, y: rcItem.y, z: rcItem.alt };
        const isDuplicate = uniqueRcData.some((existingItem) => {
            return getDistance(rcPos, existingItem.pos) < exports.RC_DUPLICATE_TOLERANCE;
        });
        if (!isDuplicate) {
            uniqueRcData.push({ original: rcItem, pos: rcPos });
        }
    });
    mpPoints.forEach((mp, i) => (mp.signature = getSignature(i, mpPoints)));
    uniqueRcData.forEach((rc, i) => (rc.signature = getSignature(i, uniqueRcData)));
    const matchPairs = [];
    for (let i = 0; i < uniqueRcData.length; i++) {
        for (let j = 0; j < mpPoints.length; j++) {
            let score = 0;
            const rcSig = uniqueRcData[i].signature;
            const mpSig = mpPoints[j].signature;
            for (let k = 0; k < Math.min(rcSig.length, mpSig.length); k++) {
                score += Math.abs(rcSig[k] - mpSig[k]);
            }
            matchPairs.push({ rcIndex: i, mpIndex: j, score: score });
        }
    }
    matchPairs.sort((a, b) => a.score - b.score);
    const matchedRc = new Set();
    const matchedMp = new Set();
    const finalOutput = [];
    matchPairs.forEach((pair) => {
        if (!matchedRc.has(pair.rcIndex) && !matchedMp.has(pair.mpIndex)) {
            const rcEntry = uniqueRcData[pair.rcIndex].original;
            const mpPoint = mpPoints[pair.mpIndex];
            finalOutput.push({
                '#name': mpPoint.name,
                x: rcEntry.x,
                y: rcEntry.y,
                alt: rcEntry.alt,
                rotation_quaternion: mpPoint.quaternion,
            });
            matchedRc.add(pair.rcIndex);
            matchedMp.add(pair.mpIndex);
        }
    });
    return finalOutput;
};
exports.processScans = processScans;
//# sourceMappingURL=scan-processor.util.js.map