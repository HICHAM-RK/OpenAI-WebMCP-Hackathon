import { initialAppState } from "../fixtures/anthropic";
import { evaluateAuthority } from "../authority/authority-gate";
import {
  applySessionRefundOverride,
  approveAccountCredit,
  issueRefund,
  requestAccountCredit,
} from "../actions/financial-actions";
import { selectRemainingCorrection } from "./selectors";

export function runCanonicalDomainChecks(): void {
  console.assert(evaluateAuthority(initialAppState, "refund", 400).outcome === "ALLOW");
  console.assert(evaluateAuthority(initialAppState, "refund", 500).outcome === "ALLOW");
  console.assert(evaluateAuthority(initialAppState, "refund", 501).outcome === "BLOCK");
  console.assert(evaluateAuthority(initialAppState, "refund", 1200).outcome === "BLOCK");

  const blocked = issueRefund(initialAppState, 1200);
  console.assert(blocked.result.status === "blocked");
  console.assert(blocked.state.dispute.executedCorrection === 0);

  let state = applySessionRefundOverride(blocked.state, 800);

  console.assert(evaluateAuthority(state, "refund", 800).outcome === "ALLOW");
  console.assert(evaluateAuthority(state, "refund", 801).outcome === "BLOCK");

  const refund = issueRefund(state, 800);
  state = refund.state;
  console.assert(refund.result.status === "executed");
  console.assert(state.dispute.executedCorrection === 800);
  console.assert(selectRemainingCorrection(state) === 400);

  const credit = requestAccountCredit(state, 400);
  state = credit.state;
  console.assert(credit.result.status === "approval_required");
  if (credit.result.status !== "approval_required") throw new Error("Expected approval request.");

  state = approveAccountCredit(state, credit.result.approvalId);
  console.assert(state.dispute.executedCorrection === 1200);
  console.assert(selectRemainingCorrection(state) === 0);
  console.assert(state.dispute.status === "RESOLVED");
}
