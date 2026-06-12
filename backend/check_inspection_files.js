const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const user = await prisma.user.findUnique({
        where: { email: 'youcefach05@gmail.com' },
        include: {
            enterprise: {
                include: {
                    projects: {
                        include: {
                            inspections: true
                        }
                    }
                }
            }
        }
    });

    if (!user || !user.enterprise) {
        console.log("User or enterprise not found.");
        return;
    }

    const inspections = user.enterprise.projects.flatMap(p => p.inspections);
    console.log(`Found ${inspections.length} inspections.`);
    
    inspections.forEach(ins => {
        console.log(`\nInspection: ${ins.title} (ID: ${ins.id})`);
        console.log(`rawScansJsonUrl (Matterport): ${ins.rawScansJsonUrl || 'null'}`);
        console.log(`rawCsvJsonUrl (RealityCapture): ${ins.rawCsvJsonUrl || 'null'}`);
    });

    await prisma.$disconnect();
}

main();
