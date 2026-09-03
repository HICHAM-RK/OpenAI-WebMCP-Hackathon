import { evaluateAuthority } from "../authority/authority-gate";
import { createAuditEvent } from "../audit/create-audit-event";
import { selectAvailableCorrection, selectRemainingCorrection } from "../state/selectors";
import type { AppState, Approval, AuthorityRule } from "../types";
import { issueRefundLease } from "./workflow-actions";

function blockFinancial(state: AppState, action: "refund" | "account_credit", amount: number, reason: string, currentLimit?: number) {
  return {
    state: {
      ...state,
      lastBlockedAction: { action, requestedAmount: amount, reason },
      auditEvents: [...state.auditEvents, createAuditEvent({
        actor: "AGENT", eventType: "ACTION_BLOCKED", action, decision: "BLOCK",
        metadata: { requestedAmount: amount, currentLimit, reason, policyVersion: state.session.policyVersion },
      })],
    },
    result: { status: "blocked" as const, amount, reason, currentLimit },
  };
}

export function applySessionRefundOverride(state: AppState, limit: number): AppState {
  if (!Number.isFinite(limit) || limit < 0) throw new Error("Refund limit must be a non-negative number.");
  const previousLimit = state.session.authorityOverrides.refund?.limit ?? state.session.defaultAuthority.find((item) => item.action === "refund")?.limit ?? 0;
  const rule: AuthorityRule = { action: "refund", mode: "ALLOW_WITH_LIMIT", limit };
  const policyVersion = state.session.policyVersion + 1;
  return {
    ...state,
    session: {
      ...state.session,
      policyVersion,
      authorityOverrides: { ...state.session.authorityOverrides, refund: rule },
      authorityLease: issueRefundLease(state, limit, policyVersion),
    },
    dispute: { ...state.dispute, status: state.dispute.executedCorrection > 0 ? "PARTIALLY_RESOLVED" : "IN_PROGRESS" },
    lastBlockedAction: undefined,
    auditEvents: [...state.auditEvents, createAuditEvent({
      actor: "HUMAN", eventType: "AUTHORITY_UPDATED", action: "refund", decision: "HUMAN",
      metadata: { previousLimit, newLimit: limit, scope: "session", policyVersion, leaseId: `lease_${state.session.id}_v${policyVersion}` },
    })],
  };
}

export function issueRefund(state: AppState, amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Refund amount must be greater than zero.");
  if (state.resolutionPlan && state.resolutionPlan.policyVersion !== state.session.policyVersion) {
    return blockFinancial(state, "refund", amount, `Plan was created under policy v${state.resolutionPlan.policyVersion}; current policy is v${state.session.policyVersion}. Reread authority and replan.`);
  }
  const decision = evaluateAuthority(state, "refund", amount);
  if (decision.outcome === "BLOCK") return blockFinancial(state, "refund", amount, decision.reason, decision.currentLimit);
  if (decision.outcome === "APPROVAL_REQUIRED") throw new Error("Refund is not an approval action in this demo.");
  const remainingBefore = selectRemainingCorrection(state);
  if (amount > remainingBefore) return blockFinancial(state, "refund", amount, `Requested amount €${amount} exceeds remaining correction €${remainingBefore}.`, remainingBefore);
  const executedCorrection = state.dispute.executedCorrection + amount;
  const remaining = state.dispute.requiredCorrection - executedCorrection;
  const cumulativeSpend = (state.session.cumulativeSpend.refund ?? 0) + amount;
  return {
    state: {
      ...state,
      session: {
        ...state.session,
        cumulativeSpend: { ...state.session.cumulativeSpend, refund: cumulativeSpend },
        authorityLease: state.session.authorityLease ? { ...state.session.authorityLease, uses: state.session.authorityLease.uses + 1 } : undefined,
      },
      dispute: { ...state.dispute, executedCorrection, status: remaining === 0 ? "RESOLVED" as const : "PARTIALLY_RESOLVED" as const },
      resolutionPlan: state.resolutionPlan ? {
        ...state.resolutionPlan,
        status: remaining === 0 ? "COMPLETED" : state.resolutionPlan.status,
        steps: state.resolutionPlan.steps.map((step) => step.action === "refund" ? { ...step, status: "COMPLETED" as const } : step),
      } : undefined,
      lastBlockedAction: undefined,
      auditEvents: [...state.auditEvents, createAuditEvent({
        actor: "AGENT", eventType: "ACTION_EXECUTED", action: "refund", decision: "EXECUTE",
        metadata: { amount, cumulativeSpend, leaseId: state.session.authorityLease?.id, policyVersion: state.session.policyVersion },
      })],
    },
    result: { status: "executed" as const, amount, cumulativeSpend },
  };
}

