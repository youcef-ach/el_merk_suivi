const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const users = await prisma.user.findMany({
        select: {
            email: true,
            role: true,
            enterprise: {
                select: {
                    name: true,
                    projects: {
                        select: {
                            _count: {
                                select: { inspections: true }
                            }
                        }
                    }
                }
            },
            _count: {
                select: { authorizedInspections: true }
            }
        }
    });

    const results = users.map(u => {
        const enterpriseInspections = u.enterprise?.projects.reduce((sum, p) => sum + p._count.inspections, 0) || 0;
        return {
            email: u.email,
            role: u.role,
            enterprise: u.enterprise?.name || 'None',
            ownedByEnterprise: enterpriseInspections,
            explicitlyAuthorized: u._count.authorizedInspections,
            totalAccess: u.role === 'ADMIN' ? enterpriseInspections : (enterpriseInspections + u._count.authorizedInspections)
        };
    });

    console.table(results);
    await prisma.$disconnect();
}

main();
