#!/usr/bin/env bash
set -euo pipefail

: "${ARC_TESTNET_RPC_URL:?Set ARC_TESTNET_RPC_URL}"
: "${DEPLOYER_PRIVATE_KEY:?Set DEPLOYER_PRIVATE_KEY in your local shell only}"

cd "$(dirname "$0")/../contracts"
forge script script/DeployWithin.s.sol:DeployWithin --rpc-url "$ARC_TESTNET_RPC_URL" --broadcast -vv
cd ..
node scripts/sync-deployment-artifact.mjs

echo "Deployment artifact updated. Review deployments/arc-testnet.json before configuring Vercel."
