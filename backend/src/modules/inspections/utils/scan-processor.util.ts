export const RC_DUPLICATE_TOLERANCE = 0.05;
const K_NEIGHBORS = 40; // Number of nearest neighbors to use for local signature

interface Point3D {
  x: number;
  y: number;
  z: number;
}

const getDistance = (p1: Point3D, p2: Point3D): number => {
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
const getSignature = (pointIndex: number, allPoints: any[]): number[] => {
  let distances: number[] = [];
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

export const processScans = (mpRawData: any, rcRawData: any[]): any[] => {
  // --- 1. EXTRACT MATTERPORT POINTS & QUATERNIONS ---
  const mpRawList = Array.isArray(mpRawData)
    ? mpRawData
    : Object.entries(mpRawData || {}).map(([key, val]: [string, any]) => ({
        name: key,
        ...(typeof val === 'object' ? val : {})
      }));

  const mpPoints: any[] = mpRawList.map((data: any, idx: number) => {
    const name = data['#name'] || data.id || data.name || `scan_${idx}`;
    let posX = 0, posY = 0, posZ = 0;
    if (Array.isArray(data.position) && data.position.length >= 3) {
      posX = Number(data.position[0]);
      posY = Number(data.position[1]);
      posZ = Number(data.position[2]);
    } else {
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

  // --- 2. EXTRACT & DEDUPLICATE REALITY CAPTURE / SOFTWARE POINTS ---
  const rcRawList = Array.isArray(rcRawData)
    ? rcRawData
    : Object.entries(rcRawData || {}).map(([key, val]: [string, any]) => ({
        name: key,
        ...(typeof val === 'object' ? val : {})
      }));

  const uniqueRcData: any[] = [];
  rcRawList.forEach((rcItem: any) => {
    const posX = Number(rcItem.x ?? rcItem.pos?.x ?? rcItem.position?.[0] ?? 0);
    const posY = Number(rcItem.y ?? rcItem.pos?.y ?? rcItem.position?.[1] ?? 0);
    const posZ = Number(rcItem.alt ?? rcItem.z ?? rcItem.pos?.z ?? rcItem.position?.[2] ?? 0);
    const rcPos = { x: posX, y: posY, z: posZ };

    const isDuplicate = uniqueRcData.some((existingItem) => {
      return getDistance(rcPos, existingItem.pos) < RC_DUPLICATE_TOLERANCE;
    });

    if (!isDuplicate) {
      uniqueRcData.push({ original: rcItem, pos: rcPos });
    }
  });

  // --- 3. CALCULATE LOCAL GEOMETRIC SIGNATURES ---
  mpPoints.forEach((mp, i) => (mp.signature = getSignature(i, mpPoints)));
  uniqueRcData.forEach((rc, i) => (rc.signature = getSignature(i, uniqueRcData)));

  // --- 4. MATCH BASED ON SIGNATURES ---
  const matchPairs: any[] = [];

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
  }

  matchPairs.sort((a, b) => a.score - b.score);

  const matchedRc = new Set<number>();
  const matchedMp = new Set<number>();
  const finalOutput: any[] = [];

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
