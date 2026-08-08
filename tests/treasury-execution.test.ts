import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  getTreasuryCapabilityStates,
  TreasuryAppKitGateway,
  type TreasuryAppKitDependencies,
  type TreasuryWalletContext,
} from "../src/lib/treasury/treasury-app-kit-gateway.ts";
import type { AppKitPaymentResult } from "../src/lib/arc/types.ts";

const address = "0xCCE679E826618797208BB1Fba4418481d92fAaD0";
const recipient = "0x1111111111111111111111111111111111111111";
const transactionHash = `0x${"a".repeat(64)}`;

function wallet(overrides: Partial<TreasuryWalletContext> = {}): TreasuryWalletContext {
  return {
    address,
    chainId: "0x4CEF52",
    provider: {
      request: async ({ method }) => {
        if (method === "eth_accounts") return [address];
        if (method === "eth_chainId") return "0x4CEF52";
        throw new Error(`Unexpected method: ${method}`);
      },
    },
    ...overrides,
  };
}

function dependencies(calls: { sendWrites: number; swapEstimates: number; bridgeEstimates: number; unifiedReads: number }): TreasuryAppKitDependencies {
  const result: AppKitPaymentResult = {
    success: true,
    transactionHash,
    sender: address,
    recipient,
    amount: "0.01",
    evidence: {
      id: transactionHash,
      operationType: "App Kit Send",
      capability: "send",
      network: "Arc Testnet",
      asset: "USDC",
      amount: "0.01",
      sender: address,
      recipient,
      status: "Confirmed",
      transactionHash,
      timestamp: "2026-08-08T10:00:00.000Z",
      reference: "TREASURY-SEND-1",
    },
  };
  return {
    createSendClient: () => ({
      estimatePayment: async () => ({ fee: "250000", feeUnit: "wei", gas: BigInt(10), gasPrice: BigInt(25) }),
      executePayment: async () => { calls.sendWrites += 1; return result; },
    }),
    createSwapClient: () => ({
      estimate: async () => {
        calls.swapEstimates += 1;
        return { inputAmount: "1", inputAsset: "EURC", estimatedOutput: "1.01", outputAsset: "USDC", networkFee: "Shown in wallet", route: "Circle App Kit" };
      },
    }),
    estimateBridge: (async () => {
      calls.bridgeEstimates += 1;
      return { gasFees: [{ name: "source gas", token: "ETH", fees: { fee: "0.001" } }], fees: [] };
    }) as unknown as TreasuryAppKitDependencies["estimateBridge"],
    readUnifiedBalance: (async () => {
      calls.unifiedReads += 1;
      return { token: "USDC", totalConfirmedBalance: "12.5", totalPendingBalance: "0.5", breakdown: [] };
    }) as TreasuryAppKitDependencies["readUnifiedBalance"],
  };
}

test("Treasury capability modes keep only Send live", () => {
  assert.deepEqual(getTreasuryCapabilityStates({ appKit: true, send: true, bridge: true, swap: true, unifiedBalance: true }), {
    send: { mode: "Live", enabled: true },
    bridge: { mode: "Estimate", enabled: true },
    swap: { mode: "Estimate", enabled: true },
    unifiedBalance: { mode: "Read only", enabled: true },
  });
  assert.equal(getTreasuryCapabilityStates({ appKit: false, send: true, bridge: true, swap: true, unifiedBalance: true }).send.enabled, false);
});

test("public Treasury flags are referenced directly for Next client inlining", async () => {
  const source = await readFile(new URL("../src/lib/arc/feature-flags.ts", import.meta.url), "utf8");
  for (const name of ["NEXT_PUBLIC_ARC_APP_KIT_ENABLED", "NEXT_PUBLIC_ARC_SEND_ENABLED", "NEXT_PUBLIC_ARC_BRIDGE_ENABLED", "NEXT_PUBLIC_ARC_SWAP_ENABLED", "NEXT_PUBLIC_ARC_UNIFIED_BALANCE_ENABLED"]) {
    assert.match(source, new RegExp(`process\\.env\\.${name}`));
  }
  assert.doesNotMatch(source, /readArcFeatureFlags\(process\.env\)/);
});

