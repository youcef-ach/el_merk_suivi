async function main() {
  const url = "http://localhost:9000/virtual-tours/tours/5e116c2e-08de-4576-a90e-0a7bb763941d/ultimate_final.glb";
  try {
    const res = await fetch(url, { method: 'HEAD' });
    console.log("MinIO HEAD request status:", res.status);
    console.log("MinIO headers:", Object.fromEntries(res.headers.entries()));
  } catch (err) {
    console.error("Fetch failed:", err.message);
  }
}
main();
