const jwt = require("jsonwebtoken");
const http = require("http");

const token = jwt.sign(
  { sub: "da6d6d58-84bd-41fe-8e24-46fc0099ab68", email: "youcefach055@gmail.com" },
  "supersecret123_production_digital_twin_2026",
  { expiresIn: "1h" }
);

console.log("Generated token:", token.substring(0, 30) + "...");

const req = http.request({
  hostname: "localhost",
  port: 3000,
  path: "/api/projects/16eaab0f-b816-43ac-83fa-403c9184cf90/inspections/3d7fa359-641e-481f-9687-2e39d1c292cb/process-panoramas",
  method: "POST",
  headers: {
    "Authorization": "Bearer " + token,
    "Content-Type": "application/json"
  }
}, res => {
  let data = "";
  res.on("data", chunk => data += chunk);
  res.on("end", () => console.log("STATUS:", res.statusCode, "BODY:", data));
});

req.on("error", e => console.error("ERR:", e.message));
req.end();
