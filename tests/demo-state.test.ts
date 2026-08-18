import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { completeEmilyPayment, createCleanDemoState, DEMO_STATE_VERSION, DEMO_STORAGE_KEY, restoreDemoState } from "../src/data/demo-state.ts";
import { resetDemoState } from "../src/lib/demo/reset-demo-state.ts";
import { ASK_WITHIN_HISTORY_KEY } from "../src/lib/intelligence/ask-within.ts";
import { createHealthResponse } from "../src/lib/demo/health.ts";
import type { PaymentResult } from "../src/lib/payments/types.ts";

const payment: PaymentResult = { success: true, paymentId: "WTH-TEST", provider: "mock", network: "demo", businessAmount: 29, businessCurrency: "GBP", settledAmount: 29, settlementCurrency: "USDC", timestamp: "2026-07-19T00:00:00.000Z", isTestnet: true };

test("clean demo state restores every seeded starting value", () => {
  const state = createCleanDemoState();
  assert.equal(state.version, DEMO_STATE_VERSION);
  assert.equal(state.page, "Dashboard");
  assert.equal(state.dashboard.pendingCount, 3);
  const emily = state.approvals.find((approval) => approval.id === "APR-EMILY-OPENAI");
  assert.equal(emily?.status, "Pending");
  assert.equal(emily?.ruleName, "Engineering AI Tools");
  assert.equal(emily?.category, "AI Software");
  assert.equal(emily?.policyId, "POL-ENG-AI-001");
  assert.equal(state.members.length, 6);
  assert.equal(state.cards.length, 4);
  assert.equal(state.integrations.length, 5);
  assert.equal(state.dashboard.activity.find((item) => item.category === "Multisig request created")?.status, "Pending");
  assert.equal(state.dashboard.paymentStatus, "idle");
  assert.equal(state.rules.input, "");
  assert.equal(state.rules.generatedRule, null);
  assert.equal(state.rules.seededRules.find((rule) => rule.policyId === "POL-ENG-AI-001")?.active, true);
  assert.equal(state.treasury.threshold, 2);
  assert.equal(state.treasury.signers.length, 3);
  assert.equal(state.treasury.requests[0].decisions.length, 1);
  assert.equal(state.treasury.address, null);
});

test("session state restores completed values and clears incomplete processing", () => {
  const completed = completeEmilyPayment(createCleanDemoState(), payment);
  completed.dashboard.drawerOpen = true;
  const restored = restoreDemoState(JSON.stringify(completed));
  assert.equal(restored.dashboard.paymentStatus, "completed");
  assert.equal(restored.dashboard.drawerOpen, false);
  assert.equal(restored.dashboard.selectedApprovalId, null);
  const incomplete = { ...completed, dashboard: { ...completed.dashboard, paymentStatus: "idle", paymentResult: payment } };
  const safe = restoreDemoState(JSON.stringify(incomplete));
  assert.equal(safe.dashboard.paymentStatus, "idle");
  assert.equal(safe.dashboard.paymentResult, null);
});

test("malformed and incompatible session versions recover cleanly", () => {
  assert.equal(restoreDemoState("not-json").dashboard.pendingCount, 3);
  assert.equal(restoreDemoState(JSON.stringify({ version: 999 })).version, DEMO_STATE_VERSION);
  const incomplete = createCleanDemoState() as unknown as { approvals?: unknown };
  delete incomplete.approvals;
  assert.equal(restoreDemoState(JSON.stringify(incomplete)).approvals[0].employeeName, "Emily Carter");
});

test("legacy activity records receive deterministic IDs during hydration", () => {
  const legacy=createCleanDemoState();
  const withoutIds=legacy.dashboard.activity.map(item=>{const copy:Partial<typeof item>={...item};delete copy.id;return copy;});
  const first=restoreDemoState(JSON.stringify({...legacy,dashboard:{...legacy.dashboard,activity:withoutIds}}));
  const second=restoreDemoState(JSON.stringify({...legacy,dashboard:{...legacy.dashboard,activity:withoutIds}}));
  assert.ok(first.dashboard.activity.every(item=>item.id));
  assert.deepEqual(first.dashboard.activity.map(item=>item.id),second.dashboard.activity.map(item=>item.id));
  assert.equal(new Set(first.dashboard.activity.map(item=>item.id)).size,first.dashboard.activity.length);
});

