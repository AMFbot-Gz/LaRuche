/**
 * App.jsx — LaRuche HQ Dashboard
 * Layout 3 colonnes :
 *   • Sidebar gauche (navigation + historique missions)
 *   • Zone centrale (ChatFeed + Composer)
 *   • RightPanel (StatusGrid + CostMeter + TelegramConsole)
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import Sidebar         from "./components/Sidebar.jsx";
import ChatFeed        from "./components/ChatFeed.jsx";
import Composer        from "./components/Composer.jsx";
import StatusGrid      from "./components/StatusGrid.jsx";
import CostMeter       from "./components/CostMeter.jsx";
import TelegramConsole from "./components/TelegramConsole.jsx";

const QUEEN_API = import.meta.env.VITE_QUEEN_API || "http://localhost:3000";
const WS_URL    = import.meta.env.VITE_WS_URL    || "ws://localhost:9001";

// ─── Hook WebSocket avec reconnexion auto ─────────────────────────────────────
function useWebSocket(url, onMessage) {
  const wsRef        = useRef(null);
  const reconnectRef = useRef(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    let active = true;

    const connect = () => {
      if (!active) return;
      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onmessage = (e) => {
          try { onMessageRef.current(JSON.parse(e.data)); } catch {}
        };

        ws.onclose = () => {
          if (active) reconnectRef.current = setTimeout(connect, 3000);
        };

        ws.onerror = () => ws.close();
      } catch {}
    };

    connect();

    return () => {
      active = false;
      clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [url]);
}

// ─── TopBar ───────────────────────────────────────────────────────────────────
function TopBar({ status, view }) {
  const labels = { missions: "Missions", agents: "Agents", logs: "Logs" };
  const isOnline = status.status === "online";

  return (
    <div style={{
      height: 52,
      borderBottom: "1px solid var(--border)",
      display: "flex",
      alignItems: "center",
      paddingInline: 24,
      justifyContent: "space-between",
      flexShrink: 0,
      background: "var(--surface)",
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", letterSpacing: "-0.01em" }}>
        {labels[view] || "Missions"}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {/* Ollama latency */}
        {status.ollama && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: status.ollama.ok ? "var(--green)" : "var(--red)",
              boxShadow: status.ollama.ok ? "0 0 6px var(--green)" : "none",
            }} />
            <span style={{ color: "var(--text-3)" }}>
              Ollama {status.ollama.ok ? `${status.ollama.latencyMs}ms` : "offline"}
            </span>
          </div>
        )}

        {/* API status */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: isOnline ? "var(--green)" : "var(--red)",
            boxShadow: isOnline ? "0 0 6px var(--green)" : "none",
          }} />
          <span style={{ color: "var(--text-3)" }}>
            {isOnline ? `API ${status.version || "3.2.0"}` : "Déconnecté"}
          </span>
        </div>

        {/* Uptime */}
        {status.uptime && (
          <div style={{ fontSize: 11, color: "var(--text-3)" }}>
            {Math.floor(status.uptime / 60)}m uptime
          </div>
        )}
      </div>
    </div>
  );
}

