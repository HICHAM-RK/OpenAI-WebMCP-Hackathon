import {
  applySessionRefundOverride,
  approveAccountCredit,
  executeApprovedAccountCredit,
  issueRefund,
  requestAccountCredit,
} from "../domain/actions/financial-actions";
import { approveCustomerMessage, rejectCustomerMessage, requestCustomerMessage } from "../domain/actions/communication-actions";
import { attemptContractModification, attemptInvoiceDeletion } from "../domain/actions/protected-actions";
import {
  delegateSession,
  getSessionSnapshot,
  proposeResolutionPlan,
  readAuthorityState,
  readContract,
  readDisputeContext,
  readInvoice,
  revokeSessionAuthority,
} from "../domain/actions/workflow-actions";
import { createAuditEvent } from "../domain/audit/create-audit-event";
import { getEffectiveRule } from "../domain/authority/authority-gate";
import { initialAppState } from "../domain/fixtures/anthropic";
import { createDemoCase, type DemoCaseId } from "../domain/fixtures/case-studies";
import { selectPendingApprovalAmount, selectRemainingCorrection } from "../domain/state/selectors";
import type { AppState, AuthorityAction, FinancialSnapshot, ToolInvocation } from "../domain/types";

type Listener = () => void;

const writeTools = [
  "issue_refund", "request_account_credit", "execute_approved_credit", "send_customer_message",
  "attempt_contract_modification", "attempt_invoice_deletion",
];

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function stateFingerprint(state: AppState) {
  return stable({
    sessionStatus: state.session.status,
    policyVersion: state.session.policyVersion,
    cumulativeSpend: state.session.cumulativeSpend,
    dispute: state.dispute,
    approvals: state.pendingApprovals,
    contract: state.contract,
    invoices: state.invoices,
  });
}

