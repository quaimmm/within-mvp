import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  defaultTreasuryBridgeDestination,
  getTreasuryCapabilityStates,
  treasuryBridgeErrorMessage,
  TreasuryAppKitGateway,
  type TreasuryAppKitDependencies,
  type TreasuryWalletContext,
} from "../src/lib/treasury/treasury-app-kit-gateway.ts";
import type { AppKitPaymentResult } from "../src/lib/arc/types.ts";
import { TREASURY_BRIDGE_ROUTES } from "../src/lib/arc/treasury-operations.ts";

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

function dependencies(calls: { sendWrites: number; swapEstimates: number; bridgeEstimates: number; bridgeWrites: number; unifiedReads: number }): TreasuryAppKitDependencies {
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
    executeBridge: (async (_provider, _sender, _direction, _destination, _amount, reference) => {
      calls.bridgeWrites += 1;
      return {
        result: {
          amount: "1",
          token: "USDC",
          state: "success",
          provider: "CCTPv2",
          source: { address, chain: TREASURY_BRIDGE_ROUTES["ethereum-to-arc"].source },
          destination: { address: recipient, chain: TREASURY_BRIDGE_ROUTES["ethereum-to-arc"].destination, recipientAddress: recipient },
          steps: [{ name: "Burn", state: "success", txHash: transactionHash }],
        },
        evidence: [{ id: transactionHash, operationType: "App Kit Bridge", capability: "Burn", network: "Ethereum Sepolia", asset: "USDC", amount: "1", sender: address, recipient, status: "Confirmed", transactionHash, timestamp: "2026-08-08T10:00:00.000Z", reference }],
      };
    }) as TreasuryAppKitDependencies["executeBridge"],
    readUnifiedBalance: (async () => {
      calls.unifiedReads += 1;
      return { token: "USDC", totalConfirmedBalance: "12.5", totalPendingBalance: "0.5", breakdown: [] };
    }) as TreasuryAppKitDependencies["readUnifiedBalance"],
  };
}

