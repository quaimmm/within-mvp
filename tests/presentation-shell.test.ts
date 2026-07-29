import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("authenticated shell exposes truthful wallet states and official links", async () => {
  const [source, walletProvider] = await Promise.all([
    readSource("src/components/within-app.tsx"),
    readSource("src/components/wallet-provider.tsx"),
  ]);

  assert.match(source, /<Link href="\/" aria-label="Go to Within home"/);
  assert.match(source, /<BrandLogo variant="app" \/>/);
  assert.doesNotMatch(source, /window\.location/);
  assert.match(source, /https:\/\/faucet\.circle\.com\//);
  assert.match(source, /onArc \? "Arc Testnet" : "Wrong network"/);
  assert.match(source, /aria-label=\{onArc \? "Arc Testnet network" : "Wrong network"\}/);
  assert.match(source, /aria-label="Open connected wallet menu"/);
  assert.match(source, /aria-haspopup="menu"/);
  assert.match(source, /shortenAddress\(wallet\.address\)/);
  assert.doesNotMatch(source, /Arc Testnet · \$\{shortenAddress\(wallet\.address\)\}/);
  assert.match(source, /role="menu" aria-label="Connected wallet"/);
  assert.match(source, /navigator\.clipboard\.writeText\(wallet\.address\)/);
  assert.match(source, /addressCopied \? "Copied" : "Copy address"/);
  assert.match(source, /ARC_TESTNET\.explorerUrl}\/address\/\$\{wallet\.address\}/);
  assert.match(source, /rel="noopener noreferrer"/);
  assert.match(source, /Connect another account/);
  assert.match(source, /onSwitchAccount\(\)/);
  assert.match(source, /const appWallet = walletSession\.wallet/);
  assert.match(walletProvider, /provider: connected\.provider/);
  assert.match(source, /setWalletOpen\(false\); onDisconnectWallet\(\)/);
  assert.match(source, /window\.addEventListener\("pointerdown", closeWalletOnOutsideClick\)/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /ARC_TESTNET\.explorerUrl}\/address\/\$\{wallet\.address\}/);
  assert.match(walletProvider, /switchToArcTestnet\(walletRef\.current\.provider\)/);
  assert.match(walletProvider, /disconnectBrowserWallet/);
  assert.match(source, /<AuthenticatedFooter wallet=\{appWallet\}\/>/);
});

test("landing footer contains real destinations and hides optional X link when unset", async () => {
  const source = await readSource("src/components/landing-page.tsx");

  assert.match(source, /NEXT_PUBLIC_WITHIN_CONTACT_EMAIL/);
  assert.match(source, /NEXT_PUBLIC_WITHIN_X_URL/);
  assert.match(source, /\{xUrl&&<a/);
  assert.match(source, /href="\/about"/);
  assert.match(source, /mailto:\$\{contactEmail\}/);
  assert.match(source, /https:\/\/testnet\.arcscan\.app\//);
  assert.match(source, /Testnet assets only\./);
  assert.doesNotMatch(source, /href="#"/);
});

test("about route presents the product without changing core feature mounts", async () => {
  const [about, shell] = await Promise.all([
    readSource("src/app/about/page.tsx"),
    readSource("src/components/within-app.tsx"),
  ]);

  assert.match(about, /About Within/);
  assert.match(about, /Programmable company spending\./);
  assert.match(about, /Within brings spending rules, human judgement and programmable settlement into one clear workspace\./);
  assert.match(about, /Within is currently available as an Arc Testnet Beta\./);
  assert.match(about, /Back to Within/);
  assert.match(shell, /<ApprovalsPage/);
  assert.match(shell, /<RulesPage/);
  assert.match(shell, /<EmployeeCreditPage/);
});
