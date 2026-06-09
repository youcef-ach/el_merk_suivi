async function main() {
  try {
    const res = await fetch("http://localhost:3000/tours/5e116c2e-08de-4576-a90e-0a7bb763941d", {
      headers: { 'Authorization': 'Bearer test' }
    });
    console.log("Status:", res.status);
    console.log("Headers:", JSON.stringify(Object.fromEntries(res.headers.entries()), null, 2));
    const text = await res.text();
    console.log("Body:", text);
  } catch (err) {
    console.error("Fetch failed:", err);
  }
}
main();
