# Within

Within is a hackathon company-spending prototype: teams define spending rules in plain English, route purchases through human approval, and create verifiable settlement evidence. The public demo remains fully usable without a wallet, API key, deployed contract, or external service.

> Hackathon prototype. Contracts are not audited and are not for production financial use. Arc Testnet assets have no real-world value.

## Product journey

`Landing → company connection → spending rule → request → standard or 2-of-3 approval → demo or Arc Testnet settlement → activity evidence`

Routes:

- `/` public landing page
- `/connect` company and optional EIP-1193 wallet connection
- `/app` workspace
- `/app/credit` Company Credit prototype
- `/api/health` safe configuration readiness

## Architecture

- Next.js App Router, React, TypeScript and Tailwind CSS
- one validated, versioned `sessionStorage` demo-state source
- provider boundaries for policies, payments, multisig and funding
- EIP-6963 wallet discovery with `window.ethereum` compatibility fallback
- one shared Circle App Kit instance
- one shared Arc Testnet definition based on `arcTestnet` from `viem/chains`
- typed Viem ABIs and public/selected-wallet contract clients
- Foundry contracts, deployment scripts and tests

UI components do not import private keys or call blockchain SDKs directly. Mock mode never fabricates hashes or explorer links. Arc mode never silently falls back to mock after an error.

## Arc Testnet and USDC

| Property | Value |
| --- | --- |
| Chain ID | `5042002` (`0x4CEF52`) |
| RPC | `https://rpc.testnet.arc.network` |
| Explorer | `https://testnet.arcscan.app` |
| Native gas display | USDC, 18 decimals |
| ERC-20 USDC | `0x3600000000000000000000000000000000000000` |
| ERC-20 accounting | 6 decimals |

Native gas amounts and ERC-20 token amounts are deliberately separate. Contract drawdowns, facility balances, allowances and repayments use 6-decimal ERC-20 units (`parseUnits(value, 6)` / `formatUnits(value, 6)`). Native Arc gas and `msg.value` use the chain's 18-decimal native currency representation.

## Modes

### Demo mode

Wallet optional, deterministic local state, no external calls, and no transaction evidence:

```dotenv
NEXT_PUBLIC_WITHIN_MODE=demo
NEXT_PUBLIC_DEMO_MODE=true
POLICY_GENERATOR=local
POLICY_PUBLISHER=mock
PAYMENT_PROVIDER=mock
MULTISIG_PROVIDER=mock
ENABLE_ARC_POLICY_WRITES=false
```

### Arc Testnet mode

Live UI actions require the selected wallet, Arc Testnet, required public contract addresses, and sufficient testnet funds. A wallet acceptance is not treated as completion: the client waits for a successful receipt and then re-reads contract state.

```dotenv
NEXT_PUBLIC_WITHIN_MODE=arc-testnet
NEXT_PUBLIC_ARC_APP_KIT_ENABLED=true
NEXT_PUBLIC_ARC_SEND_ENABLED=true
NEXT_PUBLIC_WITHIN_POLICY_EXECUTOR_ADDRESS=
NEXT_PUBLIC_WITHIN_MULTISIG_ADDRESS=
NEXT_PUBLIC_WITHIN_CREDIT_FACILITY_ADDRESS=
NEXT_PUBLIC_WITHIN_TREASURY_ADDRESS=
```

Keep unauthenticated server write routes in mock mode on a public Vercel deployment. Production-grade authentication and authorization are outside this hackathon scope.

## Wallet lifecycle

The connection page discovers EIP-6963 providers, preserves the selected provider, uses it for `eth_accounts`, `eth_chainId`, network switching and transactions, and subscribes to `accountsChanged`, `chainChanged` and `disconnect`. Refresh restoration uses `eth_accounts`; it does not automatically request permissions. A connected wallet hides the walletless choice. Wrong-network users may enter the workspace, while live actions remain disabled until Arc Testnet is selected.

## Contracts

| Contract | Source | Purpose | Constructor | Admin | Funding |
| --- | --- | --- | --- | --- | --- |
| `WithinPolicyExecutor` | `contracts/src/WithinPolicyExecutor.sol` | Active policy limits, authorised execution, duplicate execution protection and policy events | owner, executor | Ownable owner; separate executor | Native test USDC only for policy-controlled native payments |
| `WithinMultisigExecutor` | `contracts/src/WithinMultisigExecutor.sol` | Fixed distinct signers, threshold approvals, expiry, cancellation and execute-once calls | signer array, threshold | Fixed signer set | Only when executing native-value treasury transfers |
| `WithinCreditFacility` | `contracts/src/WithinCreditFacility.sol` | 6-decimal ERC-20 credit limits, protected drawdowns, disbursement and repayments | USDC, borrower, multisig executor, limit, rate, owner | Ownable pause; immutable borrower and multisig | Must hold enough testnet ERC-20 USDC before disbursement |

Deployment order is Policy → Multisig → Credit. The credit facility accepts disbursement only from the deployed multisig, so protected drawdowns cannot bypass its threshold. No factory is used.

