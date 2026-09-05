const Minio = require('minio');
const mc = new Minio.Client({
  endPoint: 'minio',
  port: 9000,
  useSSL: false,
  accessKey: 'minioadmin',
  secretKey: 'minioadmin'
});
const stream = mc.listObjectsV2('virtual-inspections', 'inspections/b9b42cc2-3516-430d-8b9a-89cef7fe4484', true);
stream.on('data', obj => console.log(obj.name, obj.size));
stream.on('error', err => console.error(err));
stream.on('end', () => console.log('--- END OF LIST ---'));