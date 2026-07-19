# Within MVP

Within is a desktop-first company-spending prototype with local product state, programmable rules, approval review, and a server-side payment-provider boundary.

## Run locally

```bash
npm ci
cp .env.example .env.local
npm run dev
```

The default `MockPaymentProvider` requires no credentials. The approval UI calls the server API, which selects either the mock provider or `ArcPaymentProvider`; browser code never receives treasury credentials.

## Supported demo modes

### A — Fully local demo

```dotenv
POLICY_GENERATOR=local
POLICY_PUBLISHER=mock
PAYMENT_PROVIDER=mock
NEXT_PUBLIC_DEMO_MODE=true
```

This is the recommended judging fallback. After dependencies are installed it requires no API keys, deployed contract, testnet funds, or internet connection.

### B — AI with mock settlement

```dotenv
POLICY_GENERATOR=openai
POLICY_PUBLISHER=mock
PAYMENT_PROVIDER=mock
```

### C — Full Arc Testnet demo

```dotenv
POLICY_GENERATOR=openai
POLICY_PUBLISHER=arc
PAYMENT_PROVIDER=arc
ENABLE_ARC_POLICY_WRITES=true
```

Add the OpenAI and Arc server credentials documented below for modes B and C.

## Reset and health

Set `NEXT_PUBLIC_DEMO_MODE=true` to expose the discreet Reset demo action inside the profile menu. Reset reseeds the browser’s versioned `sessionStorage`, returns to Dashboard, restores the original approvals, activity and rules, and creates fresh client idempotency values. It never changes, pauses, or republishes the deployed smart contract.

`GET /api/health` returns only readiness categories for the application, rule generator, publisher, and payment provider. It never performs a transaction or returns secrets, addresses, RPC payloads, or configuration contents.

For a complete rehearsal: approve Emily Carter’s OpenAI purchase, confirm the counter and activity update, create and edit a rule, activate it, pause it, reactivate it, then use Reset demo and verify the original Dashboard and seeded rules return. Refresh before approval, with the drawer open, after payment, after draft creation, and after activation to verify completed state survives while unfinished processing returns to Idle.

Rule publishing also defaults to `MockPolicyPublisher`, so activation, pausing, and reactivation work locally without Arc configuration:

```dotenv
POLICY_PUBLISHER=mock
ENABLE_ARC_POLICY_WRITES=false
```

## Rule generation

The local generator is the default and requires no API key:

```dotenv
POLICY_GENERATOR=local
ALLOW_LOCAL_AI_FALLBACK=false
```

To use OpenAI Structured Outputs, keep the key server-side and configure:

```dotenv
POLICY_GENERATOR=openai
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.6
OPENAI_POLICY_TIMEOUT_MS=12000
ALLOW_LOCAL_AI_FALLBACK=false
```

The server uses the Responses API with a strict Zod schema. OpenAI generates editable spending-rule content only. Within creates the policy ID, Draft status, and timestamps in application code, then validates and normalises the structured output again before returning it to the browser.

`ALLOW_LOCAL_AI_FALLBACK=false` keeps OpenAI failures explicit. When set to `true`, an unavailable OpenAI provider may return a local deterministic draft with the message “Rule created using the local demo engine.” No technical provider error is exposed.

AI never activates or publishes a rule. A person must review the editable draft and select Activate rule. Settlement guards remain separate from generation and are added only by the policy publisher during activation.

## Smart contract development

