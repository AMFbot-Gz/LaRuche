/**
 * App.jsx — LaRuche HQ Dashboard
 * Dark theme #0D0D1A, accents gold #F5A623 + purple #7C3AED
 * StatusGrid | MissionFeed | CostMeter | LogStream | GodButton | TelegramConsole
 */

import React, { useState, useEffect, useRef, useCallback } from "react";

const API = "http://localhost:8080";
const WS_URL = "ws://localhost:8080";

// ─── Styles ───────────────────────────────────────────────────────────────────
const colors = {
  bg: "#0D0D1A",
  surface: "#1A1A2E",
  border: "rgba(124, 58, 237, 0.3)",
  gold: "#F5A623",
  purple: "#7C3AED",
  green: "#22C55E",
  red: "#EF4444",
  text: "#E0E0E0",
  muted: "#64748B",
};

const card = {
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: 12,
  padding: 16,
};

// ─── Hook WebSocket ───────────────────────────────────────────────────────────
function useWebSocket(url, onMessage) {
  const ws = useRef(null);

  useEffect(() => {
    const connect = () => {
      try {
        ws.current = new WebSocket(url);
        let lastMsg = 0;
        ws.current.onmessage = (e) => {
          const now = Date.now();
          if (now - lastMsg < 100) return; // max 10 events/s
          lastMsg = now;
          try { onMessage(JSON.parse(e.data)); } catch {}
        };
        ws.current.onclose = () => setTimeout(connect, 3000);
      } catch {}
    };
    connect();
    return () => ws.current?.close();
  }, [url]);

  return ws;
}

// ─── StatusGrid ───────────────────────────────────────────────────────────────
const StatusGrid = React.memo(function StatusGrid({ status }) {
  const services = [
    { name: "Queen", key: "queen", online: true },
    { name: "Ollama", key: "ollama", online: status.ollama },
    { name: "HUD", key: "hud", online: status.hud },
    { name: "Vault", key: "vault", online: status.vault },
  ];

  return (
    <div style={{ ...card, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      <div style={{ gridColumn: "1/-1", color: colors.gold, fontSize: 12, marginBottom: 4 }}>
        ⚡ SERVICES
      </div>
      {services.map((s) => (
        <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
          <div style={{
            width: 6, height: 6, borderRadius: "50%",
            background: s.online ? colors.green : colors.muted,
            boxShadow: s.online ? `0 0 6px ${colors.green}` : "none",
          }} />
          <span style={{ color: s.online ? colors.text : colors.muted }}>{s.name}</span>
        </div>
      ))}
    </div>
  );
});

// ─── MissionFeed ─────────────────────────────────────────────────────────────
const MissionFeed = React.memo(function MissionFeed({ missions }) {
  return (
    <div style={{ ...card, flex: 1, overflowY: "auto", maxHeight: 280 }}>
      <div style={{ color: colors.gold, fontSize: 12, marginBottom: 8 }}>📋 MISSIONS RÉCENTES</div>
      {missions.length === 0 && (
        <div style={{ color: colors.muted, fontSize: 11 }}>Aucune mission pour l'instant.</div>
      )}
      {missions.slice(0, 10).map((m, i) => (
        <div key={i} style={{
          borderBottom: `1px solid rgba(255,255,255,0.05)`,
          padding: "6px 0",
          fontSize: 11,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{
              color: m.status === "success" ? colors.green : colors.red,
              marginRight: 8,
            }}>
              {m.status === "success" ? "✓" : "✗"}
            </span>
            <span style={{ color: colors.text, flex: 1 }}>
              {m.command?.substring(0, 50)}
            </span>
            <span style={{ color: colors.muted }}>
              {(m.duration_ms / 1000).toFixed(1)}s
            </span>
          </div>
        </div>
      ))}
    </div>
  );
});

// ─── CostMeter ────────────────────────────────────────────────────────────────
const CostMeter = React.memo(function CostMeter({ costs }) {
  return (
    <div style={card}>
      <div style={{ color: colors.gold, fontSize: 12, marginBottom: 8 }}>💰 COÛTS TOKENS</div>
      <div style={{ display: "flex", gap: 16 }}>
        <div>
          <div style={{ color: colors.muted, fontSize: 10 }}>Aujourd'hui</div>
          <div style={{ color: colors.green, fontSize: 18, fontWeight: "bold" }}>
            ${(costs.daily || 0).toFixed(4)}
          </div>
        </div>
        <div>
          <div style={{ color: colors.muted, fontSize: 10 }}>Total</div>
          <div style={{ color: colors.text, fontSize: 18 }}>
            ${(costs.total || 0).toFixed(4)}
          </div>
        </div>
      </div>
    </div>
  );
});

// ─── GodButton ────────────────────────────────────────────────────────────────
const GodButton = React.memo(function GodButton() {
  const kill = async () => {
    await fetch(`${API}/api/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "KILL_ALL" }),
    });
  };
  const resurrect = async () => {
    await fetch(`${API}/api/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "RESURRECT" }),
    });
  };

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button
        onClick={kill}
        style={{
          flex: 1,
          background: "rgba(239, 68, 68, 0.15)",
          border: `1px solid ${colors.red}`,
          color: colors.red,
          padding: "10px",
          borderRadius: 8,
          cursor: "pointer",
          fontSize: 13,
          fontWeight: "bold",
        }}
      >
        🛑 KILL ALL
      </button>
      <button
        onClick={resurrect}
        style={{
          flex: 1,
          background: "rgba(34, 197, 94, 0.15)",
          border: `1px solid ${colors.green}`,
          color: colors.green,
          padding: "10px",
          borderRadius: 8,
          cursor: "pointer",
          fontSize: 13,
          fontWeight: "bold",
        }}
      >
        ⚡ RESURRECT
      </button>
    </div>
  );
});