test("Send review performs no write and explicit confirmation writes once", async () => {
  const calls = { sendWrites: 0, swapEstimates: 0, bridgeEstimates: 0, unifiedReads: 0 };
  const gateway = new TreasuryAppKitGateway(wallet(), dependencies(calls));
  const input = { recipient, amount: "0.01", reference: "TREASURY-SEND-1" };

  await gateway.reviewSend(input);
  assert.equal(calls.sendWrites, 0);

  const result = await gateway.confirmSend(input);
  assert.equal(calls.sendWrites, 1);
  assert.equal(result.transactionHash, transactionHash);
});

test("Send confirmation blocks duplicate concurrent submissions", async () => {
  let release: (() => void) | undefined;
  let writes = 0;
  const deferred = new Promise<void>((resolve) => { release = resolve; });
  const baseCalls = { sendWrites: 0, swapEstimates: 0, bridgeEstimates: 0, unifiedReads: 0 };
  const deps = dependencies(baseCalls);
  deps.createSendClient = () => ({
    estimatePayment: async () => ({ fee: "1", feeUnit: "wei", gas: BigInt(1), gasPrice: BigInt(1) }),
    executePayment: async () => {
      writes += 1;
      await deferred;
      return dependencies(baseCalls).createSendClient(wallet()).executePayment({ recipient, amount: "0.01", reference: "1" });
    },
  });
  const gateway = new TreasuryAppKitGateway(wallet(), deps);
  const input = { recipient, amount: "0.01", reference: "TREASURY-SEND-1" };
  const first = gateway.confirmSend(input);
  await assert.rejects(() => gateway.confirmSend(input), /already being submitted/);
  release?.();
  await first;
  assert.equal(writes, 1);
});

test("A changed wallet account blocks Send before any write", async () => {
  const calls = { sendWrites: 0, swapEstimates: 0, bridgeEstimates: 0, unifiedReads: 0 };
  const changedWallet = wallet({
    provider: {
      request: async ({ method }) => method === "eth_accounts" ? [recipient] : "0x4CEF52",
    },
  });
  const gateway = new TreasuryAppKitGateway(changedWallet, dependencies(calls));
  await assert.rejects(() => gateway.confirmSend({ recipient, amount: "0.01", reference: "1" }), /Wallet account changed/);
  assert.equal(calls.sendWrites, 0);
});

test("Swap and Bridge expose estimates only, and Unified Balance is read only", async () => {
  const calls = { sendWrites: 0, swapEstimates: 0, bridgeEstimates: 0, unifiedReads: 0 };
  const gateway = new TreasuryAppKitGateway(wallet(), dependencies(calls));

  const quote = await gateway.reviewSwap({ fromAsset: "EURC", toAsset: "USDC", amount: "1" });
  const bridge = await gateway.reviewBridge(recipient, "1");
  const unified = await gateway.readUnifiedBalance();

  assert.equal(quote.estimatedOutput, "1.01");
  assert.equal(bridge.destinationNetwork, "Arc Testnet");
  assert.deepEqual(unified, { confirmed: "12.5", pending: "0.5", available: "12.5" });
  assert.deepEqual(calls, { sendWrites: 0, swapEstimates: 1, bridgeEstimates: 1, unifiedReads: 1 });
  assert.equal("executeSwap" in gateway, false);
  assert.equal("executeBridge" in gateway, false);
  assert.equal("depositUnifiedBalance" in gateway, false);
  assert.equal("spendUnifiedBalance" in gateway, false);
});

test("Rendered Treasury execution UI contains no Bridge, Swap, or Unified Balance write path", async () => {
  const source = await readFile(new URL("../src/components/treasury-operations-panel.tsx", import.meta.url), "utf8");
  assert.match(source, /Confirm Send/);
  assert.match(source, /Live execution disabled for demo|Execution[\s\S]*Disabled for this release/);
  assert.doesNotMatch(source, /bridgeToArc|depositUnifiedBalance|spendUnifiedBalance|\.execute\(input/);
});
