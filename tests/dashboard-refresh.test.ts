import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createCleanDemoState } from "../src/data/demo-state.ts";
import { creditAvailable, creditOutstanding } from "../src/lib/credit/demo-credit.ts";

test("dashboard finance overview is derived from existing workspace state", () => {
  const state = createCleanDemoState();
  const pending = state.approvals.filter((item) => item.status === "Pending" || item.status === "Flagged");

  assert.equal(state.dashboard.companySpend, 42_310);
  assert.equal(pending.length, state.dashboard.pendingCount);
  assert.equal(pending.reduce((total, item) => total + item.amount, 0), 2_044);
  assert.equal(creditAvailable(state.credit), 17_500);
  assert.equal(creditOutstanding(state.credit), 7_500);
  assert.equal(state.analytics.departments[0].label, "Engineering");
  assert.equal(state.analytics.departments[0].value, 13_680);
});

test("dashboard renders operational sections before Ask Within", async () => {
  const source = await readFile(new URL("../src/components/within-app.tsx", import.meta.url), "utf8");
  const heading = source.indexOf(">Dashboard</h2>");
  const summary = source.indexOf("Company finance summary");
  const attention = source.indexOf("Needs your attention");
  const spend = source.indexOf("Spend this month");
  const activity = source.indexOf("Recent activity");
  const ask = source.indexOf("<AskWithinPanel state={demoState}/>");

  assert.ok(heading >= 0);
  assert.ok(heading < summary && summary < attention && attention < activity && spend < activity && activity < ask);
  assert.doesNotMatch(source.slice(heading, ask), /Programmable company spending\./);
  assert.match(source, /readCompanyLiquidity\(\)/);
  assert.match(source, /demoState\.dashboard\.activity\.slice\(0, 5\)/);
  assert.match(source, /onNavigate=\{setPage\}/);
});
