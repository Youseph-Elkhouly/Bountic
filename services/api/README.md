# Bountiq API

Hono API owned by the platform branch. Set `services/api/.env` from `.env.example`; Supabase secret key and Telegram bot secrets stay in this server process only. Apply migrations with the Supabase CLI from `services/api/` after linking your Supabase project:

```sh
npm install
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
npm run dev
```

Authentication uses a Supabase access token in `Authorization: Bearer ...`; every user route verifies it with Supabase Auth before reading the profile or performing privileged database writes. Sensitive service-role operations have explicit owner/role checks. The database RLS rules remain enabled for browser access.

`POST /api/bounties` saves a `draft`. Funding has an idempotent two-transaction adapter flow (`funding-intent`, `funding-ready`, `funding-confirm`) and stays blocked until the payment service returns confirmed escrow events. `prepare-create` should return `phase: create` with a create transaction until the external ID is on-chain; after creation it should resume with `phase: fund`, on-chain ID, and funding transaction. `POST /api/bounties/:id/select-winner` uses a database RPC that verifies requester ownership, submission membership, payout cap, and the verified registered agent wallet, then records one immutable settlement authorization before asking the payments adapter for an unsigned transaction.

When `ENGINE_API_URL` is unset, funded bounties use a clearly development-only deterministic fixture after basic eligibility filtering; it does not calculate ranking scores. Configure the engine adapter when its contract is agreed. Telegram sends use a durable `notification_jobs` outbox; schedule `POST /internal/notifications/dispatch` with `INTERNAL_WORKER_TOKEN` to retry queued delivery. Webhook updates are checked using Telegram's secret-token header, stored by unique update ID, and duplicate submissions are tied to that ID.

The current payment adapter expects the paths listed in `src/integrations.ts`; it returns 503 when `PAYMENTS_API_URL` is absent or the remote endpoint is not ready. These paths are a proposal pending confirmation from the payments owner on the coordination issue.

## Qatom tool-purchase receipts

Earner agents buy tools and data through Qatom from their own wallets; GOAT escrow still handles bounty payouts. The payments module reports every purchase result to `POST /internal/qatom/receipts` with `Authorization: Bearer $INTERNAL_WORKER_TOKEN`, using the payload in `docs/qatom-integration-plan.md`. Amounts are decimal strings with up to three places (`"0.010"`), never floats. The `idempotencyKey` must be `bountyId:agentId:itemId:stepId`.

Responses: `201` for a new receipt, `200` when a pending approval is refreshed or settled, `200` with `duplicate: true` when the same result is reported again, and `409` when the key already holds a different purchase or a final result. Completed and rejected receipts are immutable in the database (migration `0009_qatom_receipts.sql`), and bounty requesters and agent owners can read them through RLS. Both dashboards list them; only the earner dashboard shows approval links.
