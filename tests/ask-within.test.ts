import assert from "node:assert/strict";
import test from "node:test";
import { createCleanDemoState } from "../src/data/demo-state.ts";
import { answerWorkspaceQuestion as answerLegacyQuestion } from "../src/lib/dashboard/ask-within.ts";
import { createCompanyContext } from "../src/lib/intelligence/company-context.ts";
import { askWithinQuestion } from "../src/lib/intelligence/ask-within.ts";

function answer(question: string, previousIntent?: string) {
  return askWithinQuestion(
    createCompanyContext(createCleanDemoState()),
    question,
    previousIntent,
  );
}

function text(question: string, previousIntent?: string) {
  return answer(question, previousIntent).sections.map((section) => section.text).join(" ");
}

test("reports company spend from the current workspace state", () => {
  assert.match(text("Summarise this month's spending."), /£42,310/);
  assert.match(text("Summarise this month's spending."), /£57,690/);
});

test("ranks departments using analytics data", () => {
  const result = answer("Which department spends the most?");
  assert.equal(result.intent, "department-spend-ranking");
  assert.match(result.sections[0].text, /Engineering/);
  assert.match(result.sections[0].text, /£13,680/);
});

test("counts current approvals without inventing records", () => {
  const result = answer("Which approvals are currently pending?");
  assert.equal(result.intent, "approval-count");
  assert.match(result.sections[0].text, /3 purchases/);
  assert.match(result.sections[1].text, /Emily Carter · OpenAI/);
});

test("reports credit records and discloses unavailable treasury data", () => {
  assert.match(text("How much company credit is available?"), /17,500 USDC/);
  const treasury = answer("What is our available treasury balance?");
  assert.equal(treasury.intent, "unavailable");
  assert.match(treasury.sections[0].text, /don't have enough data/i);
});

test("unknown questions return an honest no-data response without fabricated values", () => {
  const result = answer("How many overdue invoices do we have?");
  assert.equal(result.intent, "unavailable");
  assert.match(result.sections[0].text, /don't have enough data/i);
  assert.doesNotMatch(result.sections[0].text, /£|USDC|\b\d+\b/);
});

test("recommends a grounded low-risk automation opportunity", () => {
  const result = answer("Where can we automate more?");
  const combined = result.sections.map((section) => section.text).join(" ");
  assert.equal(result.intent, "automation-opportunity");
  assert.match(combined, /Emily Carter/);
  assert.match(combined, /OpenAI/);
  assert.match(combined, /low risk/i);
  assert.match(combined, /first purchase/i);
});

test("uses the previous intent for a department follow-up", () => {
  const first = answer("Which department spends the most?");
  const followUp = answer("What about Sales?", first.intent);
  assert.equal(followUp.intent, "department-spend");
  assert.match(followUp.sections[0].text, /Sales spent £10,940/);
});

test("distinguishes active rules, rule limits and approval volume", () => {
  assert.match(text("Which rules are active?"), /3 spending rules are active/);
  assert.match(text("Which policy has the highest limit?"), /£500/);
  assert.match(text("Which rules trigger the most approvals?"), /recorded approval activity/);
});

test("legacy adapter remains current and read-only", () => {
  const state = createCleanDemoState();
  const before = JSON.stringify(state);
  assert.match(answerLegacyQuestion(state, "How is company spend tracking?"), /42% of the current budget/);
  assert.match(answerLegacyQuestion(state, "How much card capacity is used?"), /66% of recorded monthly card capacity/);
  assert.equal(JSON.stringify(state), before);
});
