import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CONFIRMED_ARC_POLICY,
  isExpectedConfirmedArcPolicy,
  readConfirmedArcPolicy,
  type PolicyReader,
} from "../src/lib/policies/confirmed-arc-policy.ts";

test("confirmed Arc policy uses one read and the expected contract arguments", async () => {
  let reads = 0;
  const reader: PolicyReader = {
    async readContract(parameters) {
      reads += 1;
      assert.equal(parameters.address, CONFIRMED_ARC_POLICY.contractAddress);
      assert.equal(parameters.functionName, "policies");
      assert.deepEqual(parameters.args, [CONFIRMED_ARC_POLICY.policyKey]);
      return [true, true, CONFIRMED_ARC_POLICY.maxPerTransaction, CONFIRMED_ARC_POLICY.periodLimit];
    },
  };

  const result = await readConfirmedArcPolicy(reader);
  assert.equal(reads, 1);
  assert.equal(isExpectedConfirmedArcPolicy(result), true);
});

test("a mismatched Arc policy is not presented as confirmed", () => {
  assert.equal(isExpectedConfirmedArcPolicy({
    exists: true,
    active: false,
    maxPerTransaction: CONFIRMED_ARC_POLICY.maxPerTransaction,
    periodLimit: CONFIRMED_ARC_POLICY.periodLimit,
  }), false);
});

test("Rules presents confirmed Arc policy business meaning before collapsed evidence", async () => {
  const [status, shell] = await Promise.all([
    readFile(new URL("../src/components/rules-arc-policy-status.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/within-app.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(status, /✓ Active on Arc/);
  assert.match(status, /Per transaction/);
  assert.match(status, /Period limit/);
  assert.match(status, /Settlement is limited to/);
  assert.match(status, /View on ArcScan ↗/);
  assert.match(status, /<details className="group mt-6/);
  assert.doesNotMatch(status, /<details[^>]* open/);
  assert.match(status, /Onchain details/);
  assert.match(status, /shortenAddress\(value\)/);
  assert.match(status, /navigator\.clipboard\.writeText\(value\)/);
  assert.match(shell, /settlementGuard\?\.enforcement === "onchain" && rule\.settlementGuard\.transactionHash/);
  assert.match(shell, /activeOnArc \? "✓ Active on Arc" : "Rule active"/);
  assert.match(shell, /Purchases above £/);
  assert.match(shell, /No human approval is required within/);
});
