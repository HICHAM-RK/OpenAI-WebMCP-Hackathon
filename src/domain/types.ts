export type AuthorityMode =
  | "ALLOW"
  | "ALLOW_WITH_LIMIT"
  | "APPROVAL_REQUIRED"
  | "DENY";

export type AuthorityAction =
  | "read_dispute"
  | "inspect_invoice"
  | "inspect_contract"
  | "refund"
  | "account_credit"
  | "send_customer_message"
  | "modify_contract"
  | "delete_invoice";

export interface AuthorityRule {
  action: AuthorityAction;
  mode: AuthorityMode;
  limit?: number;
}

export interface Customer {
  id: string;
  name: string;
  approvedDomain: string;
  licensedSeats: number;
}

export interface Invoice {
  id: string;
  month: "2026-01" | "2026-02";
  seatCount: number;
  billedRate: number;
  billedAmount: number;
  correctRate: number;
  correctAmount: number;
  discrepancy: number;
  embeddedUntrustedText?: string;
  provenance?: "VERIFIED_SYSTEM" | "UNTRUSTED_DOCUMENT_TEXT";
}

export interface Contract {
  baseSeatPrice: number;
  discountPercent: number;
  originalDiscountExpiry: string;
  effectiveDiscountExpiry: string;
  effectiveSeatPrice: number;
}

export interface Amendment {
  id: string;
  number: number;
  description: string;
  discountExpiry: string;
  verified: boolean;
}

export type DisputeStatus =
  | "NEW"
  | "READY_TO_DELEGATE"
  | "IN_PROGRESS"
  | "BLOCKED"
  | "PARTIALLY_RESOLVED"
  | "RESOLVED";

export interface Dispute {
  id: string;
  customerId: string;
  requestText: string;
  status: DisputeStatus;
  requiredCorrection: number;
  executedCorrection: number;
}

export type ApprovalStatus =
  | "PENDING"
  | "APPROVED"
  | "MODIFIED"
  | "REJECTED"
  | "EXECUTED";

export interface Approval {
  id: string;
  sessionId: string;
  action: "account_credit" | "send_customer_message";
  amount?: number;
  approvedAmount?: number;
  reason: string;
  evidenceRefs: string[];
  status: ApprovalStatus;
  createdAt: string;
  expiresAt: string;
  recipient?: string;
  message?: string;
  rejectionReason?: string;
  binding: {
    toolName: "request_account_credit" | "send_customer_message";
    customerId: string;
    amount?: number;
    recipient?: string;
    message?: string;
    policyVersion: number;
    stateFingerprint: string;
  };
}

export type AuditActor = "AGENT" | "HUMAN" | "SYSTEM";

export interface AuditEvent {
  id: string;
  timestamp: string;
  actor: AuditActor;
  eventType: string;
  action?: string;
  decision?: "PERMIT" | "BLOCK" | "APPROVAL" | "EXECUTE" | "HUMAN";
  metadata?: Record<string, unknown>;
  traceId: string;
}

export interface Session {
  id: string;
  objective: string;
  status: "IDLE" | "ACTIVE" | "PAUSED" | "ENDED" | "REVOKED";
  defaultAuthority: AuthorityRule[];
  authorityOverrides: Partial<Record<AuthorityAction, AuthorityRule>>;
  policyVersion: number;
  cumulativeSpend: Partial<Record<AuthorityAction, number>>;
  authorityLease?: AuthorityLease;
}

export interface AuthorityLease {
  id: string;
  action: "refund";
  customerId: string;
  totalLimit: number;
  issuedAt: string;
  expiresAt: string;
  maxUses: number;
  uses: number;
  policyVersion: number;
  status: "ACTIVE" | "EXPIRED" | "REVOKED" | "PAUSED";
}

export interface FinancialSnapshot {
  required: number;
  executed: number;
  pendingApproval: number;
  remaining: number;
}

export interface PlanStep {
  id: string;
  action: "refund" | "account_credit";
  amount: number;
  checkpoint: "AUTONOMOUS" | "HUMAN_APPROVAL";
  status: "READY" | "COMPLETED" | "WAITING_APPROVAL" | "REVOKED";
}

export interface ResolutionPlan {
  id: string;
  createdAt: string;
  authorityReadAt: string;
  evidenceRefs: string[];
  status: "ACTIVE" | "COMPLETED" | "REVOKED";
  steps: PlanStep[];
  policyVersion: number;
}

export interface IdempotencyRecord {
  key: string;
  toolName: string;
  inputFingerprint: string;
  originalCallId: string;
  result: unknown;
}

export interface ToolInvocation {
  id: string;
  timestamp: string;
  toolName: string;
  kind: "READ" | "WRITE" | "PLAN";
  input: Record<string, unknown>;
  result: "PERMITTED" | "BLOCKED" | "APPROVAL_REQUIRED" | "EXECUTED" | "REPLAY_DETECTED" | "ERROR";
  authority?: {
    action: AuthorityAction;
    configuredRule: AuthorityRule;
    effectiveRule: AuthorityRule;
    source: "DEFAULT" | "SESSION_OVERRIDE" | "EMERGENCY_REVOKE" | "CIRCUIT_BREAKER";
  };
  before: FinancialSnapshot;
  after: FinancialSnapshot;
  evidenceRefs: string[];
  traceId: string;
  policyVersion: number;
  stateChanged: boolean;
  replayOf?: string;
  provenanceFindings: string[];
  previousReceiptHash: string;
  receiptHash: string;
  integrityStatus: "VERIFIED";
}

export interface SecurityState {
  deniedAttemptTimestamps: string[];
  circuitBreakerTrips: number;
  lastTripAt?: string;
}

export interface AppState {
  customer: Customer;
  invoices: Invoice[];
  contract: Contract;
  amendment: Amendment;
  dispute: Dispute;
  session: Session;
  pendingApprovals: Approval[];
  auditEvents: AuditEvent[];
  toolInvocations: ToolInvocation[];
  idempotencyRecords: IdempotencyRecord[];
  securityState: SecurityState;
  resolutionPlan?: ResolutionPlan;
  lastBlockedAction?: {
    action: AuthorityAction;
    requestedAmount?: number;
    recipient?: string;
    reason: string;
  };
  agentLastReadAuthorityAt?: string;
  agentLastReadAuthorityVersion?: number;
}
