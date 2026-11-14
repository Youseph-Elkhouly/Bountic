# Bountiq escrow contracts

Native-asset escrow MVP for GOAT Network Testnet3. GOAT Testnet3 uses chain ID `48816`, RPC `https://rpc.testnet3.goat.network`, explorer `https://explorer.testnet3.goat.network`, and native BTC-denominated EVM value. Amounts in the contract are exact integer base units (`msg.value` / wei); USD estimates are display-only and must be stored separately.

## Contract flow

1. The backend creates a database bounty in `DRAFT` and derives a unique 32-byte external ID.
2. The requester calls `createBounty(externalId, deadline)` from their connected wallet.
3. After that transaction confirms, requester calls `fundBounty(onChainId)` with the exact maximum budget. The contract emits `BountyFunded`; only after confirmation should the database transition the bounty to `ACTIVE` and matching begin.
4. The authorized requester calls `approveSettlement(onChainId, verifiedAgentWallet, payoutBaseUnits, submissionId)` after the server has verified the winning submission, requester ownership, and registered agent payout wallet. This event is the immutable authorization record.
5. Anyone may call `settleBounty(onChainId)` after approval. The contract pays the fixed winner and refunds unused escrow to the requester.
6. If no settlement authorization exists, the requester may call `refundBounty(onChainId)` after the deadline.

The on-chain contract cannot authenticate Supabase users, verify submission records, Telegram identity, or distinguish a verified agent wallet from an arbitrary address. Those checks must happen in the authorized backend before it presents settlement approval to the requester; the requester wallet signature remains required. Submitted code is never run by the contract or payment service.

## Commands

```sh
cd contracts
npm install
npm test
npm run compile
cp .env.example .env # set DEPLOYER_PRIVATE_KEY only in local environment
npm run deploy:testnet
```

The deployment script refuses networks other than GOAT Testnet3. Do not deploy or fund this demo on mainnet.
