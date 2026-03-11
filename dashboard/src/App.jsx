/**
 * App.jsx — LaRuche HQ Dashboard
 * Design inspiré Claude.ai — sidebar + main chat area
 * Theme : warm dark, terracotta orange accent
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import Sidebar from "./components/Sidebar.jsx";
import ChatFeed from "./components/ChatFeed.jsx";
import Composer from "./components/Composer.jsx";

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

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [missions,       setMissions]       = useState([]);
  const [activeMissionId, setActiveMissionId] = useState(null);
  const [status,         setStatus]         = useState({});
  const [wsEvents,       setWsEvents]       = useState([]);
  const [logs,           setLogs]           = useState([]);
  const [sidebarView,    setSidebarView]    = useState("missions");

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
      {/* ── Sidebar ── */}
      <Sidebar
        missions={missions}
        status={status}
        activeMissionId={activeMissionId}
        onSelectMission={setActiveMissionId}
        view={sidebarView}
        onViewChange={setSidebarView}
        logs={logs}
      />

      {/* ── Zone principale ── */}
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
        />

        {/* Composer */}
        <Composer
          status={status}
          onMissionStart={handleMissionStart}
          onMissionComplete={handleMissionComplete}
        />
      </main>
    </div>
  );
}
