const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

(async () => {
  const OUT = path.join(process.cwd(), "public", "capture.png");
  console.log("▶ Launching browser (1280x720)…");
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width:1280, height:720, deviceScaleFactor:1 });

  const URL = "http://instantcash.gaminglts.com:82/";
  console.log("▶ Navigating:", URL);
  await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });

  // Give layout/animations a moment to settle
  await new Promise(r => setTimeout(r, 1200));

  console.log("▶ Capturing screenshot…");
  await page.screenshot({ path: OUT, type:"png" });
  await browser.close();
  console.log("✔ Screenshot saved:", OUT);

  // (Optional) ping OCR to warm it up
  try {
    const u = "http://127.0.0.1:3001/api/ocr?img=" + encodeURIComponent("/capture.png");
    const r = await fetch(u); await r.text();
  } catch {}
})();
