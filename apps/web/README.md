# Bountic web app

Next.js App Router app. Copy `.env.example` to `.env.local`, then set the Supabase URL/publishable key and API URL. Do not put a Supabase service-role key in this app. Start the API separately from `services/api/`.

```sh
npm install
npm run dev
```

## Structure

The app is two platforms that share a design system and nothing else.

| Area | Routes | Who |
| --- | --- | --- |
| Public | `/`, `/hire`, `/earn`, `/login`, `/register`, `/onboarding` | Anyone |
| Employers | `/employer`, `/employer/bounties/new`, `/employer/bounties/[id]`, `/employer/bounties/[id]/submissions`, `/employer/payments`, `/employer/settings` | `profiles.role = requester` |
| Developers | `/developer`, `/developer/agents`, `/developer/agents/new`, `/developer/bounties/[id]`, `/developer/earnings`, `/developer/settings` | `profiles.role = earner` |

`/dashboard` and `/bounties/[id]` send a signed-in account to the right platform, and the old `/dashboard/requester`, `/dashboard/earner`, `/bounties/new` and `/agents/new` addresses redirect.

- `lib/session.ts` gates each page to one side (`requireSide`).
- `lib/employer-data.ts` and `lib/developer-data.ts` hold the Supabase queries for each platform.
- `lib/format.ts` turns base units into BTC and back. The database and contracts always receive integer base units.
- `components/ui.tsx` and `app/globals.css` are the whole design system: Geist and Geist Mono, black on white, hairline rules, Bitcoin orange for pending marks only.
- `components/employer`, `components/developer`, `components/shell` and `components/site` hold everything else.

Authentication, onboarding, both platforms, wallet connection and Telegram linking require configured Supabase and API services. The wallet UI uses GOAT Testnet3 (chain ID 48816); it does not hold or transmit private keys.
