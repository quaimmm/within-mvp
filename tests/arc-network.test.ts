import assert from "node:assert/strict";
import test from "node:test";
import { ARC_ADD_CHAIN_PARAMETERS, ARC_TESTNET, isArcTestnet, shortenAddress, switchToArcTestnet, walletConnectionDecision, walletConnectionLabel, walletErrorMessage } from "../src/lib/arc/network.ts";
import { formatUsdc, parseUsdc, USDC_TOKEN_DECIMALS } from "../src/lib/contracts/arc-contract-clients.ts";

type Request = { method: string; params?: unknown[] };

test("Arc Testnet uses the official shared chain configuration", () => {
  assert.equal(ARC_TESTNET.chainId, 5_042_002);
  assert.equal(ARC_TESTNET.chainIdHex, "0x4CEF52");
  assert.equal(ARC_ADD_CHAIN_PARAMETERS.rpcUrls[0], "https://rpc.testnet.arc.network");
  assert.equal(ARC_ADD_CHAIN_PARAMETERS.blockExplorerUrls[0], "https://testnet.arcscan.app");
  assert.equal(isArcTestnet("0x4cef52"), true);
  assert.equal(shortenAddress(null), "Not configured");
  assert.equal(shortenAddress("0x1234567890abcdef"), "0x1234…cdef");
});

test("ERC-20 USDC accounting remains separate and six-decimal", () => {
  assert.equal(USDC_TOKEN_DECIMALS, 6);
  assert.equal(parseUsdc("25000.123456"), 25_000_123_456n);
  assert.equal(formatUsdc(25_000_123_456n), "25000.123456");
  assert.throws(() => parseUsdc("0.0000001"));
});

test("wallet connection labels cover disconnected, connected, wrong-network, and progress states", () => {
  const address = "0x1234567890abcdef1234567890abcdef12345678";
  assert.equal(walletConnectionLabel(null, null), "Connect wallet");
  assert.equal(walletConnectionLabel(address, "0x4CEF52"), "Connected · 0x1234…5678");
  assert.equal(walletConnectionLabel(address, "0x1"), "Connected · Wrong network");
  assert.equal(walletConnectionLabel(null, null, "connecting"), "Connecting…");
  assert.equal(walletConnectionLabel(address, "0x1", "switching"), "Switching network…");
});

test("connection decisions hide the walletless path after connection", () => {
  const address = "0x1234567890abcdef1234567890abcdef12345678";
  assert.deepEqual(walletConnectionDecision(null, null), {
    connected: false,
    onArcTestnet: false,
    showConnectWallet: true,
    showContinueWithoutWallet: true,
    primaryAction: "connect",
  });
  assert.equal(walletConnectionDecision(address, "0x4CEF52").primaryAction, "continue");
  assert.equal(walletConnectionDecision(address, "0x4CEF52").showContinueWithoutWallet, false);
  assert.equal(walletConnectionDecision(address, "0x1").primaryAction, "switch");
  assert.equal(walletConnectionDecision(address, "0x1").showContinueWithoutWallet, false);
});

test("network switch uses the official chain ID and verifies the result", async () => {
  let chainId = "0x1";
  const calls: Request[] = [];
  const provider = { request: async (request: Request) => {
    calls.push(request);
    if (request.method === "eth_chainId") return chainId;
    if (request.method === "wallet_switchEthereumChain") { chainId = "0x4CEF52"; return null; }
    return null;
  } };
  assert.equal(await switchToArcTestnet(provider), "0x4CEF52");
  assert.deepEqual(calls.map((call) => call.method), ["eth_chainId", "wallet_switchEthereumChain", "eth_chainId"]);
  assert.deepEqual(calls[1].params, [{ chainId: "0x4CEF52" }]);
});

test("unknown-chain flow adds Arc, switches, and rereads the wallet chain", async () => {
  let chainId = "0x1";
  let firstSwitch = true;
  const calls: Request[] = [];
  const provider = { request: async (request: Request) => {
    calls.push(request);
    if (request.method === "eth_chainId") return chainId;
    if (request.method === "wallet_switchEthereumChain" && firstSwitch) {
      firstSwitch = false;
      throw Object.assign(new Error("Unknown chain"), { code: 4902 });
    }
    if (request.method === "wallet_switchEthereumChain") chainId = "0x4CEF52";
    return null;
  } };
  assert.equal(await switchToArcTestnet(provider), "0x4CEF52");
  assert.deepEqual(calls.map((call) => call.method), ["eth_chainId", "wallet_switchEthereumChain", "wallet_addEthereumChain", "eth_chainId", "wallet_switchEthereumChain", "eth_chainId"]);
  assert.deepEqual(calls[2].params, [ARC_ADD_CHAIN_PARAMETERS]);
});

test("a rejected network switch is readable and does not add a chain", async () => {
  const calls: string[] = [];
  const rejection = Object.assign(new Error("User rejected"), { code: 4001 });
  const provider = { request: async ({ method }: Request) => {
    calls.push(method);
    if (method === "eth_chainId") return "0x1";
    throw rejection;
  } };
  await assert.rejects(() => switchToArcTestnet(provider), /declined/i);
  assert.deepEqual(calls, ["eth_chainId", "wallet_switchEthereumChain"]);
  assert.equal(walletErrorMessage(rejection), "You declined the network switch.");
});

test("a wallet that does not actually switch is rejected", async () => {
  const provider = { request: async ({ method }: Request) => method === "eth_chainId" ? "0x1" : null };
  await assert.rejects(() => switchToArcTestnet(provider), /did not switch/i);
});
