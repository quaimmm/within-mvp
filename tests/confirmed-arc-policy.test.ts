import assert from "node:assert/strict";
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
