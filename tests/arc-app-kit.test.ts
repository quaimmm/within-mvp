import assert from "node:assert/strict";
import test from "node:test";
import { appKitErrorMessage, buildSendParams, isAppKitEligibleApproval, mapConfirmedSendStep, validateAppKitPayment, AppKitSendPaymentProvider } from "../src/lib/arc/app-kit-payment-provider.ts";
import { MockPaymentProvider } from "../src/lib/payments/mock-payment-provider.ts";
import { readArcFeatureFlags } from "../src/lib/arc/feature-flags.ts";
import { assertSwapWallet, executeSwapAndRefresh, mapConfirmedSwap, mockTreasurySwap, recordTreasuryConversionActivity, validateTreasurySwap } from "../src/lib/arc/treasury-swap.ts";
import { createCleanDemoState } from "../src/data/demo-state.ts";
import { mockTreasuryBridge } from "../src/lib/arc/treasury-operations.ts";

const recipient = "0x1111111111111111111111111111111111111111";
const sender = "0x2222222222222222222222222222222222222222";

test("constructs valid Arc App Kit Send parameters", () => {
  const adapter = {} as Parameters<typeof buildSendParams>[0];
  const params = buildSendParams(adapter, { recipient, amount: "0.01", reference: "PAY-1" });
  assert.equal(params.from.chain.chain, "Arc_Testnet");
  assert.equal(params.to, recipient);
  assert.equal(params.amount, "0.01");
  assert.equal(params.token, "USDC");
});

test("rejects invalid recipients and amounts", () => {
  assert.throws(() => validateAppKitPayment({ recipient: "not-an-address", amount: "0.01" }), /valid recipient/);
  assert.throws(() => validateAppKitPayment({ recipient, amount: "0" }), /positive USDC amount/);
  assert.throws(() => validateAppKitPayment({ recipient, amount: "0.0000001" }), /positive USDC amount/);
});

test("fails safely without a wallet or on the wrong network", async () => {
  const input = { recipient, amount: "0.01", reference: "PAY-1" };
  await assert.rejects(() => new AppKitSendPaymentProvider(null, null, null).estimatePayment(input), /Connect a treasury wallet/);
  await assert.rejects(() => new AppKitSendPaymentProvider({ request: async () => null }, sender, "0x1").estimatePayment(input), /Switch to Arc Testnet/);
});

test("maps only real successful results and allows a missing explorer URL", () => {
  const hash = `0x${"a".repeat(64)}`;
  const result = mapConfirmedSendStep({ state: "success", txHash: hash }, { sender, recipient, amount: "0.01", reference: "PAY-1" });
  assert.equal(result.transactionHash, hash);
  assert.equal(result.explorerUrl, undefined);
  assert.equal(result.evidence.status, "Confirmed");
  assert.throws(() => mapConfirmedSendStep({ state: "success" }, { sender, recipient, amount: "0.01", reference: "PAY-1" }), /did not return/);
});

test("maps a user-rejected wallet request without fabricating success", () => {
  assert.equal(appKitErrorMessage({ code: 4001 }), "The wallet request was rejected. No funds were transferred.");
});

test("mock mode creates no transaction evidence and App Kit never bypasses multisig", async () => {
  const mock = await new MockPaymentProvider().executePayment({ employeeId: "1", employeeName: "Emily Carter", merchant: "OpenAI", category: "AI Software", amount: 29, currency: "GBP", policyId: "POL-ENG-AI-001" }, "once");
  assert.equal(mock.transactionHash, undefined);
  assert.equal(isAppKitEligibleApproval("Standard"), true);
  assert.equal(isAppKitEligibleApproval("Treasury multisig"), false);
});

test("Bridge and Unified Balance stay disabled independently", () => {
  assert.deepEqual(readArcFeatureFlags({ NEXT_PUBLIC_ARC_APP_KIT_ENABLED: "true", NEXT_PUBLIC_ARC_SEND_ENABLED: "true" }), { appKit: true, send: true, bridge: false, unifiedBalance: false, swap: false });
  assert.deepEqual(readArcFeatureFlags({ NEXT_PUBLIC_ARC_APP_KIT_ENABLED: "false", NEXT_PUBLIC_ARC_BRIDGE_ENABLED: "true", NEXT_PUBLIC_ARC_UNIFIED_BALANCE_ENABLED: "true", NEXT_PUBLIC_ARC_SWAP_ENABLED: "true" }), { appKit: false, send: false, bridge: false, unifiedBalance: false, swap: false });
});

