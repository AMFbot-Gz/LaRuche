/**
 * Overview.jsx — Page d'accueil du dashboard LaRuche
 * Stat cards + sparkline SVG + ChatFeed + Composer + Ollama indicator
 */

import React, { useState, useEffect, useCallback } from "react";
import ChatFeed from "../ChatFeed.jsx";
import Composer from "../Composer.jsx";

const QUEEN_API = import.meta.env.VITE_QUEEN_API || "http://localhost:3000";

// ─── Skeleton shimmer ─────────────────────────────────────────────────────────
function Skeleton({ w = "100%", h = 16, radius = 6 }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: radius,
      background: "linear-gradient(90deg, var(--surface-2) 25%, var(--surface-3) 50%, var(--surface-2) 75%)",
      backgroundSize: "400px 100%",
      animation: "shimmer 1.5s infinite",
    }} />
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color, icon, loading }) {
  return (
    <div style={{
      background: "var(--surface-2)",
      border: "1px solid var(--border-2)",
      borderRadius: "var(--radius-lg)",
      padding: "20px 24px",
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{
          fontSize: 12,
          color: "var(--text-3)",
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}>{label}</span>
        <span style={{ fontSize: 20 }}>{icon}</span>
      </div>
      {loading ? (
        <Skeleton h={36} radius={6} />
      ) : (
        <div style={{
          fontSize: 32,
          fontWeight: 700,
          color: color || "var(--text)",
          letterSpacing: "-0.02em",
        }}>{value}</div>
      )}
      {sub && !loading && (
        <div style={{ fontSize: 12, color: "var(--text-3)" }}>{sub}</div>
      )}
      {loading && <Skeleton w="60%" h={12} />}
    </div>
  );
}

// ─── Sparkline SVG inline ─────────────────────────────────────────────────────
function Sparkline({ data = [], color = "var(--primary)", width = 120, height = 40 }) {
  if (!data || data.length < 2) {
    return <div style={{ width, height, opacity: 0.3, background: "var(--surface-3)", borderRadius: 4 }} />;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 6) - 3;
    return `${x},${y}`;
  });
  const polyline = pts.join(" ");
  // Zone remplie
  const fillPts = `0,${height} ${polyline} ${width},${height}`;

  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={`sg-${color.replace(/[^a-z0-9]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={fillPts}
        fill={`url(#sg-${color.replace(/[^a-z0-9]/gi, "")})`}
      />
      <polyline
        points={polyline}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}


// ─── Overview ─────────────────────────────────────────────────────────────────
export default function Overview({ status: statusProp, wsEvents = [] }) {
  const [status,   setStatus]   = useState(statusProp || null);
  const [missions, setMissions] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [activeMissionId, setActiveMissionId] = useState(null);
  const [prefillCommand,  setPrefillCommand]  = useState("");

  // Données sparkline mockées avec animation légère
  const [sparkData, setSparkData] = useState([4, 7, 3, 9, 5, 11, 8, 14, 10, 12, 9, 16]);

  // Sync status from parent prop when it changes
  useEffect(() => {
    if (statusProp) setStatus(statusProp);
  }, [statusProp]);

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, missionsRes] = await Promise.all([
        fetch(`${QUEEN_API}/api/status`).catch(() => null),
        fetch(`${QUEEN_API}/api/missions?limit=12`).catch(() => null),
      ]);

      if (statusRes?.ok)   setStatus(await statusRes.json());
      if (missionsRes?.ok) {
        const d = await missionsRes.json();
        setMissions(d.missions || []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Animation sparkline — ajoute un point toutes les 3s
  useEffect(() => {
    const t = setInterval(() => {
      setSparkData(prev => {
        const last = prev[prev.length - 1];
        const next = Math.max(1, Math.min(20, last + (Math.random() * 4 - 2)));
        return [...prev.slice(1), Math.round(next)];
      });
    }, 3000);
    return () => clearInterval(t);
  }, []);

  // Stats calculées
  const totalMissions  = status?.missions?.total || 0;
  const successMissions = status?.missions?.success || 0;
  const successRate    = totalMissions > 0
    ? Math.round((successMissions / totalMissions) * 100)
    : 0;
  const activeAgents   = status?.models ? Object.keys(status.models).length : 0;
  const uptimeMin      = status?.uptime ? Math.floor(status.uptime / 60) : 0;
  const uptimeDisplay  = uptimeMin >= 60
    ? `${Math.floor(uptimeMin / 60)}h ${uptimeMin % 60}m`
    : `${uptimeMin}m`;

  const ollamaOk      = status?.ollama?.ok;
  const ollamaLatency = status?.ollama?.latencyMs;

  return (
    <div style={{
      flex: 1,
      overflowY: "auto",
      padding: "28px 32px",
      display: "flex",
      flexDirection: "column",
      gap: 28,
    }}>
      {/* Erreur réseau */}
      {error && (
        <div style={{
          padding: "10px 16px",
          background: "rgba(248,113,113,0.07)",
          border: "1px solid rgba(248,113,113,0.2)",
          borderRadius: "var(--radius)",
          fontSize: 13,
          color: "var(--red)",
        }}>
          ⚠ Impossible de contacter l'API : {error}
        </div>
      )}

      {/* ── Section titre ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em", marginBottom: 4 }}>
            Vue d'ensemble
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-3)" }}>
            Tableau de bord LaRuche HQ
          </p>
        </div>
        {/* Indicateur Ollama */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 14px",
          background: "var(--surface-2)",
          border: "1px solid var(--border-2)",
          borderRadius: "var(--radius)",
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: ollamaOk ? "var(--green)" : ollamaOk === false ? "var(--red)" : "var(--text-3)",
            boxShadow: ollamaOk ? "0 0 7px var(--green)" : "none",
            flexShrink: 0,
          }} />
          <span style={{ fontSize: 12, color: "var(--text-2)" }}>
            Ollama {ollamaOk ? `${ollamaLatency}ms` : ollamaOk === false ? "hors ligne" : "…"}
          </span>
          {status?.ollama?.model && (
            <span style={{
              fontSize: 11,
              color: "var(--text-3)",
              background: "var(--surface-3)",
              padding: "1px 7px",
              borderRadius: 20,
              border: "1px solid var(--border)",
            }}>
              {status.ollama.model}
            </span>
          )}
        </div>
      </div>

      {/* ── Stat Cards ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: 16,
      }}>
        <StatCard
          label="Missions totales"
          value={loading ? "" : totalMissions}
          sub={`${successMissions} réussies`}
          color="var(--text)"
          icon="🎯"
          loading={loading}
        />
        <StatCard
          label="Taux de succès"
          value={loading ? "" : `${successRate}%`}
          sub={totalMissions > 0 ? "sur toutes les missions" : "Aucune mission"}
          color={successRate >= 80 ? "var(--green)" : successRate >= 50 ? "var(--yellow)" : "var(--red)"}
          icon="✅"
          loading={loading}
        />
        <StatCard
          label="Agents actifs"
          value={loading ? "" : activeAgents}
          sub="configurés dans .env"
          color="var(--primary)"
          icon="🤖"
          loading={loading}
        />
        <StatCard
          label="Uptime"
          value={loading ? "" : uptimeDisplay}
          sub={status?.status === "online" ? "API en ligne" : "API hors ligne"}
          color="var(--cyan)"
          icon="⏱"
          loading={loading}
        />
      </div>

      {/* ── Sparkline missions ── */}
      <div style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border-2)",
        borderRadius: "var(--radius-lg)",
        padding: "20px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 24,
      }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
            Activité récente
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text)" }}>
            Missions / temps
          </div>
          <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>
            Mise à jour toutes les 3s
          </div>
        </div>
        <Sparkline data={sparkData} color="var(--primary)" width={200} height={50} />
      </div>

      {/* ── Chat Feed + Composer ── */}
      <div style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border-2)",
        borderRadius: "var(--radius-lg)",
        display: "flex",
        flexDirection: "column",
        minHeight: 400,
        overflow: "hidden",
      }}>
        <ChatFeed
          missions={missions}
          activeMissionId={activeMissionId}
          wsEvents={wsEvents}
          onRefresh={fetchData}
          onSuggest={(s) => setPrefillCommand(s)}
        />
        <Composer
          status={status}
          prefillCommand={prefillCommand}
          onPrefillConsumed={() => setPrefillCommand("")}
          onMissionStart={(id) => {
            setActiveMissionId(id);
            setTimeout(fetchData, 1500);
          }}
          onMissionComplete={() => {
            setActiveMissionId(null);
            fetchData();
          }}
        />
      </div>
    </div>
  );
}
