const http = require("http");
const path = require("path");
const fs = require("fs");
const next = require("next");
const express = require("express");

// -------- Google Vision (safe init) --------
let visionClient = null;
let visionInitError = null;
try {
  const { ImageAnnotatorClient } = require("@google-cloud/vision");
  visionClient = new ImageAnnotatorClient();
  console.log("[vision] client ready");
} catch (e) {
  visionInitError = e?.message || String(e);
  console.warn("[vision] init failed:", visionInitError);
}

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const exp = express();
  exp.use(express.json());

  // -------- Health & OCR diagnostics --------
  exp.get("/health", (_req, res) => {
    res.type("text/plain").send("OK");
  });

  exp.get("/api/ocr/ping", (_req, res) => {
    res.json({ ok: true, pong: true, time: new Date().toISOString() });
  });

  exp.get("/api/ocr/status", (_req, res) => {
    const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || "";
    const keyExists = credsPath ? fs.existsSync(credsPath) : false;
    res.json({
      ok: true,
      env: { GOOGLE_APPLICATION_CREDENTIALS: credsPath },
      keyExists,
      visionOk: !!visionClient,
      visionError: visionInitError || null,
      now: new Date().toISOString(),
    });
  });

  // -------- OCR endpoint: GET /api/ocr?img=/filename.png --------
  exp.get("/api/ocr", async (req, res) => {
    try {
      if (!visionClient) {
        return res.status(500).json({ ok: false, error: "Vision client not initialized" });
      }
      const img = (req.query.img || "").toString().trim();
      if (!img) {
        return res.status(400).json({ ok: false, error: "Missing ?img=/path" });
      }

      // Resolve to /public path if a leading slash is provided
      let localPath;
      if (img.startsWith("/")) {
        localPath = path.join(process.cwd(), "public", img.replace(/^\//, ""));
      } else {
        localPath = path.isAbsolute(img) ? img : path.join(process.cwd(), img);
      }

      if (!fs.existsSync(localPath)) {
        return res.status(404).json({ ok: false, error: `File not found: ${path.basename(localPath)}` });
      }

      // Use filename directly with Vision
      const [result] = await visionClient.textDetection(localPath);
      const textAnn = result.textAnnotations && result.textAnnotations[0];
      const fullText = textAnn ? textAnn.description : "";
      const lines = fullText ? fullText.split(/\r?\n/).filter(Boolean) : [];
      return res.json({ ok: true, text: fullText, lines });
    } catch (err) {
      console.error("OCR error:", err);
      return res.status(500).json({ ok: false, error: "OCR failed" });
    }
  });

  // -------- Hand off everything else to Next --------
  exp.all(/.*/, (req, res) => handle(req, res));

  const server = http.createServer(exp);
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`✔ Server running at http://0.0.0.0:${PORT}`);
  });
});