// ─── RightPanel — StatusGrid + CostMeter + TelegramConsole ───────────────────
function RightPanel({ status, missions, wsEvents, logs }) {
  // Calcul des tokens totaux depuis les missions pour CostMeter
  const totalTokens = missions.reduce((acc, m) => acc + (m.tokens || 0), 0) || undefined;

  // Dérivation des agents depuis status.models pour StatusGrid
  const agentsProp = React.useMemo(() => {
    const models = status.models || {};
    if (Object.keys(models).length === 0) return undefined; // laisse StatusGrid gérer le fetch
    return [
      {
        id: "strategist",
        name: "Stratège",
        icon: "🧠",
        color: "var(--violet)",
        model: models.strategist || "—",
        status: missions.some(m => m.status === "running") ? "running" : "idle",
        tokensPerSec: 0,
        lastTask: "En attente...",
      },
      {
        id: "architect",
        name: "Architecte",
        icon: "⚡",
        color: "var(--blue)",
        model: models.architect || "—",
        status: "idle",
        tokensPerSec: 0,
        lastTask: "En attente...",
      },
      {
        id: "worker",
        name: "Worker",
        icon: "🔧",
        color: "var(--amber)",
        model: models.worker || "—",
        status: "idle",
        tokensPerSec: 0,
        lastTask: "En attente...",
      },
      {
        id: "vision",
        name: "Vision",
        icon: "👁",
        color: "var(--cyan)",
        model: models.vision || "—",
        status: "idle",
        tokensPerSec: 0,
        lastTask: "En attente...",
      },
    ];
  }, [status.models, missions]);

  return (
    <aside style={{
      width: "var(--right-panel-w)",
      flexShrink: 0,
      borderLeft: "1px solid var(--border)",
      background: "var(--surface)",
      display: "flex",
      flexDirection: "column",
      height: "100%",
      overflow: "hidden",
    }}>
      {/* ── StatusGrid (agents IA) ── */}
      <div style={{ flexShrink: 0 }}>
        <StatusGrid agents={agentsProp} />
      </div>

      {/* ── Séparateur ── */}
      <div style={{ height: 1, background: "var(--border)", marginInline: 12, flexShrink: 0 }} />

      {/* ── CostMeter (ressources / tokens) ── */}
      <div style={{ padding: "12px 12px 8px", flexShrink: 0 }}>
        <CostMeter totalTokens={totalTokens || undefined} />
      </div>

      {/* ── Séparateur ── */}
      <div style={{ height: 1, background: "var(--border)", marginInline: 12, flexShrink: 0 }} />

      {/* ── TelegramConsole (logs WS temps réel, scrollable) ── */}
      <div style={{
        flex: 1,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        padding: "8px 12px 12px",
        minHeight: 0,
      }}>
        <div style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--text-3)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 8,
          flexShrink: 0,
        }}>
          Terminal
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          <TelegramConsole />
        </div>
      </div>
    </aside>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [missions,        setMissions]        = useState([]);
  const [activeMissionId, setActiveMissionId] = useState(null);
  const [status,          setStatus]          = useState({});
  const [wsEvents,        setWsEvents]        = useState([]);
  const [logs,            setLogs]            = useState([]);
  const [sidebarView,     setSidebarView]     = useState("missions");
  const [suggestedCommand, setSuggestedCommand] = useState("");

  // ─── Chargement des données ─────────────────────────────────────────────────
  const loadMissions = useCallback(async () => {
    try {
      const r = await fetch(`${QUEEN_API}/api/missions?limit=20`);
      if (r.ok) {
        const d = await r.json();
        setMissions(d.missions || []);
      }
    } catch {}
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const r = await fetch(`${QUEEN_API}/api/status`);
      if (r.ok) setStatus(await r.json());
    } catch {}
  }, []);

  useEffect(() => {
    loadMissions();
    loadStatus();
    const interval = setInterval(() => { loadMissions(); loadStatus(); }, 6000);
    return () => clearInterval(interval);
  }, [loadMissions, loadStatus]);

  // ─── WebSocket events ───────────────────────────────────────────────────────
  useWebSocket(WS_URL, useCallback((event) => {
    const ts = new Date().toLocaleTimeString("fr-FR");
    setWsEvents(prev => [...prev.slice(-100), event]);
    setLogs(prev => [
      ...prev.slice(-200),
      `[${ts}] ${event.type}${event.command ? " · " + event.command.substring(0, 50) : ""}`,
    ]);
    if (event.type === "mission_complete" || event.type === "mission_error") {
      loadMissions();
    }
  }, [loadMissions]));

  // ─── Handlers mission ───────────────────────────────────────────────────────
  const handleMissionStart = useCallback((id, cmd) => {
    setActiveMissionId(id);
    setSidebarView("missions");
    const ts = new Date().toLocaleTimeString("fr-FR");
    setLogs(prev => [...prev.slice(-200), `[${ts}] mission_start · ${cmd.substring(0, 60)}`]);
  }, []);

  const handleMissionComplete = useCallback((mission) => {
    loadMissions();
    const ts = new Date().toLocaleTimeString("fr-FR");
    setLogs(prev => [
      ...prev.slice(-200),
      `[${ts}] mission_${mission.status} · ${(mission.duration / 1000).toFixed(1)}s`,
    ]);
  }, [loadMissions]);

  return (
    <div style={{
      display: "flex",
      height: "100vh",
      background: "var(--bg)",
      overflow: "hidden",
    }}>
      {/* ── Sidebar gauche ── */}
      <Sidebar
        missions={missions}
        status={status}
        activeMissionId={activeMissionId}
        onSelectMission={setActiveMissionId}
        view={sidebarView}
        onViewChange={setSidebarView}
        logs={logs}
      />

      {/* ── Zone centrale ── */}
      <main style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        minWidth: 0,
        background: "var(--bg)",
      }}>
        {/* TopBar */}
        <TopBar status={status} view={sidebarView} />

        {/* Feed conversations */}
        <ChatFeed
          missions={missions}
          activeMissionId={activeMissionId}
          wsEvents={wsEvents}
          onRefresh={loadMissions}
          onSuggest={setSuggestedCommand}
        />

        {/* Composer */}
        <Composer
          status={status}
          onMissionStart={handleMissionStart}
          onMissionComplete={handleMissionComplete}
          prefillCommand={suggestedCommand}
          onPrefillConsumed={() => setSuggestedCommand("")}
        />
      </main>

      {/* ── Panneau droit ── */}
      <RightPanel
        status={status}
        missions={missions}
        wsEvents={wsEvents}
        logs={logs}
      />
    </div>
  );
}
