const Minio = require('minio');

const minioClient = new Minio.Client({
    endPoint: 'localhost',
    port: 9000,
    useSSL: false,
    accessKey: 'minioadmin',
    secretKey: 'minioadmin'
});

async function checkBucket() {
    console.log("Checking virtual-inspections bucket...");
    
    // Check if inspection1 exists
    const prefix = 'inspections/4dafc234-b8eb-469f-be5d-aa231903b992/';
    const stream = minioClient.listObjects('virtual-inspections', prefix, true);
    
    let filesFound = [];
    stream.on('data', function(obj) {
        filesFound.push(obj.name);
    });
    
    stream.on('error', function(err) {
        console.log("Error:", err);
    });
    
    stream.on('end', function() {
        console.log(`Found ${filesFound.length} total files under ${prefix}`);
        const images = filesFound.filter(f => f.includes('/images/'));
        console.log(`Found ${images.length} images.`);
        if (filesFound.length > 0) {
            console.log("\nSample of files found:");
            filesFound.slice(0, 10).forEach(f => console.log("- " + f));
        }
    });
}

checkBucket();
