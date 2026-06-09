export const RC_DUPLICATE_TOLERANCE = 0.05;

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

const getSignature = (pointIndex: number, allPoints: any[]): number[] => {
  let distances: number[] = [];
  for (let i = 0; i < allPoints.length; i++) {
    if (i !== pointIndex) {
      distances.push(getDistance(allPoints[pointIndex].pos, allPoints[i].pos));
    }
  }
  distances.sort((a, b) => a - b);
  const maxDist = distances[distances.length - 1] || 1;
  return distances.map((d) => d / maxDist);
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

  // --- 3. CALCULATE GEOMETRIC SIGNATURES ---
  mpPoints.forEach((mp, i) => (mp.signature = getSignature(i, mpPoints)));
  uniqueRcData.forEach((rc, i) => (rc.signature = getSignature(i, uniqueRcData)));

  // --- 4. MATCH BASED ON SIGNATURES ---
  const matchPairs: any[] = [];

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