Frontend ABIs live in `src/lib/contracts`. `arc-contract-clients.ts` exposes one Arc public client and selected-provider wallet clients for policy, multisig, credit and USDC operations.

## Circle App Kit

The Treasury page retains visible capability states for:

- Send: estimate, wallet confirmation, SDK result, receipt confirmation and evidence
- Bridge: optional supported-chain USDC flow and returned transaction steps
- Swap: same-chain quote, fees and confirmed result
- Unified Balance: enabled only when real Gateway configuration is available

Capabilities are independently gated by `NEXT_PUBLIC_ARC_*_ENABLED`. Disabled or unconfigured capabilities remain visible with a useful status. App Kit Send cannot bypass the multisig path for high-value approvals.

## Local setup

Node.js 22 or newer is required.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

No secret is required for the default demo. `.env*`, Foundry broadcasts, PEM files and local wallet material are ignored. Never put private keys, mnemonics, API tokens, or entity secrets in `NEXT_PUBLIC_*` variables.

## Tests

```bash
npm run lint
npm run build
npm test
npm run test:contracts
cd contracts
forge build --offline
forge test -vv --offline
```

Contract coverage includes authorised/unauthorised policy updates, readable activation, multisig signer and threshold enforcement, cancellation/expiry/execute-once behavior, credit limits, liquidity, protected disbursement, partial/full/over repayment, pausing and 6-decimal token units.

## Arc Testnet deployment

Nothing in the repository deploys automatically. Use a dedicated testnet-only wallet and populate the deployment variables in your local shell. Never commit them.

```bash
export ARC_TESTNET_RPC_URL=https://rpc.testnet.arc.network
export DEPLOYER_PRIVATE_KEY=…
export TREASURY_ADDRESS=…
export BORROWER_TREASURY_ADDRESS=…
export USDC_ADDRESS=0x3600000000000000000000000000000000000000
export MULTISIG_SIGNER_1=…
export MULTISIG_SIGNER_2=…
export MULTISIG_SIGNER_3=…
export MULTISIG_THRESHOLD=2
export CREDIT_LIMIT_USDC=25000
export CREDIT_RATE_BPS=800
```

First simulate without broadcasting:

```bash
cd contracts
forge script script/DeployWithin.s.sol:DeployWithin --rpc-url "$ARC_TESTNET_RPC_URL" -vv
```

After reviewing the simulation, the human operator may broadcast interactively:

```bash
./scripts/deploy-arc-testnet.sh
```

The wrapper runs the Foundry deployment and then reads Foundry's confirmed broadcast output into `deployments/arc-testnet.json`. Empty addresses and hashes in the committed artifact are intentional; never fabricate them.

## ArcScan verification

After deployment, run:

```bash
node scripts/verify-arc-testnet.mjs
```

The script reads deployed addresses, recreates exact constructor arguments, uses Solidity `0.8.24`, chain `5042002`, Blockscout and `https://testnet.arcscan.app/api/`, and marks each artifact entry verified only after the command succeeds.

Equivalent command shape:

```bash
forge verify-contract <ADDRESS> src/<Contract>.sol:<Contract> \
  --constructor-args <ABI_ENCODED_ARGS> \
  --chain-id 5042002 \
  --compiler-version 0.8.24 \
  --verifier blockscout \
  --verifier-url https://testnet.arcscan.app/api/ \
  --watch
```

## Frontend and Vercel configuration

Copy confirmed public addresses from `deployments/arc-testnet.json` into Vercel's public address variables. These are public chain data, not secrets. Keep deployment keys out of Vercel unless a separately authenticated server-side operational design is introduced.

The project declares Node.js `>=22`, uses browser-only App Kit modules from client components, has no production localhost dependency, and remains fully functional in Demo mode when wallets, contract addresses and optional capabilities are absent.

Recommended public release configuration:

```dotenv
NEXT_PUBLIC_WITHIN_MODE=demo
NEXT_PUBLIC_DEMO_MODE=true
POLICY_GENERATOR=local
POLICY_PUBLISHER=mock
PAYMENT_PROVIDER=mock
NEXT_PUBLIC_ARC_APP_KIT_ENABLED=false
```

## Demo walkthrough

1. Launch `/` and continue to `/connect`.
2. Enter without a wallet or connect a browser wallet.
3. Create, edit and activate a rule.
4. Create/edit a purchase request and complete a standard approval.
5. Use distinct demo identities for the clearly labelled mock multisig flow.
6. Inspect Send, Bridge, Swap and Unified Balance readiness under Treasury.
7. Open Company Credit, complete a demo drawdown and two repayments.
8. Refresh to verify persistence, then Reset Demo.

## Public judging links

- Vercel application: _add after deployment_
- ArcScan policy contract: _add after deployment and verification_
- ArcScan multisig contract: _add after deployment and verification_
- ArcScan credit contract: _add after deployment and verification_

## Limitations

- Prototype contracts are unaudited and non-upgradeable.
- Company access and API authorization are demo-only.
- No underwriting, custody, real lending or production treasury service is provided.
- GBP product values and testnet USDC settlement controls are separate.
- Testnet assets have no real-world value.
- Real deployments require human review, dedicated test wallets, funding, verification and public environment configuration.
