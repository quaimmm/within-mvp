import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
  const source = await readSource("src/components/treasury-page.tsx");

  for (const flag of ["ARC_APP_KIT_ENABLED", "ARC_SEND_ENABLED", "ARC_BRIDGE_ENABLED", "ARC_SWAP_ENABLED", "ARC_UNIFIED_BALANCE_ENABLED"]) {
    assert.match(source, new RegExp(flag));
  }
  assert.match(source, /Unified USDC balance/);
  assert.match(source, /Available to spend/);
  assert.match(source, /Pending balance/);
  assert.match(source, /Move money/);
  assert.match(source, /External liquidity/);
  assert.match(source, /Arc settlement/);
  assert.doesNotMatch(source, /writeContract|sendTransaction|eth_sendTransaction|executePayment|bridgeToArc|spendUnifiedBalance/);
  assert.doesNotMatch(source, /Credit facility|Employee Credit|repay|drawCredit/);
});
