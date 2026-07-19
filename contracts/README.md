# WithinPolicyExecutor

Minimal, non-upgradeable Arc Testnet executor for enforcing native-USDC settlement limits.

The contract does not interpret GBP or perform currency conversion. Within evaluates business rules offchain; the contract independently enforces settlement-denominated USDC limits in deterministic 30-day buckets.

## Commands

```bash
forge install OpenZeppelin/openzeppelin-contracts@v5.4.0 --no-git
forge install foundry-rs/forge-std --no-git
forge fmt --check
forge test -vv
```

## Deploy

Use a dedicated Arc Testnet wallet funded only with testnet USDC. The configured owner must be the address derived from `PRIVATE_KEY` so the deployment script can configure the initial rule.

```bash
export ARC_RPC_URL=https://rpc.testnet.arc.network
export PRIVATE_KEY=0x...
export WITHIN_CONTRACT_OWNER=0x...
export WITHIN_CONTRACT_EXECUTOR=0x...

forge script script/DeployWithinPolicyExecutor.s.sol:DeployWithinPolicyExecutor \
  --rpc-url "$ARC_RPC_URL" \
  --broadcast
```

The broadcast output contains the deployment transaction information. Never print, share, or commit `PRIVATE_KEY`.

## Verify on ArcScan

```bash
forge verify-contract <CONTRACT_ADDRESS> \
  src/WithinPolicyExecutor.sol:WithinPolicyExecutor \
  --constructor-args $(cast abi-encode "constructor(address,address)" <OWNER> <EXECUTOR>) \
  --chain-id 5042002 \
  --verifier blockscout \
  --verifier-url https://testnet.arcscan.app/api/
```

Native USDC on Arc uses 18 decimals. Values such as `0.01 ether`, `0.05 ether`, and `1 ether` represent 0.01, 0.05, and 1.00 native USDC respectively on Arc.

This prototype contract has not been professionally audited. Testnet USDC has no real-world value.
