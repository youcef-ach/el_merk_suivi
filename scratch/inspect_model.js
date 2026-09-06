const Minio = require('minio');
const fs = require('fs');

const minioClient = new Minio.Client({
  endPoint: 'minio',
  port: 9000,
  useSSL: false,
  accessKey: 'minioadmin',
  secretKey: 'minioadmin'
});

async function main() {
  const bucket = 'virtual-inspections';
  const tourId = '3d7fa359-641e-481f-9687-2e39d1c292cb';
  
  // 1. Fetch scan_metadata.json
  console.log('Fetching scan_metadata.json...');
  const metaStream = await minioClient.getObject(bucket, `inspections/${tourId}/scan_metadata.json`);
  const metaChunks = [];
  for await (const chunk of metaStream) {
    metaChunks.push(chunk);
  }
  const scanMetadata = JSON.parse(Buffer.concat(metaChunks).toString('utf-8'));
  const scanKeys = Object.keys(scanMetadata);
  console.log('Total scans in metadata:', scanKeys.length);
  
  const zValues = scanKeys.map(k => scanMetadata[k].position[2]);
  const minZ = Math.min(...zValues);
  const maxZ = Math.max(...zValues);
  const avgZ = zValues.reduce((a, b) => a + b, 0) / zValues.length;
  console.log(`Scan Z values: min=${minZ.toFixed(3)}, max=${maxZ.toFixed(3)}, avg=${avgZ.toFixed(3)}`);
  console.log('First 5 scan positions:', scanKeys.slice(0, 5).map(k => ({ id: k, pos: scanMetadata[k].position })));

  // 2. Fetch first 1MB of model.glb to inspect GLTF JSON chunk
  console.log('\nFetching model.glb header...');
  const glbStream = await minioClient.getPartialObject(bucket, `inspections/${tourId}/model.glb`, 0, 1024 * 1024);
  const glbChunks = [];
  for await (const chunk of glbStream) {
    glbChunks.push(chunk);
  }
  const glbBuffer = Buffer.concat(glbChunks);
  const magic = glbBuffer.toString('ascii', 0, 4);
  console.log('GLB Magic:', magic);
  if (magic === 'glTF') {
    const version = glbBuffer.readUInt32LE(4);
    const length = glbBuffer.readUInt32LE(8);
    const jsonChunkLen = glbBuffer.readUInt32LE(12);
    const jsonChunkType = glbBuffer.toString('ascii', 16, 20);
    console.log(`Version: ${version}, Total length: ${length}, JSON len: ${jsonChunkLen}, Type: ${jsonChunkType}`);
    const jsonStr = glbBuffer.toString('utf-8', 20, 20 + jsonChunkLen);
    const gltf = JSON.parse(jsonStr);

    const posAccessors = (gltf.accessors || []).filter(a => a.min && a.max && a.min.length === 3);
    if (posAccessors.length > 0) {
      const minBounds = [
        Math.min(...posAccessors.map(a => a.min[0])),
        Math.min(...posAccessors.map(a => a.min[1])),
        Math.min(...posAccessors.map(a => a.min[2])),
      ];
      const maxBounds = [
        Math.max(...posAccessors.map(a => a.max[0])),
        Math.max(...posAccessors.map(a => a.max[1])),
        Math.max(...posAccessors.map(a => a.max[2])),
      ];
      console.log('Mesh Bounding Box Min:', minBounds);
      console.log('Mesh Bounding Box Max:', maxBounds);
      console.log('Mesh Dimensions (X, Y, Z):', [
        (maxBounds[0] - minBounds[0]).toFixed(3),
        (maxBounds[1] - minBounds[1]).toFixed(3),
        (maxBounds[2] - minBounds[2]).toFixed(3),
      ]);
    } else {
      console.log('No min/max in accessors');
    }
  }
}

main().catch(err => console.error(err));
