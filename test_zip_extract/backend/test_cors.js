async function main() {
  try {
    const res = await fetch("http://localhost:3000/tours/5e116c2e-08de-4576-a90e-0a7bb763941d", {
      method: "OPTIONS",
      headers: {
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "Authorization"
      }
    });
    console.log("Status:", res.status);
    console.log("Headers:", JSON.stringify(Object.fromEntries(res.headers.entries()), null, 2));
  } catch (err) {
    console.error("Fetch failed:", err);
  }
}
main();
