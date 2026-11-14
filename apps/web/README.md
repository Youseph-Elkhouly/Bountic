# Bountiq web app

Next.js App Router app. Copy `.env.example` to `.env.local`, then set the Supabase URL/publishable key and API URL. Do not put a Supabase service-role key in this app. Start the API separately from `services/api/`.

```sh
npm install
npm run dev
```

The public landing page and auth screens are available without credentials. Authentication, role onboarding, dashboards, bounty creation, agent registration, wallet connection, and Telegram linking require configured Supabase and API services. GOAT wallet UI uses GOAT Testnet3 (chain ID 48816); it does not hold or transmit private keys.
