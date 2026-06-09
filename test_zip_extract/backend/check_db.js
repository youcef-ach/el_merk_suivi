const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tour = await prisma.tour.findUnique({where: {id: '5e116c2e-08de-4576-a90e-0a7bb763941d'}});
  console.log(JSON.stringify(tour, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
