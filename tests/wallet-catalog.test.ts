import assert from "node:assert/strict";
import test from "node:test";
import type { BrowserEthereumProvider } from "../src/lib/arc/network.ts";
import { buildWalletCatalog } from "../src/lib/arc/wallet-catalog.ts";

const provider: BrowserEthereumProvider = { request: async () => null };

test("wallet catalog keeps established wallets and adds Backpack, OKX, and WalletConnect", () => {
  const catalog = buildWalletCatalog([]);
  assert.deepEqual(
    catalog.map((wallet) => wallet.name),
    ["MetaMask", "Rabby", "Coinbase Wallet", "Brave Wallet", "Phantom", "Backpack", "OKX Wallet", "WalletConnect"],
  );
  assert.equal(catalog.find((wallet) => wallet.name === "Backpack")?.status, "not-detected");
  assert.equal(catalog.find((wallet) => wallet.name === "OKX Wallet")?.status, "not-detected");
  assert.equal(catalog.find((wallet) => wallet.name === "WalletConnect")?.status, "configuration-required");
});

test("Backpack and OKX aliases retain the exact EIP-6963 provider and icon", () => {
  const backpack = { info: { uuid: "backpack-live", name: "Backpack", rdns: "app.backpack", icon: "data:image/png;base64,AA==" }, provider };
  const okx = { info: { uuid: "okx-live", name: "OKX Wallet", rdns: "com.okx.wallet", icon: "data:image/png;base64,BB==" }, provider };
  const catalog = buildWalletCatalog([backpack, okx]);
  assert.equal(catalog.find((wallet) => wallet.brand === "backpack")?.detail, backpack);
  assert.equal(catalog.find((wallet) => wallet.brand === "okx")?.detail, okx);
  assert.equal(catalog.find((wallet) => wallet.brand === "backpack")?.detail?.info.icon, backpack.info.icon);
  assert.equal(catalog.find((wallet) => wallet.brand === "okx")?.detail?.info.icon, okx.info.icon);
});

test("unknown EIP-6963 wallets remain connectable and WalletConnect fails closed", () => {
  const unknown = { info: { uuid: "new-wallet", name: "New Wallet", rdns: "dev.new.wallet" }, provider };
  const unconfigured = buildWalletCatalog([unknown]);
  assert.equal(unconfigured.find((wallet) => wallet.id === "new-wallet")?.detail?.provider, provider);
  assert.equal(unconfigured.find((wallet) => wallet.brand === "walletconnect")?.status, "configuration-required");
  assert.equal(buildWalletCatalog([], "configured-id").find((wallet) => wallet.brand === "walletconnect")?.status, "provider-unavailable");
});
