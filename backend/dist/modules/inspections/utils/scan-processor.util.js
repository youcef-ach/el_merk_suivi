"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processScans = exports.RC_DUPLICATE_TOLERANCE = void 0;
exports.RC_DUPLICATE_TOLERANCE = 0.05;
const K_NEIGHBORS = 40;
const getDistance = (p1, p2) => {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) +
        Math.pow(p1.y - p2.y, 2) +
        Math.pow(p1.z - p2.z, 2));
};
const getSignature = (pointIndex, allPoints) => {
    let distances = [];
    const pTarget = allPoints[pointIndex].pos;
    for (let i = 0; i < allPoints.length; i++) {
        if (i !== pointIndex) {
            distances.push(getDistance(pTarget, allPoints[i].pos));
        }
    }
    distances.sort((a, b) => a - b);
    const k = Math.min(K_NEIGHBORS, distances.length);
    const neighbors = distances.slice(0, k);
    if (neighbors.length === 0)
        return [];
    const normalizationFactor = neighbors[neighbors.length - 1] || 1;
    return neighbors.map(d => d / normalizationFactor);
};
const processScans = (mpRawData, rcRawData) => {
    const mpRawList = Array.isArray(mpRawData)
        ? mpRawData
        : Object.entries(mpRawData || {}).map(([key, val]) => ({
            name: key,
            ...(typeof val === 'object' ? val : {})
        }));
    const mpPoints = mpRawList.map((data, idx) => {
        const name = data['#name'] || data.id || data.name || `scan_${idx}`;
        let posX = 0, posY = 0, posZ = 0;
        if (Array.isArray(data.position) && data.position.length >= 3) {
            posX = Number(data.position[0]);
            posY = Number(data.position[1]);
            posZ = Number(data.position[2]);
        }
        else {
            posX = Number(data.x ?? 0);
            posY = Number(data.y ?? 0);
            posZ = Number(data.alt ?? data.z ?? 0);
        }
        const quat = data.rotation_quaternion || data.quaternion || [1, 0, 0, 0];
        return {
            name,
            pos: { x: posX, y: posY, z: posZ },
            quaternion: quat,
        };
    });
    const rcRawList = Array.isArray(rcRawData)
        ? rcRawData
        : Object.entries(rcRawData || {}).map(([key, val]) => ({
            name: key,
            ...(typeof val === 'object' ? val : {})
        }));
    const uniqueRcData = [];
    rcRawList.forEach((rcItem) => {
        const posX = Number(rcItem.x ?? rcItem.pos?.x ?? rcItem.position?.[0] ?? 0);
        const posY = Number(rcItem.y ?? rcItem.pos?.y ?? rcItem.position?.[1] ?? 0);
        const posZ = Number(rcItem.alt ?? rcItem.z ?? rcItem.pos?.z ?? rcItem.position?.[2] ?? 0);
        const rcPos = { x: posX, y: posY, z: posZ };
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
        const rcSig = uniqueRcData[i].signature;
        for (let j = 0; j < mpPoints.length; j++) {
            const mpSig = mpPoints[j].signature;
            let score = 0;
            const len = Math.min(rcSig.length, mpSig.length);
            if (len === 0) {
                score = 1000;
            }
            else {
                for (let k = 0; k < len; k++) {
                    score += Math.abs(rcSig[k] - mpSig[k]);
                }
                score = score / len;
                score += Math.abs(rcSig.length - mpSig.length) * 0.1;
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
            const rcPos = uniqueRcData[pair.rcIndex].pos;
            finalOutput.push({
                '#name': mpPoint.name,
                x: rcEntry.x !== undefined ? Number(rcEntry.x) : rcPos.x,
                y: rcEntry.y !== undefined ? Number(rcEntry.y) : rcPos.y,
                alt: rcEntry.alt !== undefined ? Number(rcEntry.alt) : (rcEntry.z !== undefined ? Number(rcEntry.z) : rcPos.z),
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