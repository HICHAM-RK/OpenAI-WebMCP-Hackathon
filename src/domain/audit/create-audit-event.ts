import type { AuditActor, AuditEvent } from "../types";

let sequence = 0;

export function createAuditEvent(input: {
  actor: AuditActor;
  eventType: string;
  action?: string;
  decision?: AuditEvent["decision"];
  metadata?: Record<string, unknown>;
  traceId?: string;
}): AuditEvent {
  sequence += 1;

  return {
    id: `audit_${sequence}`,
    timestamp: new Date().toISOString(),
    actor: input.actor,
    eventType: input.eventType,
    action: input.action,
    decision: input.decision,
    metadata: input.metadata,
    traceId: input.traceId ?? `trace_${sequence}`,
  };
}
