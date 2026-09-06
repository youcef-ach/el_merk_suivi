const Minio = require('minio');

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

  const metaStream = await minioClient.getObject(bucket, `inspections/${tourId}/scan_metadata.json`);
  const metaChunks = [];
  for await (const chunk of metaStream) metaChunks.push(chunk);
  const data = JSON.parse(Buffer.concat(metaChunks).toString('utf-8'));
  const zList = Object.values(data).map(s => s.position[2]).sort((a, b) => a - b);
  const buckets = {};
  zList.forEach(z => {
    const b = Math.floor(z);
    buckets[b] = (buckets[b] || 0) + 1;
  });
  console.log('Z buckets:', buckets);

  console.log('Extensions used:', gltf.extensionsUsed);
  console.log('Extensions required:', gltf.extensionsRequired);
  console.log('Nodes:', JSON.stringify(gltf.nodes, null, 2));
  console.log('Meshes count:', gltf.meshes.length);
  console.log('Mesh 0 primitives:', gltf.meshes[0].primitives.length);
  const posAcc = gltf.accessors[0];
  console.log('Accessor 0 (pos) count (vertices):', posAcc.count);
  console.log('Accessor 0 min:', posAcc.min, 'max:', posAcc.max);
}

main().catch(err => console.error(err));
