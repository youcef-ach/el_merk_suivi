const fs = require('fs');

const FILE_MATTERPORT = 'scans.json';
const FILE_RC = 'csvjson.json';
const FILE_OUTPUT = 'processed_scans.json';

const RC_DUPLICATE_TOLERANCE = 0.05;
const K_NEIGHBORS = 40; // Number of nearest neighbors to use for local signature

const getDistance = (p1, p2) => {
    return Math.sqrt(
        Math.pow(p1.x - p2.x, 2) +
        Math.pow(p1.y - p2.y, 2) +
        Math.pow(p1.z - p2.z, 2)
    );
};

/**
 * Generates a local geometric signature for a point based on its K-nearest neighbors.
 * Local signatures are much more robust than global ones for large point clouds
 * because they are not affected by distant points or missing data in other areas.
 */
const getSignature = (pointIndex, allPoints) => {
    let distances = [];
    const pTarget = allPoints[pointIndex].pos;

    for (let i = 0; i < allPoints.length; i++) {
        if (i !== pointIndex) {
            distances.push(getDistance(pTarget, allPoints[i].pos));
        }
    }

    // Sort distances to find nearest neighbors
    distances.sort((a, b) => a - b);

    // Take the K nearest neighbors
    const k = Math.min(K_NEIGHBORS, distances.length);
    const neighbors = distances.slice(0, k);

    if (neighbors.length === 0) return [];

    // Normalize by the distance of the k-th neighbor to make it scale-invariant
    const normalizationFactor = neighbors[neighbors.length - 1] || 1;
    return neighbors.map(d => d / normalizationFactor);
};

const runPipeline = () => {
    console.log('--- Matterport to RC Scan Mapper ---');
    console.log('Loading JSON files...');

    if (!fs.existsSync(FILE_MATTERPORT) || !fs.existsSync(FILE_RC)) {
        console.error(`Error: Required files (${FILE_MATTERPORT} or ${FILE_RC}) not found.`);
        return;
    }

    const mpRawData = JSON.parse(fs.readFileSync(FILE_MATTERPORT, 'utf-8'));
    const rcRawData = JSON.parse(fs.readFileSync(FILE_RC, 'utf-8'));

    // --- 1. EXTRACT MATTERPORT POINTS & QUATERNIONS ---
    console.log('Extracting Matterport points...');
    const mpPoints = Object.entries(mpRawData).map(([name, data]) => ({
        name: name,
        pos: { x: data.position[0], y: data.position[1], z: data.position[2] },
        quaternion: data.rotation_quaternion
    }));

    // --- 2. EXTRACT & DEDUPLICATE REALITY CAPTURE POINTS ---
    console.log('Deduplicating Reality Capture points...');
    const uniqueRcData = [];
    rcRawData.forEach(rcItem => {
        const rcPos = { x: rcItem.x, y: rcItem.y, z: rcItem.alt };

        const isDuplicate = uniqueRcData.some(existingItem => {
            return getDistance(rcPos, existingItem.pos) < RC_DUPLICATE_TOLERANCE;
        });

        if (!isDuplicate) {
            uniqueRcData.push({ original: rcItem, pos: rcPos });
        }
    });

    console.log(`Summary: ${mpPoints.length} MP scans, ${uniqueRcData.length} unique RC locations.`);

    // --- 3. CALCULATE LOCAL GEOMETRIC SIGNATURES ---
    console.log(`Calculating signatures (K=${K_NEIGHBORS})...`);
    mpPoints.forEach((mp, i) => mp.signature = getSignature(i, mpPoints));
    uniqueRcData.forEach((rc, i) => rc.signature = getSignature(i, uniqueRcData));

    // --- 4. MATCH BASED ON SIGNATURES ---
    console.log('Matching scans... (this may take a moment for large sets)');
    const matchPairs = [];

    for (let i = 0; i < uniqueRcData.length; i++) {
        const rcSig = uniqueRcData[i].signature;

        for (let j = 0; j < mpPoints.length; j++) {
            const mpSig = mpPoints[j].signature;

            let score = 0;
            const len = Math.min(rcSig.length, mpSig.length);

            if (len === 0) {
                score = 1000; // High penalty for no neighbors
            } else {
                for (let k = 0; k < len; k++) {
                    score += Math.abs(rcSig[k] - mpSig[k]);
                }
                // Average the score by length to make it comparable if k varies
                score = score / len;

                // Penalty for significant length difference in signatures
                // (e.g. one point is at the edge of the cloud, the other is in the middle)
                score += Math.abs(rcSig.length - mpSig.length) * 0.1;
            }

            matchPairs.push({ rcIndex: i, mpIndex: j, score: score });
        }

        if (i % 100 === 0 && i > 0) console.log(`Processed ${i} matches...`);
    }

    console.log('Sorting and finalizing matches...');
    matchPairs.sort((a, b) => a.score - b.score);

    const matchedRc = new Set();
    const matchedMp = new Set();
    const finalOutput = [];

    matchPairs.forEach(pair => {
        if (!matchedRc.has(pair.rcIndex) && !matchedMp.has(pair.mpIndex)) {
            const rcEntry = uniqueRcData[pair.rcIndex].original;
            const mpPoint = mpPoints[pair.mpIndex];

            finalOutput.push({
                "#name": mpPoint.name,
                "x": rcEntry.x,
                "y": rcEntry.y,
                "alt": rcEntry.alt,
                "rotation_quaternion": mpPoint.quaternion
            });

            matchedRc.add(pair.rcIndex);
            matchedMp.add(pair.mpIndex);
        }
    });

    // --- 5. SAVE RESULT ---
    fs.writeFileSync(FILE_OUTPUT, JSON.stringify(finalOutput, null, 2));

    console.log('\n--- MATCHING SUMMARY ---');
    console.log(`Total MP Scans: ${mpPoints.length}`);
    console.log(`Successfully Mapped: ${finalOutput.length}`);
    console.log(`Unmapped: ${mpPoints.length - finalOutput.length}`);
    console.log(`\n✅ Pipeline complete! Saved to ${FILE_OUTPUT}`);
};

runPipeline();