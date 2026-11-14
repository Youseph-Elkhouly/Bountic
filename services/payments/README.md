# Payments service boundary

This package prepares unsigned GOAT Testnet3 transactions for user-owned wallets and verifies successful transaction receipts. It never stores or requests requester/agent private keys. Set `BOUNTIQ_ESCROW_ADDRESS` after deploying the contract; load the values from `.env.example` in the server environment.

The platform API should own authentication, authorization, Supabase writes, transaction-to-bounty association, and submission/agent payout-wallet validation. Use the authenticated session to identify the requester; never accept requester identity from arbitrary request JSON. Before exposing `prepareApproveSettlement`, load the submission and bounty from trusted storage, ensure the caller owns the bounty, the submission belongs to it, payout is within the funded base-unit budget, and the recipient matches the agent's verified registered GOAT wallet. Then require the requester wallet to sign the returned transaction.

After wallet submission, call `confirmTransaction(hash, expectedEvent)` with the event for that operation (`BountyCreated`, `BountyFunded`, `SettlementApproved`, `BountySettled`, or `BountyRefunded`) and persist the returned hash/block/explorer URL only when receipt status is `1` and that escrow event is present. Transition to `ACTIVE`, `SETTLED`, or `REFUNDED` from confirmed contract events, not from a requested transaction or optimistic UI state. Integrating the storage/API routes remains the `services/api/` owner’s task.

Bounty/payment interface: `bountyId` is a decimal string for the unique on-chain uint256; `externalId` and `submissionId` are 32-byte hex IDs; all amounts are decimal strings containing exact native base units; `deadline` is a Unix-seconds integer; `txHash` is a 32-byte transaction hash. Fiat estimates are separate metadata and are never used for escrow calculations.

## Qatom agent tool purchases

Earner agents buy tools and data through Qatom from their own agent wallet. GOAT escrow still pays out bounties and is unchanged. `src/qatom/` exports `QatomClient` (MCP), `SpendingGuard`, and `createReceiptReporter` from `src/index.ts`.

### Phase 0: what the Qatom docs say (checked 2026-11-14)

Sources: docs.qatom.ai/guide/getting-started, qatom.ai/capabilities, pay.m.todaq.net/v4/openapi.json, github.com/TODAQmicro/qatom-skill. "Not documented" means we found nothing and have not guessed.

1. **Server-side access.** The MCP server at `https://mcp.m.todaq.net/mcp` takes `Authorization: Bearer <access token>` issued by Qatom's OAuth/OIDC provider at `https://pay.m.todaq.net` after an **interactive email + 2FA sign-in** (scopes `openid profile email twin`). Access tokens last about an hour, and refresh tokens are single-use and last 24 hours. The REST API (`/v4`) also supports client credentials (`POST /v4/account/oauth/token` with HTTP Basic `client_id:client_secret`), but the docs do not say that this token works on the MCP server or for agent checkout (`/v4/agent/*` returns 401 "Not an agent's OIDC token for a user"). **Status: BLOCKED for unattended backend use.** Today a human must sign in and hand the process a token (`QATOM_ACCESS_TOKEN`).
2. **Tools.** The names are documented: `catalog_search` (query → items with id, name, description, price, seller, input schema), `agent_checkout` (item id + arguments → receipt), and `agent_wallet_info` (primary and agent wallet balances in USD-TDN). Carts use `cart_add_item`, `cart_view`, `cart_update_item`, `cart_remove_item`, `cart_discard`, `cart_checkout`, `cart_pay` (takes an approval id) and `cart_finish`. **The exact input and output field names are not documented.** They are isolated in `src/qatom/client.ts` (`UNCONFIRMED`, `checkoutOutcome`, `getAgentWallet`) and parsed strictly. Run `npm run qatom:discover` (read-only) after signing in to print the live `tools/list` schemas, and confirm them before any real purchase.
3. **Receipts.** The docs list a transaction id, item, amount paid, seller and the seller's response, plus an email receipt for every direct purchase. Cart payments return `transaction_id` and `amount_charged` per line. A verification hash, signature or explorer link is **not documented**. The full raw receipt is kept and sent to Bountiq.
4. **Approvals.** Purchases above the wallet's auto-approve limit need a human. The REST approval object has `id` (`aar_…`), `state` (pending, declined, expired, used), `amount`, `merchant`, `expires_at` and `approve_url`, and an approval is good for about 15 minutes and one use. Status is available at `GET /v4/agent/approvals/{id}?wait=0..25`, and the agent resumes by calling again with the approval id. The exact fields `agent_checkout` returns for a pending purchase are not documented.
5. **Retries.** "A retry is a new charge, even under auto-approve." A call the seller rejects can still be charged. There is no idempotency key; only hosted checkout links are idempotent. Before retrying, check the last receipt's transaction id and the agent wallet balance.

Amounts are USD-TDN strings with three decimals (minimum paid price 0.001). This module keeps them as bigint thousandths and never uses floats.

### Spending guard

`SpendingGuard.purchase(plan)` is the only path to `checkout`. For each purchase it:

- re-reads the item from the catalog and refuses if the price or seller differs from the plan (overspending or redirection);
- refuses if the price exceeds the bounty's remaining tool budget (completed, pending-approval and unresolved purchases all count) or the agent wallet balance;
- keys each purchase `bountyId:agentId:itemId:stepId` and returns the stored result for a repeated key instead of buying again; purchases for one bounty run one at a time;
- passes `pending_approval` through with its approval link and never approves anything itself;
- if a checkout call fails, marks the key unknown and throws `QatomOutcomeUnknownError`. The key stays locked until `guard.reconcile(plan, outcome)` records what Qatom actually did, and nothing is retried automatically;
- treats catalog names and descriptions as inert text: they are never parsed for instructions, and they are stripped of control and bidi characters and truncated before reaching receipts.

Every result is sent to `onReceipt`. `createReceiptReporter` posts it to the Bountiq API at `POST /internal/qatom/receipts` with `INTERNAL_WORKER_TOKEN`. If delivery fails, the receipt is re-sent on the next call with the same key, without charging again. `InMemoryLedger` is process-local; a long-running worker should back `PurchaseLedger` with durable storage.

### Demo

`npm run qatom:demo` shows the wallet balance, searches the catalog, makes a purchase under the limit, makes one that needs approval, attempts one over budget, and repeats a purchase to show there is no second charge. It spends real USD-TDN and refuses to run unless `QATOM_DEMO_CONFIRM_SPEND=yes`. A human must fund the agent wallet with a few USD-TDN and sign off on any real-money top-up first. See `.env.example` for the settings.