test("Treasury capability modes keep Send and Bridge live", () => {
  assert.deepEqual(getTreasuryCapabilityStates({ appKit: true, send: true, bridge: true, swap: true, unifiedBalance: true }), {
    send: { mode: "Live", enabled: true },
    bridge: { mode: "Live", enabled: true },
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
  const calls = { sendWrites: 0, swapEstimates: 0, bridgeEstimates: 0, bridgeWrites: 0, unifiedReads: 0 };
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
  const baseCalls = { sendWrites: 0, swapEstimates: 0, bridgeEstimates: 0, bridgeWrites: 0, unifiedReads: 0 };
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
  const calls = { sendWrites: 0, swapEstimates: 0, bridgeEstimates: 0, bridgeWrites: 0, unifiedReads: 0 };
  const changedWallet = wallet({
    provider: {
      request: async ({ method }) => method === "eth_accounts" ? [recipient] : "0x4CEF52",
    },
  });
  const gateway = new TreasuryAppKitGateway(changedWallet, dependencies(calls));
  await assert.rejects(() => gateway.confirmSend({ recipient, amount: "0.01", reference: "1" }), /Wallet account changed/);
  assert.equal(calls.sendWrites, 0);
});

test("Bridge review performs no write and explicit confirmation executes once", async () => {
  const calls = { sendWrites: 0, swapEstimates: 0, bridgeEstimates: 0, bridgeWrites: 0, unifiedReads: 0 };
  const ethereumWallet = wallet({
    chainId: "0xaa36a7",
    provider: { request: async ({ method }) => method === "eth_accounts" ? [address] : "0xaa36a7" },
  });
  const gateway = new TreasuryAppKitGateway(ethereumWallet, dependencies(calls));
  const review = await gateway.reviewBridge("ethereum-to-arc", recipient, "1");

  assert.equal(calls.bridgeEstimates, 1);
  assert.equal(calls.bridgeWrites, 0);
  assert.equal(review.sourceNetwork, "Ethereum Sepolia");
  assert.equal(review.destinationNetwork, "Arc Testnet");

  const result = await gateway.confirmBridge(review, "TREASURY-BRIDGE-1");
  assert.equal(calls.bridgeWrites, 1);
  assert.equal(result.state, "success");
});

test("Bridge supports the Arc Testnet to Ethereum Sepolia live route", async () => {
  const calls = { sendWrites: 0, swapEstimates: 0, bridgeEstimates: 0, bridgeWrites: 0, unifiedReads: 0 };
  const gateway = new TreasuryAppKitGateway(wallet(), dependencies(calls));
  const review = await gateway.reviewBridge("arc-to-ethereum", address, "1");
  assert.equal(review.sourceNetwork, "Arc Testnet");
  assert.equal(review.destinationNetwork, "Ethereum Sepolia");
  assert.equal(review.destination, address);
});

test("Bridge routes use the official App Kit identifiers", () => {
  assert.equal(TREASURY_BRIDGE_ROUTES["ethereum-to-arc"].source.chain, "Ethereum_Sepolia");
  assert.equal(TREASURY_BRIDGE_ROUTES["ethereum-to-arc"].destination.chain, "Arc_Testnet");
  assert.equal(TREASURY_BRIDGE_ROUTES["arc-to-ethereum"].source.chain, "Arc_Testnet");
  assert.equal(TREASURY_BRIDGE_ROUTES["arc-to-ethereum"].destination.chain, "Ethereum_Sepolia");
});

test("Bridge destination defaults are explicit for both directions", () => {
  assert.equal(defaultTreasuryBridgeDestination("ethereum-to-arc", address, recipient), address);
  assert.equal(defaultTreasuryBridgeDestination("arc-to-ethereum", address, recipient), recipient);
  assert.equal(defaultTreasuryBridgeDestination("arc-to-ethereum", address, null), "");
});

test("Bridge rejects the wrong source network before estimate or execution", async () => {
  const calls = { sendWrites: 0, swapEstimates: 0, bridgeEstimates: 0, bridgeWrites: 0, unifiedReads: 0 };
  const gateway = new TreasuryAppKitGateway(wallet(), dependencies(calls));
  await assert.rejects(() => gateway.reviewBridge("ethereum-to-arc", recipient, "1"), /Switch your wallet to Ethereum Sepolia/);
  assert.equal(calls.bridgeEstimates, 0);
  assert.equal(calls.bridgeWrites, 0);
});

test("Bridge blocks an account change between review and confirmation", async () => {
  let currentAccount = address;
  const calls = { sendWrites: 0, swapEstimates: 0, bridgeEstimates: 0, bridgeWrites: 0, unifiedReads: 0 };
  const liveWallet = wallet({
    chainId: "0xaa36a7",
    provider: { request: async ({ method }) => method === "eth_accounts" ? [currentAccount] : "0xaa36a7" },
  });
  const gateway = new TreasuryAppKitGateway(liveWallet, dependencies(calls));
  const review = await gateway.reviewBridge("ethereum-to-arc", recipient, "1");
  currentAccount = recipient;
  await assert.rejects(() => gateway.confirmBridge(review, "TREASURY-BRIDGE-1"), /Wallet account changed/);
  assert.equal(calls.bridgeWrites, 0);
});

test("Bridge duplicate submissions are blocked", async () => {
  let release: (() => void) | undefined;
  const deferred = new Promise<void>((resolve) => { release = resolve; });
  const calls = { sendWrites: 0, swapEstimates: 0, bridgeEstimates: 0, bridgeWrites: 0, unifiedReads: 0 };
  const deps = dependencies(calls);
  const execute = deps.executeBridge;
  deps.executeBridge = (async (...args: Parameters<typeof execute>) => {
    calls.bridgeWrites += 1;
    await deferred;
    const result = await execute(...args);
    calls.bridgeWrites -= 1;
    return result;
  }) as TreasuryAppKitDependencies["executeBridge"];
  const ethereumWallet = wallet({ chainId: "0xaa36a7", provider: { request: async ({ method }) => method === "eth_accounts" ? [address] : "0xaa36a7" } });
  const gateway = new TreasuryAppKitGateway(ethereumWallet, deps);
  const review = await gateway.reviewBridge("ethereum-to-arc", recipient, "1");
  const first = gateway.confirmBridge(review, "TREASURY-BRIDGE-1");
  await assert.rejects(() => gateway.confirmBridge(review, "TREASURY-BRIDGE-1"), /already being submitted/);
  release?.();
  await first;
  assert.equal(calls.bridgeWrites, 1);
});

test("Bridge wallet rejection is neutral and cannot fabricate completion", () => {
  assert.equal(treasuryBridgeErrorMessage({ code: 4001 }), "Wallet confirmation was cancelled. No bridge was submitted.");
  assert.notEqual(treasuryBridgeErrorMessage(new Error("cross-chain processing failure")), "Bridge completed through Circle App Kit.");
});

test("Bridge wallet rejection releases the submission lock without success", async () => {
  const calls = { sendWrites: 0, swapEstimates: 0, bridgeEstimates: 0, bridgeWrites: 0, unifiedReads: 0 };
  const deps = dependencies(calls);
  deps.executeBridge = (async () => {
    calls.bridgeWrites += 1;
    throw Object.assign(new Error("User rejected the request"), { code: 4001 });
  }) as TreasuryAppKitDependencies["executeBridge"];
  const ethereumWallet = wallet({ chainId: "0xaa36a7", provider: { request: async ({ method }) => method === "eth_accounts" ? [address] : "0xaa36a7" } });
  const gateway = new TreasuryAppKitGateway(ethereumWallet, deps);
  const review = await gateway.reviewBridge("ethereum-to-arc", recipient, "1");

  await assert.rejects(() => gateway.confirmBridge(review, "TREASURY-BRIDGE-1"), /User rejected/);
  await assert.rejects(() => gateway.confirmBridge(review, "TREASURY-BRIDGE-1"), /User rejected/);
  assert.equal(calls.bridgeWrites, 2);
});

test("A pending App Kit result remains processing and is never mapped to completion", async () => {
  const calls = { sendWrites: 0, swapEstimates: 0, bridgeEstimates: 0, bridgeWrites: 0, unifiedReads: 0 };
  const deps = dependencies(calls);
  deps.executeBridge = (async (_provider, _sender, _direction, _destination, _amount, reference) => ({
    result: {
      amount: "1",
      token: "USDC",
      state: "pending",
      provider: "CCTPv2",
      source: { address, chain: TREASURY_BRIDGE_ROUTES["ethereum-to-arc"].source },
      destination: { address: recipient, chain: TREASURY_BRIDGE_ROUTES["ethereum-to-arc"].destination, recipientAddress: recipient },
      steps: [{ name: "Burn", state: "success", txHash: transactionHash }, { name: "Mint", state: "pending" }],
    },
    evidence: [{ id: transactionHash, operationType: "App Kit Bridge", capability: "Burn", network: "Ethereum Sepolia", asset: "USDC", amount: "1", sender: address, recipient, status: "Pending", transactionHash, timestamp: "2026-08-08T10:00:00.000Z", reference }],
  })) as TreasuryAppKitDependencies["executeBridge"];
  const ethereumWallet = wallet({ chainId: "0xaa36a7", provider: { request: async ({ method }) => method === "eth_accounts" ? [address] : "0xaa36a7" } });
  const gateway = new TreasuryAppKitGateway(ethereumWallet, deps);
  const review = await gateway.reviewBridge("ethereum-to-arc", recipient, "1");
  const result = await gateway.confirmBridge(review, "TREASURY-BRIDGE-1");

  assert.equal(result.state, "pending");
  assert.equal(result.steps.at(-1)?.state, "pending");
});

test("Swap remains estimate-only and Unified Balance remains read only", async () => {
  const calls = { sendWrites: 0, swapEstimates: 0, bridgeEstimates: 0, bridgeWrites: 0, unifiedReads: 0 };
  const gateway = new TreasuryAppKitGateway(wallet(), dependencies(calls));

  const quote = await gateway.reviewSwap({ fromAsset: "EURC", toAsset: "USDC", amount: "1" });
  const unified = await gateway.readUnifiedBalance();

  assert.equal(quote.estimatedOutput, "1.01");
  assert.deepEqual(unified, { confirmed: "12.5", pending: "0.5", available: "12.5" });
  assert.deepEqual(calls, { sendWrites: 0, swapEstimates: 1, bridgeEstimates: 0, bridgeWrites: 0, unifiedReads: 1 });
  assert.equal("executeSwap" in gateway, false);
  assert.equal("depositUnifiedBalance" in gateway, false);
  assert.equal("spendUnifiedBalance" in gateway, false);
});

test("Rendered Treasury UI requires Bridge review and keeps other capabilities read-only", async () => {
  const source = await readFile(new URL("../src/components/treasury-operations-panel.tsx", import.meta.url), "utf8");
  assert.match(source, /Confirm Send/);
  assert.match(source, /Review bridge/);
  assert.match(source, /Confirm bridge/);
  assert.match(source, /Company Treasury/);
  assert.match(source, /defaultTreasuryBridgeDestination/);
  assert.match(source, /Swap[\s\S]*Execution[\s\S]*Disabled for this release/);
  assert.doesNotMatch(source, /depositUnifiedBalance|spendUnifiedBalance/);
});
