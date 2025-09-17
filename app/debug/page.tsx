"use client";

import { useEffect, useRef, useState } from "react";
import { getSocket } from "@/lib/socket";

type Msg = { ts: string; text: string };

export default function DebugFriendFeedPage() {
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [lastPing, setLastPing] = useState<string>("-");
  const [wsInfo, setWsInfo] = useState<string>("(waiting)");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const socketRef = useRef<any>(null);

  useEffect(() => {
    const sock = getSocket();
    socketRef.current = sock;

    const onConnect = () => setStatus("connected");
    const onDisconnect = () => setStatus("disconnected");

    // From server: raw text lines mirrored from FRIEND_WS
    const onFriendRaw = (text: string) => {
      const ts = new Date().toLocaleTimeString();
      setMsgs((prev) => [{ ts, text }, ...prev].slice(0, 200)); // keep last 200
    };

    // Optional: if server ever emits parsed JSON too
    const onFriendJson = (obj: any) => {
      const ts = new Date().toLocaleTimeString();
      setMsgs((prev) => [{ ts, text: JSON.stringify(obj) }, ...prev].slice(0, 200));
    };

    // We also mirror a couple of environment hints (logged at server start)
    // Not strictly required, but nice to show here. We'll ask the server for them.
    sock.emit("whoami", null, (info: any) => {
      // If you didn't wire this on the server, it's fine — this callback just won't run.
      if (info && typeof info === "object") {
        setWsInfo(
          `FRIEND_WS_URL=${info.FRIEND_WS_URL || "?"} | SAFE=${String(info.FRIEND_SAFE)}`
        );
      }
    });

    sock.on("connect", onConnect);
    sock.on("disconnect", onDisconnect);
    sock.on("friend-raw", onFriendRaw);
    sock.on("friend-json", onFriendJson);

    const pingInterval = setInterval(() => {
      setLastPing(new Date().toLocaleTimeString());
      try {
        sock.emit("debug-ping");
      } catch {}
    }, 10000);

    return () => {
      clearInterval(pingInterval);
      sock.off("connect", onConnect);
      sock.off("disconnect", onDisconnect);
      sock.off("friend-raw", onFriendRaw);
      sock.off("friend-json", onFriendJson);
    };
  }, []);

  return (
    <div style={{ fontFamily: "system-ui, Arial, sans-serif", padding: 16, color: "#0b1221" }}>
      <h1 style={{ marginTop: 0 }}>Friend Feed Debug</h1>

      <div
        style={{
          display: "grid",
          gap: 8,
          gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
          marginBottom: 16,
        }}
      >
        <Card title="Socket Status">
          <strong>{status.toUpperCase()}</strong>
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>{wsInfo}</div>
        </Card>

        <Card title="Last Ping">
          <div>{lastPing}</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            (This page pings the local Socket.IO every 10s — not the friend feed.)
          </div>
        </Card>
      </div>

      <Card title="Incoming Messages (friend-raw / friend-json)">
        <div
          style={{
            height: "60vh",
            overflow: "auto",
            background: "#0b1221",
            color: "#d6e1ff",
            padding: 12,
            borderRadius: 8,
            border: "1px solid #1b294a",
          }}
        >
          {msgs.length === 0 ? (
            <div style={{ opacity: 0.8 }}>
              Nothing yet. This is expected outside 10 AM–10 PM. Keep this page open — when the
              upstream starts sending, messages will appear here.
            </div>
          ) : (
            msgs.map((m, i) => (
              <pre
                key={i}
                style={{
                  margin: 0,
                  padding: "8px 0",
                  borderBottom: "1px dashed #2a3a64",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                <span style={{ color: "#87c7ff" }}>[{m.ts}]</span> {m.text}
              </pre>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        border: "1px solid #d8e0f5",
        borderRadius: 12,
        padding: 12,
        background: "#f7f9ff",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{title}</div>
      <div>{children}</div>
    </div>
  );
}
