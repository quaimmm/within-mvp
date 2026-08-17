import assert from "node:assert/strict";
import test from "node:test";
import { createCleanDemoState } from "../src/data/demo-state.ts";
import { analyticsSummary, cardSummary, teamSummary } from "../src/lib/demo-metrics.ts";

test("card and team summaries use the current workspace fixtures", () => {
  const state = createCleanDemoState();

  assert.deepEqual(cardSummary(state), {
    activeCards: 3,
    frozenCards: 1,
    spentThisMonth: 2_716,
    available: 1_002,
  });
  assert.deepEqual(teamSummary(state), {
    teamMembers: 6,
    departments: 6,
    activeCards: 3,
    pendingInvitations: 0,
  });
});

test("summaries respond to card and member changes", () => {
  const state = createCleanDemoState();
  state.cards[0].status = "Frozen";
  state.cards[0].monthlyLimit = 200;
  state.members.push({ ...state.members[0], id: "INV-1", email: "new@northstar.io", accountStatus: "Invited", department: "Legal" });

  assert.equal(cardSummary(state).activeCards, 2);
  assert.equal(cardSummary(state).frozenCards, 2);
  assert.equal(cardSummary(state).available, 888);
  assert.equal(teamSummary(state).teamMembers, 6);
  assert.equal(teamSummary(state).departments, 6);
  assert.equal(teamSummary(state).pendingInvitations, 1);
});

test("analytics headline and rule performance are derived from shared state", () => {
  const state = createCleanDemoState();
  const summary = analyticsSummary(state);

  assert.equal(summary.companySpend, state.dashboard.companySpend);
  assert.equal(summary.monthlyTrend.at(-1)?.value, state.dashboard.companySpend);
  assert.equal(summary.comparison, 14);
  assert.deepEqual(summary.rulePerformance, {
    autoApprovalRate: 25,
    purchasesChecked: 4,
    approvedAutomatically: 1,
    sentForApproval: 3,
    blocked: 0,
  });
});
