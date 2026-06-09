import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const pointers = await prisma.areaPointer.findMany();
  console.log(pointers);
}

main()
  .catch(e => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
