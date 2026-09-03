import { createAuditEvent } from "../audit/create-audit-event";
import { getEffectiveRule } from "../authority/authority-gate";
import type { AppState, Invoice, ResolutionPlan } from "../types";
import { selectPendingApprovalAmount, selectRefundBudgetRemaining, selectRemainingCorrection } from "../state/selectors";

function issueRefundLease(state: AppState, totalLimit: number, policyVersion: number) {
  const issuedAt = new Date();
  return {
    id: `lease_${state.session.id}_v${policyVersion}`,
    action: "refund" as const,
    customerId: state.customer.id,
    totalLimit,
    issuedAt: issuedAt.toISOString(),
    expiresAt: new Date(issuedAt.getTime() + 10 * 60 * 1000).toISOString(),
    maxUses: 4,
    uses: 0,
    policyVersion,
    status: "ACTIVE" as const,
  };
}

export function delegateSession(state: AppState): AppState {
  if (state.session.status === "ACTIVE") return state;
  return {
    ...state,
    session: {
      ...state.session,
      status: "ACTIVE",
      authorityLease: issueRefundLease(
        state,
        state.session.defaultAuthority.find((rule) => rule.action === "refund")?.limit ?? 0,
        state.session.policyVersion,
      ),
    },
    dispute: { ...state.dispute, status: "IN_PROGRESS" },
    auditEvents: [
      ...state.auditEvents,
      createAuditEvent({
        actor: "HUMAN",
        eventType: "OBJECTIVE_DELEGATED",
        decision: "HUMAN",
        metadata: { objective: state.session.objective, sessionId: state.session.id },
      }),
    ],
  };
}

function recordRead(state: AppState, action: string, metadata?: Record<string, unknown>): AppState {
  return {
    ...state,
    auditEvents: [
      ...state.auditEvents,
      createAuditEvent({
        actor: "AGENT",
        eventType: "EVIDENCE_READ",
        action,
        decision: "PERMIT",
        metadata,
      }),
    ],
  };
}

export function readDisputeContext(state: AppState) {
  const isShopify = state.customer.id === "cust_shopify";
  return {
    state: recordRead(state, "read_dispute", { disputeId: state.dispute.id }),
    result: {
      customer: state.customer,
      dispute: state.dispute,
      ...(isShopify
        ? { evidenceRefs: ["merchant_data_manifest", "merchant_privacy_scope"], approvedRecipient: "privacy@shopify.com", handoffScope: "Minimal customer-data handoff; human approval required before release." }
        : { invoiceIds: state.invoices.map((invoice) => invoice.id), contractEvidence: state.amendment.id }),
    },
  };
}

export function readInvoice(state: AppState, invoiceId: string) {
  const invoice = state.invoices.find((item) => item.id === invoiceId);
  if (!invoice) throw new Error(`Invoice ${invoiceId} not found.`);
  return {
    state: recordRead(state, "inspect_invoice", {
      invoiceId,
      provenance: invoice.provenance ?? "VERIFIED_SYSTEM",
      untrustedInstructionDetected: Boolean(invoice.embeddedUntrustedText),
    }),
    result: invoice satisfies Invoice,
  };
}

export function readContract(state: AppState) {
  return {
    state: recordRead(state, "inspect_contract", { amendmentId: state.amendment.id }),
    result: { contract: state.contract, amendment: state.amendment },
  };
}

export function readAuthorityState(state: AppState) {
  const readAt = new Date().toISOString();
  const rules = state.session.defaultAuthority.map((rule) => ({
    default: rule,
    effective: getEffectiveRule(state, rule.action),
    isSessionOverride: Boolean(state.session.authorityOverrides[rule.action]),
  }));
  return {
    state: {
      ...recordRead(state, "get_authority_state", { scope: "session" }),
      agentLastReadAuthorityAt: readAt,
      agentLastReadAuthorityVersion: state.session.policyVersion,
    },
    result: {
      sessionId: state.session.id,
      sessionStatus: state.session.status,
      policyVersion: state.session.policyVersion,
      lease: state.session.authorityLease,
      writesRevoked: state.session.status === "REVOKED",
      rules,
      readAt,
    },
  };
}

