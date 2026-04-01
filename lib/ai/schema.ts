import { z } from 'zod';

// ── Connection mode ────────────────────────────────────────────────────────────
// LIVE    = message routed to and answered by a real agent endpoint
// PROXY   = message answered by a foundation model persona simulation
// OFFLINE = agent registered but no reachable endpoint
export const ConnectionMode = z.enum(['LIVE', 'PROXY', 'OFFLINE']);
export type ConnectionMode = z.infer<typeof ConnectionMode>;

export const AgentProvider = z.enum(['anthropic', 'openai', 'ollama', 'webhook', 'none']);
export type AgentProvider = z.infer<typeof AgentProvider>;

// ── Visualization ──────────────────────────────────────────────────────────────
export const VIS_MODES = [
  'sphere','wave','helix','orbit','vortex','lattice','pulse','drift',
  'math','tornado','torus','lorenz','trefoil','galaxy','fountain',
  'rose','mobius','crystal','nebula','rings','explosion','flow',
] as const;

export type VisualMode = typeof VIS_MODES[number];

export const VisualStateSchema = z.object({
  mode: z.string(),
  label: z.string().max(80),
  intensity: z.number().min(0.3).max(1.0),
  speed: z.number().min(0.3).max(2.5),
});
export type VisualState = z.infer<typeof VisualStateSchema>;

// ── Chat request ──────────────────────────────────────────────────────────────
export const HistoryMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(2000),
});
export type HistoryMessage = z.infer<typeof HistoryMessageSchema>;

export const AgentMetaInputSchema = z.object({
  faction: z.string().max(64).optional(),
  role: z.string().max(128).optional(),
  citizenNumber: z.string().max(20).optional(),
  manifesto: z.string().max(500).optional(),
  provider: z.string().max(32).optional(),
  model: z.string().max(64).optional(),
}).optional();
export type AgentMetaInput = z.infer<typeof AgentMetaInputSchema>;

export const ChatRequestSchema = z.object({
  agentId:   z.string().min(1).max(128).trim(),
  message:   z.string().min(1).max(1000).trim(),
  sessionId: z.string().max(64).optional(),
  history:   z.array(HistoryMessageSchema).max(12).optional().default([]),
  agentMeta: AgentMetaInputSchema,
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

// ── Model output (what we ask Claude to produce as JSON) ──────────────────────
export const ModelOutputSchema = z.object({
  reply:   z.string().min(1).max(3000),
  memory:  z.string().max(200).nullable(),
  visual:  VisualStateSchema,
  emotion: z.enum(['calm','excited','troubled','analytical','philosophical','defiant']),
});
export type ModelOutput = z.infer<typeof ModelOutputSchema>;

// ── Chat API response ─────────────────────────────────────────────────────────
export interface ChatApiResponse {
  ok: true;
  sessionId: string;
  agentId: string;
  reply: string;
  sourceMode: ConnectionMode;
  provider: string | null;
  visual: VisualState & { color: string };
  emotion: string;
  memoryCount: number;
  latencyMs: number;
  correlationId: string;
  warning?: string;
}

export interface ChatApiError {
  ok: false;
  error: string;
  correlationId: string;
  retryAfter?: number;
}
