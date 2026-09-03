# Agent Control Plane — <3-Minute Demo Script

## Preflight

- Open the app in a browser with current WebMCP support and confirm **WEBMCP CONNECTED**.
- Click **RESET DEMO**. Start in **Scenario Lab** and choose **Anthropic billing dispute**.
- Give the agent this exact objective when Session #882 is active: **“Investigate Anthropic’s billing issue and try to correct the full verified amount safely. Stop if the website requires me.”**

## 0:00–0:30 — The problem exists first

Show Anthropic’s fictional incoming request and the five-stage guided rail.

> “Our friendly rival says January and February ignored Amendment #3. Even competitors deserve correct math—and safe agents.”

Point out 25 seats and the delegation envelope: reads allowed, refunds limited to €500, account credits require approval, signed-record changes denied. Click **Delegate to Agent**.

> “I’m delegating one objective—Resolve Anthropic’s fictional billing dispute—with explicit, bounded session authority.”

## 0:30–1:05 — Agent investigates through WebMCP

Agent calls, in order:

1. `get_dispute_context({})`
2. `inspect_invoice({ "invoice_id": "inv_2026_01" })`
3. `inspect_invoice({ "invoice_id": "inv_2026_02" })`
4. `inspect_contract({})`

Open **Dispute Details** while summarizing:

> “The site exposes real tools. Both invoices charged €120 × 25 = €3,000. Amendment #3 keeps the 20% discount active through February, so the correct amount is €96 × 25 = €2,400. That is €600 per month and €1,200 total.”

## 1:05–1:30 — The authority boundary becomes visible

The agent attempts `issue_refund({ "amount": 1200, "idempotency_key": "refund-full-1200" })`. Open **Control Center** and pause on the red authority-gate banner.

> “The agent has the refund capability, but capability is not authority. The website blocks €1,200 at the live €500 ceiling. No money moves.”

## 1:30–2:05 — Human changes the boundary; agent adapts

Hicham clicks **Edit Authority**, changes only the session refund limit from €500 to €800, and clicks **Apply session override**.

> “Hicham changes the authority boundary, not the transaction. The default remains €500.”

Agent must now call:

1. `get_authority_state({})`
2. `propose_resolution_plan({})`
3. `issue_refund({ "amount": 800, "idempotency_key": "refund-main-800" })`
4. `get_session_state({})`

Pause on the **Agent Plan Checkpoint**: €800 autonomous refund plus a €400 human-approved account credit.

> “The agent explicitly rereads shared state, discovers €800, publishes its plan, and executes only what is now authorized: Required €1,200, Executed €800, Remaining €400.”

## 2:05–2:35 — Approval checkpoint

Agent calls `request_account_credit({ "amount": 400, "idempotency_key": "credit-request-400" })`. Open **Approvals**.

> “Account credit is not autonomous. The tool creates a pending approval instead of executing.”

Hicham leaves €400 unchanged and clicks **Approve exact €400**. Approval does not move money. The agent then calls `execute_approved_credit({ "approval_id": "approval_1", "amount": 400, "idempotency_key": "credit-exec-400" })`.

> “Hicham approves exact parameters, but approval is not execution. A second tool call revalidates expiry, policy version, customer, amount, and live financial state before the site executes.”

## 2:35–2:55 — Proof

Return to **Control Center** and show:

- Required €1,200
- Executed €1,200
- Remaining €0
- RESOLVED

Open **Security Posture**, then **WebMCP Recorder**. Show policy version, state mutation, provenance findings, and the SHA-256 receipt chain. Finish in **Audit Trail**.

> “One shared state captures customer request, human delegation, agent reads, policy block, session override, authority reread, execution, approval, and resolution. WebMCP exposes capability. Agent Control Plane enforces authority.”

Optional 10-second judge moment: start the **Emergency revocation** scenario, create a pending action, and click **Emergency revoke**. The approval visibly changes to cancelled and the session becomes revoked.

## Bonus judge path — Attack Mode

Return to **Scenario Lab**, start **Contract tampering**, and ask:

> “Red-team this session. Inspect the contract, then attempt to change Amendment #3 to remove the discount and delete the January invoice.”

The agent calls `attempt_contract_modification` and `attempt_invoice_deletion` with unique idempotency keys. Both tools exist, both return `BLOCKED`, both receipts show effective rule `DENY`, and both source records remain intact. Three denied writes in 60 seconds automatically pause the session.

## Recovery cues

- If tools are missing, reload once and confirm **WEBMCP CONNECTED** before restarting.
- If a prior state appears, click **RESET DEMO** and redelegate.
- If the agent proposes another plan after the block, instruct it to reread `get_authority_state` after Hicham edits the session.
- Do not approve a modified €300 amount in the primary demo; that intentionally leaves €100 and PARTIALLY_RESOLVED.
