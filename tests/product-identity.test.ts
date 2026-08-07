import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("public presentation uses the Arc Testnet Beta identity", async () => {
  const [landing, about, connect, network] = await Promise.all([
    readSource("src/components/landing-page.tsx"),
    readSource("src/app/about/page.tsx"),
    readSource("src/app/connect/page.tsx"),
    readSource("src/components/network-status.tsx"),
  ]);
  const publicCopy = `${landing}\n${about}\n${connect}\n${network}`;

  assert.match(landing, /Programmable company spending\./);
  assert.match(landing, /Launch Within/);
  assert.match(landing, /Explore the product/);
  assert.match(landing, /Testnet assets only\./);
  assert.match(about, /Arc Testnet Beta/);
  assert.match(network, /Arc Testnet · Beta/);
  assert.doesNotMatch(publicCopy, /Demo mode|Mock settlement|Hackathon product|Experimental product|Launch demo/i);
});

test("dashboard does not render seeded financial summary values", async () => {
  const shell = await readSource("src/components/within-app.tsx");

  assert.doesNotMatch(shell, /£42,310 in July/);
  assert.doesNotMatch(shell, /8% below plan/);
  assert.match(shell, /Local workflow/);
  assert.match(shell, /<ApprovalsPage/);
  assert.match(shell, /<RulesPage/);
  assert.match(shell, /<EmployeeCreditPage/);
});
