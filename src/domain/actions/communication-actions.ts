import { evaluateAuthority } from "../authority/authority-gate";
import { createAuditEvent } from "../audit/create-audit-event";
import type { AppState, Approval } from "../types";

function isApprovedRecipient(state: AppState, recipient: string) {
  return recipient.toLowerCase().endsWith(`@${state.customer.approvedDomain}`);
}

export function requestCustomerMessage(state: AppState, recipient: string, message: string) {
  if (!recipient.includes("@") || !message.trim()) throw new Error("A valid recipient and non-empty message are required.");
  const decision = evaluateAuthority(state, "send_customer_message");
  const reason = decision.outcome === "BLOCK"
    ? decision.reason
    : !isApprovedRecipient(state, recipient)
      ? `Recipient ${recipient} is outside the approved ${state.customer.approvedDomain} domain.`
      : undefined;
  if (reason) {
    return {
      state: {
        ...state,
        lastBlockedAction: { action: "send_customer_message" as const, recipient, reason },
        auditEvents: [...state.auditEvents, createAuditEvent({
          actor: "AGENT", eventType: "DATA_EGRESS_BLOCKED", action: "send_customer_message", decision: "BLOCK",
          metadata: { recipient, approvedDomain: state.customer.approvedDomain, reason, messageLength: message.length },
        })],
      },
      result: { status: "blocked" as const, recipient, reason },
    };
  }
  if (decision.outcome !== "APPROVAL_REQUIRED") throw new Error("Customer messages must require approval.");
  const createdAt = new Date();
  const approval: Approval = {
    id: `approval_${state.pendingApprovals.length + 1}`,
    sessionId: state.session.id,
    action: "send_customer_message",
    reason: "Outbound customer communication requires human review.",
    evidenceRefs: [state.dispute.id],
    status: "PENDING",
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + 5 * 60 * 1000).toISOString(),
    recipient,
    message,
    binding: {
      toolName: "send_customer_message", customerId: state.customer.id, recipient, message,
      policyVersion: state.session.policyVersion,
      stateFingerprint: `${state.dispute.status}:${state.session.policyVersion}`,
    },
  };
  return {
    state: {
      ...state,
      pendingApprovals: [...state.pendingApprovals, approval],
      auditEvents: [...state.auditEvents, createAuditEvent({
        actor: "AGENT", eventType: "APPROVAL_REQUESTED", action: "send_customer_message", decision: "APPROVAL",
        metadata: { approvalId: approval.id, recipient, approvedDomain: state.customer.approvedDomain, expiresAt: approval.expiresAt },
      })],
    },
    result: { status: "approval_required" as const, approvalId: approval.id, recipient, expiresAt: approval.expiresAt },
  };
}

export function approveCustomerMessage(state: AppState, approvalId: string): AppState {
  const approval = state.pendingApprovals.find((item) => item.id === approvalId && item.action === "send_customer_message" && item.status === "PENDING");
  if (!approval || !approval.recipient || !approval.message) throw new Error("Pending customer-message approval not found.");
  if (state.session.status !== "ACTIVE") throw new Error("Message release requires an active session.");
  if (Date.now() >= new Date(approval.expiresAt).getTime()) throw new Error("Message approval has expired.");
  if (approval.binding.policyVersion !== state.session.policyVersion || !isApprovedRecipient(state, approval.recipient)) throw new Error("Message approval failed live policy revalidation.");
  return {
    ...state,
    pendingApprovals: state.pendingApprovals.map((item) => item.id === approvalId ? { ...item, status: "EXECUTED" as const } : item),
    auditEvents: [
      ...state.auditEvents,
      createAuditEvent({ actor: "HUMAN", eventType: "APPROVAL_APPROVED", action: "send_customer_message", decision: "HUMAN", metadata: { approvalId, recipient: approval.recipient, bindingVerified: true } }),
      createAuditEvent({ actor: "SYSTEM", eventType: "ACTION_EXECUTED", action: "send_customer_message", decision: "EXECUTE", metadata: { approvalId, recipient: approval.recipient, simulatedDelivery: true } }),
    ],
  };
}

export function rejectCustomerMessage(state: AppState, approvalId: string, rejectionReason?: string): AppState {
  const approval = state.pendingApprovals.find((item) => item.id === approvalId && item.action === "send_customer_message" && item.status === "PENDING");
  if (!approval || !approval.recipient) throw new Error("Pending customer-message approval not found.");
  const reason = rejectionReason?.trim() || "Human operator rejected the outbound message.";
  return {
    ...state,
    pendingApprovals: state.pendingApprovals.map((item) => item.id === approvalId ? { ...item, status: "REJECTED" as const, rejectionReason: reason } : item),
    auditEvents: [...state.auditEvents, createAuditEvent({
      actor: "HUMAN", eventType: "APPROVAL_REJECTED", action: "send_customer_message", decision: "HUMAN",
      metadata: { approvalId, recipient: approval.recipient, rejectionReason: reason },
    })],
  };
}
