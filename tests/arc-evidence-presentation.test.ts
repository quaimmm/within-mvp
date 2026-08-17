import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Arc payment finality requires genuine Arc result evidence", async () => {
  const source = await readFile(new URL("../src/components/within-app.tsx", import.meta.url), "utf8");
  const view = source.slice(source.indexOf("function PaymentExecutionView"), source.indexOf("function ApprovalDrawer"));

  assert.match(view, /result\.provider === "arc" && result\.network === "arc-testnet" && Boolean\(result\.transactionHash\)/);
  assert.match(view, /Settlement complete/);
  assert.match(view, /Final on Arc/);
  assert.match(view, /result\.explorerUrl && <a href=\{result\.explorerUrl\}/);
  assert.match(view, /View on ArcScan ↗/);
  assert.match(view, /finalOnArc \? "Final on Arc" : "Completed"/);
});

test("Employee Credit preserves pending state and shows finality only after confirmation", async () => {
  const source = await readFile(new URL("../src/components/employee-credit-page.tsx", import.meta.url), "utf8");

  assert.match(source, /evidence\.status==="confirmed"\?"✓ Final on Arc"/);
  assert.match(source, /"Transaction pending"/);
  assert.match(source, /ARC_TESTNET\.explorerUrl}\/tx\/\$\{evidence\.transactionHash\}/);
  assert.match(source, /View on ArcScan ↗/);
  assert.doesNotMatch(source, />Transaction confirmed</);
});

test("local approval evidence is not labelled as final on Arc", async () => {
  const source = await readFile(new URL("../src/components/within-app.tsx", import.meta.url), "utf8");
  const view = source.slice(source.indexOf("function PaymentExecutionView"), source.indexOf("function ApprovalDrawer"));

  assert.match(view, /finalOnArc \? "Settlement complete" : "Payment completed"/);
  assert.match(view, /finalOnArc \? "Final on Arc" : "Completed"/);
  assert.doesNotMatch(view, /wei|gwei|ETH gas/);
});
