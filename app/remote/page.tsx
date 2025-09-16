"use client";

import { useEffect, useRef, useState } from "react";
import { getSocket } from "@/lib/socket";

export default function RemoteController() {
  const socketRef = useRef<any>(null);

  const [pin, setPin] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [p2, setP2] = useState("");
  const [p3, setP3] = useState("");
  const [p4, setP4] = useState("");
  const [p5, setP5] = useState("");
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    socketRef.current = getSocket();

    const onAck = (msg: any) => {
      setStatus(
        typeof msg === "string"
          ? msg
          : msg?.ok
          ? "✔️ Sent!"
          : msg?.error
          ? `❌ ${msg.error}`
          : "ℹ️ Updated"
      );
    };

    socketRef.current.on("ack", onAck);
    return () => socketRef.current?.off("ack", onAck);
  }, []);

  const emit = (event: string, payload: any = {}) => {
    if (!pin.trim()) {
      setStatus("❌ Enter your controller PIN first.");
      return;
    }
    setStatus("… sending");
    socketRef.current?.emit(event, { pin, ...payload });
  };

  const addToday = () => {
    if (!selectedTime) {
      setStatus("❌ Select a draw time.");
      return;
    }
    emit("controller:add", {
      selectedTime,
      pick2: p2,
      pick3: p3,
      pick4: p4,
      pick5: p5,
    });
    setP2(""); setP3(""); setP4(""); setP5("");
  };

  const resetAll = () => emit("controller:reset");
  const addYesterday = () => emit("controller:addYesterdayNumbers");
  const addTodayStates = () => emit("controller:addTodayStateNumbers");
  const addYesterdayStates = () => emit("controller:addYesterdayStateNumbers");

  const timeOptions = (() => {
    const out: string[] = [];
    for (let h = 10; h < 22; h++) {
      const disp = h > 12 ? h - 12 : h;
      const ap = h >= 12 ? "PM" : "AM";
      out.push(`${disp}:00 ${ap}`);
      out.push(`${disp}:30 ${ap}`);
    }
    return out;
  })();

  const boxStyle: React.CSSProperties = {
    maxWidth: 520,
    margin: "32px auto",
    padding: 16,
    borderRadius: 12,
    boxShadow: "0 6px 24px rgba(0,0,0,0.12)",
    background: "white",
    fontFamily: "ui-sans-serif, system-ui, Arial, Helvetica",
  };

  const row: React.CSSProperties = { display: "grid", gap: 8, marginTop: 12 };
  const grid2: React.CSSProperties = { display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" };
  const label: React.CSSProperties = { fontSize: 12, opacity: 0.8 };
  const input: React.CSSProperties = { padding: "10px 12px", border: "1px solid #ddd", borderRadius: 8 };
  const btn: React.CSSProperties = { padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", cursor: "pointer" };

  return (
    <div style={boxStyle}>
      <h1 style={{ margin: 0, fontSize: 22 }}>📱 Instant Cash – Remote</h1>
      <p style={{ marginTop: 6, color: "#555" }}>
        Use this page from your phone to control the display.  
        Your viewers just open the main site.
      </p>

      <div style={row}>
        <label style={label}>Controller PIN</label>
        <input
          style={input}
          placeholder="Enter your PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
        />
      </div>

      <div style={row}>
        <label style={label}>Draw time</label>
        <select
          style={{ ...input, appearance: "auto" }}
          value={selectedTime}
          onChange={(e) => setSelectedTime(e.target.value)}
        >
          <option value="">Choose a time…</option>
          {timeOptions.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div style={{ ...row, ...grid2 }}>
        <div>
          <label style={label}>Pick 2</label>
          <input style={input} placeholder="12" value={p2} onChange={(e) => setP2(e.target.value)} />
        </div>
        <div>
          <label style={label}>Pick 3</label>
          <input style={input} placeholder="123" value={p3} onChange={(e) => setP3(e.target.value)} />
        </div>
        <div>
          <label style={label}>Pick 4</label>
          <input style={input} placeholder="1234" value={p4} onChange={(e) => setP4(e.target.value)} />
        </div>
        <div>
          <label style={label}>Pick 5</label>
          <input style={input} placeholder="12345" value={p5} onChange={(e) => setP5(e.target.value)} />
        </div>
      </div>

      <div style={{ ...row, ...grid2, marginTop: 16 }}>
        <button style={btn} onClick={addToday}>➕ Add to Today’s Draws</button>
        <button style={btn} onClick={resetAll}>🗑 Reset All</button>
        <button style={btn} onClick={addTodayStates}>🏷 Add Today State Numbers</button>
        <button style={btn} onClick={addYesterdayStates}>🏷 Add Yesterday State Numbers</button>
        <button style={btn} onClick={addYesterday}>📅 Add Yesterday Numbers</button>
      </div>

      <div style={{ marginTop: 12, minHeight: 24, color: "#333" }}>{status}</div>

      <hr style={{ margin: "20px 0" }} />
      <p style={{ fontSize: 12, color: "#777" }}>
        Tip: open <code>/remote</code> on your phone. Your display page will update instantly if your server
        handles the events and re-broadcasts <code>"state"</code>.
      </p>
    </div>
  );
}
