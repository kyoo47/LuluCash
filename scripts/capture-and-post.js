// scripts/capture-and-post.js
const path = require("path");
const fs = require("fs/promises");
const http = require("http");
const puppeteer = require("puppeteer");

// Where to capture from (your friend’s page)
const TARGET_URL = process.env.CAPTURE_URL || "http://instantcash.gaminglts.com:82/";
// Where our OCR API lives
const OCR_URL_BASE = process.env.OCR_BASE || "http://localhost:3000";

function httpGetJSON(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(new Error(`Bad JSON from ${url} -> ${data.slice(0, 200)}`));
        }
      });
    });
    req.on("error", reject);
  });
}

// simple wait function
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  try {
    console.log("▶ Launching browser...");
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    console.log("▶ Navigating:", TARGET_URL);
    await page.goto(TARGET_URL, { waitUntil: "networkidle2", timeout: 60_000 });

    // Give the page a second to settle
    await delay(1500);

    console.log("▶ Capturing screenshot...");
    const outPath = path.join(process.cwd(), "public", "capture.png");
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await page.screenshot({ path: outPath, fullPage: true });
    console.log("✔ Screenshot saved to:", outPath);

    await browser.close();

    // Call our OCR endpoint via plain http
    const imgParam = encodeURIComponent("/capture.png");
    const ocrURL = `${OCR_URL_BASE}/api/ocr?img=${imgParam}`;
    console.log("▶ Sending to OCR:", ocrURL);

    const result = await httpGetJSON(ocrURL);

    if (!result?.ok) {
      console.error("✖ OCR failed:", result?.error || "unknown error");
      process.exitCode = 1;
      return;
    }

    console.log("✔ OCR text (first 400 chars):");
    const t = result.text || "";
    console.log(t.slice(0, 400));
    if (t.length > 400) console.log("…");
  } catch (err) {
    console.error("✖ Script error:", err?.message || err);
    process.exitCode = 1;
  }
})();
