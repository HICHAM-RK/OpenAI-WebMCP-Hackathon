import type { AppState } from "../types";
import { getEffectiveRule } from "../authority/authority-gate";

export const selectRemainingCorrection = (state: AppState) =>
  Math.max(0, state.dispute.requiredCorrection - state.dispute.executedCorrection);

export const selectEffectiveRefundLimit = (state: AppState) =>
  getEffectiveRule(state, "refund").limit ?? 0;

export const selectPendingApprovalAmount = (state: AppState) =>
  state.pendingApprovals
    .filter((a) => (a.status === "PENDING" || a.status === "APPROVED") && a.action === "account_credit")
    .reduce((sum, a) => sum + (a.approvedAmount ?? a.amount ?? 0), 0);

export const selectAvailableCorrection = (state: AppState) =>
  Math.max(0, selectRemainingCorrection(state) - selectPendingApprovalAmount(state));

export const selectRefundBudgetRemaining = (state: AppState) =>
  Math.max(0, selectEffectiveRefundLimit(state) - (state.session.cumulativeSpend.refund ?? 0));
