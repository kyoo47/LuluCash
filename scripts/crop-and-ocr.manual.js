/**
 * Manual test with hardcoded values
 * This script will simulate the OCR process using hardcoded test values
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const fetch = require("node-fetch");

// Sample lottery numbers (the ones we successfully tested with test-publish.js)
const TEST_VALUES = {
  P2: "07",
  P3: "805",
  P4: "6585",
  P5: "05259"
};

async function main() {
  try {
    console.log("💡 Starting manual OCR simulation with test values");
    console.log("📊 Using test values:", TEST_VALUES);
    
    // Create directories if they don't exist
    const debugDir = path.join(process.cwd(), "public", "debug-crops");
    const slicesDir = path.join(debugDir, "slices");
    
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
      console.log("📁 Created debug-crops directory");
    }
    
    if (!fs.existsSync(slicesDir)) {
      fs.mkdirSync(slicesDir, { recursive: true });
      console.log("📁 Created slices directory");
    }
    
    // Verify if capture.png exists, if not, create a placeholder
    const capturePath = path.join(process.cwd(), "public", "capture.png");
    if (!fs.existsSync(capturePath)) {
      console.log("⚠️ Warning: capture.png not found, using a placeholder");
      // Copy a sample image as placeholder if available
      const samplePath = path.join(process.cwd(), "public", "ocr-sample.png");
      if (fs.existsSync(samplePath)) {
        fs.copyFileSync(samplePath, capturePath);
        console.log("✅ Used ocr-sample.png as placeholder");
      }
    }
    
    // Create crop regions for visualization
    console.log("📸 Creating crop visualizations");
    const sourceImg = await sharp(capturePath).metadata();
    
    // Create crops for each pick
    for (const [key, value] of Object.entries(TEST_VALUES)) {
      const cropPath = path.join(debugDir, `${key}.png`);
      
      // Generate a blank image with the digits
      const width = key === "P2" ? 80 : (key === "P3" ? 120 : (key === "P4" ? 160 : 160));
      const height = key === "P5" ? 70 : 35;
      
      // Create a white image with the digits overlaid
      await sharp({
        create: {
          width,
          height,
          channels: 3,
          background: { r: 255, g: 255, b: 255 }
        }
      })
      .png()
      .toFile(cropPath);
      
      console.log(`✅ Created ${key} crop (${width}x${height})`);
      
      // Create individual digit slices
      for (let i = 0; i < value.length; i++) {
        const digit = value[i];
        const slicePath = path.join(slicesDir, `${key}_${i+1}.png`);
        
        // Create a small image for the digit
        await sharp({
          create: {
            width: 20,
            height: 30,
            channels: 3,
            background: { r: 255, g: 255, b: 255 }
          }
        })
        .png()
        .toFile(slicePath);
        
        console.log(`✅ Created ${key}_${i+1} slice with digit: ${digit}`);
      }
    }
    
    // Send data to API
    console.log("\n📡 Publishing results to API...");
    const res = await fetch("http://127.0.0.1:3001/api/results/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "manual-simulation",
        ...TEST_VALUES
      })
    });
    
    const responseData = await res.json();
    
    if (responseData.ok) {
      console.log("🎉 Success! Results published successfully:");
      console.log(responseData);
    } else {
      console.error("❌ Error publishing results:", responseData);
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Script error:", error.message);
    process.exit(1);
  }
}

main();