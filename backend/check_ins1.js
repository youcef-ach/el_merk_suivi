const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const ins = await prisma.inspection.findUnique({
        where: { id: '4dafc234-b8eb-469f-be5d-aa231903b992' },
        include: { scans: true, panoramas: true }
    });
    console.log("scansJsonUrl:", ins.scansJsonUrl);
    console.log("glbModelUrl:", ins.glbModelUrl);
    console.log("Scans in DB:", ins.scans.length);
    console.log("Panoramas in DB:", ins.panoramas.length);
    await prisma.$disconnect();
}
main();