test("hydration removes duplicate event records", () => {
  const state=createCleanDemoState();
  const repeated=state.dashboard.activity[0];
  const restored=restoreDemoState(JSON.stringify({...state,dashboard:{...state.dashboard,activity:[repeated,repeated,...state.dashboard.activity.slice(1)]}}));
  assert.equal(restored.dashboard.activity.filter(item=>item.eventId===repeated.eventId).length,1);
});

test("reset completely reseeds storage with fresh idempotency values", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const before = createCleanDemoState();
  const reset = resetDemoState(storage);
  assert.equal(reset.dashboard.pendingCount, 3);
  assert.notEqual(reset.idempotency.payment, before.idempotency.payment);
  assert.equal(JSON.parse(values.get(DEMO_STORAGE_KEY)!).rules.generatedRule, null);
});

test("reset clears only demo workspace storage and preserves wallet and Arc evidence", () => {
  const preserved = {
    "within:selected-wallet": "metamask",
    "within:arc-policy-activation:v1": "policy-evidence",
    "within:employee-credit:evidence:v1": "credit-evidence",
    "within:arc-transaction-evidence": "treasury-evidence",
    "unrelated:key": "keep-me",
  };
  const values = new Map<string, string>([
    [DEMO_STORAGE_KEY, "changed-demo-state"],
    [ASK_WITHIN_HISTORY_KEY, "asked-questions"],
    ...Object.entries(preserved),
  ]);
  const removed: string[] = [];
  const storage = { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { removed.push(key); values.delete(key); } };

  resetDemoState(storage);

  assert.deepEqual(removed, [DEMO_STORAGE_KEY, ASK_WITHIN_HISTORY_KEY]);
  assert.equal(JSON.parse(values.get(DEMO_STORAGE_KEY)!).dashboard.pendingCount, 3);
  assert.equal(values.has(ASK_WITHIN_HISTORY_KEY), false);
  for (const [key, value] of Object.entries(preserved)) assert.equal(values.get(key), value);
});

test("Settings requires confirmation and the app reset keeps non-demo session state", async () => {
  const settings = await readFile(new URL("../src/components/settings-page.tsx", import.meta.url), "utf8");
  const shell = await readFile(new URL("../src/components/within-app.tsx", import.meta.url), "utf8");
  const resetFlow = shell.slice(shell.indexOf("function resetDemo()"), shell.indexOf("function openApproval"));

  assert.match(settings, /Reset demo data/);
  assert.match(settings, /Reset demo data confirmation/);
  assert.match(settings, /It does not change your wallet or onchain Arc data\./);
  assert.match(settings, /setConfirmingReset\(false\)/);
  assert.match(settings, /onClick=\{onReset\}>Reset/);
  assert.doesNotMatch(resetFlow, /localStorage\.clear|sessionStorage\.clear|removeItem\(WITHIN_/);
  assert.doesNotMatch(resetFlow, /walletSession|disconnectAppWallet|ARC_POLICY|EMPLOYEE_CREDIT|transactionHash/);
  assert.match(shell, /Demo data reset/);
});

test("payment completion cannot create duplicate activity or counter updates", () => {
  const once = completeEmilyPayment(createCleanDemoState(), payment);
  const twice = completeEmilyPayment(once, payment);
  assert.equal(twice.dashboard.pendingCount, 2);
  assert.equal(twice.dashboard.activity.filter((item) => item.employee === "Emily Carter").length, 1);
});

test("health output is safe in local mode and degraded without selected provider secrets", () => {
  const local = createHealthResponse({ NODE_ENV: "test", POLICY_GENERATOR: "local", POLICY_PUBLISHER: "mock", PAYMENT_PROVIDER: "mock" });
  assert.deepEqual(local.services, { application: "ready", policyGenerator: "local", policyPublisher: "mock", paymentProvider: "mock" });
  assert.equal(local.status, "ok");
  const missing = createHealthResponse({ NODE_ENV: "test", POLICY_GENERATOR: "openai", POLICY_PUBLISHER: "arc", PAYMENT_PROVIDER: "arc" });
  assert.equal(missing.status, "degraded");
  assert.equal(missing.services.policyGenerator, "unavailable");
  assert.equal(JSON.stringify(missing).includes("PRIVATE_KEY"), false);
});
