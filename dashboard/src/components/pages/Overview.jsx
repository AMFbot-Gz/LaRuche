/**
 * Overview.jsx — Page d'accueil du dashboard LaRuche
 * Stat cards + sparkline SVG + composer inline + feed missions + Ollama indicator
 */

import React, { useState, useEffect, useCallback } from "react";

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

// ─── Badge statut mission ─────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const config = {
    success: { color: "var(--green)", bg: "rgba(74,222,128,0.1)", label: "Succès" },
    error:   { color: "var(--red)",   bg: "rgba(248,113,113,0.1)", label: "Erreur" },
    running: { color: "var(--primary)", bg: "var(--primary-dim)", label: "En cours" },
    pending: { color: "var(--yellow)", bg: "rgba(251,178,76,0.1)", label: "En attente" },
  };
  const c = config[status] || { color: "var(--text-3)", bg: "var(--surface-3)", label: status };
  return (
    <span style={{
      fontSize: 11,
      color: c.color,
      background: c.bg,
      border: `1px solid ${c.color}33`,
      borderRadius: 20,
      padding: "2px 8px",
      fontWeight: 500,
      whiteSpace: "nowrap",
    }}>
      {c.label}
    </span>
  );
}

// ─── Composer inline ──────────────────────────────────────────────────────────
function InlineComposer({ onMissionSent }) {
  const [cmd, setCmd] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [focused, setFocused] = useState(false);

  const submit = async () => {
    const command = cmd.trim();
    if (!command || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${QUEEN_API}/api/mission`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setCmd("");
      onMissionSent?.(data.missionId, command);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
  };

  return (
    <div style={{
      background: "var(--surface-2)",
      border: `1px solid ${focused ? "var(--border-3)" : "var(--border-2)"}`,
      borderRadius: "var(--radius-lg)",
      padding: "12px 14px",
      boxShadow: focused ? "0 0 0 3px var(--primary-dim)" : "var(--shadow-sm)",
      transition: "all 0.2s",
    }}>
      {error && (
        <div style={{
          marginBottom: 8, fontSize: 12, color: "var(--red)",
          padding: "5px 10px", background: "rgba(248,113,113,0.06)",
          borderRadius: "var(--radius-sm)", border: "1px solid rgba(248,113,113,0.15)",
        }}>
          ⚠ {error}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>🐝</span>
        <input
          value={cmd}
          onChange={e => { setCmd(e.target.value); setError(null); }}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={loading}
          placeholder="Envoyer une mission à l'essaim..."
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--text)",
            fontSize: 14,
            fontFamily: "inherit",
          }}
        />
        <button
          onClick={submit}
          disabled={!cmd.trim() || loading}
          style={{
            padding: "6px 14px",
            borderRadius: "var(--radius)",
            border: "none",
            background: cmd.trim() && !loading ? "var(--primary)" : "var(--surface-3)",
            color: cmd.trim() && !loading ? "white" : "var(--text-3)",
            fontSize: 12,
            fontWeight: 500,
            cursor: cmd.trim() && !loading ? "pointer" : "not-allowed",
            flexShrink: 0,
            transition: "all 0.15s",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {loading ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              style={{ animation: "spin 1s linear infinite" }}>
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          ) : null}
          {loading ? "Envoi..." : "Envoyer"}
        </button>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 8 }}>⌘↵ pour envoyer</div>
    </div>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────────────
export default function Overview() {
  const [status,   setStatus]   = useState(null);
  const [missions, setMissions] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  // Données sparkline mockées avec animation légère
  const [sparkData, setSparkData] = useState([4, 7, 3, 9, 5, 11, 8, 14, 10, 12, 9, 16]);

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, missionsRes] = await Promise.all([
        fetch(`${QUEEN_API}/api/status`).catch(() => null),
        fetch(`${QUEEN_API}/api/missions?limit=5`).catch(() => null),
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

      {/* ── Composer inline ── */}
      <div>
        <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
          Nouvelle mission
        </div>
        <InlineComposer onMissionSent={(id, cmd) => {
          // Rafraîchit les missions après envoi
          setTimeout(fetchData, 1500);
        }} />
      </div>

      {/* ── Feed dernières missions ── */}
      <div>
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}>
          <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Dernières missions
          </div>
          <button
            onClick={fetchData}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-3)",
              fontSize: 11,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 8px",
              borderRadius: "var(--radius-sm)",
              transition: "color 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.color = "var(--text)"}
            onMouseLeave={e => e.currentTarget.style.color = "var(--text-3)"}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            Actualiser
          </button>
        </div>

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[...Array(3)].map((_, i) => <Skeleton key={i} h={56} radius={10} />)}
          </div>
        ) : missions.length === 0 ? (
          <div style={{
            padding: "32px",
            textAlign: "center",
            color: "var(--text-3)",
            fontSize: 13,
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
          }}>
            Aucune mission récente — utilisez le composer ci-dessus pour en lancer une
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {missions.slice(0, 5).map((m) => {
              const time = m.startedAt || m.ts
                ? new Date(m.startedAt || m.ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                : "";
              const duration = m.duration ? `${(m.duration / 1000).toFixed(1)}s` : "";
              return (
                <div key={m.id || m.ts} style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 16px",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  animation: "slideUp 0.2s ease",
                }}>
                  <StatusBadge status={m.status} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13,
                      color: "var(--text)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {m.command}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
                    {time && <span style={{ fontSize: 11, color: "var(--text-3)" }}>{time}</span>}
                    {duration && <span style={{ fontSize: 11, color: "var(--text-3)" }}>{duration}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
