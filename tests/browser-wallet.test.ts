import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { beforeEach } from "node:test";
import {
  clearSelectedWallet,
  connectBrowserWallet,
  discardLegacyWalletPersistence,
  disconnectBrowserWallet,
  discoverBrowserWallets,
  discoverMetaMask,
  restoreBrowserWallet,
  subscribeWallet,
  subscribeWalletRecovery,
  switchMetaMaskAccount,
} from "../src/lib/arc/browser-wallet.ts";
import type { BrowserEthereumProvider } from "../src/lib/arc/network.ts";

const accountOne = "0x1234567890123456789012345678901234567890";
const accountTwo = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";

function installBrowser(
  announcements: Array<{ info: { uuid: string; name: string; rdns: string }; provider: BrowserEthereumProvider }>,
) {
  const target = new EventTarget() as EventTarget & { setTimeout: typeof setTimeout };
  target.setTimeout = setTimeout;
  target.addEventListener("eip6963:requestProvider", () => {
    for (const detail of announcements) {
      const event = new Event("eip6963:announceProvider");
      Object.defineProperty(event, "detail", { value: detail });
      target.dispatchEvent(event);
    }
  });
  const globals = globalThis as unknown as { window?: typeof target };
  const oldWindow = globals.window;
  globals.window = target;
  return () => {
    if (oldWindow) globals.window = oldWindow; else delete globals.window;
  };
}

beforeEach(() => clearSelectedWallet());

