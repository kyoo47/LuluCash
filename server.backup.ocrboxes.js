/**
 * server.js  Next + Express + Socket.IO + Google Vision OCR + Results API
 * - Serves Next app
 * - Provides /api/ocr/* and /api/results/* on the SAME express instance
 */
const http = require("http");
const path = require("path");
const fs = require("fs");
const express = require("express");
const next = require("next");
const { Server } = require("socket.io");

// ----- Google Vision (optional) -----
let visionClient = null;
try {
  const { ImageAnnotatorClient } = require("@google-cloud/vision");
  visionClient = new ImageAnnotatorClient();
  console.log("[vision] client ready");
} catch (e) {
  console.warn("[vision] client not ready:", e?.message || e);
}

const dev = process.env.NODE_ENV !== "production";
const nextApp = next({ dev });
const nextHandle = nextApp.getRequestHandler();

// ----- One express app for everything -----
const app = express();
app.use(express.json({ limit: "1mb" }));

// ----- Health -----
app.get("/health", (req, res) => res.send("OK"));

// ----- OCR endpoints (minimal) -----
app.get("/api/ocr/ping", (req, res) => {
  res.json({ ok: true, pong: true, time: new Date().toISOString() });
});

app.get("/api/ocr", async (req, res) => {
  try {
    const img = req.query.img;
    if (!img) return res.status(400).json({ ok: false, error: "missing ?img" });

    const abs = path.join(process.cwd(), "public", img.replace(/^\//, ""));
    if (!fs.existsSync(abs)) return res.status(404).json({ ok: false, error: "file not found" });

    if (!visionClient) return res.status(500).json({ ok: false, error: "vision not ready" });

    const [result] = await visionClient.textDetection(abs);
    const detections = result?.textAnnotations || [];
    const fullText = detections.length ? detections[0].description : "";
    return res.json({ ok: true, text: fullText });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

// ----- Results API (persist to data/results.json) -----
const RESULTS_PATH = path.join(process.cwd(), "data", "results.json");
if (!fs.existsSync(path.dirname(RESULTS_PATH))) {
  fs.mkdirSync(path.dirname(RESULTS_PATH), { recursive: true });
}

function readResults() {
  if (!fs.existsSync(RESULTS_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(RESULTS_PATH, "utf8"));
  } catch {
    return null;
  }
}
function writeResults(obj) {
  const tmp = RESULTS_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
  fs.renameSync(tmp, RESULTS_PATH);
}

app.get("/api/results/latest", (req, res) => {
  const data = readResults();
  return res.json(data ? Object.assign({ ok: true }, data) : { ok: true, at: null, P2: null, P3: null, P4: null, P5: null });
});

// strict ingest: only accept exactly 2/3/4/5 digits; otherwise 422 and DO NOT overwrite
app.post("/api/results/ingest", (req, res) => {
  try {
    const b = req.body || {};
    const is2 = /^\d{2}$/.test(b.P2 || "");
    const is3 = /^\d{3}$/.test(b.P3 || "");
    const is4 = /^\d{4}$/.test(b.P4 || "");
    const is5 = /^\d{5}$/.test(b.P5 || "");

    if (!(is2 && is3 && is4 && is5)) {
      return res.status(422).json({
        ok: false,
        error: "invalid_digits",
        details: { P2: !!is2, P3: !!is3, P4: !!is4, P5: !!is5 }
      });
    }

    const payload = {
      at: new Date().toISOString(),
      P2: String(b.P2),
      P3: String(b.P3),
      P4: String(b.P4),
      P5: String(b.P5),
      source: b.source || "ocr",
    };
    writeResults(payload);
    io.emit("results:update", payload);
    return res.json(Object.assign({ ok: true }, payload));
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

console.log("[results] endpoints ready");

// ----- Hand off to Next for everything else -----
nextApp.prepare().then(() => {
  app.all("*", (req, res) => nextHandle(req, res));
}).catch((e) => {
  console.error("Next prepare error:", e);
  process.exit(1);
});

// ----- HTTP + Socket.IO -----
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

io.on("connection", (socket) => {
  socket.emit("hello", { t: Date.now() });
});

// ----- Listen -----
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(` Server running at http://0.0.0.0:${PORT}`);
});
/** Return token-level OCR with bounding boxes for better ordering */
app.get("/api/ocr/boxes", async (req, res) => {
  try {
    const img = req.query.img;
    if (!img) return res.status(400).json({ ok: false, error: "missing ?img" });

    const abs = path.join(process.cwd(), "public", img.replace(/^\//, ""));
    if (!fs.existsSync(abs)) return res.status(404).json({ ok: false, error: "file not found" });
    if (!visionClient) return res.status(500).json({ ok: false, error: "vision not ready" });

    const [result] = await visionClient.textDetection(abs);
    const anns = result?.textAnnotations || [];
    // anns[0] is the full text; the rest are tokens/words
    const items = anns.slice(1).map(t => ({
      text: t.description || "",
      box: (t.boundingPoly?.vertices || []).map(v => ({ x: v?.x || 0, y: v?.y || 0 }))
    }));
    return res.json({ ok: true, items });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
});
