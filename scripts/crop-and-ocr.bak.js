const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const fetch = require("node-fetch");

const ROOT = process.cwd();
const PUB  = (rel) => path.join(ROOT, "public", rel.replace(/^\//, ""));
const SRC  = PUB("/capture.png");

/** Rects for 1280x720 */
const RECTS_PX_1280x720 = {
  P2: { left:107, top:286, width:102, height:54 },
  P3: { left: 94, top:325, width:160, height:51 },
  P4: { left: 94, top:363, width:211, height:54 },
  P5: { left: 94, top:424, width:262, height:66 },
};

// Fallback percentage rects (if size != 1280x720)
const RECTS_PCT = {
  P2:[0.0836,0.397,0.0797,0.075], // [x,y,w,h] as fractions of W/H
  P3:[0.0734,0.451,0.125, 0.071],
  P4:[0.0734,0.504,0.165, 0.075],
  P5:[0.0734,0.589,0.205, 0.092],
};

async function ocr(rel){
  const url = "http://127.0.0.1:3000/api/ocr?img=" + encodeURIComponent(rel);
  const r = await fetch(url);
  try { const j = await r.json(); return j.ok ? (j.text||"") : ""; }
  catch { return ""; }
}

async function preprocExtract(srcAbs, rect, outAbs){
  // Softer pipeline: grayscale + normalize + slight sharpen, NO hard threshold.
  await sharp(srcAbs)
    .extract(rect)
    .resize({ width: rect.width*2, height: rect.height*2, kernel:"nearest" })
    .grayscale()
    .normalize()
    .sharpen()
    .png()
    .toFile(outAbs);
}

function pctToPx(W,H,[x,y,w,h]){
  const left = Math.max(0, Math.round(W*x));
  const top  = Math.max(0, Math.round(H*y));
  const width  = Math.min(W-left, Math.max(1, Math.round(W*w)));
  const height = Math.min(H-top , Math.max(1, Math.round(H*h)));
  return { left, top, width, height };
}

async function readBySlices(baseRel, N, padX=0.08, padY=0.15){
  const abs = PUB(baseRel);
  const meta = await sharp(abs).metadata();
  const W = meta.width, H = meta.height;
  const segW = W / N;
  const px = Math.round(segW*padX), py = Math.round(H*padY);

  const dirRel = "/debug-crops/slices";
  const dirAbs = PUB(dirRel);
  if (!fs.existsSync(dirAbs)) fs.mkdirSync(dirAbs, { recursive:true });

  const stem = path.basename(baseRel, ".png");
  const digits = [];

  for (let i=0;i<N;i++){
    const left   = Math.max(0, Math.floor(i*segW + px));
    const width  = Math.max(1, Math.floor(segW - 2*px));
    const top    = py;
    const height = Math.max(1, H - 2*py);
    const outRel = `${dirRel}/${stem}_${i+1}.png`;

    await sharp(abs).extract({ left, top, width, height }).png().toFile(PUB(outRel));
    const t = await ocr(outRel);
    const m = t.match(/\d/);
    digits.push(m ? m[0] : "?");
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

  // Choose rects
  let rects;
  if (W===1280 && H===720) {
    rects = RECTS_PX_1280x720;
  } else {
    console.warn("⚠ capture size differs — using percentage rects");
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

  // Preprocess + write crops
  const outs = {};
  for (const [k, r] of Object.entries(rects)){
    const rel = `${outDirRel}/${k}.png`;
    await preprocExtract(SRC, r, PUB(rel));
    outs[k]=rel;
  }
  console.log("• Crops written:", outs);

  // Slice OCR (slightly wider vertical coverage)
  const P2 = await readBySlices(outs.P2,2,0.06,0.12);
  const P3 = await readBySlices(outs.P3,3,0.06,0.12);
  const P4 = await readBySlices(outs.P4,4,0.06,0.12);
  const P5 = await readBySlices(outs.P5,5,0.06,0.12);

  console.log("\n=== Parsed (slice method) ===");
  console.log({P2,P3,P4,P5});

  const ok = /^\d{2}$/.test(P2||"") && /^\d{3}$/.test(P3||"") && /^\d{4}$/.test(P4||"") && /^\d{5}$/.test(P5||"");
  if (!ok){ console.error("✖ Not publishing — open /debug-crops/*.png and /debug-crops/slices/*.png"); process.exit(2); }

  const res = await fetch("http://127.0.0.1:3000/api/results/ingest", {
    method:"POST", headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ source:"crop-ocr-slices", P2,P3,P4,P5 })
  });
  const j = await res.json().catch(async()=>({ok:false, error:await res.text()}));
  if (!j.ok) throw new Error("ingest failed: " + (j.error||"unknown"));
  console.log("✔ Published:", j);
}
main().catch(e=>{ console.error("✖ Script error:", e.message||e); process.exit(1); });
