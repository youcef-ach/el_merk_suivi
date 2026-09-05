const { PrismaClient } = require('@prisma/client');
const { Queue } = require('bullmq');

async function main() {
  const prisma = new PrismaClient();
  const inspectionId = 'eef56a7e-9e33-4fec-9aa0-ceabd1737238';
  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    include: { project: true }
  });

  if (!inspection) {
    console.error('Inspection not found');
    return;
  }

  const queue = new Queue('asset-processing', {
    connection: {
      host: 'redis',
      port: 6379
    }
  });

  const job = await queue.add('process-glb', {
    inspectionId,
    userEnterpriseId: inspection.project.enterpriseId,
    role: 'ADMIN',
    fileName: 'model.zip',
    compressionMode: 'etc1s'
  });

  console.log(`Queued process-glb job [ID: ${job.id}] for ${inspectionId}`);
  await queue.close();
}

main().catch(console.error);