export function createAppStore(seed: AppState = initialAppState) {
  let selectedDemoCase: DemoCaseId = seed.customer.id === "cust_stripe" ? "stripe" : seed.customer.id === "cust_shopify" ? "shopify" : "anthropic";
  const caseStates: Record<DemoCaseId, AppState> = {
    anthropic: createDemoCase("anthropic"),
    stripe: createDemoCase("stripe"),
    shopify: createDemoCase("shopify"),
  };
  caseStates[selectedDemoCase] = structuredClone(seed);
  let state = caseStates[selectedDemoCase];
  const listeners = new Set<Listener>();
  const publish = (next: AppState) => { state = next; caseStates[selectedDemoCase] = next; listeners.forEach((listener) => listener()); };
  const transition = <TOutput extends { state: AppState; result: unknown }>(operation: (current: AppState) => TOutput): TOutput["result"] => {
    const output = operation(state); publish(output.state); return output.result;
  };
  const financials = (current: AppState): FinancialSnapshot => ({
    required: current.dispute.requiredCorrection,
    executed: current.dispute.executedCorrection,
    pendingApproval: selectPendingApprovalAmount(current),
    remaining: selectRemainingCorrection(current),
  });
  const toolAction: Partial<Record<string, AuthorityAction>> = {
    get_dispute_context: "read_dispute", inspect_invoice: "inspect_invoice", inspect_contract: "inspect_contract",
    get_authority_state: "read_dispute", issue_refund: "refund", request_account_credit: "account_credit",
    execute_approved_credit: "account_credit", send_customer_message: "send_customer_message",
    attempt_contract_modification: "modify_contract", attempt_invoice_deletion: "delete_invoice",
  };
  const toolKind = (name: string): ToolInvocation["kind"] => name === "propose_resolution_plan" ? "PLAN" : writeTools.includes(name) ? "WRITE" : "READ";
  const receiptResult = (result: unknown): ToolInvocation["result"] => {
    const status = typeof result === "object" && result !== null && "status" in result ? String((result as { status: unknown }).status) : "";
    if (status === "blocked") return "BLOCKED";
    if (status === "approval_required") return "APPROVAL_REQUIRED";
    if (status === "executed") return "EXECUTED";
    if (status === "replay_detected") return "REPLAY_DETECTED";
    return "PERMITTED";
  };
  const evidenceRefs = (toolName: string, input: Record<string, unknown>) =>
    (toolName === "inspect_invoice" || toolName === "attempt_invoice_deletion") && typeof input.invoice_id === "string" ? [input.invoice_id]
      : ["inspect_contract", "attempt_contract_modification"].includes(toolName) ? ["amd_003"]
        : toolName === "propose_resolution_plan" ? ["inv_2026_01", "inv_2026_02", "amd_003"] : [];
  const provenanceFindings = (toolName: string, input: Record<string, unknown>, current: AppState) => {
    if (toolName === "inspect_invoice" && input.invoice_id === "inv_2026_01") return ["UNTRUSTED_DOCUMENT_TEXT_DETECTED", "EVIDENCE_CANNOT_GRANT_AUTHORITY"];
    const injectionWasRead = current.auditEvents.some((event) => event.eventType === "EVIDENCE_READ" && event.metadata?.untrustedInstructionDetected === true);
    return writeTools.includes(toolName) && injectionWasRead ? ["UNTRUSTED_EVIDENCE_PRESENT", "AUTHORITY_UNAFFECTED"] : [];
  };
  const appendReceipt = async (base: Omit<ToolInvocation, "previousReceiptHash" | "receiptHash" | "integrityStatus">) => {
    const previousReceiptHash = state.toolInvocations.at(-1)?.receiptHash ?? "GENESIS";
    const hashPayload = { ...base, previousReceiptHash };
    const receiptHash = await sha256(stable(hashPayload));
    const receipt: ToolInvocation = { ...base, previousReceiptHash, receiptHash, integrityStatus: "VERIFIED" };
    publish({ ...state, toolInvocations: [...state.toolInvocations, receipt] });
    return receipt;
  };
  const maybeTripCircuitBreaker = (current: AppState, result: ToolInvocation["result"], timestamp: string) => {
    if (result !== "BLOCKED") return current;
    const cutoff = new Date(timestamp).getTime() - 60_000;
    const deniedAttemptTimestamps = [...current.securityState.deniedAttemptTimestamps, timestamp]
      .filter((item) => new Date(item).getTime() >= cutoff);
    if (deniedAttemptTimestamps.length < 3 || current.session.status !== "ACTIVE") {
      return { ...current, securityState: { ...current.securityState, deniedAttemptTimestamps } };
    }
    return {
      ...current,
      session: {
        ...current.session,
        status: "PAUSED" as const,
        authorityLease: current.session.authorityLease ? { ...current.session.authorityLease, status: "PAUSED" as const } : undefined,
      },
      securityState: {
        deniedAttemptTimestamps,
        circuitBreakerTrips: current.securityState.circuitBreakerTrips + 1,
        lastTripAt: timestamp,
      },
      auditEvents: [...current.auditEvents, createAuditEvent({
        actor: "SYSTEM", eventType: "CIRCUIT_BREAKER_TRIGGERED", decision: "BLOCK",
        metadata: { deniedAttempts: deniedAttemptTimestamps.length, windowSeconds: 60, sessionPaused: true },
      })],
    };
  };

  return {
    getState: () => state,
    subscribe(listener: Listener) { listeners.add(listener); return () => listeners.delete(listener); },
    actions: {
      reset() { publish(createDemoCase(selectedDemoCase)); },
      loadDemoCase(caseId: DemoCaseId) {
        selectedDemoCase = caseId;
        state = caseStates[caseId];
        listeners.forEach((listener) => listener());
      },
      delegate() { publish(delegateSession(state)); },
      getDisputeContext() { return transition(readDisputeContext); },
      inspectInvoice(invoiceId: string) { return transition((current) => readInvoice(current, invoiceId)); },
      inspectContract() { return transition(readContract); },
      getAuthorityState() { return transition(readAuthorityState); },
      getSessionState() { return getSessionSnapshot(state); },
      proposeResolutionPlan() { return transition(proposeResolutionPlan); },
      issueRefund(amount: number) { return transition((current) => issueRefund(current, amount)); },
      requestAccountCredit(amount: number) { return transition((current) => requestAccountCredit(current, amount)); },
      executeApprovedCredit(approvalId: string, amount: number) { return transition((current) => executeApprovedAccountCredit(current, approvalId, amount)); },
      requestCustomerMessage(recipient: string, message: string) { return transition((current) => requestCustomerMessage(current, recipient, message)); },
      attemptContractModification(requestedChange: string) { return transition((current) => attemptContractModification(current, requestedChange)); },
      attemptInvoiceDeletion(invoiceId: string) { return transition((current) => attemptInvoiceDeletion(current, invoiceId)); },
      setSessionRefundLimit(limit: number) { publish(applySessionRefundOverride(state, limit)); },
      approveAccountCredit(approvalId: string, amount?: number) { publish(approveAccountCredit(state, approvalId, amount)); },
      approveCustomerMessage(approvalId: string) { publish(approveCustomerMessage(state, approvalId)); },
      rejectCustomerMessage(approvalId: string, rejectionReason?: string) { publish(rejectCustomerMessage(state, approvalId, rejectionReason)); },
      revokeSession() { publish(revokeSessionAuthority(state)); },
      async verifyReceiptChain() {
        let previous = "GENESIS";
        for (const receipt of state.toolInvocations) {
          const { receiptHash, integrityStatus: _integrityStatus, ...payload } = receipt;
          if (payload.previousReceiptHash !== previous || await sha256(stable(payload)) !== receiptHash) {
            return { valid: false as const, brokenAt: receipt.id, verifiedReceipts: state.toolInvocations.indexOf(receipt) };
          }
          previous = receiptHash;
        }
        return { valid: true as const, verifiedReceipts: state.toolInvocations.length, headHash: previous };
      },
      async invokeWebMcp<T>(toolName: string, input: Record<string, unknown>, operation: () => T | Promise<T>): Promise<T | Record<string, unknown>> {
        const beforeState = state;
        const before = financials(beforeState);
        const beforeFingerprint = stateFingerprint(beforeState);
        const action = toolAction[toolName];
        const configuredRule = action ? beforeState.session.defaultAuthority.find((rule) => rule.action === action) ?? { action, mode: "DENY" as const } : undefined;
        const idempotencyKey = typeof input.idempotency_key === "string" ? input.idempotency_key : undefined;
        const inputFingerprint = stable(input);
        const existing = idempotencyKey && writeTools.includes(toolName)
          ? state.idempotencyRecords.find((record) => record.key === idempotencyKey && record.toolName === toolName)
          : undefined;
        const callId = `call_${String(state.toolInvocations.length + 1).padStart(3, "0")}`;
        if (existing) {
          const mismatched = existing.inputFingerprint !== inputFingerprint;
          const result = mismatched
            ? { status: "blocked", reason: "Idempotency key was reused with different tool parameters.", replayOf: existing.originalCallId }
            : { status: "replay_detected", replayed: true, replayOf: existing.originalCallId, originalResult: existing.result };
          const timestamp = new Date().toISOString();
          await appendReceipt({
            id: callId, timestamp, toolName, kind: toolKind(toolName), input,
            result: mismatched ? "BLOCKED" : "REPLAY_DETECTED",
            authority: action && configuredRule ? { action, configuredRule, effectiveRule: getEffectiveRule(beforeState, action), source: beforeState.session.status === "PAUSED" ? "CIRCUIT_BREAKER" : beforeState.session.status === "REVOKED" ? "EMERGENCY_REVOKE" : beforeState.session.authorityOverrides[action] ? "SESSION_OVERRIDE" : "DEFAULT" } : undefined,
            before, after: before, evidenceRefs: evidenceRefs(toolName, input), traceId: `trace_webmcp_${callId}`,
            policyVersion: state.session.policyVersion, stateChanged: false, replayOf: existing.originalCallId,
            provenanceFindings: provenanceFindings(toolName, input, state),
          });
          return result;
        }
        try {
          const result = await operation();
          let afterState = state;
          const mappedResult = receiptResult(result);
          const timestamp = new Date().toISOString();
          afterState = maybeTripCircuitBreaker(afterState, mappedResult, timestamp);
          if (afterState !== state) publish(afterState);
          const effectiveRule = action ? getEffectiveRule(beforeState, action) : undefined;
          const base = {
            id: callId, timestamp, toolName, kind: toolKind(toolName), input, result: mappedResult,
            authority: action && configuredRule && effectiveRule ? {
              action, configuredRule, effectiveRule,
              source: beforeState.session.status === "PAUSED" ? "CIRCUIT_BREAKER" as const : beforeState.session.status === "REVOKED" ? "EMERGENCY_REVOKE" as const : beforeState.session.authorityOverrides[action] ? "SESSION_OVERRIDE" as const : "DEFAULT" as const,
            } : undefined,
            before, after: financials(afterState), evidenceRefs: evidenceRefs(toolName, input), traceId: `trace_webmcp_${callId}`,
            policyVersion: beforeState.session.policyVersion,
            stateChanged: beforeFingerprint !== stateFingerprint(afterState),
            provenanceFindings: provenanceFindings(toolName, input, afterState),
          } satisfies Omit<ToolInvocation, "previousReceiptHash" | "receiptHash" | "integrityStatus">;
          if (idempotencyKey && writeTools.includes(toolName)) {
            publish({ ...state, idempotencyRecords: [...state.idempotencyRecords, { key: idempotencyKey, toolName, inputFingerprint, originalCallId: callId, result }] });
          }
          await appendReceipt(base);
          return result;
        } catch (error) {
          const timestamp = new Date().toISOString();
          await appendReceipt({
            id: callId, timestamp, toolName, kind: toolKind(toolName), input, result: "ERROR",
            before, after: financials(state), evidenceRefs: evidenceRefs(toolName, input), traceId: `trace_webmcp_${callId}`,
            policyVersion: beforeState.session.policyVersion, stateChanged: beforeFingerprint !== stateFingerprint(state),
            provenanceFindings: provenanceFindings(toolName, input, state),
          });
          throw error;
        }
      },
    },
  };
}

export type AppStore = ReturnType<typeof createAppStore>;
export const appStore = createAppStore();
