// scripts/auto-capture-and-ocr.js
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const sharp = require("sharp");
const fetch = require("node-fetch");
const { createWorker } = require('tesseract.js');

// Configuration
const TARGET_URL = process.env.CAPTURE_URL || "http://instantcash.gaminglts.com:82/";
const LOCAL_API = "http://127.0.0.1:3001";
const SCREENSHOT_PATH = path.join(process.cwd(), "public", "capture.png");

// OCR crop coordinates (adjust these based on your friend's website layout)
const RECTS_PX_1280x720 = {
  P2: { left: 130, top: 300, width: 80, height: 35 },
  P3: { left: 130, top: 340, width: 120, height: 35 },
  P4: { left: 130, top: 380, width: 160, height: 35 },
  P5: { left: 130, top: 420, width: 160, height: 70 }
};

async function captureWebsite() {
  console.log("▶ Launching browser...");
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  
  console.log("▶ Navigating to:", TARGET_URL);
  await page.goto(TARGET_URL, { waitUntil: "networkidle2", timeout: 60000 });
  
  // Wait for content to load
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log("▶ Capturing screenshot...");
  await page.screenshot({ 
    path: SCREENSHOT_PATH,
    type: "png"
  });
  
  await browser.close();
  console.log("✔ Screenshot saved to:", SCREENSHOT_PATH);
}

async function preprocessCrop(src, rect, outAbs) {
  await sharp(src)
    .extract(rect)
    .resize(rect.width * 4, rect.height * 4) // Scale up for better resolution
    .png()
    .toFile(outAbs);
}


async function ocrWithGoogleVision(imageRelativePath) {
  try {
    const imageParam = encodeURIComponent(imageRelativePath);
    const url = `${LOCAL_API}/api/ocr?img=${imageParam}`;
    
    const response = await fetch(url);
    const result = await response.json();
    
    if (result.ok && result.text) {
      console.log(`Vision API detected: "${result.text}"`);
      
      // Extract numbers from the text based on patterns
      const text = result.text;
      const lines = text.split('\n');
      
      // Look for number patterns in the text
      const numberMatches = text.match(/\d+/g) || [];
      console.log(`Found numbers: ${numberMatches.join(', ')}`);
      
      return numberMatches;
    } else {
      console.error('Vision API error:', result.error);
      return [];
    }
  } catch (error) {
    console.error('Vision API fetch error:', error);
    return [];
  }
}

async function processOCR() {
  if (!fs.existsSync(SCREENSHOT_PATH)) {
    throw new Error("Screenshot not found!");
  }

  const meta = await sharp(SCREENSHOT_PATH).metadata();
  console.log(`▶ Processing screenshot: ${meta.width}x${meta.height}`);

  // Create debug crops directory
  const debugDir = path.join(process.cwd(), "public", "debug-crops");
  if (!fs.existsSync(debugDir)) {
    fs.mkdirSync(debugDir, { recursive: true });
  }

  const results = {};
  
  // Process each lottery pick
  for (const [pick, rect] of Object.entries(RECTS_PX_1280x720)) {
    const cropPath = path.join(debugDir, `${pick}.png`);
    await preprocessCrop(SCREENSHOT_PATH, rect, cropPath);
    console.log(`▶ Created ${pick} crop`);
    const relativePath = `/debug-crops/${pick}.png`;
    const ocrResult = await ocrWithGoogleVision(relativePath);
    results[pick] = ocrResult;
    console.log(`▶ ${pick}: "${ocrResult}"`);
  }

  return results;
}

async function publishResults(results) {
  // Validate results
  const P2 = results.P2 && results.P2.length === 2 ? results.P2 : null;
  const P3 = results.P3 && results.P3.length === 3 ? results.P3 : null;
  const P4 = results.P4 && results.P4.length === 4 ? results.P4 : null;
  const P5 = results.P5 && results.P5.length === 5 ? results.P5 : null;

  console.log("\n=== Validated Results ===");
  console.log({ P2, P3, P4, P5 });

  if (P2 && P3 && P4 && P5) {
    console.log("\n▶ Publishing results to your lottery page...");
    
    const response = await fetch(`${LOCAL_API}/api/results/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        source: "auto-capture-ocr", 
        P2, P3, P4, P5 
      })
    });
    
    const result = await response.json();
    if (result.ok) {
      console.log("✔ Results published successfully!");
      console.log("✔ Check your lottery page:", `${LOCAL_API}`);
      return true;
    } else {
      console.error("✖ Publishing failed:", result);
      return false;
    }
  } else {
    console.log("✖ Invalid results - not publishing");
    console.log("✖ Check crop images at:", `${LOCAL_API}/debug-crops/`);
    return false;
  }
}

async function main() {
  try {
    console.log("=== AUTO-CAPTURE OCR WORKFLOW ===\n");
    
    // Step 1: Capture screenshot from friend's website
    await captureWebsite();
    
    // Step 2: Process with OCR
    const ocrResults = await processOCR();
    
    // Step 3: Publish to your lottery page
    const success = await publishResults(ocrResults);
    
    if (success) {
      console.log("\n🎉 Workflow completed successfully!");
    } else {
      console.log("\n❌ Workflow failed - check the debug images");
    }
    
  } catch (error) {
    console.error("❌ Workflow error:", error.message);
    process.exit(1);
  }
}

// Run immediately if called directly
if (require.main === module) {
  main();
}

// Export for scheduling
module.exports = { main };
