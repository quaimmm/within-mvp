import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readCompanyLiquidity } from "../src/lib/treasury/company-liquidity.ts";

const readSource = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Treasury is a top-level page in the required sidebar order", async () => {
  const [shell, state] = await Promise.all([
    readSource("src/components/within-app.tsx"),
    readSource("src/data/demo-state.ts"),
  ]);

  const orderedLabels = ["Dashboard", "Cards", "Approvals", "Rules", "Treasury", "Credit", "Team", "Analytics", "Settings"];
  let cursor = -1;
  for (const label of orderedLabels) {
    const next = shell.indexOf(`{ label: "${label}"`, cursor + 1);
    assert.ok(next > cursor, `${label} should follow the previous sidebar item`);
    cursor = next;
  }
  assert.match(state, /"Rules" \| "Treasury" \| "Credit"/);
  assert.match(shell, /page === "Treasury" \? <TreasuryPage/);
});

test("Treasury presentation respects existing Arc flags and contains no execution implementation", async () => {
  const [source, operations] = await Promise.all([
    readSource("src/components/treasury-page.tsx"),
    readSource("src/components/treasury-operations-panel.tsx"),
  ]);
  const presentation = `${source}\n${operations}`;

  for (const flag of ["ARC_APP_KIT_ENABLED", "ARC_SEND_ENABLED", "ARC_BRIDGE_ENABLED", "ARC_SWAP_ENABLED", "ARC_UNIFIED_BALANCE_ENABLED"]) {
    assert.match(operations, new RegExp(flag));
  }
  assert.match(presentation, /Company liquidity/);
  assert.match(presentation, /Total treasury/);
  assert.match(presentation, /Available to spend/);
  assert.match(presentation, /Pending \/ reserved/);
  assert.match(presentation, /Across networks/);
  assert.match(presentation, /Move money/);
  assert.match(presentation, /Arc liquidity/);
  assert.match(presentation, /Company assets/);
  assert.match(presentation, /Arc settlement/);
  assert.match(source, /TreasuryOperationsPanel/);
  assert.doesNotMatch(source, /writeContract|sendTransaction|eth_sendTransaction|executePayment|bridgeToArc|spendUnifiedBalance/);
  assert.doesNotMatch(operations, /writeContract|sendTransaction|eth_sendTransaction|bridgeToArc|spendUnifiedBalance|depositUnifiedBalance/);
  assert.match(operations, /Confirm Send/);
  assert.match(operations, /Execution[\s\S]*Disabled for this release/);
  assert.doesNotMatch(source, /Credit facility|Employee Credit|repay|drawCredit/);
});

test("company liquidity uses the configured Arc treasury USDC balance without credit or wallet state", async () => {
  const calls: object[] = [];
  const snapshot = await readCompanyLiquidity({
    async readContract(request) { calls.push(request); return BigInt(25_904_140); },
    async getBlockNumber() { return BigInt(55_933_003); },
  }, "0xCCE679E826618797208BB1Fba4418481d92fAaD0");

  assert.equal(snapshot.totalTreasury, BigInt(25_904_140));
  assert.equal(snapshot.availableToSpend, snapshot.totalTreasury);
  assert.equal(snapshot.pendingReserved, null);
  assert.deepEqual(snapshot.networks, [{ network: "Arc", balance: BigInt(25_904_140) }]);
  assert.equal(snapshot.blockNumber, BigInt(55_933_003));
  assert.equal(calls.length, 1);
  assert.deepEqual((calls[0] as { args: string[] }).args, ["0xCCE679E826618797208BB1Fba4418481d92fAaD0"]);
  assert.equal("wallet" in snapshot, false);
  assert.equal("credit" in snapshot, false);
});
