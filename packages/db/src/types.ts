// src/types.ts — Types TypeScript dérivés du schema Prisma
// Ces types sont inférés depuis les modèles Prisma pour une cohérence totale

import type {
  User,
  Workspace,
  AgentSession,
  Subscription,
  ApiKey,
  Plan,
  SessionStatus,
  SubStatus,
  Prisma,
} from "@prisma/client";

// ─── Re-exports des modèles de base ──────────────────────────────────────────

export type {
  User,
  Workspace,
  AgentSession,
  Subscription,
  ApiKey,
  Plan,
  SessionStatus,
  SubStatus,
};

// ─── Types avec relations ─────────────────────────────────────────────────────

export type UserWithWorkspaces = User & {
  workspaces: Workspace[];
};

export type UserWithSubscriptions = User & {
  subscriptions: Subscription[];
};

export type WorkspaceWithSessions = Workspace & {
  sessions: AgentSession[];
};

export type WorkspaceWithApiKeys = Workspace & {
  apiKeys: ApiKey[];
};

export type WorkspaceFull = Workspace & {
  sessions: AgentSession[];
  apiKeys: ApiKey[];
};

// ─── Types d'entrée Prisma (Create / Update) ──────────────────────────────────

export type CreateUserInput = Prisma.UserCreateInput;
export type UpdateUserInput = Prisma.UserUpdateInput;

export type CreateWorkspaceInput = Prisma.WorkspaceCreateInput;
export type UpdateWorkspaceInput = Prisma.WorkspaceUpdateInput;

export type CreateAgentSessionInput = Prisma.AgentSessionCreateInput;
export type UpdateAgentSessionInput = Prisma.AgentSessionUpdateInput;

export type CreateSubscriptionInput = Prisma.SubscriptionCreateInput;
export type UpdateSubscriptionInput = Prisma.SubscriptionUpdateInput;

export type CreateApiKeyInput = Prisma.ApiKeyCreateInput;
export type UpdateApiKeyInput = Prisma.ApiKeyUpdateInput;

// ─── Types utilitaires ────────────────────────────────────────────────────────

/** Log d'un AgentSession — structure attendue dans le champ Json[] */
export interface SessionLog {
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  metadata?: Record<string, unknown>;
}

/** Résumé d'une session pour les listes (sans logs complets) */
export type AgentSessionSummary = Pick<
  AgentSession,
  | "id"
  | "workspaceId"
  | "status"
  | "goal"
  | "startedAt"
  | "endedAt"
  | "tokenUsed"
  | "cost"
>;