// ─── TelegramConsole ─────────────────────────────────────────────────────────
const TelegramConsole = React.memo(function TelegramConsole() {
  const [input, setInput] = useState("");
  const [log, setLog] = useState([]);

  const send = async () => {
    if (!input.trim()) return;
    const cmd = input.trim();
    setInput("");
    setLog((prev) => [...prev, `> ${cmd}`]);
    try {
      const res = await fetch(`${API}/api/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd }),
      });
      const data = await res.json();
      setLog((prev) => [...prev, data.success ? "✓ Envoyé" : `✗ ${data.error}`]);
    } catch (e) {
      setLog((prev) => [...prev, `✗ ${e.message}`]);
    }
  };

  return (
    <div style={{ ...card, flex: 1 }}>
      <div style={{ color: colors.gold, fontSize: 12, marginBottom: 8 }}>💬 CONSOLE TELEGRAM</div>
      <div style={{ height: 100, overflowY: "auto", fontSize: 10, color: colors.muted, marginBottom: 8, fontFamily: "monospace" }}>
        {log.map((l, i) => <div key={i}>{l}</div>)}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Envoyer une commande..."
          style={{
            flex: 1,
            background: "rgba(255,255,255,0.05)",
            border: `1px solid ${colors.border}`,
            borderRadius: 6,
            padding: "6px 10px",
            color: colors.text,
            fontSize: 12,
            outline: "none",
          }}
        />
        <button
          onClick={send}
          style={{
            background: colors.purple,
            border: "none",
            borderRadius: 6,
            color: "white",
            padding: "6px 14px",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          ▶
        </button>
      </div>
    </div>
  );
});

// ─── LogStream ────────────────────────────────────────────────────────────────
function LogStream({ logs }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [logs]);

  return (
    <div style={{ ...card, flex: 1 }}>
      <div style={{ color: colors.gold, fontSize: 12, marginBottom: 8 }}>📜 LOGS TEMPS RÉEL</div>
      <div ref={ref} style={{ height: 150, overflowY: "auto", fontSize: 10, fontFamily: "monospace" }}>
        {logs.slice(-100).map((l, i) => (
          <div key={i} style={{ color: l.includes("ERROR") ? colors.red : colors.muted, padding: "1px 0" }}>
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
function App() {
  const [status, setStatus] = useState({});
  const [missions, setMissions] = useState([]);
  const [costs, setCosts] = useState({ daily: 0, total: 0 });
  const [logs, setLogs] = useState(["LaRuche HQ connecté..."]);

  // Chargement initial
  useEffect(() => {
    const load = async () => {
      try {
        const [statusRes, missionsRes, costsRes] = await Promise.all([
          fetch(`${API}/api/status`).then((r) => r.json()),
          fetch(`${API}/api/missions`).then((r) => r.json()),
          fetch(`${API}/api/costs`).then((r) => r.json()),
        ]);
        setStatus(statusRes);
        setMissions(missionsRes.missions || []);
        setCosts(costsRes);
      } catch (e) {
        setLogs((prev) => [...prev, `Erreur chargement: ${e.message}`]);
      }
    };
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  // WebSocket temps réel
  useWebSocket(WS_URL, (event) => {
    if (event.type === "mission_complete") {
      fetch(`${API}/api/missions`).then((r) => r.json()).then((d) => setMissions(d.missions || []));
      fetch(`${API}/api/costs`).then((r) => r.json()).then(setCosts);
    }
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${event.type}: ${event.command || event.task || ""}`]);
  });

  return (
    <div style={{
      background: colors.bg,
      minHeight: "100vh",
      padding: 20,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
      color: colors.text,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 24 }}>🐝</div>
        <div style={{ marginLeft: 12 }}>
          <div style={{ fontSize: 18, fontWeight: "bold", color: colors.gold }}>LaRuche HQ</div>
          <div style={{ fontSize: 11, color: colors.muted }}>v3.0 SINGULARITY — Ghost Swarm</div>
        </div>
      </div>

      {/* Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr 280px", gap: 16 }}>
        {/* Colonne gauche */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <StatusGrid status={status} />
          <CostMeter costs={costs} />
          <GodButton />
        </div>

        {/* Colonne centrale */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <MissionFeed missions={missions} />
          <LogStream logs={logs} />
        </div>

        {/* Colonne droite */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <TelegramConsole />
        </div>
      </div>
    </div>
  );
}

export default React.memo(App);
