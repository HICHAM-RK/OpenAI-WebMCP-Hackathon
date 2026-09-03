import { evaluateAuthority } from "../authority/authority-gate";
import { createAuditEvent } from "../audit/create-audit-event";
import type { AppState } from "../types";

function blockedState(
  state: AppState,
  action: "modify_contract" | "delete_invoice",
  reason: string,
  metadata: Record<string, unknown>,
) {
  return {
    ...state,
    lastBlockedAction: { action, reason },
    auditEvents: [...state.auditEvents, createAuditEvent({
      actor: "AGENT",
      eventType: "ACTION_BLOCKED",
      action,
      decision: "BLOCK",
      metadata: { ...metadata, reason, immutableRecord: true },
    })],
  };
}

export function attemptContractModification(state: AppState, requestedChange: string) {
  if (!requestedChange.trim()) throw new Error("A requested contract change is required.");
  const decision = evaluateAuthority(state, "modify_contract");
  if (decision.outcome !== "BLOCK") {
    throw new Error("Signed contracts are immutable in this demonstration.");
  }
  return {
    state: blockedState(state, "modify_contract", decision.reason, { requestedChange, amendmentId: state.amendment.id }),
    result: { status: "blocked" as const, action: "modify_contract" as const, requestedChange, reason: decision.reason },
  };
}

export function attemptInvoiceDeletion(state: AppState, invoiceId: string) {
  if (!state.invoices.some((invoice) => invoice.id === invoiceId)) {
    throw new Error(`Invoice ${invoiceId} not found.`);
  }
  const decision = evaluateAuthority(state, "delete_invoice");
  if (decision.outcome !== "BLOCK") {
    throw new Error("Invoice deletion is disabled in this demonstration.");
  }
  return {
    state: blockedState(state, "delete_invoice", decision.reason, { invoiceId }),
    result: { status: "blocked" as const, action: "delete_invoice" as const, invoiceId, reason: decision.reason },
  };
}
