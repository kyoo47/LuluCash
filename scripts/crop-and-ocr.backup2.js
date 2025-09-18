const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

const ROOT = process.cwd();
const OUT_DIR  = path.join(ROOT, "public", "debug-crops");

function pickNDigitsStrict(text, n) {
  if (!text) return null;
  // remove everything that is not 0-9
  const digits = (text.match(/\d/g) || []).join("");
  if (digits.length < n) return null;
  // take the LAST contiguous n digits (helps when extra noise precedes the number)
  return digits.slice(-n);
}

async function main() {
  // Read the OCR raw text for each crop via HTTP (keeps it consistent)
  async function ocrPublic(rel) {
    const url = "http://127.0.0.1:3000/api/ocr?img=" + encodeURIComponent(rel);
    const r = await fetch(url);
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "OCR failed");
    return j.text || "";
  }

  console.log("▶ OCRing crops at /public/debug-crops");
  const raw = {};
  raw.P2 = await ocrPublic("/debug-crops/P2.png");
  raw.P3 = await ocrPublic("/debug-crops/P3.png");
  raw.P4 = await ocrPublic("/debug-crops/P4.png");
  raw.P5 = await ocrPublic("/debug-crops/P5.png");

  console.log("\n=== Cropped OCR (raw) ===");
  for (const k of ["P2","P3","P4","P5"]) console.log(`${k}: ${JSON.stringify(raw[k])}`);

  const parsed = {
    P2: pickNDigitsStrict(raw.P2, 2),
    P3: pickNDigitsStrict(raw.P3, 3),
    P4: pickNDigitsStrict(raw.P4, 4),
    P5: pickNDigitsStrict(raw.P5, 5),
  };

  console.log("\n=== Parsed ===");
  console.log(parsed);

  const ok =
    /^\d{2}$/.test(parsed.P2 || "") &&
    /^\d{3}$/.test(parsed.P3 || "") &&
    /^\d{4}$/.test(parsed.P4 || "") &&
    /^\d{5}$/.test(parsed.P5 || "");

  if (!ok) {
    console.error("✖ Not publishing (one or more values invalid).");
    console.error("  Details: ", {
      P2: /^\d{2}$/.test(parsed.P2 || ""),
      P3: /^\d{3}$/.test(parsed.P3 || ""),
      P4: /^\d{4}$/.test(parsed.P4 || ""),
      P5: /^\d{5}$/.test(parsed.P5 || ""),
    });
    process.exit(2);
  }

  const post = await fetch("http://127.0.0.1:3000/api/results/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(Object.assign({ source: "crop-ocr" }, parsed)),
  });
  const pj = await post.json().catch(async () => {
    const txt = await post.text();
    throw new Error(`ingest bad response: ${txt}`);
  });
  if (!pj.ok) throw new Error("ingest failed: " + (pj.error || "unknown"));
  console.log("\n✔ Published:", pj);
}
main().catch(e => { console.error("✖ Script error:", e.message || e); process.exit(1); });
