async function testCors() {
  const url = "http://localhost:9000/virtual-tours/tours/5e116c2e-08de-4576-a90e-0a7bb763941d/ultimate_final.glb";
  try {
    const res = await fetch(url, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:5173',
        'Access-Control-Request-Method': 'GET'
      }
    });
    console.log("CORS PREFLIGHT STATUS:", res.status);
    console.log("HEADERS:", JSON.stringify(Object.fromEntries(res.headers.entries()), null, 2));
  } catch(e) { console.error(e); }
}
testCors();
