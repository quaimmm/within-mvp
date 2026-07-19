import assert from "node:assert/strict";
import test from "node:test";
import { completeEmilyPayment, createCleanDemoState, DEMO_STATE_VERSION, DEMO_STORAGE_KEY, restoreDemoState } from "../src/data/demo-state.ts";
import { resetDemoState } from "../src/lib/demo/reset-demo-state.ts";
import { createHealthResponse } from "../src/lib/demo/health.ts";
import type { PaymentResult } from "../src/lib/payments/types.ts";

const payment: PaymentResult = { success: true, paymentId: "WTH-TEST", provider: "mock", network: "demo", businessAmount: 29, businessCurrency: "GBP", settledAmount: 29, settlementCurrency: "USDC", timestamp: "2026-07-19T00:00:00.000Z", isTestnet: true };

test("clean demo state restores every seeded starting value", () => {
  const state = createCleanDemoState();
  assert.equal(state.version, DEMO_STATE_VERSION);
  assert.equal(state.page, "Dashboard");
  assert.equal(state.dashboard.pendingCount, 3);
  assert.equal(state.dashboard.emilyInQueue, true);
  assert.equal(state.dashboard.activity[0].status, "Pending");
  assert.equal(state.dashboard.paymentStatus, "idle");
  assert.equal(state.rules.input, "");
  assert.equal(state.rules.generatedRule, null);
  assert.equal(state.rules.seededRules.find((rule) => rule.policyId === "POL-ENG-AI-001")?.active, true);
});

test("session state restores completed values and clears incomplete processing", () => {
  const completed = completeEmilyPayment(createCleanDemoState(), payment);
  completed.dashboard.drawerOpen = true;
  const restored = restoreDemoState(JSON.stringify(completed));
  assert.equal(restored.dashboard.paymentStatus, "completed");
  assert.equal(restored.dashboard.drawerOpen, true);
  const incomplete = { ...completed, dashboard: { ...completed.dashboard, paymentStatus: "idle", paymentResult: payment } };
  const safe = restoreDemoState(JSON.stringify(incomplete));
  assert.equal(safe.dashboard.paymentStatus, "idle");
  assert.equal(safe.dashboard.paymentResult, null);
});

test("malformed and incompatible session versions recover cleanly", () => {
  assert.equal(restoreDemoState("not-json").dashboard.pendingCount, 3);
  assert.equal(restoreDemoState(JSON.stringify({ version: 999 })).version, DEMO_STATE_VERSION);
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

test("payment completion cannot create duplicate activity or counter updates", () => {
  const once = completeEmilyPayment(createCleanDemoState(), payment);
  const twice = completeEmilyPayment(once, payment);
  assert.equal(twice.dashboard.pendingCount, 2);
  assert.equal(twice.dashboard.activity.filter((item) => item.employee === "Emily Carter").length, 1);
});

test("health output is safe in local mode and degraded without selected provider secrets", () => {
  const local = createHealthResponse({ POLICY_GENERATOR: "local", POLICY_PUBLISHER: "mock", PAYMENT_PROVIDER: "mock" });
  assert.deepEqual(local.services, { application: "ready", policyGenerator: "local", policyPublisher: "mock", paymentProvider: "mock" });
  assert.equal(local.status, "ok");
  const missing = createHealthResponse({ POLICY_GENERATOR: "openai", POLICY_PUBLISHER: "arc", PAYMENT_PROVIDER: "arc" });
  assert.equal(missing.status, "degraded");
  assert.equal(missing.services.policyGenerator, "unavailable");
  assert.equal(JSON.stringify(missing).includes("PRIVATE_KEY"), false);
});
