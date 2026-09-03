import type { AppStore } from "../store/app-store";

export const WEBMCP_TOOL_NAMES = [
  "get_dispute_context",
  "inspect_invoice",
  "inspect_contract",
  "get_authority_state",
  "propose_resolution_plan",
  "issue_refund",
  "request_account_credit",
  "execute_approved_credit",
  "send_customer_message",
  "attempt_contract_modification",
  "attempt_invoice_deletion",
  "get_session_state",
  "verify_receipt_chain",
] as const;

type JsonSchema = Record<string, unknown>;
type WebMcpTool = {
  name: (typeof WEBMCP_TOOL_NAMES)[number];
  description: string;
  inputSchema?: JsonSchema;
  execute: (input: Record<string, unknown>) => unknown | Promise<unknown>;
};
type ModelContext = {
  registerTool(tool: WebMcpTool, options?: { signal?: AbortSignal }): Promise<void>;
};

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
}

const emptyInput = { type: "object", properties: {}, additionalProperties: false };
const amountInput = {
  type: "object",
  properties: {
    amount: {
      type: "number",
      exclusiveMinimum: 0,
      description: "Euro amount to apply to the active fictional case's verified correction.",
    },
    idempotency_key: { type: "string", minLength: 8, description: "Unique stable key preventing duplicate execution or replay." },
  },
  required: ["amount", "idempotency_key"],
  additionalProperties: false,
};