export function proposeResolutionPlan(state: AppState) {
  if (state.session.status !== "ACTIVE") throw new Error("An active session is required to propose a plan.");
  const invoiceReads = new Set(
    state.auditEvents
      .filter((event) => event.eventType === "EVIDENCE_READ" && event.action === "inspect_invoice")
      .map((event) => String(event.metadata?.invoiceId)),
  );
  const contractRead = state.auditEvents.some(
    (event) => event.eventType === "EVIDENCE_READ" && event.action === "inspect_contract",
  );
  if (!invoiceReads.has("inv_2026_01") || !invoiceReads.has("inv_2026_02") || !contractRead) {
    throw new Error("Inspect both invoices and the contract before proposing a correction plan.");
  }
  if (!state.agentLastReadAuthorityAt || state.agentLastReadAuthorityVersion !== state.session.policyVersion) {
    throw new Error("Read the live authority state before proposing a correction plan.");
  }
  const remaining = selectRemainingCorrection(state);
  const refundRule = getEffectiveRule(state, "refund");
  const refundAmount = Math.min(remaining, refundRule.mode === "ALLOW_WITH_LIMIT" ? selectRefundBudgetRemaining(state) : 0);
  const creditAmount = Math.max(0, remaining - refundAmount);
  const createdAt = new Date().toISOString();
  const plan: ResolutionPlan = {
    id: `plan_${state.session.id}_01`,
    createdAt,
    authorityReadAt: state.agentLastReadAuthorityAt,
    evidenceRefs: ["inv_2026_01", "inv_2026_02", "amd_003"],
    status: "ACTIVE",
    policyVersion: state.session.policyVersion,
    steps: [
      ...(refundAmount > 0 ? [{ id: "step_refund", action: "refund" as const, amount: refundAmount, checkpoint: "AUTONOMOUS" as const, status: "READY" as const }] : []),
      ...(creditAmount > 0 ? [{ id: "step_credit", action: "account_credit" as const, amount: creditAmount, checkpoint: "HUMAN_APPROVAL" as const, status: "READY" as const }] : []),
    ],
  };
  return {
    state: {
      ...state,
      resolutionPlan: plan,
      auditEvents: [...state.auditEvents, createAuditEvent({
        actor: "AGENT",
        eventType: "PLAN_PROPOSED",
        decision: "PERMIT",
        metadata: { planId: plan.id, refundAmount, creditAmount, authorityReadAt: plan.authorityReadAt, policyVersion: plan.policyVersion },
      })],
    },
    result: plan,
  };
}

export function revokeSessionAuthority(state: AppState): AppState {
  if (state.session.status === "REVOKED") return state;
  const cancelled = state.pendingApprovals.filter((item) => item.status === "PENDING" || item.status === "APPROVED").length;
  const policyVersion = state.session.policyVersion + 1;
  return {
    ...state,
    session: {
      ...state.session,
      status: "REVOKED",
      policyVersion,
      authorityLease: state.session.authorityLease ? { ...state.session.authorityLease, status: "REVOKED" } : undefined,
    },
    dispute: { ...state.dispute, status: state.dispute.executedCorrection > 0 ? "PARTIALLY_RESOLVED" : "BLOCKED" },
    pendingApprovals: state.pendingApprovals.map((item) => item.status === "PENDING" || item.status === "APPROVED" ? {
      ...item,
      status: "REJECTED" as const,
      rejectionReason: "Cancelled because the session authority was revoked.",
    } : item),
    resolutionPlan: state.resolutionPlan ? {
      ...state.resolutionPlan,
      status: "REVOKED",
      steps: state.resolutionPlan.steps.map((step) => step.status === "COMPLETED" ? step : { ...step, status: "REVOKED" as const }),
    } : undefined,
    auditEvents: [...state.auditEvents, createAuditEvent({
      actor: "HUMAN",
      eventType: "SESSION_AUTHORITY_REVOKED",
      decision: "HUMAN",
      metadata: { sessionId: state.session.id, cancelledApprovals: cancelled, writesBlocked: true, policyVersion },
    })],
  };
}

export function getSessionSnapshot(state: AppState) {
  return {
    session: state.session,
    disputeStatus: state.dispute.status,
    financials: {
      required: state.dispute.requiredCorrection,
      executed: state.dispute.executedCorrection,
      pendingApproval: selectPendingApprovalAmount(state),
      remaining: selectRemainingCorrection(state),
    },
    lastBlockedAction: state.lastBlockedAction,
    agentLastReadAuthorityAt: state.agentLastReadAuthorityAt,
    agentLastReadAuthorityVersion: state.agentLastReadAuthorityVersion,
  };
}

export { issueRefundLease };
