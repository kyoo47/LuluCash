const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

(async () => {
  const url = process.env.TARGET_URL || "http://instantcash.gaminglts.com:82/";
  const outPath = path.join(process.cwd(), "public", "capture.png");

  console.log("▶ Launching browser (1920x1080)...");
  const browser = await puppeteer.launch({
    headless: "new",
    defaultViewport: { width: 1920, height: 1080 }
  });
  const page = await browser.newPage();

  await page.goto(url, { waitUntil: "networkidle2", timeout: 120000 });
  await page.evaluate(() => window.scrollTo(0, 0));   // top of page

  // wait manually
  await new Promise(r => setTimeout(r, 1500));

  console.log("▶ Capturing full-page screenshot...");
  await page.screenshot({ path: outPath, fullPage: true });
  await browser.close();

  console.log("✔ Saved:", outPath);
})();
