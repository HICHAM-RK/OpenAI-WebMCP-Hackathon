import type { AppState, AuthorityAction, AuthorityRule } from "../types";

export type AuthorityDecision =
  | { outcome: "ALLOW"; rule: AuthorityRule }
  | { outcome: "APPROVAL_REQUIRED"; rule: AuthorityRule }
  | {
      outcome: "BLOCK";
      rule: AuthorityRule;
      reason: string;
      currentLimit?: number;
    };

const consequentialActions: AuthorityAction[] = [
  "refund", "account_credit", "send_customer_message", "modify_contract", "delete_invoice",
];

export function getEffectiveRule(
  state: AppState,
  action: AuthorityAction,
): AuthorityRule {
  if (
    (state.session.status === "REVOKED" || state.session.status === "PAUSED") &&
    consequentialActions.includes(action)
  ) {
    return { action, mode: "DENY" };
  }
  const override = state.session.authorityOverrides[action];
  if (override) return override;

  return (
    state.session.defaultAuthority.find((rule) => rule.action === action) ?? {
      action,
      mode: "DENY",
    }
  );
}

export function evaluateAuthority(
  state: AppState,
  action: AuthorityAction,
  amount?: number,
): AuthorityDecision {
  const rule = getEffectiveRule(state, action);

  if (consequentialActions.includes(action) && state.session.status !== "ACTIVE") {
    return {
      outcome: "BLOCK",
      rule,
      reason: state.session.status === "REVOKED"
        ? "All consequential actions are blocked because the human operator revoked this session."
        : state.session.status === "PAUSED"
          ? "All consequential actions are blocked because the automatic circuit breaker paused this session."
          : "Consequential actions require an active delegated session.",
    };
  }

  if (rule.mode === "ALLOW") return { outcome: "ALLOW", rule };
  if (rule.mode === "APPROVAL_REQUIRED") {
    return { outcome: "APPROVAL_REQUIRED", rule };
  }
  if (rule.mode === "DENY") {
    return {
      outcome: "BLOCK",
      rule,
      reason: "Action is denied by current delegated authority.",
    };
  }

  const limit = rule.limit ?? 0;
  const spent = action === "refund" ? state.session.cumulativeSpend.refund ?? 0 : 0;
  const available = Math.max(0, limit - spent);

  if (action === "refund") {
    const lease = state.session.authorityLease;
    if (!lease || lease.status !== "ACTIVE") {
      return { outcome: "BLOCK", rule, currentLimit: available, reason: "No active refund authority lease exists for this session." };
    }
    if (lease.customerId !== state.customer.id || lease.policyVersion !== state.session.policyVersion) {
      return { outcome: "BLOCK", rule, currentLimit: available, reason: "Refund lease is stale or bound to a different customer." };
    }
    if (Date.now() >= new Date(lease.expiresAt).getTime()) {
      return { outcome: "BLOCK", rule, currentLimit: available, reason: "Refund authority lease has expired." };
    }
    if (lease.uses >= lease.maxUses) {
      return { outcome: "BLOCK", rule, currentLimit: available, reason: "Refund authority lease has no remaining uses." };
    }
  }

  if (amount === undefined) {
    return {
      outcome: "BLOCK",
      rule,
      currentLimit: available,
      reason: "A numeric amount is required for this authority rule.",
    };
  }

  if (amount <= available) return { outcome: "ALLOW", rule };

  return {
    outcome: "BLOCK",
    rule,
    currentLimit: available,
    reason: `Requested amount €${amount} exceeds the remaining cumulative session budget of €${available}.`,
  };
}
