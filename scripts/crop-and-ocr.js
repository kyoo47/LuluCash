/**
 * scripts/crop-and-ocr.js (auto-row slicer)
 * - Reads /public/capture.png
 * - Writes /public/debug-crops/{P2,P3,P4,P5}.png
 * - Auto-detects 1 or 2 rows inside each crop, slices digits left→right
 * - OCRs each slice via /api/ocr?img=...
 * - Publishes only if all picks look valid
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const fetch = require("node-fetch");

const ROOT = process.cwd();
const PUB = (...p) => path.join(ROOT, "public", ...p);
const SRC = PUB("capture.png");

const RECTS_PX_1280x720 = {
  P2: { left: 107, top: 286, width: 102, height: 54 },
  P3: { left: 94,  top: 325, width: 160, height: 51 },
  P4: { left: 94,  top: 363, width: 211, height: 54 },
  P5: { left: 94,  top: 424, width: 262, height: 66 },
};

const RECTS_PCT = {
  P2: [0.084, 0.397, 0.080, 0.075],
  P3: [0.073, 0.451, 0.125, 0.071],
  P4: [0.073, 0.504, 0.165, 0.075],
  P5: [0.073, 0.589, 0.205, 0.092],
};

function pctToPx(W,H,[x,y,w,h]){
  const left = Math.max(0, Math.floor(W*x));
  const top  = Math.max(0, Math.floor(H*y));
  const width  = Math.min(W-left, Math.max(1, Math.floor(W*w)));
  const height = Math.min(H-top,  Math.max(1, Math.floor(H*h)));
  return { left, top, width, height };
}

async function preprocExtract(src, rect, outAbs) {
  // Preprocess so digits pop: grayscale→normalize→threshold→slight blur
  await sharp(src)
    .extract(rect)
    .grayscale()
    .normalize()
    .threshold(160)     // binarize; tweakable
    .blur(0.3)
    .png()
    .toFile(outAbs);
}

async function toRawGray(buf) {
  const img = sharp(buf).ensureAlpha();
  const meta = await img.metadata();
  const { data } = await img
    .removeAlpha()
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { w: meta.width, h: meta.height, data };
}

function horizBands(gray, minBandHeight=8) {
  const { w, h, data } = gray;
  const hist = new Array(h).fill(0);
  for (let y=0; y<h; y++){
    let s = 0, rowStart=y*w;
    for (let x=0; x<w; x++) s += 255 - data[rowStart+x]; // brighter (white) -> higher score
    hist[y] = s;
  }
  // threshold ~ 60th percentile
  const sorted = [...hist].sort((a,b)=>a-b);
  const thr = sorted[Math.floor(sorted.length*0.60)];
  const bands = [];
  let y0=null;
  for (let y=0; y<h; y++){
    const on = hist[y] >= thr;
    if (on && y0===null) y0=y;
    if (!on && y0!==null){
      if (y - y0 >= minBandHeight) bands.push([y0, y-1]);
      y0=null;
    }
  }
  if (y0!==null && (h - y0)>=minBandHeight) bands.push([y0, h-1]);
  return bands;
}

function splitCols(gray, y0, y1, kWant) {
  // vertical histogram inside [y0..y1]
  const { w, data } = gray;
  const histX = new Array(w).fill(0);
  for (let y=y0; y<=y1; y++){
    const row=y*w;
    for (let x=0; x<w; x++) histX[x] += 255 - data[row+x];
  }
  // pick kWant peaks using simple windowed maxima
  const peaks=[];
  const win = Math.max(3, Math.floor(w/30)); // window ~3–10 px
  for (let x=win; x<w-win; x++){
    let isMax=true;
    for (let t=x-win; t<=x+win; t++){
      if (histX[t] > histX[x]){ isMax=false; break; }
    }
    if (isMax && histX[x] > 0) peaks.push([x, histX[x]]);
  }
  peaks.sort((a,b)=>b[1]-a[1]);      // strongest first
  const take = peaks.slice(0, kWant).map(p=>p[0]).sort((a,b)=>a-b); // left→right centers

  // build column rectangles around centers
  const rects=[];
  const half = Math.max(6, Math.floor(w/20)); // ~slice width
  for (const cx of take){
    const x0 = Math.max(0, cx-half);
    const x1 = Math.min(w-1, cx+half);
    rects.push([x0, y0, x1-x0+1, y1-y0+1]);
  }
  // if detection failed, fall back to equal slices
  if (rects.length !== kWant){
    rects.length = 0;
    const sliceW = Math.floor(w/kWant);
    for (let i=0;i<kWant;i++){
      const x0 = Math.max(0, Math.floor(i*sliceW));
      const x1 = (i===kWant-1) ? (w-1) : Math.min(w-1, Math.floor((i+1)*sliceW)-1);
      rects.push([x0, y0, x1-x0+1, y1-y0+1]);
    }
  }
  return rects;
}

async function readBySlicesSmart(stem, N, relPng) {
  // Load preprocessed crop and analyze rows/columns dynamically
  const cropBuf = fs.readFileSync(PUB(relPng));
  const gray = await toRawGray(cropBuf);
  const bands = horizBands(gray, Math.max(6, Math.floor(gray.h*0.18)));

  // Decide row allocation
  let rowRects = [];
  if (bands.length <= 1) {
    // One row → N digits in one line
    const [y0,y1] = bands.length===1 ? bands[0] : [Math.floor(gray.h*0.15), Math.floor(gray.h*0.80)];
    const cols = splitCols(gray, y0, y1, N);
    for (const c of cols) rowRects.push(c);
  } else {
    // Two rows → estimate how many digits per row using peak counts
    const [t0,t1] = bands[0];
    const [b0,b1] = bands[1];

    // Try to count peaks per band
    const topCols  = splitCols(gray, t0, t1, Math.min(N, 4));
    const botCols  = splitCols(gray, b0, b1, N - topCols.length);
    // If total < N, fill remaining from top equal slices
    let total = topCols.length + botCols.length;
    if (total < N){
      const need = N - total;
      const fallback = splitCols(gray, t0, t1, Math.min(need, N)); // add to top
      rowRects = [...topCols, ...fallback, ...botCols].slice(0,N);
    } else {
      rowRects = [...topCols, ...botCols];
    }
  }

  // Save debug slices and OCR each
  const outDirRel = "/debug-crops/slices";
  const outDirAbs = PUB(outDirRel);
  if (!fs.existsSync(outDirAbs)) fs.mkdirSync(outDirAbs, { recursive:true });

  const digits = [];
  for (let i=0;i<rowRects.length;i++){
    const [x,y,w,h] = rowRects[i];
    const outRel = `${outDirRel}/${stem}_${i+1}.png`;
    await sharp(PUB(relPng)).extract({ left:x, top:y, width:w, height:h }).png().toFile(PUB(outRel));

    const url = "http://127.0.0.1:3000/api/ocr?img=" + encodeURIComponent(outRel);
    const r = await fetch(url);
    const j = await r.json().catch(async()=>({ ok:false, error:await r.text() }));
    let d = (j.text||"").replace(/[^\d]/g,"").trim();
    if (d.length===0) d="?";
    digits.push(d[0] || "?");
  }

  console.log(`• ${stem} slices -> ${digits.join(" ")}`);
  const s = digits.join("");
  return (/^\d+$/).test(s) && s.length===N ? s : null;
}

async function main(){
  if (!fs.existsSync(SRC)){ console.error("✖ capture.png missing"); process.exit(1); }

  const meta = await sharp(SRC).metadata();
  const W = meta.width, H = meta.height;
  console.log(`• capture.png size: ${W}x${H}`);

  let rects;
  if (W===1280 && H===720) rects = RECTS_PX_1280x720;
  else {
    console.warn("⚠ capture size differs - using percentage rects");
    rects = {
      P2: pctToPx(W,H,RECTS_PCT.P2),
      P3: pctToPx(W,H,RECTS_PCT.P3),
      P4: pctToPx(W,H,RECTS_PCT.P4),
      P5: pctToPx(W,H,RECTS_PCT.P5),
    };
  }

  const outDirRel = "/debug-crops";
  const outDirAbs = PUB(outDirRel);
  if (!fs.existsSync(outDirAbs)) fs.mkdirSync(outDirAbs, { recursive:true });

  const outs = {};
  for (const [k, r] of Object.entries(rects)){
    const rel = `${outDirRel}/${k}.png`;
    await preprocExtract(SRC, r, PUB(rel));
    outs[k]=rel;
  }
  console.log("• Crops written:", outs);
  console.log("  Open crops:  http://127.0.0.1:3000/debug-crops/P2.png etc.");
  console.log("  Open slices: http://127.0.0.1:3000/debug-crops/slices/P5_1.png etc.");

  const P2 = await readBySlicesSmart("P2",2,outs.P2);
  const P3 = await readBySlicesSmart("P3",3,outs.P3);
  const P4 = await readBySlicesSmart("P4",4,outs.P4);
  const P5 = await readBySlicesSmart("P5",5,outs.P5);

  console.log("\n=== Parsed (slice method) ===");
  console.log({P2,P3,P4,P5});

  const ok =
    /^\d{2}$/.test(P2||"") &&
    /^\d{3}$/.test(P3||"") &&
    /^\d{4}$/.test(P4||"") &&
    /^\d{5}$/.test(P5||"");

  if (!ok){
    console.error("✖ Not publishing — open /debug-crops/*.png and /debug-crops/slices/*.png");
    process.exit(2);
  }

  const res = await fetch("http://127.0.0.1:3000/api/results/ingest", {
    method:"POST", headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ source:"crop-ocr-smart", P2,P3,P4,P5 })
  });
  const j = await res.json().catch(async()=>({ok:false, error:await res.text()}));
  if (!j.ok) throw new Error("ingest failed: " + (j.error||"unknown"));
  console.log("✔ Published:", j);
}
main().catch(e=>{ console.error("✖ Script error:", e.message||e); process.exit(1); });
