/* =============================================================
   Revenue Intelligence OS — Shared Domain Types
   ============================================================= */

/* ── Auth & Users ── */
export type UserRole = 'closer' | 'manager' | 'admin' | 'csm' | 'sdr';

export interface User {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    tenantId: string;
    avatarUrl?: string;
    plan?: PlanTier;
    createdAt: string;
}

export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
    tokenType: string;
    expiresIn: number;
}

/* ── Tenant & Plans ── */
export type PlanTier = 'starter' | 'growth' | 'scale' | 'enterprise';

export interface Tenant {
    id: string;
    name: string;
    plan: PlanTier;
    seats: number;
    aiMinutesUsed: number;
    aiMinutesLimit: number;
    region: string;
    status: 'active' | 'trial' | 'suspended';
    mrr: number;
}

/* ── CRM ── */
export type DealStage = 'lead' | 'qualified' | 'demo_scheduled' | 'demo_completed' | 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost';

export interface Client {
    id: string;
    name: string;
    company: string;
    email: string;
    phone?: string;
    stage: DealStage;
    value: number;
    probability: number;
    assignedTo: string;
    vertical?: string;
}

export interface Opportunity {
    id: string;
    title: string;
    clientId: string;
    stage: DealStage;
    value: number;
    mrr: number;
    probability: number;
    expectedCloseDate?: string;
}

/* ── Demo Intelligence ── */
export interface DemoSession {
    id: string;
    title: string;
    clientName: string;
    status: 'scheduled' | 'live' | 'completed';
    scheduledAt: string;
    duration?: number;
    demoScore?: number;
    engagementScore?: number;
    closingProbability?: number;
}

export interface SaaSSignalDetection {
    type: 'pricing_mention' | 'budget_timing' | 'competitor' | 'feature_interest' | 'objection';
    time: string;
    text: string;
    severity: 'low' | 'medium' | 'high';
}

export interface TranscriptSegment {
    id: string;
    speaker: string;
    role: 'closer' | 'prospect';
    text: string;
    timestamp: number;
    sentiment?: 'positive' | 'neutral' | 'negative' | 'mixed';
    isObjection?: boolean;
    objectionType?: string;
    featuresMentioned?: string[];
}

export interface AiCoachingSuggestion {
    id: string;
    type: 'response' | 'objection_handler' | 'feature_highlight' | 'roi_pivot';
    label: string;
    text: string;
    confidence: number;
}

/* ── Product Intelligence ── */
export interface FeatureImpact {
    name: string;
    demosShown: number;
    winRate: number;
    controlRate: number;
    impactMultiplier: number;
    avgEngagement: number;
    confusionRate: number;
    trend: 'up' | 'down' | 'stable';
}

export interface SlideAnalysis {
    slide: string;
    avgAttention: number;
    dropOff: number;
    bestPractice: string;
}

/* ── Churn Predictor ── */
export type ChurnRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ChurnSignal {
    type: 'sentiment' | 'engagement' | 'usage' | 'support' | 'competitor';
    detail: string;
}

export interface ChurnRiskAccount {
    id: string;
    name: string;
    mrr: number;
    riskScore: number;
    riskLevel: ChurnRiskLevel;
    signals: ChurnSignal[];
    daysUntilRenewal: number;
    recommendedActions: string[];
}

/* ── Revenue Analytics ── */
export interface RevenueFunnelStage {
    name: string;
    count: number;
    value: number;
    conversionRate: number;
}

export interface ExpansionOpportunity {
    account: string;
    currentPlan: PlanTier;
    recommendedPlan: PlanTier;
    expansionMrr: number;
    confidence: number;
    signals: string[];
}

/* ── Simulation Trainer ── */
export type PersonaType = 'mid-market' | 'enterprise' | 'technical' | 'cfo';
export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

export interface SimulationPersona {
    id: PersonaType;
    label: string;
    description: string;
    difficulty: Difficulty;
    objections: string[];
}

export interface TrainingSession {
    id: string;
    persona: PersonaType;
    score: number;
    objections: number;
    handled: number;
    duration: number;
    completedAt: string;
}

/* ── RAG Knowledge Base ── */
export type RagTeam = 'sales' | 'csm' | 'sdr';
export type ContentType = 'product_docs' | 'pricing' | 'roadmap' | 'faq' | 'case_study';

export interface KnowledgeBase {
    id: string;
    name: string;
    description: string;
    documentCount: number;
    team: RagTeam;
    contentTypes: ContentType[];
    lastUpdated: string;
    status: 'synced' | 'processing' | 'error';
}

/* ── Dashboard Stats ── */
export interface CloserStats {
    demoPipeline: number;
    demoCloseRate: number;
    forecastedMrr: number;
    avgDemoScore: number;
}

export interface ManagerStats {
    totalMrr: number;
    demosThisMonth: number;
    demoCloseRate: number;
    avgDemoScore: number;
    revenueAtRisk: number;
}

export interface AdminStats {
    totalTenants: number;
    activeUsers: number;
    platformMrr: number;
    activeDemos: number;
    aiMinutesToday: number;
    avgUptime: number;
}

/* ── API Response ── */
export interface ApiResponse<T> {
    data: T;
    success: boolean;
    message?: string;
    pagination?: { page: number; pageSize: number; total: number };
}

/* ── CRM Integrations ── */
export type CrmProvider = 'hubspot' | 'salesforce' | 'pipedrive';

export interface CrmIntegration {
    provider: CrmProvider;
    status: 'connected' | 'disconnected' | 'error';
    lastSync: string;
    syncDirection: 'bidirectional' | 'inbound' | 'outbound';
}
