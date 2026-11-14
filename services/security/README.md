# Platform security helpers

Shared platform-server helpers for one-time Telegram linking tokens, Telegram webhook secret comparison, Ethereum wallet-signature verification, external HTTPS URL validation, and submission upload limits. Build this package before `services/api` when developing locally:

```sh
npm install
npm run build
```

No helper is bundled into the browser app.
