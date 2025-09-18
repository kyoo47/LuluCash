// scripts/parse-capture.js (fuzzy label + multiline aware)
//
// Goal: find the first number that appears after the labels
//  "PICK 2", "PICK 3", "PICK 4", "PICK 5", even if OCR mangles "PICK"
//  as PIŠK / PISK / P1CK, and even if the digits are on the next line.

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const IMG = process.env.IMG || "/capture.png";

// Normalize common OCR mistakes to improve matching
function normalize(text) {
  let t = text;

  // unify quotes and weird whitespace
  t = t.replace(/\r/g, "\n").replace(/\u00A0/g, " ");

  // map some diacritics / confusables often seen in your OCR:
  const map = {
    "Š": "K", "Ś": "K", "Ř": "K", "Ƙ": "K",
    "İ": "I", "Í": "I", "Ì": "I", "Ï": "I", "Ī": "I",
    "ℐ": "I", "Ⅰ": "I",
    "₱": "P",
    "¡": "I", "ł": "l", "€": "E",
    // digits commonly misread:
    "O": "0", "o": "0",
    "I": "I", "l": "1", "Z": "2", "S": "5"
  };
  t = t.split("").map(ch => map[ch] ?? ch).join("");

  // common whole-word fixes around PICK:
  t = t.replace(/\bPI[ŚŠ]K\b/gi, "PICK");
  t = t.replace(/\bPISK\b/gi, "PICK");
  t = t.replace(/\bP1CK\b/gi, "PICK");
  t = t.replace(/\bP!CK\b/gi, "PICK");

  // collapse multiple spaces but KEEP newlines for multiline matching
  // (we’ll allow \s* in regex to hop lines)
  return t;
}

// helper to pick the first exact-length digit group after a label
function findAfterLabel(text, labelNum, len) {
  // Regex:
  //   - fuzzy "PICK" already normalized above
  //   - allow any spaces/newlines between tokens
  //   - capture EXACT len digits in group 1
  const re = new RegExp(
    String.raw`PICK\s*${labelNum}\s*[:\-]*\s*([0-9]{${len}})`,
    "i"
  );

  const m = re.exec(text);
  return m ? m[1] : null;
}

(async () => {
  const url = `${BASE}/api/ocr?img=${encodeURIComponent(IMG)}`;
  console.log(`▶ Fetching OCR JSON from: ${url}`);

  const r = await fetch(url);
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`OCR request failed: ${r.status} ${r.statusText} -> ${txt.slice(0, 200)}`);
  }
  const data = await r.json();
  if (!data?.ok || typeof data?.text !== "string") {
    throw new Error(`Bad OCR payload: ${JSON.stringify(data).slice(0, 200)}`);
  }

  const raw = data.text;
  const norm = normalize(raw);

  const p2 = findAfterLabel(norm, 2, 2);
  const p3 = findAfterLabel(norm, 3, 3);
  const p4 = findAfterLabel(norm, 4, 4);
  const p5 = findAfterLabel(norm, 5, 5);

  console.log("\n=== Fuzzy, multiline OCR picks (first match after label) ===");
  console.log("Pick 2:", p2 || "(none)");
  console.log("Pick 3:", p3 || "(none)");
  console.log("Pick 4:", p4 || "(none)");
  console.log("Pick 5:", p5 || "(none)");
})();