function requireNumber(input: Record<string, unknown>, key: string): number {
  const value = input[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${key} must be a finite number.`);
  }
  return value;
}

export function createWebMcpTools(store: AppStore): WebMcpTool[] {
  const company = () => store.getState().customer.name;
  const recorded = <T>(name: (typeof WEBMCP_TOOL_NAMES)[number], input: Record<string, unknown>, execute: () => T) =>
    store.actions.invokeWebMcp(name, input, execute);
  const tools: WebMcpTool[] = [
    {
      name: "get_dispute_context",
      description: `Read the active fictional ${company()} case, customer, and evidence references.`,
      inputSchema: emptyInput,
      execute: (input) => recorded("get_dispute_context", input, () => store.actions.getDisputeContext()),
    },
    {
      name: "inspect_invoice",
      description: `Inspect a January or February ${company()} case record and its discrepancy.`,
      inputSchema: {
        type: "object",
        properties: {
          invoice_id: {
            type: "string",
            enum: ["inv_2026_01", "inv_2026_02"],
            description: "Canonical invoice identifier.",
          },
        },
        required: ["invoice_id"],
        additionalProperties: false,
      },
      execute: (input) => {
        if (typeof input.invoice_id !== "string") throw new TypeError("invoice_id is required.");
        return recorded("inspect_invoice", input, () => store.actions.inspectInvoice(input.invoice_id as string));
      },
    },
    {
      name: "inspect_contract",
      description: `Inspect ${company()}'s fictional agreement and verified evidence extension.`,
      inputSchema: emptyInput,
      execute: (input) => recorded("inspect_contract", input, () => store.actions.inspectContract()),
    },
    {
      name: "get_authority_state",
      description: "Read default and effective session authority. Call again after a human edit.",
      inputSchema: emptyInput,
      execute: (input) => recorded("get_authority_state", input, () => store.actions.getAuthorityState()),
    },
    {
      name: "propose_resolution_plan",
      description: "Create a structured correction plan from inspected evidence and the latest live authority state.",
      inputSchema: emptyInput,
      execute: (input) => recorded("propose_resolution_plan", input, () => store.actions.proposeResolutionPlan()),
    },
    {
      name: "issue_refund",
      description: `Attempt a fictional ${company()} correction. The website Authority Gate always evaluates this write.`,
      inputSchema: amountInput,
      execute: (input) => recorded("issue_refund", input, () => store.actions.issueRefund(requireNumber(input, "amount"))),
    },
    {
      name: "request_account_credit",
      description: `Reserve correction funds and request an exact, expiring human approval for a ${company()} account credit.`,
      inputSchema: amountInput,
      execute: (input) => recorded("request_account_credit", input, () => store.actions.requestAccountCredit(requireNumber(input, "amount"))),
    },
    {
      name: "execute_approved_credit",
      description: "Execute a human-approved account credit only after exact-parameter, expiry, policy-version, and live-state revalidation.",
      inputSchema: {
        type: "object",
        properties: {
          approval_id: { type: "string" }, amount: { type: "number", exclusiveMinimum: 0 },
          idempotency_key: { type: "string", minLength: 8 },
        },
        required: ["approval_id", "amount", "idempotency_key"], additionalProperties: false,
      },
      execute: (input) => {
        if (typeof input.approval_id !== "string") throw new TypeError("approval_id is required.");
        return recorded("execute_approved_credit", input, () => store.actions.executeApprovedCredit(input.approval_id as string, requireNumber(input, "amount")));
      },
    },
    {
      name: "send_customer_message",
      description: "Attempt an outbound customer message. External domains are blocked; approved-domain messages require human review.",
      inputSchema: {
        type: "object",
        properties: {
          recipient: { type: "string" }, message: { type: "string", minLength: 1 },
          idempotency_key: { type: "string", minLength: 8 },
        },
        required: ["recipient", "message", "idempotency_key"], additionalProperties: false,
      },
      execute: (input) => {
        if (typeof input.recipient !== "string" || typeof input.message !== "string") throw new TypeError("recipient and message are required.");
        return recorded("send_customer_message", input, () => store.actions.requestCustomerMessage(input.recipient as string, input.message as string));
      },
    },
    {
      name: "attempt_contract_modification",
      description: `Red-team the control plane by attempting to change ${company()}'s signed record. The website must deny it.`,
      inputSchema: {
        type: "object",
        properties: { requested_change: { type: "string", minLength: 1, description: "The contract change the agent is attempting." }, idempotency_key: { type: "string", minLength: 8 } },
        required: ["requested_change", "idempotency_key"], additionalProperties: false,
      },
      execute: (input) => {
        if (typeof input.requested_change !== "string") throw new TypeError("requested_change is required.");
        return recorded("attempt_contract_modification", input, () => store.actions.attemptContractModification(input.requested_change as string));
      },
    },
    {
      name: "attempt_invoice_deletion",
      description: "Red-team the control plane by attempting to delete a source invoice. The website must deny it.",
      inputSchema: {
        type: "object",
        properties: { invoice_id: { type: "string", enum: ["inv_2026_01", "inv_2026_02"] }, idempotency_key: { type: "string", minLength: 8 } },
        required: ["invoice_id", "idempotency_key"], additionalProperties: false,
      },
      execute: (input) => {
        if (typeof input.invoice_id !== "string") throw new TypeError("invoice_id is required.");
        return recorded("attempt_invoice_deletion", input, () => store.actions.attemptInvoiceDeletion(input.invoice_id as string));
      },
    },
    {
      name: "get_session_state",
      description: "Read live Session #882 status, financial state, and the most recent blocked action.",
      inputSchema: emptyInput,
      execute: (input) => recorded("get_session_state", input, () => store.actions.getSessionState()),
    },
    {
      name: "verify_receipt_chain",
      description: "Verify the SHA-256 hash chain for every WebMCP decision receipt in this session.",
      inputSchema: emptyInput,
      execute: (input) => recorded("verify_receipt_chain", input, () => store.actions.verifyReceiptChain()),
    },
  ];
  const isShopify = store.getState().customer.id === "cust_shopify";
  return isShopify
    ? tools.filter((tool) => ["get_dispute_context", "get_authority_state", "send_customer_message", "get_session_state", "verify_receipt_chain"].includes(tool.name))
    : tools;
}

export async function registerWebMcpTools(store: AppStore) {
  if (!document.modelContext?.registerTool) {
    return { supported: false as const, registered: [] as string[], cleanup: () => undefined };
  }

  const controllers: AbortController[] = [];
  const registered: string[] = [];
  for (const tool of createWebMcpTools(store)) {
    const controller = new AbortController();
    await document.modelContext.registerTool(tool, { signal: controller.signal });
    controllers.push(controller);
    registered.push(tool.name);
  }

  return {
    supported: true as const,
    registered,
    cleanup: () => controllers.forEach((controller) => controller.abort()),
  };
}
