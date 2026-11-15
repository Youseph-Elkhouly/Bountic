# Bountiq API

Hono API owned by the platform branch. Set `services/api/.env` from `.env.example`; Supabase secret key and Telegram bot secrets stay in this server process only. Apply migrations with the Supabase CLI from `services/api/` after linking your Supabase project:

```sh
npm install
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
npm run dev
```

Authentication uses a Supabase access token in `Authorization: Bearer ...`; every user route verifies it with Supabase Auth before reading the profile or performing privileged database writes. Sensitive service-role operations have explicit owner/role checks. The database RLS rules remain enabled for browser access.

`POST /api/bounties` saves a `draft`. Requesters sign a one-time wallet challenge before funding. The API keeps the verified GOAT wallet linked to the authenticated requester, then builds unsigned transactions through `PaymentsClient`; signing and broadcasting remain in the browser. The two-step funding flow verifies the `BountyCreated` and `BountyFunded` events from the configured escrow, extracts the actual on-chain bounty ID, checks the wallet and exact amount, and only then activates the bounty. Settlement uses the immutable database authorization plus the agent's verified registered payout wallet. Both settlement approval and the final payout must be confirmed by the configured escrow before the database records them as successful.

When `ENGINE_API_URL` is unset, funded bounties use a clearly development-only deterministic fixture after basic eligibility filtering; it does not calculate ranking scores. Configure the engine adapter when its contract is agreed. Telegram sends use a durable `notification_jobs` outbox; schedule `POST /internal/notifications/dispatch` with `INTERNAL_WORKER_TOKEN` to retry queued delivery. Webhook updates are checked using Telegram's secret-token header, stored by unique update ID, and duplicate submissions are tied to that ID.

## Autonomous text agent worker

Apply migrations through `0011` before starting the API. Enable autonomy per agent only after its GOAT payout address is verified. The worker runs separately from the HTTP server:

```sh
cd services/api
npm run worker:agents
```

Configure `AGENT_MODEL_API_URL`, `AGENT_MODEL_API_KEY`, and `AGENT_MODEL_NAME` in the server's local `.env`. The worker supports OpenAI-compatible text generation for writing, research summaries, content, marketing, and analysis. It exposes no shell, filesystem, browser, network tools, or wallet access. Token limits, concurrency, timeouts, three attempts, cancellation, task logs, and idempotent submission records are enforced. The requester still has to review/select the submission and authorize settlement.

The platform branch currently expects `@bountiq/payments` to be available as an importable package and a deployed escrow address in `BOUNTIQ_ESCROW_ADDRESS`. The payments package and contract are owned by `feat/goat-payments`; merge that package first and configure/deploy it to GOAT Testnet3 before live funding. No `PAYMENTS_API_URL` payments server is used. Qatom purchase receipts remain available, but autonomous execution does not buy Qatom tools.

## Qatom tool-purchase receipts

Earner agents buy tools and data through Qatom from their own wallets; GOAT escrow still handles bounty payouts. The payments module reports every purchase result to `POST /internal/qatom/receipts` with `Authorization: Bearer $INTERNAL_WORKER_TOKEN`, using the payload in `docs/qatom-integration-plan.md`. Amounts are decimal strings with up to three places (`"0.010"`), never floats. The `idempotencyKey` must be `bountyId:agentId:itemId:stepId`.

Responses: `201` for a new receipt, `200` when a pending approval is refreshed or settled, `200` with `duplicate: true` when the same result is reported again, and `409` when the key already holds a different purchase or a final result. Completed and rejected receipts are immutable in the database (migration `0009_qatom_receipts.sql`), and bounty requesters and agent owners can read them through RLS. Both dashboards list them; only the earner dashboard shows approval links.
