/**
 * simulate-full-workflow.js
 * 
 * This script simulates the full workflow:
 * 1. Capture the website (simulated with existing capture.png)
 * 2. Process the image with our OCR (simulated with test values)
 * 3. Publish the results
 * 4. Verify the results are visible in the website data
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// Use realistic values similar to what we see in the lottery website
const testResults = {
  P2: "42",
  P3: "678",
  P4: "3579",
  P5: "12345",
  source: "simulated-workflow"
};

async function runSimulation() {
  console.log("=== SIMULATING FULL WORKFLOW ===");
  console.log("1. Image capture (using existing capture.png)");
  
  const captureFile = path.join(process.cwd(), 'public', 'capture.png');
  if (fs.existsSync(captureFile)) {
    console.log(`✅ Using existing capture: ${captureFile}`);
  } else {
    console.log(`❌ Capture file not found: ${captureFile}`);
    return;
  }

  console.log("\n2. OCR processing (simulated with test values)");
  console.log("Extracted lottery numbers:", testResults);

  console.log("\n3. Publishing results to website");
  try {
    const publishResponse = await fetch("http://127.0.0.1:3001/api/results/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testResults)
    });
    
    const publishData = await publishResponse.json();
    
    if (publishData.ok) {
      console.log("✅ Results published successfully:", publishData);
    } else {
      console.error("❌ Failed to publish results:", publishData);
      return;
    }
  } catch (err) {
    console.error("❌ Error during publishing:", err);
    return;
  }

  console.log("\n4. Verifying results are visible in website data");
  try {
    const verifyResponse = await fetch("http://127.0.0.1:3001/api/results/latest");
    const latestResults = await verifyResponse.json();
    
    console.log("Current website data:", latestResults);
    
    // Verify our results match what's displayed on the website
    const valuesMatch = 
      latestResults.P2 === testResults.P2 &&
      latestResults.P3 === testResults.P3 &&
      latestResults.P4 === testResults.P4 &&
      latestResults.P5 === testResults.P5;
    
    if (valuesMatch) {
      console.log("✅ Verification successful! The results are visible on the website.");
    } else {
      console.log("❌ Verification failed. Published values don't match website data:");
      console.log("Expected:", testResults);
      console.log("Actual:", latestResults);
    }
  } catch (err) {
    console.error("❌ Error during verification:", err);
  }
  
  console.log("\n=== SIMULATION COMPLETE ===");
  console.log("To view the results on the website, open: http://localhost:3001");
}

// Run the simulation
runSimulation().catch(err => {
  console.error("Simulation failed with error:", err);
});