test("Swap is independently gated and uses the installed SDK keyless mode", () => {
  assert.equal(readArcFeatureFlags({ NEXT_PUBLIC_ARC_APP_KIT_ENABLED: "true" }).swap, false);
  assert.equal(readArcFeatureFlags({ NEXT_PUBLIC_ARC_APP_KIT_ENABLED: "true", NEXT_PUBLIC_ARC_SWAP_ENABLED: "true" }).swap, true);
});

test("validates treasury swap wallet, pair, amount, and balance", () => {
  assert.throws(() => assertSwapWallet(null, null, null), /Connect a treasury wallet/);
  assert.throws(() => assertSwapWallet({ request: async () => null }, sender, "0x1"), /Switch to Arc Testnet/);
  assert.throws(() => validateTreasurySwap({ fromAsset: "EURC", toAsset: "EURC", amount: "1" }), /different/);
  assert.throws(() => validateTreasurySwap({ fromAsset: "EURC", toAsset: "USDC", amount: "0" }), /positive/);
  assert.throws(() => validateTreasurySwap({ fromAsset: "EURC", toAsset: "USDC", amount: "1.0000001" }), /positive/);
  assert.throws(() => validateTreasurySwap({ fromAsset: "EURC", toAsset: "USDC", amount: "11" }, "10"), /Insufficient EURC/);
});

test("maps confirmed App Kit Swap evidence without fabricating data", () => {
  const hash = `0x${"b".repeat(64)}`;
  const result = mapConfirmedSwap({ txHash: hash, explorerUrl: `https://testnet.arcscan.app/tx/${hash}`, fromAddress: sender, amountIn: "10", amountOut: "10.82", tokenIn: "EURC", tokenOut: "USDC", progress: { status: "DONE" } }, "TREASURY-SWAP-1", "2026-07-21T12:00:00.000Z");
  assert.equal(result.confirmedOutput, "10.82");
  assert.equal(result.evidence[0].operationType, "App Kit Swap");
  assert.equal(result.evidence[0].inputAsset, "EURC");
  assert.equal(result.evidence[0].outputAsset, "USDC");
  assert.equal(result.evidence[0].transactionHash, hash);
});

test("maps every real swap transaction step separately", () => {
  const first = `0x${"c".repeat(64)}`;
  const second = `0x${"d".repeat(64)}`;
  const result = mapConfirmedSwap({ txHash: first, fromAddress: sender, amountIn: "10", amountOut: "10.8", tokenIn: "EURC", tokenOut: "USDC", progress: { status: "DONE" }, steps: [{ txHash: first, state: "success", name: "approve" }, { txHash: second, state: "success", name: "swap" }] }, "TREASURY-SWAP-2");
  assert.deepEqual(result.evidence.map((item) => item.transactionHash), [first, second]);
});

test("demo conversion remains deterministic and has no transaction evidence", () => {
  const input = { fromAsset: "EURC" as const, toAsset: "USDC" as const, amount: "10" };
  assert.deepEqual(mockTreasurySwap.estimate(input), mockTreasurySwap.estimate(input));
  const result = mockTreasurySwap.execute(input);
  assert.equal(result.label, "Demo conversion");
  assert.equal("transactionHash" in result, false);
  assert.equal("explorerUrl" in result, false);
});

test("confirmed swap refreshes balances exactly once", async () => {
  let refreshes = 0;
  const execution = { confirmedOutput: "10.8", evidence: [] };
  assert.equal(await executeSwapAndRefresh(async () => execution, async () => { refreshes += 1; }), execution);
  assert.equal(refreshes, 1);
});

test("swap activity cannot approve a purchase or bypass multisig", () => {
  const before = createCleanDemoState();
  const after = recordTreasuryConversionActivity(before, { fromAsset: "EURC", toAsset: "USDC", amount: "10" }, "Demo conversion");
  assert.equal(after.dashboard.pendingCount, before.dashboard.pendingCount);
  assert.deepEqual(after.approvals, before.approvals);
  assert.deepEqual(after.treasury.requests, before.treasury.requests);
  assert.equal(after.dashboard.activity[0].merchant, "Treasury conversion");
});

test("demo bridge is deterministic and contains no transaction evidence", () => { const first=mockTreasuryBridge.execute("0.01");const second=mockTreasuryBridge.execute("0.01");assert.deepEqual(first,second);assert.equal(first.label,"Demo bridge");assert.equal("transactionHash" in first,false);assert.equal("explorerUrl" in first,false); });
