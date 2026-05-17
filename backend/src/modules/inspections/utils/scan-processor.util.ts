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
  const mpPoints: any[] = Object.entries(mpRawData).map(([name, data]: [string, any]) => ({
    name: name,
    pos: { x: data.position[0], y: data.position[1], z: data.position[2] },
    quaternion: data.rotation_quaternion,
  }));

  // --- 2. EXTRACT & DEDUPLICATE REALITY CAPTURE POINTS ---
  const uniqueRcData: any[] = [];
  rcRawData.forEach((rcItem) => {
    const rcPos = { x: rcItem.x, y: rcItem.y, z: rcItem.alt };

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