test("legacy wallet selection storage is removed without restoring an account", async () => {
  const values = new Map([["within:selected-wallet", "cached-provider"]]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  const globals = globalThis as unknown as { window?: EventTarget; sessionStorage?: typeof storage };
  const oldWindow = globals.window;
  const oldStorage = globals.sessionStorage;
  globals.window = new EventTarget();
  globals.sessionStorage = storage;
  try {
    discardLegacyWalletPersistence();
    assert.equal(storage.getItem("within:selected-wallet"), null);
    assert.equal(await restoreBrowserWallet(), null);
  } finally {
    if (oldWindow) globals.window = oldWindow; else delete globals.window;
    if (oldStorage) globals.sessionStorage = oldStorage; else delete globals.sessionStorage;
  }
});

test("connect uses permission, request, verification, and chain reads on the exact MetaMask provider", async () => {
  const methods: string[] = [];
  const provider: BrowserEthereumProvider = { request: async ({ method }) => {
    methods.push(method);
    if (method === "wallet_requestPermissions") return [{ parentCapability: "eth_accounts" }];
    if (method === "eth_requestAccounts" || method === "eth_accounts") return [accountOne];
    if (method === "eth_chainId") return "0x4CEF52";
    throw new Error(`Unexpected method ${method}`);
  } };
  const detail = { info: { uuid: "metamask", name: "MetaMask", rdns: "io.metamask" }, provider };
  const connected = await connectBrowserWallet(detail);
  assert.equal(connected.provider, provider);
  assert.equal(connected.address, accountOne);
  assert.deepEqual(methods, ["wallet_requestPermissions", "eth_requestAccounts", "eth_accounts", "eth_chainId"]);
  assert.equal(methods.some((method) => method === "eth_sendTransaction" || method.includes("sign")), false);
});

test("initial load ignores previously available accounts and performs no provider reads", async () => {
  const methods: string[] = [];
  const provider: BrowserEthereumProvider = { request: async ({ method }) => {
    methods.push(method);
    if (method === "eth_accounts") return [];
    if (method === "eth_chainId") return "0x4CEF52";
    throw new Error(`Unexpected method ${method}`);
  } };
  const restore = installBrowser([{ info: { uuid: "fresh-metamask", name: "MetaMask", rdns: "io.metamask" }, provider }]);
  try {
    const restored = await restoreBrowserWallet();
    assert.equal(restored, null);
    assert.deepEqual(methods, []);
  } finally {
    restore();
  }
});

test("only the EIP-6963 io.metamask provider is selected", async () => {
  const other: BrowserEthereumProvider = { request: async () => null };
  const metamask: BrowserEthereumProvider = { request: async () => null };
  const restore = installBrowser([
    { info: { uuid: "other", name: "Other Wallet", rdns: "com.other" }, provider: other },
    { info: { uuid: "metamask", name: "MetaMask", rdns: "io.metamask" }, provider: metamask },
  ]);
  try {
    assert.equal((await discoverMetaMask(0))?.provider, metamask);
  } finally {
    restore();
  }
});

test("EIP-6963 discovery returns multiple wallet providers with their metadata", async () => {
  const first: BrowserEthereumProvider = { request: async () => null };
  const second: BrowserEthereumProvider = { request: async () => null };
  const restore = installBrowser([
    { info: { uuid: "wallet-one", name: "Wallet One", rdns: "com.wallet.one" }, provider: first },
    { info: { uuid: "wallet-two", name: "Wallet Two", rdns: "com.wallet.two" }, provider: second },
  ]);
  try {
    const wallets = await discoverBrowserWallets(0);
    assert.deepEqual(wallets.map((wallet) => wallet.info.name), ["Wallet One", "Wallet Two"]);
    assert.equal(wallets[0]?.provider, first);
    assert.equal(wallets[1]?.provider, second);
  } finally {
    restore();
  }
});

test("a selected non-MetaMask EIP-6963 wallet connects through its own provider", async () => {
  const methods: string[] = [];
  const provider: BrowserEthereumProvider = { request: async ({ method }) => {
    methods.push(method);
    if (method === "eth_requestAccounts" || method === "eth_accounts") return [accountTwo];
    if (method === "eth_chainId") return "0x4CEF52";
    throw new Error(`Unexpected method ${method}`);
  } };
  const detail = { info: { uuid: "wallet-two", name: "Wallet Two", rdns: "com.wallet.two", icon: "data:image/png;base64,AA==" }, provider };
  const connected = await connectBrowserWallet(detail);
  assert.equal(connected.provider, provider);
  assert.equal(connected.walletId, "wallet-two");
  assert.equal(connected.walletIcon, detail.info.icon);
  assert.deepEqual(methods, ["eth_requestAccounts", "eth_accounts", "eth_chainId"]);
  assert.equal(methods.some((method) => method === "eth_sendTransaction" || method.includes("sign")), false);
});

test("account events replace the previous account, refresh the chain, clear prepared state, and empty accounts disconnect", async () => {
  const listeners = new Map<string, (value: unknown) => void>();
  const removed: string[] = [];
  const methods: string[] = [];
  const provider: BrowserEthereumProvider = {
    request: async ({ method }) => {
      methods.push(method);
      if (method === "eth_chainId") return "0x004CEF52";
      throw new Error(`Unexpected method ${method}`);
    },
    on: (event, listener) => { assert.equal(listeners.has(event), false); listeners.set(event, listener); },
    removeListener: (event) => { removed.push(event); },
  };
  let latest = { address: accountOne, chainId: "0x1" } as { address: string | null; chainId: string | null };
  let preparedClears = 0;
  let disconnects = 0;
  const unsubscribe = subscribeWallet(provider, latest, (state) => { latest = state; }, () => { disconnects += 1; }, () => { preparedClears += 1; });
  listeners.get("accountsChanged")?.([accountTwo]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(latest, { address: accountTwo, chainId: "0x4cef52" });
  assert.equal(preparedClears, 1);
  assert.deepEqual(methods, ["eth_chainId"]);
  assert.equal(methods.some((method) => method === "eth_sendTransaction" || method.includes("sign")), false);
  listeners.get("accountsChanged")?.([]);
  assert.deepEqual(latest, { address: null, chainId: "0x4cef52" });
  assert.equal(preparedClears, 2);
  assert.equal(disconnects, 1);
  assert.deepEqual(methods, ["eth_chainId"]);
  unsubscribe();
  assert.deepEqual(removed, ["accountsChanged", "chainChanged", "disconnect"]);
});

test("a stale account chain read cannot overwrite a newer account event", async () => {
  const listeners = new Map<string, (value: unknown) => void>();
  const chainResolvers: Array<(value: string) => void> = [];
  const methods: string[] = [];
  const provider: BrowserEthereumProvider = {
    request: ({ method }) => {
      methods.push(method);
      if (method !== "eth_chainId") return Promise.reject(new Error(`Unexpected method ${method}`));
      return new Promise((resolve) => chainResolvers.push(resolve as (value: string) => void));
    },
    on: (event, listener) => { listeners.set(event, listener); },
    removeListener: () => undefined,
  };
  let latest = { address: accountOne, chainId: "0x1" } as { address: string | null; chainId: string | null };
  const unsubscribe = subscribeWallet(provider, latest, (state) => { latest = state; });
  listeners.get("accountsChanged")?.([accountTwo]);
  listeners.get("accountsChanged")?.([accountOne]);
  chainResolvers[1]?.("0x4CEF52");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(latest, { address: accountOne, chainId: "0x4cef52" });
  chainResolvers[0]?.("0x1");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(latest, { address: accountOne, chainId: "0x4cef52" });
  assert.deepEqual(methods, ["eth_chainId", "eth_chainId"]);
  unsubscribe();
});

test("an empty account event prevents a pending chain read from restoring stale wallet state", async () => {
  const listeners = new Map<string, (value: unknown) => void>();
  let resolveChain: ((value: string) => void) | null = null;
  const provider: BrowserEthereumProvider = {
    request: ({ method }) => method === "eth_chainId"
      ? new Promise((resolve) => { resolveChain = resolve as (value: string) => void; })
      : Promise.reject(new Error(`Unexpected method ${method}`)),
    on: (event, listener) => { listeners.set(event, listener); },
    removeListener: () => undefined,
  };
  let latest = { address: accountOne, chainId: "0x1" } as { address: string | null; chainId: string | null };
  let disconnects = 0;
  const unsubscribe = subscribeWallet(provider, latest, (state) => { latest = state; }, () => { disconnects += 1; });
  listeners.get("accountsChanged")?.([accountTwo]);
  listeners.get("accountsChanged")?.([]);
  resolveChain?.("0x4CEF52");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(latest, { address: null, chainId: "0x1" });
  assert.equal(disconnects, 1);
  unsubscribe();
});

test("chain events store a canonical hexadecimal chain ID", () => {
  const listeners = new Map<string, (value: unknown) => void>();
  const provider: BrowserEthereumProvider = {
    request: async () => null,
    on: (event, listener) => { listeners.set(event, listener); },
    removeListener: () => undefined,
  };
  let latest = { address: accountOne, chainId: "0x1" } as { address: string | null; chainId: string | null };
  const unsubscribe = subscribeWallet(provider, latest, (state) => { latest = state; });
  listeners.get("chainChanged")?.("0x004CEF52");
  assert.equal(latest.chainId, "0x4cef52");
  listeners.get("chainChanged")?.(5_042_002);
  assert.equal(latest.chainId, "0x4cef52");
  unsubscribe();
});

test("focus and visible-tab recovery reread the live provider without duplicate listeners", () => {
  const windowTarget = new EventTarget();
  const documentTarget = new EventTarget() as EventTarget & { visibilityState: string };
  documentTarget.visibilityState = "visible";
  const globals = globalThis as unknown as { window?: EventTarget; document?: typeof documentTarget };
  const oldWindow = globals.window;
  const oldDocument = globals.document;
  globals.window = windowTarget;
  globals.document = documentTarget;
  let refreshes = 0;
  try {
    const unsubscribe = subscribeWalletRecovery(() => { refreshes += 1; });
    windowTarget.dispatchEvent(new Event("focus"));
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    assert.equal(refreshes, 2);
    unsubscribe();
    windowTarget.dispatchEvent(new Event("focus"));
    assert.equal(refreshes, 2);
  } finally {
    if (oldWindow) globals.window = oldWindow; else delete globals.window;
    if (oldDocument) globals.document = oldDocument; else delete globals.document;
  }
});

test("switch account requests MetaMask permission then verifies eth_accounts", async () => {
  const methods: string[] = [];
  const provider: BrowserEthereumProvider = { request: async ({ method }) => {
    methods.push(method);
    if (method === "wallet_requestPermissions") return [];
    if (method === "eth_requestAccounts" || method === "eth_accounts") return [accountTwo];
    if (method === "eth_chainId") return "0x4CEF52";
    throw new Error(`Unexpected method ${method}`);
  } };
  const detail = { info: { uuid: "metamask", name: "MetaMask", rdns: "io.metamask" }, provider };
  assert.equal((await switchMetaMaskAccount(detail)).address, accountTwo);
  assert.deepEqual(methods, ["wallet_requestPermissions", "eth_requestAccounts", "eth_accounts", "eth_chainId"]);
});

test("disconnect clears only the in-memory session and never calls the provider", async () => {
  const methods: string[] = [];
  const provider: BrowserEthereumProvider = { request: async ({ method }) => { methods.push(method); return null; } };
  const detail = { info: { uuid: "metamask", name: "MetaMask", rdns: "io.metamask" }, provider };
  assert.equal(await disconnectBrowserWallet(detail), false);
  assert.deepEqual(methods, []);
  assert.equal(await restoreBrowserWallet(), null);
});

test("browser wallet helpers are safe during server rendering", async () => {
  assert.equal(await restoreBrowserWallet(), null);
});

test("explicit connection survives SPA use but a fresh in-memory session is disconnected", async () => {
  const provider: BrowserEthereumProvider = { request: async ({ method }) => {
    if (method === "wallet_requestPermissions") return [];
    if (method === "eth_requestAccounts" || method === "eth_accounts") return [accountOne];
    if (method === "eth_chainId") return "0x4CEF52";
    throw new Error(`Unexpected method ${method}`);
  } };
  const detail = { info: { uuid: "metamask", name: "MetaMask", rdns: "io.metamask" }, provider };
  await connectBrowserWallet(detail);
  assert.equal((await restoreBrowserWallet())?.address, accountOne);
  clearSelectedWallet();
  assert.equal(await restoreBrowserWallet(), null);
});

test("shared wallet state starts disconnected and only explicit connect can populate it", async () => {
  const [shell, connectPage, walletClient, walletProvider, rootLayout] = await Promise.all([
    readFile(new URL("../src/components/within-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/connect/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/arc/browser-wallet.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/components/wallet-provider.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/layout.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(walletProvider, /const disconnectedWallet: SharedWallet = \{/);
  assert.match(walletProvider, /address: null/);
  assert.match(walletProvider, /chainId: null/);
  assert.match(walletProvider, /provider: null/);
  assert.match(rootLayout, /<WalletProvider>\{children\}<\/WalletProvider>/);
  assert.match(connectPage, /const walletSession = useWallet\(\)/);
  assert.match(shell, /const walletSession = useWallet\(\)/);
  assert.match(shell, /!connected \? \(/);
  assert.match(shell, /aria-label="Connect wallet"/);
  assert.match(walletClient, /wallet_requestPermissions/);
  assert.match(walletClient, /eth_requestAccounts/);
  assert.match(walletClient, /return currentWalletSession/);
  assert.doesNotMatch(walletClient, /sessionStorage\.setItem/);
});

test("workspace navigation preserves the shared in-memory wallet without disconnecting", async () => {
  const [connectPage, walletProvider, shell] = await Promise.all([
    readFile(new URL("../src/app/connect/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/wallet-provider.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/within-app.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(connectPage, /const continueToWorkspace = \(\) => router\.push\("\/app"\)/);
  assert.doesNotMatch(connectPage, /window\.location|location\.href|document\.location|router\.refresh|<a[^>]+href="\/app"/);
  assert.equal((connectPage.match(/onClick=\{continueToWorkspace\}/g) ?? []).length, 1);
  assert.doesNotMatch(connectPage, /Work email|Continue as administrator|Continue without wallet|useState\("amanda@northstar\.io"\)/);
  assert.match(connectPage, />Connect your wallet<\/h2>/);
  assert.doesNotMatch(connectPage, />Copy address<|>Switch \{wallet\.walletName/);
  assert.match(connectPage, /variant="primary" onClick=\{continueToWorkspace\} className="h-11 w-full">Continue to workspace/);
  assert.match(connectPage, /onClick=\{\(\)=>void disconnect\(\)\}[^>]*className="h-11 w-full">Disconnect from Within/);
  assert.doesNotMatch(connectPage, /onClick=\{\(\)=>enter|const enter|isNorthstarEmail/);
  assert.match(walletProvider, /<WalletContext\.Provider value=\{value\}>\{children\}<\/WalletContext\.Provider>/);
  assert.doesNotMatch(shell, /router\.replace\("\/connect"\)/);
  assert.match(shell, /if \(!walletSession\.ready \|\| !hydrated\)/);
  assert.doesNotMatch(shell, /if \(!walletSession\.ready \|\| !hydrated \|\| !demoState\.signedIn\)/);
});
