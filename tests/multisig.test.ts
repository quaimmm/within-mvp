import assert from "node:assert/strict";
import test from "node:test";
import { approveMultisig, settleMultisig, type MultisigRequest } from "../src/lib/multisig/types.ts";
import { ArcMultisigProvider } from "../src/lib/multisig/arc-multisig-provider.ts";

const request = (): MultisigRequest => ({
  id: "MSIG-BA-001",
  approvalId: "APR-DANIEL-BA",
  required: 2,
  expiresAt: "2026-08-19T12:00:00.000Z",
  status: "Awaiting signatures",
  decisions: [],
  settlementId: null,
});

test("multisig records a first approval and reaches the configured threshold", () => {
  const first = approveMultisig(request(), "SIGNER-OLIVIA", true, new Date("2026-07-20T10:00:00.000Z"));
  assert.equal(first.status, "Awaiting signatures");
  assert.equal(first.decisions.length, 1);
  const second = approveMultisig(first, "SIGNER-AMANDA", true, new Date("2026-07-20T10:01:00.000Z"));
  assert.equal(second.status, "Ready to settle");
  assert.equal(second.decisions.length, 2);
});

test("multisig rejects duplicate and inactive signer decisions", () => {
  const first = approveMultisig(request(), "SIGNER-OLIVIA", true, new Date("2026-07-20T10:00:00.000Z"));
  assert.throws(() => approveMultisig(first, "SIGNER-OLIVIA", true), /already decided/);
  assert.throws(() => approveMultisig(request(), "SIGNER-INACTIVE", false), /Inactive signers/);
});

test("expired requests become expired and cannot settle", () => {
  const expired = approveMultisig(request(), "SIGNER-AMANDA", true, new Date("2026-08-20T10:00:00.000Z"));
  assert.equal(expired.status, "Expired");
  assert.throws(() => settleMultisig(expired), /threshold/);
});

test("settlement requires threshold and cannot be submitted twice", () => {
  assert.throws(() => settleMultisig(request()), /threshold/);
  const ready: MultisigRequest = { ...request(), status: "Ready to settle", decisions: [
    { signerId: "SIGNER-OLIVIA", decision: "Approved", timestamp: "2026-07-20T10:00:00.000Z" },
    { signerId: "SIGNER-AMANDA", decision: "Approved", timestamp: "2026-07-20T10:01:00.000Z" },
  ] };
  const settled = settleMultisig(ready);
  assert.equal(settled.status, "Settlement confirmed");
  assert.equal(settled.settlementId, "DEMO-MSIG-BA-001");
  assert.throws(() => settleMultisig(settled), /threshold/);
});

test("live multisig fails safely when configuration or network is unavailable", async () => {
  await assert.rejects(() => new ArcMultisigProvider(undefined, undefined).approve(request(), "SIGNER-AMANDA"), /not configured/);
  const wrongNetwork = { request: async ({ method }: { method: string }) => method === "eth_chainId" ? "0x1" : [] };
  await assert.rejects(() => new ArcMultisigProvider(wrongNetwork, "0x0000000000000000000000000000000000000001").approve(request(), "SIGNER-AMANDA"), /Switch to Arc Testnet/);
});
