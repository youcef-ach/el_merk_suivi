const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const inspections = await prisma.inspection.findMany({ orderBy: { createdAt: 'desc' }, take: 1 });
  if (inspections.length > 0) {
    const url = "http://localhost:9000/virtual-inspections/" + inspections[0].scansJsonUrl;
    console.log("Fetching", url);
    try {
      const res = await fetch(url);
      const data = await res.text();
      console.log("First 100 chars:", data.substring(0, 100));
    } catch (e) {
      console.log("Fetch error:", e.message);
    }
  } else {
    console.log("No inspections found");
  }
}
main();
