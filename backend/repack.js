const { PrismaClient } = require('@prisma/client');
const Minio = require('minio');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');

process.env.PATH = process.env.PATH + ';C:\\Program Files\\KTX-Software\\bin';

const execAsync = promisify(exec);
const prisma = new PrismaClient();

const minioClient = new Minio.Client({
  endPoint: 'localhost',
  port: 9000,
  useSSL: false,
  accessKey: 'minioadmin',
  secretKey: 'minioadmin',
});

async function main() {
  console.log('Fetching inspections...');
  const inspections = await prisma.inspection.findMany({
    where: {
      glbModelUrl: {
        not: null,
      },
    },
  });

  console.log(`Found ${inspections.length} inspections with GLB models.`);

  for (const inspection of inspections) {
    console.log(`\nProcessing Inspection: ${inspection.title} (${inspection.id})`);

    const tmpDir = os.tmpdir();
    const inputPath = path.join(tmpDir, `${inspection.id}_input.glb`);
    const outputPath = path.join(tmpDir, `${inspection.id}_opt.glb`);

    try {
      const rawS3Path = `inspections/${inspection.id}/ultimate_final.glb`;
      console.log(`  -> Downloading ${rawS3Path}...`);
      await minioClient.fGetObject('virtual-inspections', rawS3Path, inputPath);

      console.log(`  -> Running gltfpack...`);
      // Fallback command without -tc since toktx isn't installed natively
      const command = `.\\gltfpack.exe -i "${inputPath}" -o "${outputPath}" -cc -mm`;
      
      try {
        await execAsync(`.\\gltfpack.exe -i "${inputPath}" -o "${outputPath}" -cc -tc -mm`);
      } catch (err) {
        console.error(`  -> KTX2 (-tc) failed: ${err.message}`);
        console.log(`  -> Falling back to Meshopt geometry compression...`);
        await execAsync(command);
      }

      const newS3Path = `inspections/${inspection.id}/optimized_final.glb`;
      
      console.log(`  -> Uploading optimized model to MinIO...`);
      await minioClient.fPutObject('virtual-inspections', newS3Path, outputPath, {
        'Content-Type': 'model/gltf-binary',
      });

      console.log(`  -> Updating database...`);
      await prisma.inspection.update({
        where: { id: inspection.id },
        data: { glbModelUrl: newS3Path },
      });

      console.log(`  [Success] Finished ${inspection.title}`);
    } catch (err) {
      console.error(`  [Error] Failed to process ${inspection.title}:`, err.message);
    } finally {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    }
  }

  console.log('\nAll done!');
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
