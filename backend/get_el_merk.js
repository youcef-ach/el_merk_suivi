const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const project = await prisma.project.findFirst({
    where: { name: { contains: 'el merk', mode: 'insensitive' } },
    include: {
      inspections: true
    }
  });

  if (!project) {
    // try el_merk
    const project2 = await prisma.project.findFirst({
      where: { name: { contains: 'el_merk', mode: 'insensitive' } },
      include: {
        inspections: true
      }
    });
    console.log(JSON.stringify(project2, null, 2));
  } else {
    console.log(JSON.stringify(project, null, 2));
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