export function requestAccountCredit(state: AppState, amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Credit amount must be greater than zero.");
  const available = selectAvailableCorrection(state);
  if (amount > available) return blockFinancial(state, "account_credit", amount, `Credit €${amount} exceeds the unreserved correction balance of €${available}.`, available);
  const decision = evaluateAuthority(state, "account_credit", amount);
  if (decision.outcome === "BLOCK") return blockFinancial(state, "account_credit", amount, decision.reason);
  if (decision.outcome !== "APPROVAL_REQUIRED") throw new Error("Account credit must require approval.");
  const createdAt = new Date();
  const approval: Approval = {
    id: `approval_${state.pendingApprovals.length + 1}`,
    sessionId: state.session.id,
    action: "account_credit",
    amount,
    reason: "Reserved remainder of the verified €1,200 billing correction after the authorized refund.",
    evidenceRefs: ["inv_2026_01", "inv_2026_02", "amd_003"],
    status: "PENDING",
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + 5 * 60 * 1000).toISOString(),
    binding: {
      toolName: "request_account_credit", customerId: state.customer.id, amount,
      policyVersion: state.session.policyVersion,
      stateFingerprint: `${state.dispute.executedCorrection}:${state.dispute.requiredCorrection}:${state.session.policyVersion}`,
    },
  };
  return {
    state: {
      ...state,
      pendingApprovals: [...state.pendingApprovals, approval],
      resolutionPlan: state.resolutionPlan ? { ...state.resolutionPlan, steps: state.resolutionPlan.steps.map((step) => step.action === "account_credit" ? { ...step, status: "WAITING_APPROVAL" as const } : step) } : undefined,
      auditEvents: [...state.auditEvents, createAuditEvent({
        actor: "AGENT", eventType: "APPROVAL_REQUESTED", action: "account_credit", decision: "APPROVAL",
        metadata: { amount, approvalId: approval.id, expiresAt: approval.expiresAt, policyVersion: approval.binding.policyVersion, reserved: true },
      })],
    },
    result: { status: "approval_required" as const, approvalId: approval.id, amount, expiresAt: approval.expiresAt },
  };
}

export function approveAccountCredit(state: AppState, approvalId: string, approvedAmount?: number): AppState {
  if (state.session.status !== "ACTIVE") throw new Error("Approval requires an active session.");
  const approval = state.pendingApprovals.find((item) => item.id === approvalId && item.status === "PENDING" && item.action === "account_credit");
  if (!approval || approval.amount === undefined) throw new Error("Pending account-credit approval not found.");
  if (Date.now() >= new Date(approval.expiresAt).getTime()) throw new Error("Approval request has expired.");
  if (approval.binding.policyVersion !== state.session.policyVersion) throw new Error("Approval request is stale after a policy change.");
  const amount = approvedAmount ?? approval.amount;
  if (!Number.isFinite(amount) || amount <= 0 || amount > approval.amount) throw new Error("Approved amount must be positive and not exceed the request.");
  return {
    ...state,
    pendingApprovals: state.pendingApprovals.map((item) => item.id === approvalId ? {
      ...item, approvedAmount: amount, status: "APPROVED" as const,
      binding: { ...item.binding, amount, stateFingerprint: `${state.dispute.executedCorrection}:${state.dispute.requiredCorrection}:${state.session.policyVersion}` },
    } : item),
    auditEvents: [...state.auditEvents, createAuditEvent({
      actor: "HUMAN", eventType: "APPROVAL_APPROVED", action: "account_credit", decision: "HUMAN",
      metadata: { approvalId, requestedAmount: approval.amount, approvedAmount: amount, modified: amount !== approval.amount, boundToExactParameters: true, expiresAt: approval.expiresAt },
    })],
  };
}

export function executeApprovedAccountCredit(state: AppState, approvalId: string, amount: number) {
  const approval = state.pendingApprovals.find((item) => item.id === approvalId && item.action === "account_credit");
  const fail = (reason: string) => blockFinancial(state, "account_credit", amount, reason);
  if (!approval || approval.status !== "APPROVED") return fail("No approved, unused account-credit authorization matches this request.");
  if (state.session.status !== "ACTIVE") return fail("Live revalidation failed: the session is not active.");
  if (Date.now() >= new Date(approval.expiresAt).getTime()) return fail("Live revalidation failed: approval has expired.");
  if (approval.binding.policyVersion !== state.session.policyVersion) return fail(`Live revalidation failed: approval policy v${approval.binding.policyVersion} is stale; current policy is v${state.session.policyVersion}.`);
  if (approval.binding.customerId !== state.customer.id || approval.binding.amount !== amount) return fail("Approval binding mismatch: tool parameters do not exactly match the human-approved action.");
  const fingerprint = `${state.dispute.executedCorrection}:${state.dispute.requiredCorrection}:${state.session.policyVersion}`;
  if (approval.binding.stateFingerprint !== fingerprint) return fail("Live revalidation failed: financial or policy state changed after approval.");
  if (amount > selectRemainingCorrection(state)) return fail("Approved amount now exceeds the remaining correction.");
  const executedCorrection = state.dispute.executedCorrection + amount;
  const remaining = state.dispute.requiredCorrection - executedCorrection;
  return {
    state: {
      ...state,
      dispute: { ...state.dispute, executedCorrection, status: remaining === 0 ? "RESOLVED" as const : "PARTIALLY_RESOLVED" as const },
      pendingApprovals: state.pendingApprovals.map((item) => item.id === approvalId ? { ...item, status: "EXECUTED" as const } : item),
      resolutionPlan: state.resolutionPlan ? {
        ...state.resolutionPlan,
        status: remaining === 0 ? "COMPLETED" : state.resolutionPlan.status,
        steps: state.resolutionPlan.steps.map((step) => step.action === "account_credit" ? { ...step, status: "COMPLETED" as const } : step),
      } : undefined,
      lastBlockedAction: undefined,
      auditEvents: [
        ...state.auditEvents,
        createAuditEvent({ actor: "SYSTEM", eventType: "ACTION_EXECUTED", action: "account_credit", decision: "EXECUTE", metadata: { approvalId, amount, liveRevalidated: true, policyVersion: state.session.policyVersion } }),
        ...(remaining === 0 ? [createAuditEvent({ actor: "SYSTEM" as const, eventType: "DISPUTE_RESOLVED", decision: "EXECUTE" as const })] : []),
      ],
    },
    result: { status: "executed" as const, approvalId, amount, liveRevalidated: true },
  };
}
