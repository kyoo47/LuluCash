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
// Test endpoint to manually trigger Socket event
app.post("/api/test-socket", (req, res) => {
  const testData = {
    P2: "12", P3: "345", P4: "6789", P5: "01234",
    source: "test"
  };
  console.log("Emitting test results:update event");
  io.emit("results:update", testData);
  res.json({ ok: true, message: "Test event emitted" });
});
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

// ----- Remote Control API -----
// PIN for remote access (hardcoded for simplicity)
const CONTROL_PIN = "2468"; // You can change this to your preferred PIN

app.post("/api/remote", (req, res) => {
  try {
    const b = req.body || {};
    
    // Verify PIN
    if (b.pin !== CONTROL_PIN) {
      return res.status(403).json({ ok: false, error: "Invalid PIN" });
    }
    
    // Handle Reset All action
    if (b.action === "resetAll") {
      // Clear all stored results
      const resetPayload = {
        at: new Date().toISOString(),
        P2: null,
        P3: null,
        P4: null,
        P5: null,
        source: "remote-reset",
      };
      writeResults(resetPayload);
      
      // Update global state
      globalState.numberBoxes = [];
      globalState.stateResults = [];
      
      // Broadcast updates
      io.emit("results:update", resetPayload);
      io.emit("state", globalState);
      io.emit("state:reset");
      return res.json({ ok: true, message: "All data reset" });
    }
    
    // Handle today's draws submission
    if (b.selectedTime) {
      const pick2 = b.pick2 || "";
      const pick3 = b.pick3 || "";
      const pick4 = b.pick4 || "";
      const pick5 = b.pick5 || "";
      
      // Validate that at least one pick is provided
      if (!pick2 && !pick3 && !pick4 && !pick5) {
        return res.status(400).json({ ok: false, error: "No picks provided" });
      }
      
      // Validate format of provided picks
      if (pick2 && !/^\d{2}$/.test(pick2)) {
        return res.status(400).json({ ok: false, error: "Pick 2 must be exactly 2 digits" });
      }
      if (pick3 && !/^\d{3}$/.test(pick3)) {
        return res.status(400).json({ ok: false, error: "Pick 3 must be exactly 3 digits" });
      }
      if (pick4 && !/^\d{4}$/.test(pick4)) {
        return res.status(400).json({ ok: false, error: "Pick 4 must be exactly 4 digits" });
      }
      if (pick5 && !/^\d{5}$/.test(pick5)) {
        return res.status(400).json({ ok: false, error: "Pick 5 must be exactly 5 digits" });
      }
      
      // Create a payload with the provided picks
      const payload = {
        at: new Date().toISOString(),
        time: b.selectedTime,
        P2: pick2 || null,
        P3: pick3 || null,
        P4: pick4 || null,
        P5: pick5 || null,
        source: "remote",
      };
      
      // Only update results if we have all picks (to avoid overwriting existing)
      if (pick2 && pick3 && pick4 && pick5) {
        writeResults(payload);
      }
      
      // Format for the numberBoxes array
      const drawTime = new Date();
      const numberBox = {
        id: Date.now().toString(),
        date: drawTime.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        time: b.selectedTime,
        drawTime: drawTime,
        pick2: pick2 ? pick2.split("").map(n => parseInt(n)) : [],
        pick3: pick3 ? pick3.split("").map(n => parseInt(n)) : [],
        pick4: pick4 ? pick4.split("").map(n => parseInt(n)) : [],
        pick5: pick5 ? pick5.split("").map(n => parseInt(n)) : []
      };
      
      // Add to global state
      globalState.numberBoxes = [numberBox, ...globalState.numberBoxes];
      
      // Emit events
      io.emit("today:update", payload);
      io.emit("state", globalState);
      
      return res.json({ ok: true, message: "Today's draw updated" });
    }
    
    // Handle state entries
    if (b.stateEntries && Array.isArray(b.stateEntries) && b.stateEntries.length > 0) {
      // Validate entries
      for (const entry of b.stateEntries) {
        if (!entry.state) {
          return res.status(400).json({ ok: false, error: "State name required for entries" });
        }
        
        const p3 = entry.pick3 || "";
        const p4 = entry.pick4 || "";
        
        if (!p3 && !p4) {
          return res.status(400).json({ ok: false, error: "At least one of Pick 3 or Pick 4 required" });
        }
        
        if (p3 && !/^\d{3}$/.test(p3)) {
          return res.status(400).json({ ok: false, error: "State Pick 3 must be exactly 3 digits" });
        }
        
        if (p4 && !/^\d{4}$/.test(p4)) {
          return res.status(400).json({ ok: false, error: "State Pick 4 must be exactly 4 digits" });
        }
      }
      
      // Format state entries for the global state
      const now = new Date();
      const formattedEntries = b.stateEntries.map(entry => ({
        id: `${entry.type || "today"}-${entry.state}-${Date.now()}`,
        state: entry.state,
        pick3: entry.pick3 ? entry.pick3.split("").map(n => parseInt(n)) : [],
        pick4: entry.pick4 ? entry.pick4.split("").map(n => parseInt(n)) : [],
        type: entry.type || "today",
        timestamp: now
      }));
      
      // Add to global state
      globalState.stateResults = [...globalState.stateResults, ...formattedEntries];
      
      // Emit events
      io.emit("state:update", {
        entries: b.stateEntries,
        at: new Date().toISOString(),
        source: "remote"
      });
      io.emit("state", globalState);
      
      return res.json({ ok: true, message: "State entries updated" });
    }
    
    return res.status(400).json({ ok: false, error: "Invalid request format" });
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

// Global state to store all lottery data
const globalState = {
  numberBoxes: [],
  stateResults: []
};

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
  
  socket.emit("hello", { t: Date.now() });
  
  // Send current state when client requests it
  socket.on("getState", () => {
    socket.emit("state", globalState);
  });
  
  // Handle reset requests from main page
  socket.on("resetAll", (data, callback) => {
    try {
      if (data.pin !== CONTROL_PIN) {
        if (callback) callback({ ok: false, error: "Invalid PIN" });
        return;
      }
      
      // Clear all data
      globalState.numberBoxes = [];
      globalState.stateResults = [];
      
      // Broadcast to all clients
      io.emit("state", globalState);
      
      if (callback) callback({ ok: true });
    } catch (e) {
      console.error("Reset error:", e);
      if (callback) callback({ ok: false, error: "Reset failed" });
    }
  });
  
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

// ----- Listen -----
const PORT = process.env.PORT || 3001;
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
