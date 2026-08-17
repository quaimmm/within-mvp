import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createCleanDemoState } from "../src/data/demo-state.ts";

test("pending and flagged approvals carry policy reasoning from shared state", () => {
  const state = createCleanDemoState();
  const pending = state.approvals.find((approval) => approval.id === "APR-EMILY-OPENAI");
  const flagged = state.approvals.find((approval) => approval.id === "APR-SARAH-HOXTON");
  const multisig = state.approvals.find((approval) => approval.id === "APR-DANIEL-BA");
  const request = state.treasury.requests.find((item) => item.id === multisig?.multisigRequestId);

  assert.equal(pending?.reviewReason, "First purchase from this merchant.");
  assert.equal(pending?.ruleName, "Engineering AI Tools");
  assert.equal(flagged?.reviewReason, "The nightly rate is above the company limit.");
  assert.equal(flagged?.ruleName, "Hotels above £200");
  assert.equal(request?.required, 2);
  assert.equal(state.treasury.signers.filter((signer) => signer.active).length, 3);
  assert.equal(request?.decisions.filter((decision) => decision.decision === "Approved").length, 1);
});

test("approval UI puts business reasoning before policy and technical details", async () => {
  const app = await readFile(new URL("../src/components/within-app.tsx", import.meta.url), "utf8");
  const products = await readFile(new URL("../src/components/product-pages.tsx", import.meta.url), "utf8");
  const standardDrawer = app.slice(app.indexOf("function ApprovalDrawer"), app.indexOf("function MultisigApprovalDrawer"));
  const reason = standardDrawer.indexOf("Why this needs approval");
  const rule = standardDrawer.indexOf("Matched rule");
  const requirement = standardDrawer.indexOf("Approval required");
  const recommendation = standardDrawer.indexOf("Recommendation");
  const technical = standardDrawer.indexOf("Request details");

  assert.ok(reason >= 0 && reason < rule && rule < requirement && requirement < recommendation && recommendation < technical);
  assert.match(standardDrawer, /\{approval\.reviewReason\}/);
  assert.match(standardDrawer, /\{approval\.ruleName\}/);
  assert.match(standardDrawer, /approveAndExecute/);
  assert.match(standardDrawer, /onDecline/);
  assert.match(products, /Review company spending requests and policy-based approvals\./);
  assert.match(products, />Use example</);
  assert.doesNotMatch(products, /Review purchases stored in this browser workspace\.|>Generate sample</);
});
