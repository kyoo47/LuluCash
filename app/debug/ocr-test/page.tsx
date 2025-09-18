"use client";
import { useEffect, useState } from "react";

export default function OCRParseDebug() {
  const [img, setImg] = useState("/ocr-lottopic.png"); // change if your file name is different
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState<string>("");
  const [groups, setGroups] = useState<{ len: number; items: string[] }[]>([]);

  async function run() {
    setLoading(true);
    setError(null);
    setRaw("");
    setGroups([]);

    try {
      const url = `/api/ocr?img=${encodeURIComponent(img)}`;
      const res = await fetch(url);
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const text: string = data?.text || "";

      setRaw(text);

      // Normalize OCR text: remove weird non-ascii, convert to lines
      const normalized = text
        .replace(/[^\x20-\x7E\n]/g, " ") // strip non-printable
        .replace(/[I|]/g, "1")           // common OCR confusion
        .replace(/[O]/g, "0");           // O vs 0
      const tokens = normalized
        .split(/\s+/)
        .map((t) => t.trim())
        .filter(Boolean);

      // Collect only pure digit tokens, but keep 2..5 long
      const digitTokens = tokens.filter((t) => /^\d{2,5}$/.test(t));

      // Bucket by length
      const byLen = new Map<number, string[]>();
      for (const t of digitTokens) {
        const L = t.length;
        if (L < 2 || L > 5) continue;
        if (!byLen.has(L)) byLen.set(L, []);
        byLen.get(L)!.push(t);
      }

      // Build view data
      const result: { len: number; items: string[] }[] = [2, 3, 4, 5].map((L) => ({
        len: L,
        items: (byLen.get(L) || []).slice(0, 200), // cap just in case
      }));

      setGroups(result);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // auto-run on first load
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ fontFamily: "system-ui, Arial", padding: 16, lineHeight: 1.4 }}>
      <h1>OCR → Digit Extractor (debug)</h1>
      <p>
        Image path (from <code>/public</code>):{" "}
        <input
          value={img}
          onChange={(e) => setImg(e.target.value)}
          style={{ padding: 6, width: 360 }}
          placeholder="/ocr-lottopic.png"
        />
        <button
          onClick={run}
          disabled={loading}
          style={{ marginLeft: 12, padding: "6px 12px", cursor: "pointer" }}
        >
          {loading ? "Running..." : "Run OCR"}
        </button>
      </p>

      {error && (
        <div style={{ color: "white", background: "#c0392b", padding: 10, borderRadius: 6 }}>
          Error: {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 16, marginTop: 16 }}>
        {groups.map((g) => (
          <div key={g.len} style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
            <h3 style={{ marginTop: 0 }}>
              {g.len === 2 && "Pick 2 candidates"}
              {g.len === 3 && "Pick 3 candidates"}
              {g.len === 4 && "Pick 4 candidates"}
              {g.len === 5 && "Pick 5 candidates"}
            </h3>
            {g.items.length === 0 ? (
              <div style={{ color: "#666" }}>— none found —</div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {g.items.map((t, i) => (
                  <span key={i} style={{ padding: "6px 8px", border: "1px solid #ccc", borderRadius: 8 }}>
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <details style={{ marginTop: 20 }}>
        <summary style={{ cursor: "pointer" }}>Show raw OCR text</summary>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            background: "#f6f8fa",
            padding: 12,
            borderRadius: 8,
            maxHeight: 300,
            overflow: "auto",
          }}
        >
{raw}
        </pre>
      </details>
    </div>
  );
}
