import assert from "node:assert/strict";
import test from "node:test";
import { createCleanDemoState } from "../src/data/demo-state.ts";
import { answerWorkspaceQuestion } from "../src/lib/dashboard/ask-within.ts";

test("Ask Within derives read-only answers from current workspace state", () => {
  const state = createCleanDemoState();
  assert.match(answerWorkspaceQuestion(state, "What needs attention?"), /3 purchases are waiting for review/);
  assert.match(answerWorkspaceQuestion(state, "Which rules are active?"), /3 spending rules are active/);
  assert.match(answerWorkspaceQuestion(state, "How is company spend tracking?"), /42% of its current company budget/);
  assert.match(answerWorkspaceQuestion(state, "How much card capacity is used?"), /66% of their combined monthly capacity/);
});

test("Ask Within responds to updated state and does not mutate it", () => {
  const state = createCleanDemoState();
  const before = JSON.stringify(state);
  state.approvals = state.approvals.map((approval) => ({ ...approval, status: "Approved" }));
  const snapshot = JSON.stringify(state);
  assert.match(answerWorkspaceQuestion(state, "What needs attention?"), /no purchases waiting for review/i);
  assert.equal(JSON.stringify(state), snapshot);
  assert.notEqual(snapshot, before);
});
