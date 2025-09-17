// lib/scrapeFriend.js
// WebSocket listener for your friend's feed.
// Safe mode logic: FRIEND_SAFE = 0|false|no|off  --> CONNECT
//                   anything else                 --> DO NOT CONNECT

const http = require("http");

function isSafeMode() {
  const v = String(process.env.FRIEND_SAFE || "1").toLowerCase().trim();
  return !["0", "false", "no", "off"].includes(v); // true = safe (no ws), false = connect
}

// Optional: preview helper used by /api/dev/scrape-friend/raw
async function fetchRaw() {
  const url = process.env.FRIEND_SOURCE_URL;
  if (!url) throw new Error("FRIEND_SOURCE_URL is not set");

  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
  });
}

// Try a few common subscription messages after open.
// These are harmless if the server ignores them.
function sendPossibleSubscriptions(ws) {
  const candidates = [
    // JSON-ish
    JSON.stringify({ action: "subscribe", channel: "draws" }),
    JSON.stringify({ subscribe: "draws" }),
    JSON.stringify({ type: "subscribe", topic: "draws" }),
    JSON.stringify({ event: "subscribe", feed: "draws" }),
    // Plain strings
    "SUBSCRIBE draws",
    "subscribe draws",
    "ping",
  ];

  for (const msg of candidates) {
    try {
      ws.send(msg);
    } catch {}
  }
}

function start(io) {
  const SAFE = isSafeMode();
  const wsUrl = process.env.FRIEND_WS_URL;

  if (SAFE) {
    console.log("[scrapeFriend] start() called (safe mode: no websocket connect).");
    return;
  }
  if (!wsUrl) {
    console.log("[scrapeFriend] FRIEND_WS_URL is not set; cannot connect.");
    return;
  }

  console.log(`[scrapeFriend] connecting to ${wsUrl}`);

  let WebSocket;
  try {
    WebSocket = require("ws");
  } catch (e) {
    console.error("[scrapeFriend] 'ws' package not installed. Run: npm i ws");
    return;
  }

  let ws;
  let reconnectTimer = null;
  let heartbeatTimer = null;

  const clearTimers = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const scheduleReconnect = () => {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      console.log("[scrapeFriend] reconnecting...");
      connect();
    }, 5000);
  };

  const connect = () => {
    ws = new WebSocket(wsUrl);

    ws.on("open", () => {
      console.log("[scrapeFriend] WS open");
      // Try to subscribe to something the server recognizes
      sendPossibleSubscriptions(ws);

      // Heartbeat every 25s (some proxies close idle conns)
      heartbeatTimer = setInterval(() => {
        try { ws.send("ping"); } catch {}
      }, 25000);
    });

    ws.on("message", (data) => {
      try {
        const text = typeof data === "string" ? data : data.toString("utf8");
        console.log("[scrapeFriend] WS message:", text.slice(0, 200));

        // Try parse JSON; emit both raw and json to browsers (optional)
        io.emit("friend-raw", text);
        try {
          const parsed = JSON.parse(text);
          io.emit("friend-json", parsed);
        } catch {
          // not JSON, ignore
        }

        // NOTE: Once we learn the exact schema the server sends,
        // we will map it into your /api/remote format and push to state.
      } catch (err) {
        console.error("[scrapeFriend] WS message parse error:", err.message || err);
      }
    });

    ws.on("close", (code) => {
      console.log("[scrapeFriend] WS closed", code);
      clearTimers();
      scheduleReconnect();
    });

    ws.on("error", (err) => {
      console.error("[scrapeFriend] WS error:", err && err.message ? err.message : err);
      try { ws.close(); } catch {}
    });
  };

  connect();
}

module.exports = {
  start,
  fetchRaw,
};
