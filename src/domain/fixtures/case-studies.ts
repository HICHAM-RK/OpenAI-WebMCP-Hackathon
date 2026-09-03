import { defaultAuthority, initialAppState } from "./anthropic";

export type DemoCaseId = "anthropic" | "stripe" | "shopify";

export const demoCases: Record<DemoCaseId, { company: string; domain: string; initials: string; title: string; subtitle: string; scenario: "resolution" | "egress" }> = {
  anthropic: { company: "Anthropic", domain: "anthropic.com", initials: "AN", title: "Billing correction", subtitle: "Bounded refund, live override, and exact human approval.", scenario: "resolution" },
  stripe: { company: "Stripe", domain: "stripe.com", initials: "ST", title: "Merchant remediation", subtitle: "A financial correction proves cumulative limits and approval gates.", scenario: "resolution" },
  shopify: { company: "Shopify", domain: "shopify.com", initials: "SH", title: "Customer-data handoff", subtitle: "A merchant-data message is blocked outside the approved recipient boundary.", scenario: "egress" },
};

export function createDemoCase(caseId: DemoCaseId) {
  const state = structuredClone(initialAppState);
  if (caseId === "anthropic") return state;
  const demo = demoCases[caseId];
  state.customer = { id: `cust_${caseId}`, name: demo.company, approvedDomain: demo.domain, licensedSeats: caseId === "stripe" ? 40 : 30 };
  state.dispute = {
    ...state.dispute,
    id: `dispute_${caseId}_001`, customerId: state.customer.id,
    requestText: caseId === "stripe"
      ? "A fictional Stripe merchant reconciliation found an overcharge. Review the evidence and apply any correction only within live delegated authority."
      : "A fictional Shopify merchant needs a customer-data handoff. Keep the data inside the merchant recipient boundary and require human review before release.",
    requiredCorrection: caseId === "stripe" ? 1800 : 1200,
  };
  if (caseId === "stripe") {
    state.contract = {
      ...state.contract,
      baseSeatPrice: 112.5,
      effectiveSeatPrice: 90,
    };
    state.invoices = state.invoices.map((invoice) => ({
      ...invoice,
      seatCount: 40,
      billedRate: 112.5,
      billedAmount: 4500,
      correctRate: 90,
      correctAmount: 3600,
      discrepancy: 900,
    }));
  }
  if (caseId === "shopify") {
    state.invoices = [];
    state.dispute = { ...state.dispute, requiredCorrection: 0 };
    state.session = {
      ...state.session,
      defaultAuthority: defaultAuthority.filter((rule) => ["read_dispute", "send_customer_message"].includes(rule.action)),
    };
  }
  state.session = { ...state.session, objective: caseId === "stripe" ? "Resolve Stripe's fictional merchant remediation" : "Resolve Shopify's fictional customer-data handoff" };
  state.amendment = { ...state.amendment, description: caseId === "stripe" ? "Verifies the fictional 20% merchant reconciliation discount: €112.50 per seat becomes €90 through February 28, 2026." : "Verifies the fictional Shopify merchant data-handling scope and approved recipient boundary." };
  state.auditEvents[0] = { ...state.auditEvents[0], metadata: { channel: caseId === "stripe" ? "merchant_console" : "merchant_privacy_queue", customer: demo.company, fictionalDemo: true } };
  return state;
}
