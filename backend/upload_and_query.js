const { PrismaClient } = require('@prisma/client');
const Minio = require('minio');
const fs = require('fs');

const prisma = new PrismaClient();

const minioClient = new Minio.Client({
    endPoint: 'localhost',
    port: 9000,
    useSSL: false,
    accessKey: 'minioadmin',
    secretKey: 'minioadmin'
});

async function main() {
    // 1. Get Accounts
    console.log('--- ACCOUNTS ---');
    const users = await prisma.user.findMany({
        select: {
            id: true,
            email: true,
            role: true
        }
    });
    console.table(users);

    // 2. Upload file
    console.log('\n--- UPLOAD SCANS ---');
    const inspectionId = '4afdcea1-5295-43be-a103-6a9781fde615'; // el_merk
    const filePath = 'c:\\four\\helper project\\processed_scans.json';
    const bucket = 'virtual-inspections';
    const objectName = `inspections/${inspectionId}/scans.json`;

    if (!fs.existsSync(filePath)) {
        console.error('File not found:', filePath);
        return;
    }

    try {
        await minioClient.fPutObject(bucket, objectName, filePath, {
            'Content-Type': 'application/json'
        });
        console.log(`Successfully uploaded to ${bucket}/${objectName}`);

        // 3. Update Prisma
        await prisma.inspection.update({
            where: { id: inspectionId },
            data: { scansJsonUrl: objectName }
        });
        console.log('Successfully updated inspection in database.');

    } catch (err) {
        console.error('Error during upload or DB update:', err);
    } finally {
        await prisma.$disconnect();
    }
}

main();