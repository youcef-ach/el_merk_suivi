const Minio = require('minio');
const mc = new Minio.Client({
  endPoint: 'minio',
  port: 9000,
  useSSL: false,
  accessKey: 'minioadmin',
  secretKey: 'minioadmin'
});

async function main() {
  const bucket = 'virtual-inspections';
  const key = 'inspections/b9b42cc2-3516-430d-8b9a-89cef7fe4484/scan_metadata.json';
  
  const stream = await mc.getObject(bucket, key);
  let data = '';
  for await (const chunk of stream) {
    data += chunk;
  }
  const meta = JSON.parse(data);
  for (const k of Object.keys(meta)) {
    meta[k].ktx2_256 = null;
    meta[k].ktx2_512 = null;
    meta[k].ktx2_1024 = null;
  }
  const buf = Buffer.from(JSON.stringify(meta, null, 2), 'utf8');
  await mc.putObject(bucket, key, buf, buf.length, { 'Content-Type': 'application/json' });
  console.log('Successfully cleaned scan_metadata.json in MinIO!');
}

main().catch(console.error);
