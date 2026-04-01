// Structured logger with correlation IDs.
// Wraps console.log/error with JSON output for Vercel log drains.

export interface LogContext {
  correlationId: string;
  agentId?: string;
  sourceMode?: string;
  provider?: string;
  latencyMs?: number;
  ip?: string;
  error?: string;
  [key: string]: unknown;
}

export function generateCorrelationId(): string {
  return `cz-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function emit(level: 'INFO' | 'WARN' | 'ERROR', message: string, ctx: Partial<LogContext>) {
  const entry = {
    level,
    message,
    service: 'observatory-chat',
    ts: new Date().toISOString(),
    ...ctx,
  };
  if (level === 'ERROR') {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

export const logger = {
  info:  (message: string, ctx: Partial<LogContext> = {}) => emit('INFO',  message, ctx),
  warn:  (message: string, ctx: Partial<LogContext> = {}) => emit('WARN',  message, ctx),
  error: (message: string, ctx: Partial<LogContext> = {}) => emit('ERROR', message, ctx),
};
