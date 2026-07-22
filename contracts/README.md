# Within contracts

Foundry contracts for the Within Arc Testnet hackathon prototype. They are not audited and are not for production financial use.

## Inventory and order

1. `WithinPolicyExecutor` — owner-managed active policies and authorised native test-USDC execution.
2. `WithinMultisigExecutor` — fixed distinct signers, approval threshold, expiry, cancellation and execute-once calls.
3. `WithinCreditFacility` — 6-decimal ERC-20 test-USDC credit accounting; the multisig is its immutable disbursement executor.

The credit facility must be funded with Arc Testnet ERC-20 USDC before drawdowns can be disbursed.

## Build and test

```bash
forge fmt --check
forge build --offline
forge test -vv --offline
```

## Safe deployment preparation

Populate the variables documented in the repository README in your local shell. Simulate first:

```bash
forge script script/DeployWithin.s.sol:DeployWithin \
  --rpc-url "$ARC_TESTNET_RPC_URL" \
  -vv
```

Nothing is broadcast unless the human operator explicitly adds `--broadcast` or runs the repository deployment wrapper. Foundry broadcast output is ignored by Git. The committed deployment artifact contains blank values until a real deployment succeeds.

## Verification

The repository verification script uses chain ID `5042002`, compiler `0.8.24`, Blockscout, and `https://testnet.arcscan.app/api/`. It reconstructs constructor arguments and stops if any deployed address is absent.
