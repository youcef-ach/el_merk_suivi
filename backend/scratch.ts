import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const inspections = await prisma.inspection.findMany({ select: { id: true, title: true, thumbnailUrl: true, glbModelUrl: true }});
  console.log(inspections);
}
main().finally(() => prisma.$disconnect());
