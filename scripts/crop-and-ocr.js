/**
 * scripts/crop-and-ocr.js
 * Modes:
 *   --probe      : Export a LARGE grid of tiles below the banner to find the top-left card.
 *   --card-first : Rough page→card crop to /public/debug-crops/card.png, then (optionally) slice lines.
 *   (default)    : Use REGION_PCTS (page-relative) for P2/P3/P4/P5 once we’ve dialed them in.
 */
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const sharp = require("sharp");

const ROOT = process.cwd();
const SRC_PATH = path.join(ROOT, "public", "capture.png");
const OUT_DIR  = path.join(ROOT, "public", "debug-crops");

function pctRectToPixels(W, H, [xPct, yPct, wPct, hPct]) {
  const left = Math.max(0, Math.floor(W * xPct));
  const top  = Math.max(0, Math.floor(H * yPct));
  const width  = Math.min(W - left, Math.max(1, Math.floor(W * wPct)));
  const height = Math.min(H - top,  Math.max(1, Math.floor(H * hPct)));
  return { left, top, width, height };
}
async function cropToFile(inPath, outPath, rect) {
  await sharp(inPath).extract(rect).png().toFile(outPath);
}
async function ocrLocalUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OCR HTTP ${res.status}`);
  return await res.json();
}

// ===== Default (page-relative) generous guesses (we’ll refine after card-first) =====
const REGION_PCTS = {
  P2: [0.05, 0.32, 0.38, 0.14],
  P3: [0.05, 0.48, 0.38, 0.14],
  P4: [0.05, 0.64, 0.38, 0.14],
  P5: [0.05, 0.80, 0.38, 0.16],
};

async function runNormal() {
  console.log("▶ Normal mode (page-relative crops) -> /public/debug-crops/*.png");
  if (!fs.existsSync(SRC_PATH)) { console.error("✖ capture.png not found"); process.exit(1); }
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const { width:W, height:H } = await sharp(SRC_PATH).metadata();
  const rects = {};
  for (const [k, p] of Object.entries(REGION_PCTS)) rects[k] = pctRectToPixels(W, H, p);

  for (const k of ["P2","P3","P4","P5"]) {
    const outP = path.join(OUT_DIR, `${k}.png`);
    await cropToFile(SRC_PATH, outP, rects[k]);
    console.log("• wrote", outP);
  }

  const base = "http://127.0.0.1:3000/api/ocr?img=";
  for (const k of ["P2","P3","P4","P5"]) {
    const url = base + encodeURIComponent(`/debug-crops/${k}.png`);
    try {
      const j = await ocrLocalUrl(url);
      console.log(`${k}:`, JSON.stringify(j.text||""));
    } catch(e){ console.log(`${k}: (error ${e.message})`); }
  }

  console.log("\nOpen to inspect crops:");
  console.log("  http://127.0.0.1:3000/debug-crops/P2.png");
  console.log("  http://127.0.0.1:3000/debug-crops/P3.png");
  console.log("  http://127.0.0.1:3000/debug-crops/P4.png");
  console.log("  http://127.0.0.1:3000/debug-crops/P5.png");
}

// ===== PROBE MODE: big grid BELOW the banner/clock to guarantee hitting a card =====
async function runProbe() {
  console.log("▶ PROBE mode: large grid below header to locate top-left card.");
  if (!fs.existsSync(SRC_PATH)) { console.error("✖ capture.png not found"); process.exit(1); }
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const { width:W, height:H } = await sharp(SRC_PATH).metadata();

  // Based on your screenshot: banner + countdown take the top ~20–23%. Start lower.
  const GRID_COLS = 4;
  const GRID_ROWS = 4;
  const X0 = 0.00;   // from the very left
  const Y0 = 0.24;   // start below the banner/clock
  const XW = 0.90;   // cover 90% width
  const YH = 0.70;   // cover most of the vertical section with cards

  const tileW = XW / GRID_COLS;
  const tileH = YH / GRID_ROWS;

  const urls = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const xPct = X0 + c * tileW;
      const yPct = Y0 + r * tileH;
      const rect = pctRectToPixels(W, H, [xPct, yPct, tileW, tileH]);
      const name = `probe-r${r+1}c${c+1}.png`;
      const outP = path.join(OUT_DIR, name);
      await cropToFile(SRC_PATH, outP, rect);
      console.log(`• wrote ${name} (x=${xPct.toFixed(2)}, y=${yPct.toFixed(2)}, w=${tileW.toFixed(2)}, h=${tileH.toFixed(2)})`);
      urls.push(`http://127.0.0.1:3000/debug-crops/${name}`);
    }
  }

  console.log("\nOpen these and tell me which tiles contain the TOP-LEFT card & its P2/P3/P4/P5 rows:");
  urls.forEach(u => console.log("  " + u));
}

// ===== CARD-FIRST MODE: rough page→card crop, then we’ll fine-tune inside the card =====
async function runCardFirst() {
  console.log("▶ CARD-FIRST mode: cropping a rough top-left card to /debug-crops/card.png");
  if (!fs.existsSync(SRC_PATH)) { console.error("✖ capture.png not found"); process.exit(1); }
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const { width:W, height:H } = await sharp(SRC_PATH).metadata();

  // Rough guess for the top-left card on your page:
  // Start just below header (y≈0.24), a little right of the very left (x≈0.02),
  // and cover a typical card footprint (w≈0.32, h≈0.18). We’ll tune after you preview it.
  const CARD_REGION_PCT = [0.02, 0.24, 0.34, 0.20];
  const cardRect = pctRectToPixels(W, H, CARD_REGION_PCT);
  const cardOut = path.join(OUT_DIR, "card.png");
  await cropToFile(SRC_PATH, cardOut, cardRect);
  console.log("• wrote", cardOut);

  console.log("\nOpen and tell me if this contains the full top-left card:");
  console.log("  http://127.0.0.1:3000/debug-crops/card.png");

  // If it looks good, we’ll set inner slices (card-relative) next.
}

const ARGV = new Set(process.argv.slice(2));
(async () => {
  if (ARGV.has("--probe")) return runProbe();
  if (ARGV.has("--card-first")) return runCardFirst();
  return runNormal();
})().catch(e => { console.error("✖ Script error:", e); process.exit(1); });
