// server.js
const http = require("http");
const next = require("next");
const express = require("express");
const { Server } = require("socket.io");

// web-scraper helper
const scrapeFriend = require("./lib/scrapeFriend");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

const CONTROLLER_PIN = process.env.CONTROLLER_PIN || "2468";

// ---- scraper env (PRINT THEM SO WE KNOW WHAT THE PROCESS SEES) ----
const FRIEND_WS_URL = process.env.FRIEND_WS_URL || "";
const FRIEND_SAFE = process.env.FRIEND_SAFE === "1"; // "1" means safe mode on

console.log("[env] FRIEND_WS_URL =", FRIEND_WS_URL || "(empty)");
console.log("[env] FRIEND_SAFE   =", process.env.FRIEND_SAFE ?? "(unset)");

// In-memory shared state
let state = {
  numberBoxes: [],
  stateResults: [],
  lastUpdated: null,
};

// ---------- helpers ----------
function nyNow() {
  const now = new Date();
  return new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
}
function nextDrawTimeNY() {
  const nowNY = nyNow();
  const drawTimes = [];
  for (let h = 10; h < 22; h++) {
    drawTimes.push(new Date(nowNY.getFullYear(), nowNY.getMonth(), nowNY.getDate(), h, 0, 0, 0));
    drawTimes.push(new Date(nowNY.getFullYear(), nowNY.getMonth(), nowNY.getDate(), h, 30, 0, 0));
  }
  for (const t of drawTimes) if (t > nowNY) return t;
  const tomorrow = new Date(nowNY);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 10, 0, 0, 0);
}
function toDigitsArray(str) {
  if (!str || typeof str !== "string") return [];
  return str
    .trim()
    .split("")
    .map((c) => parseInt(c, 10))
    .filter((n) => !Number.isNaN(n) && n >= 0 && n <= 9);
}
function sameNYDate(d1, d2) {
  const a = new Date(d1);
  const b = new Date(d2);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

app.prepare().then(() => {
  const exp = express();
  exp.use(express.json());

  // Create HTTP server from Express so Socket.IO and Next share it
  const server = http.createServer(exp);
  const io = new Server(server, { cors: { origin: "*" } });

  io.on("connection", (socket) => {
    // Send current state immediately
    socket.emit("state", state);

    // Optional: reset via socket
    socket.on("resetAll", ({ pin }, ack) => {
      if (pin !== CONTROLLER_PIN) return ack?.({ ok: false, error: "Invalid PIN" });
      state = { numberBoxes: [], stateResults: [], lastUpdated: Date.now() };
      io.emit("state", state);
      ack?.({ ok: true });
    });
  });

  // -----------------------------
  // Remote controller HTTP API
  // -----------------------------
  // POST /api/remote
  exp.post("/api/remote", (req, res) => {
    try {
      const {
        pin,
        selectedTime,
        pick2,
        pick3,
        pick4,
        pick5,
        stateEntries,
        action,
      } = req.body || {};

      if (!pin || pin !== CONTROLLER_PIN) {
        return res.status(401).json({ ok: false, error: "Invalid PIN" });
      }

      // Handle reset if requested
      if (action === "resetAll") {
        state = { numberBoxes: [], stateResults: [], lastUpdated: Date.now() };
        io.emit("state", state);
        return res.json({ ok: true, reset: true });
      }

      // Add today's draw numbers if provided
      const p2 = toDigitsArray(pick2);
      const p3 = toDigitsArray(pick3);
      const p4 = toDigitsArray(pick4);
      const p5 = toDigitsArray(pick5);
      const hasAnyPick = p2.length || p3.length || p4.length || p5.length;

      if (hasAnyPick) {
        if (!selectedTime || typeof selectedTime !== "string" || !selectedTime.trim()) {
          return res.status(400).json({ ok: false, error: "Missing selectedTime" });
        }

        const drawTime = nextDrawTimeNY();
        const chosen = selectedTime.trim();

        // Prevent duplicate draw time for the same NY day
        const duplicate = state.numberBoxes.some((b) => {
          return b.time === chosen && sameNYDate(new Date(b.drawTime), drawTime);
        });
        if (duplicate) {
          return res
            .status(409)
            .json({ ok: false, error: `Draw time "${chosen}" already added for today` });
        }

        const newBox = {
          id: Date.now().toString(),
          date: drawTime.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
          time: chosen,
          drawTime,
          pick2: p2,
          pick3: p3,
          pick4: p4,
          pick5: p5,
        };
        state.numberBoxes = [newBox, ...state.numberBoxes];
      }

      // Add optional state lottery entries
      if (Array.isArray(stateEntries) && stateEntries.length) {
        const now = nyNow();
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);

        for (const entry of stateEntries) {
          const sName = entry?.state;
          const t = entry?.type === "yesterday" ? "yesterday" : "today";
          const p3s = toDigitsArray(entry?.pick3);
          const p4s = toDigitsArray(entry?.pick4);
          if (!sName) continue;
          if (p3s.length === 3 || p4s.length === 4) {
            state.stateResults.push({
              id: `${t}-${sName}-${Date.now()}`,
              state: sName,
              pick3: p3s,
              pick4: p4s,
              type: t,
              timestamp: t === "yesterday" ? yesterday : now,
            });
          }
        }
      }

      state.lastUpdated = Date.now();
      io.emit("state", state);
      return res.json({ ok: true });
    } catch (err) {
      console.error("Error in /api/remote:", err);
      return res.status(500).json({ ok: false, error: "Server error" });
    }
  });

  // -------------------------------------------------------
  // DEV: raw scrape preview (no state change, just returns HTML)
  // -------------------------------------------------------
  exp.get("/api/dev/scrape-friend/raw", async (req, res) => {
    try {
      const html = await scrapeFriend.fetchRaw();
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.status(200).send(html.slice(0, 20000)); // first 20k chars
    } catch (err) {
      console.error("scrape-friend/raw error:", err?.message || err);
      res.status(500).json({ ok: false, error: err?.message || "scrape failed" });
    }
  });

  // Hand off everything else to Next.js
  // Express 5 + path-to-regexp v6: use a RegExp for "match everything"
  exp.all(/.*/, (req, res) => handle(req, res));

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`✔ Server running at http://0.0.0.0:${PORT}`);

    // ---- start scraper ONCE with the env we printed above ----
    // If FRIEND_WS_URL is empty, start in safe mode (no connect) so we still get helpful logs.
    const opts = {
      wsUrl: FRIEND_WS_URL,
      safe: FRIEND_WS_URL ? FRIEND_SAFE : true,
    };
    scrapeFriend.start(opts);
  });
});
