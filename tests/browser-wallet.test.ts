import assert from "node:assert/strict";
import test from "node:test";
import { connectBrowserWallet, discoverBrowserWallets, restoreBrowserWallet, SELECTED_WALLET_SESSION_KEY, subscribeWallet } from "../src/lib/arc/browser-wallet.ts";
import type { BrowserEthereumProvider } from "../src/lib/arc/network.ts";

const address = "0x1234567890123456789012345678901234567890";

test("the explicitly selected provider is reused for account and chain requests", async () => {
  const methods: string[] = [];
  const provider = { request: async ({ method }: { method: string }) => {
    methods.push(method);
    return method === "eth_requestAccounts" ? [address] : "0x4CEF52";
  } };
  const connected = await connectBrowserWallet({ info: { uuid: "chosen", name: "Chosen wallet" }, provider });
  assert.equal(connected.provider, provider);
  assert.equal(connected.address, address);
  assert.equal(connected.chainId, "0x4CEF52");
  assert.deepEqual(methods, ["eth_requestAccounts", "eth_chainId"]);
});

test("wallet events update accounts and chain, and disconnect clears only wallet state", () => {
  const listeners = new Map<string, (value: unknown) => void>();
  const removed: string[] = [];
  const provider: BrowserEthereumProvider = {
    request: async () => null,
    on: (event, listener) => { listeners.set(event, listener); },
    removeListener: (event) => { removed.push(event); },
  };
  const states: Array<{ address: string | null; chainId: string | null }> = [];
  let disconnected = false;
  const unsubscribe = subscribeWallet(provider, { address, chainId: "0x1" }, (state) => states.push(state), () => { disconnected = true; });
  listeners.get("accountsChanged")?.(["0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"]);
  listeners.get("chainChanged")?.("0x4CEF52");
  listeners.get("disconnect")?.({ code: 4900 });
  assert.deepEqual(states, [
    { address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd", chainId: "0x1" },
    { address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd", chainId: "0x4CEF52" },
    { address: null, chainId: null },
  ]);
  assert.equal(disconnected, true);
  unsubscribe();
  assert.deepEqual(removed, ["accountsChanged", "chainChanged", "disconnect"]);
});

test("empty accounts return the connection to a disconnected state", () => {
  const listeners = new Map<string, (value: unknown) => void>();
  const provider: BrowserEthereumProvider = { request: async () => null, on: (event, listener) => { listeners.set(event, listener); } };
  let latest = { address, chainId: "0x4CEF52" } as { address: string | null; chainId: string | null };
  subscribeWallet(provider, latest, (state) => { latest = state; });
  listeners.get("accountsChanged")?.([]);
  assert.deepEqual(latest, { address: null, chainId: "0x4CEF52" });
});

test("an authorised selected wallet is restored without requesting permission", async () => {
  const methods: string[] = [];
  const provider: BrowserEthereumProvider = { request: async ({ method }) => {
    methods.push(method);
    if (method === "eth_accounts") return [address];
    if (method === "eth_chainId") return "0x4CEF52";
    throw new Error(`Unexpected method ${method}`);
  } };
  const target = new EventTarget() as EventTarget & { ethereum: BrowserEthereumProvider; setTimeout: typeof setTimeout };
  target.ethereum = provider;
  target.setTimeout = setTimeout;
  const values = new Map<string, string>([[SELECTED_WALLET_SESSION_KEY, "window.ethereum"]]);
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const globals = globalThis as unknown as { window?: typeof target; sessionStorage?: typeof storage };
  const oldWindow = globals.window;
  const oldStorage = globals.sessionStorage;
  globals.window = target;
  globals.sessionStorage = storage;
  try {
    const restored = await restoreBrowserWallet();
    assert.equal(restored?.provider, provider);
    assert.equal(restored?.address, address);
    assert.deepEqual(methods, ["eth_accounts", "eth_chainId"]);
  } finally {
    if (oldWindow) globals.window = oldWindow; else delete globals.window;
    if (oldStorage) globals.sessionStorage = oldStorage; else delete globals.sessionStorage;
  }
});

test("EIP-6963 discovery keeps multiple injected providers distinct", async () => {
  const first: BrowserEthereumProvider = { request: async () => null };
  const second: BrowserEthereumProvider = { request: async () => null };
  const target = new EventTarget() as EventTarget & { setTimeout: typeof setTimeout };
  target.setTimeout = setTimeout;
  target.addEventListener("eip6963:requestProvider", () => {
    for (const detail of [
      { info: { uuid: "wallet-one", name: "Wallet One" }, provider: first },
      { info: { uuid: "wallet-two", name: "Wallet Two" }, provider: second },
    ]) {
      const event = new Event("eip6963:announceProvider");
      Object.defineProperty(event, "detail", { value: detail });
      target.dispatchEvent(event);
    }
  });
  const globals = globalThis as unknown as { window?: typeof target };
  const oldWindow = globals.window;
  globals.window = target;
  try {
    const wallets = await discoverBrowserWallets(0);
    assert.deepEqual(wallets.map((wallet) => wallet.info.uuid), ["wallet-one", "wallet-two"]);
  } finally {
    if (oldWindow) globals.window = oldWindow; else delete globals.window;
  }
});

test("browser wallet helpers are safe during server rendering", async () => {
  const walletModule = await import("../src/lib/arc/browser-wallet.ts");
  assert.deepEqual(await walletModule.discoverBrowserWallets(), []);
  assert.equal(await walletModule.restoreBrowserWallet(), null);
});
