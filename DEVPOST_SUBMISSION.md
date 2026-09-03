# Agent Control Plane

> **The website-enforced authority layer for WebMCP agents.**

## Inspiration

AI is moving from copilots that recommend actions to autonomous agents that execute them.

These agents can issue refunds, contact customers and work with sensitive business data. As soon as AI begins taking consequential actions, prompt-level guardrails are no longer enough.

The question is no longer only **“What can this model do?”** It is:

**“What is this agent authorized to do right now?”**

Prompt instructions such as “never refund more than €500” are not enough. Prompts can become stale, be misunderstood or be influenced by malicious content hidden inside invoices, emails and documents.

We wanted to build a stronger model in which the website—not the agent’s prompt—enforces authority at execution time.

That led to our core thesis:

> **Capability is not authority. WebMCP exposes what an agent can do; Agent Control Plane governs what it is allowed to do.**

---

## What it does

Agent Control Plane is a website-enforced authority and security layer for WebMCP agents.

We demonstrate it through a fictional Anthropic billing dispute involving a verified €1,200 overcharge.

The agent uses real page-defined WebMCP tools to:

- Inspect two invoices
- Verify the signed contract
- Read its live delegated authority
- Propose an evidence-backed correction plan
- Attempt refunds
- Request an account credit
- Execute an exactly approved action
- Verify the final session state

The agent initially has a cumulative €500 refund limit. When it attempts the full €1,200 refund, the website blocks the action and no money moves.

The human operator then raises only that session’s authority to €800. The agent rereads the website’s live state and replans without being restarted:

1. Execute an €800 refund inside delegated authority.
2. Request human approval for the remaining €400 account credit.

The approval is bound to the exact action, amount, customer, session, policy version and expiration. Approval does not execute the credit—the agent must make a separate matching WebMCP call that is revalidated at execution time.

The app also demonstrates:

- Prompt-injection containment
- Cumulative-budget enforcement
- Replay and idempotency protection
- External-recipient blocking
- Human-reviewed customer messages
- Signed-record protection
- Emergency session revocation
- An automatic circuit breaker
- SHA-256-linked decision receipts

All payments and deliveries are simulated inside the security lab. The WebMCP calls, enforcement decisions and state transitions are part of the working application.

---

## How we built it

We built Agent Control Plane as a React and TypeScript application with 13 page-defined WebMCP tools registered through `document.modelContext.registerTool()`.

The React interface and WebMCP tools share the same observable store, pure domain actions and deterministic Authority Gate:

```text
React controls ──────┐
                     ├──> Shared store ──> Domain actions ──> Authority Gate
WebMCP tools ────────┘                           │
                                                └──> Audit events and receipts
```

This architecture ensures that a WebMCP tool cannot bypass the rules displayed by the interface. There is no separate demo-only execution path.

Each consequential action receives one of four decisions:

- `ALLOW`
- `ALLOW_WITH_LIMIT`
- `APPROVAL_REQUIRED`
- `DENY`

The WebMCP implementation includes tools for reading evidence, inspecting authority, proposing plans, moving money, requesting approval, sending customer messages, testing protected-record attacks and verifying the receipt chain.

To make the enforcement visible, we created:

- A **Control Center** with live financial and authority state
- An **Agent Plan Checkpoint**
- A streaming **Live Activity** feed
- An **Authorization Queue**
- A **WebMCP Recorder**
- A detailed **Audit Trail**
- A live **Security Posture** board
- A guided **Scenario Lab**

Every real WebMCP call creates a receipt containing its inputs, effective policy, decision, provenance findings and before/after state. Receipts are linked using SHA-256 hashes so the chain can be verified.

---

## Challenges we ran into

Our biggest challenge was maintaining one trustworthy source of truth.

The human interface and WebMCP tools had to call exactly the same domain actions. Otherwise, the interface could claim that an action was blocked while a tool silently bypassed the enforcement layer.

We also had to carefully separate concepts that are often combined:

- Requesting approval is not executing an action.
- Human approval is not the same as execution.
- Pending funds are reserved but not completed.
- A policy change invalidates plans created under older authority.
- Evidence may inform reasoning but must never become authority.
- Discovering a tool does not imply permission to use it.

Another major challenge was making invisible security understandable. When a security control succeeds, the dangerous side effect simply does not happen. We therefore designed strong blocked-action banners, inline explanations, live state changes and decision receipts that show exactly why an action was permitted, blocked or held for approval.

We also had to prevent fragmented refunds, repeated requests and parameter-swapped approvals from bypassing controls that appeared safe when evaluating only one call at a time.

---

## Accomplishments that we’re proud of

We are proud that Agent Control Plane is a coherent working product rather than a collection of disconnected security demonstrations.

Our canonical workflow completes an entire agent journey:

**Objective → Evidence → Plan → Block → Live authority change → Replan → Autonomous execution → Human approval → Final execution → Verifiable proof**

We are especially proud of the live-authority interaction. The human can change a session’s authority while the agent is already operating. The agent then rereads the website state, recognizes the new policy version and changes its plan without being restarted.

We are also proud of the WebMCP Recorder. It makes the underlying implementation visible by showing the real registered tools and the receipts produced by actual calls.

Other accomplishments include:

- 13 working WebMCP tools
- Cumulative rather than per-call refund limits
- Replay protection using required idempotency keys
- Exact, expiring and state-bound approvals
- Recipient-domain enforcement before data release
- Immutable signed-record policies
- Emergency revocation of consequential actions
- Automatic circuit breaking after repeated denied writes
- SHA-256-linked decision receipts
- A complete suite of 25 domain and security tests

Most importantly, even if an agent is manipulated by malicious evidence, the website’s authority boundary continues to hold.

---

## What we learned

We learned that agent safety cannot live only inside the agent.

The website owns the business data, consequential tools and current state. It is therefore the strongest place to enforce financial limits, approvals, recipient boundaries, leases and revocation.

We also learned that useful human-agent collaboration does not mean asking the human to approve every step.

A better model is:

> **Autonomy inside the boundary. Human control at the boundary.**

The agent should work independently within clearly delegated authority and stop only when it reaches a meaningful limit or approval requirement.

Finally, we learned that auditability should be created during execution, not reconstructed afterward. Recording the exact input, effective rule, decision and state transition gives operators stronger evidence than relying on an agent’s explanation of what it believes it did.

---

## What’s next for Agent Control Plane

The current project is a focused security lab with simulated financial and communication actions.

The next step is to turn the authority model into reusable infrastructure for websites exposing consequential WebMCP tools.

As autonomous agents become a primary interface for using software, every website exposing consequential tools will need an execution-time authority layer. We want Agent Control Plane to become that layer for WebMCP.

Future development could include:

- Authenticated human operators
- Passkey-backed approvals and authority changes
- Persistent, externally verifiable receipt storage
- Enterprise policy management
- Multi-tenant and customer-level isolation
- Reusable policy templates
- Real payment and customer-support integrations
- Approval notifications across devices
- Compliance exports and incident investigation
- A developer SDK for adding the Authority Gate to other WebMCP websites

The billing scenario demonstrates the model, but the same architecture could govern agents working in customer support, commerce, finance, healthcare and enterprise administration.

Our long-term vision is simple:

> **WebMCP gives agents capabilities. Agent Control Plane gives humans control over how those capabilities are used.**
