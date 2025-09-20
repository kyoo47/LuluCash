const fetch = require("node-fetch");

const testData = {
  source: "manual-test",
  P2: "07",
  P3: "805", 
  P4: "6585",
  P5: "05259"
};

fetch("http://127.0.0.1:3001/api/results/ingest", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(testData)
})
.then(res => res.json())
.then(data => console.log("Result:", data))
.catch(err => console.error("Error:", err));