[Install Foundry](https://book.getfoundry.sh/getting-started/installation), then install the pinned workspace dependencies and run the suite:

```bash
cd contracts
forge install OpenZeppelin/openzeppelin-contracts@v5.4.0 --no-git
forge install foundry-rs/forge-std@v1.9.7 --no-git
forge fmt --check
forge test -vv
```

`WithinPolicyExecutor` is a minimal, non-upgradeable executor. It authorises one server-side executor, enforces per-payment and deterministic 30-day native-USDC limits, rejects duplicate execution IDs, and forwards the exact approved settlement value.

## Deploy to Arc Testnet

Use a dedicated testnet wallet. Fund it with Arc Testnet USDC before deployment and keep enough test USDC for deployment, contract calls, and network fees.

```bash
cd contracts
export ARC_RPC_URL=https://rpc.testnet.arc.network
export PRIVATE_KEY=0x...
export WITHIN_CONTRACT_OWNER=0x...
export WITHIN_CONTRACT_EXECUTOR=0x...

forge script script/DeployWithinPolicyExecutor.s.sol:DeployWithinPolicyExecutor \
  --rpc-url "$ARC_RPC_URL" \
  --broadcast
```

The owner must match the address derived from `PRIVATE_KEY`, because the deployment script immediately creates the initial `POL-ENG-AI-001` rule. Never print, share, or commit a private key.

Verify the deployed contract on ArcScan:

```bash
forge verify-contract <CONTRACT_ADDRESS> \
  src/WithinPolicyExecutor.sol:WithinPolicyExecutor \
  --constructor-args $(cast abi-encode "constructor(address,address)" <OWNER> <EXECUTOR>) \
  --chain-id 5042002 \
  --verifier blockscout \
  --verifier-url https://testnet.arcscan.app/api/
```

## Connect the application

Add the deployment to `.env.local`; `ARC_POLICY_CONTRACT_ADDRESS` is intentionally server-only and must never use a `NEXT_PUBLIC_` prefix.

```dotenv
PAYMENT_PROVIDER=arc
ARC_RPC_URL=https://rpc.testnet.arc.network
ARC_TREASURY_PRIVATE_KEY=0x...
ARC_RECIPIENT_ADDRESS=0x...
ARC_POLICY_CONTRACT_ADDRESS=0x...
ARC_TEST_SETTLEMENT_USDC=0.01
```

The treasury wallet must be the contract's configured executor. Start the app, open Emily Carter's pending OpenAI approval, and approve it. The existing flow submits `POL-ENG-AI-001` through the contract; its completed receipt keeps the contract and transaction identifiers inside collapsed technical details.

### Arc policy publishing

Policy administration is a separate server-only role. Use a dedicated Arc Testnet wallet that owns `WithinPolicyExecutor`; do not reuse a production wallet. To publish the rule and settlement guard from the existing Rules screen, add:

```dotenv
POLICY_PUBLISHER=arc
ENABLE_ARC_POLICY_WRITES=true
ARC_POLICY_ADMIN_PRIVATE_KEY=0x...
ARC_POLICY_CONTRACT_ADDRESS=0x...
ARC_DEFAULT_MAX_PER_TX_USDC=0.05
ARC_DEFAULT_PERIOD_LIMIT_USDC=1.00
```

Restart the app, open Rules, and activate `POL-ENG-AI-001`. Pausing and reactivating that row call the same deployed contract. Arc mode never falls back to mock, and every write is simulated before submission. `ARC_POLICY_ADMIN_PRIVATE_KEY` and `ARC_POLICY_CONTRACT_ADDRESS` are server-only and must never use a `NEXT_PUBLIC_` prefix.

The public API routes in this prototype are intentionally unauthenticated for a local hackathon demonstration. On any publicly accessible deployment, keep `POLICY_PUBLISHER=mock` and `ENABLE_ARC_POLICY_WRITES=false` until real authentication, authorization, rate limiting, and audit logging are implemented.

To return to the deterministic demo, set `PAYMENT_PROVIDER=mock` and restart the app. Arc failures never silently fall back to direct transfers or the mock provider. API-level idempotency remains in place, with a second duplicate-payment check enforced by the contract.

## Important prototype limits

- Arc Testnet chain ID is `5042002`; its native USDC and `msg.value` use 18 decimals.
- Testnet USDC has no real-world value.
- The visible £29.00 purchase is separate from `ARC_TEST_SETTLEMENT_USDC`.
- The visible £300 rule is GBP-denominated and interpreted offchain.
- Its 0.05 USDC per-payment and 1.00 USDC per-period settlement guards are independent testnet controls, not a GBP-to-USDC conversion.
- The contract enforces USDC settlement limits; it does not convert GBP to USDC.
- GBP business-rule interpretation and conversion remain offchain in this prototype.
- The contract has not been professionally audited.
- Private keys and `.env.local` must never be committed.
- `OPENAI_API_KEY` is server-only and must never use a `NEXT_PUBLIC_` prefix.

## Quality checks

```bash
npm run lint
npm run build
cd contracts
forge fmt --check
forge test -vv
```
