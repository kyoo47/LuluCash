const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const fetch = require("node-fetch");
const { createWorker } = require('tesseract.js');

const ROOT = process.cwd();
const PUB = (...p) => path.join(ROOT, "public", ...p);
const SRC = PUB("capture.png");

const RECTS_PX_1280x720 = {
  P2: { left: 130, top: 300, width: 80, height: 35 },
  P3: { left: 130, top: 340, width: 120, height: 35 },
  P4: { left: 130, top: 380, width: 160, height: 35 },
  P5: { left: 130, top: 420, width: 160, height: 70 },
};

async function preprocessCrop(src, rect, outAbs) {
  await sharp(src)
    .extract(rect)
    .resize(rect.width * 3, rect.height * 3)
    .modulate({ brightness: 1.3, saturation: 0.5 })
    .sharpen()
    .png()
    .toFile(outAbs);
}

async function ocrWithTesseract(imagePath) {
  const worker = await createWorker('eng');
  
  try {
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789',
      tessedit_pageseg_mode: '8',
    });
    
    const { data: { text } } = await worker.recognize(imagePath);
    await worker.terminate();
    
    const digits = text.replace(/[^\d]/g, '');
    console.log(`OCR result: "${text}" -> cleaned: "${digits}"`);
    return digits;
    
  } catch (error) {
    console.error('OCR error:', error);
    await worker.terminate();
    return '';
  }
}

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error("✖ capture.png missing");
    process.exit(1);
  }

  const meta = await sharp(SRC).metadata();
  console.log(`• capture.png size: ${meta.width}x${meta.height}`);

  const outDirAbs = PUB("debug-crops");
  if (!fs.existsSync(outDirAbs)) fs.mkdirSync(outDirAbs, { recursive: true });

  const results = {};
  
  for (const [pick, rect] of Object.entries(RECTS_PX_1280x720)) {
    const cropPath = PUB("debug-crops", `${pick}.png`);
    
    await preprocessCrop(SRC, rect, cropPath);
    console.log(`• Created ${pick} crop`);
    
    const ocrResult = await ocrWithTesseract(cropPath);
    results[pick] = ocrResult;
    
    console.log(`• ${pick}: "${ocrResult}"`);
  }

  console.log("\n=== OCR Results ===");
  console.log(results);

  const P2 = results.P2 && results.P2.length === 2 ? results.P2 : null;
  const P3 = results.P3 && results.P3.length === 3 ? results.P3 : null;
  const P4 = results.P4 && results.P4.length === 4 ? results.P4 : null;
  const P5 = results.P5 && results.P5.length === 5 ? results.P5 : null;

  console.log("\n=== Validated Results ===");
  console.log({ P2, P3, P4, P5 });

  if (P2 && P3 && P4 && P5) {
    console.log("\n• Publishing results...");
    
    const res = await fetch("http://127.0.0.1:3001/api/results/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "tesseract-ocr", P2, P3, P4, P5 })
    });
    
    const result = await res.json();
    if (result.ok) {
      console.log("✔ Published successfully:", result);
    } else {
      console.error("✖ Publishing failed:", result);
    }
  } else {
    console.log("✖ Invalid results - not publishing");
    console.log("Check the crop images at http://127.0.0.1:3001/debug-crops/");
  }
}

main().catch(e => {
  console.error("✖ Script error:", e.message || e);
  process.exit(1);
});
