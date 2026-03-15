// ============================================================
// Chimera Protocol — Contrats WebSocket Queen ↔ Dashboard
// ============================================================

export type MessageType =
  | "command"
  | "message:incoming"
  | "message:outgoing"
  | "metrics"
  | "health_check"
  | "health_check:response"
  | "mission:created"
  | "mission:completed"
  | "mission:failed"
  | "agent:status"
  | "skill:generated";

export interface BaseMessage {
  type: MessageType;
  id: string;
  timestamp: number;
}

// Dashboard → Queen
export interface DashboardCommand extends BaseMessage {
  type: "command";
  action: "send_message" | "create_mission" | "stop_mission" | "reload_skills";
  payload: Record<string, unknown>;
}

// Incoming message from any channel
export interface IncomingMessage extends BaseMessage {
  type: "message:incoming";
  channel_id: string;
  source: {
    user_id: string;
    user_name: string;
    is_group: boolean;
  };
  content: {
    text: string;
    media: string[];
  };
}

// Queen → Dashboard metrics broadcast (every 5s)
export interface MetricsBroadcast extends BaseMessage {
  type: "metrics";
  queen: {
    status: "running" | "degraded" | "offline";
    tasks_queue: number;
    avg_response_time_ms: number;
    uptime_seconds: number;
  };
  agents: Record<string, {
    port: number;
    status: "healthy" | "degraded" | "offline";
    last_check: number;
  }>;
  channels: Record<string, {
    status: "healthy" | "degraded" | "offline";
    messages_1min: number;
    avg_latency_ms: number;
    error_rate: number;
  }>;
}

// Mission lifecycle events
export interface MissionEvent extends BaseMessage {
  type: "mission:created" | "mission:completed" | "mission:failed";
  mission_id: string;
  command: string;
  result?: string;
  error?: string;
  duration_ms?: number;
}
