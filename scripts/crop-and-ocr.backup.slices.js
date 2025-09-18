const fetch = require("node-fetch");

/** Pick digits by their bounding boxes, filter the correct ROW, sort by X, join. */
async function readDigitsLeftToRight(relPath, expectedN) {
  const url = "http://127.0.0.1:3000/api/ocr/boxes?img=" + encodeURIComponent(relPath);
  const r = await fetch(url);
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "boxes failed");

  // Keep only single characters 0–9
  let digits = (j.items || [])
    .filter(it => /^[0-9]$/.test(it.text))
    .map(it => {
      const box = it.box || [];
      const cx = box.reduce((s, v) => s + (v.x || 0), 0) / (box.length || 1);
      const cy = box.reduce((s, v) => s + (v.y || 0), 0) / (box.length || 1);
      return { d: it.text, cx, cy };
    });

  if (!digits.length) return null;

  // Group by rows using Y proximity (robust against small tilt)
  digits.sort((a,b) => a.cy - b.cy);
  const rows = [];
  const yTol = 18; // pixels tolerance between digits to be considered same row (good for ~720p crops)
  for (const g of digits) {
    let placed = false;
    for (const row of rows) {
      if (Math.abs(g.cy - row.meanY) <= yTol) {
        row.items.push(g);
        row.meanY = row.items.reduce((s, x) => s + x.cy, 0) / row.items.length;
        placed = true;
        break;
      }
    }
    if (!placed) rows.push({ meanY: g.cy, items: [g] });
  }

  // Prefer a row that has at least expectedN digits; otherwise pick the row with most digits
  rows.sort((a,b) => b.items.length - a.items.length);
  let chosen = rows.find(rw => rw.items.length >= expectedN) || rows[0];

  // Sort chosen row by X (left → right) and take the last expectedN (in case there are extras)
  const ordered = chosen.items.sort((a,b) => a.cx - b.cx);
  const picked = ordered.slice(-expectedN);
  if (picked.length < expectedN) return null;

  return picked.map(p => p.d).join("");
}

async function main() {
  console.log("▶ Reading digits from crops via /api/ocr/boxes …");

  const P2 = await readDigitsLeftToRight("/debug-crops/P2.png", 2);
  const P3 = await readDigitsLeftToRight("/debug-crops/P3.png", 3);
  const P4 = await readDigitsLeftToRight("/debug-crops/P4.png", 4);
  const P5 = await readDigitsLeftToRight("/debug-crops/P5.png", 5);

  console.log("\\n=== Parsed (left→right by row) ===");
  console.log({ P2, P3, P4, P5 });

  const ok =
    /^\\d{2}$/.test(P2 || "") &&
    /^\\d{3}$/.test(P3 || "") &&
    /^\\d{4}$/.test(P4 || "") &&
    /^\\d{5}$/.test(P5 || "");

  if (!ok) {
    console.error("✖ Not publishing (one or more invalid).");
    process.exit(2);
  }

  const post = await fetch("http://127.0.0.1:3000/api/results/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: "crop-ocr-boxes", P2, P3, P4, P5 }),
  });
  const pj = await post.json().catch(async () => {
    const t = await post.text(); throw new Error("ingest bad response: " + t);
  });
  if (!pj.ok) throw new Error("ingest failed: " + (pj.error || "unknown"));
  console.log("\\n✔ Published:", pj);
}
main().catch(e => { console.error("✖ Script error:", e.message || e); process.exit(1); });
