"use client";

import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import { ArcTestnet, BaseSepolia, EthereumSepolia } from "@circle-fin/app-kit/chains";
import { isAddress } from "viem";
import { appKit } from "./app-kit.ts";
import type { BrowserEthereumProvider } from "./network.ts";
import type { SettlementEvidence } from "./types.ts";

const supportedChains = [ArcTestnet, EthereumSepolia, BaseSepolia];

export const mockTreasuryBridge = {
  preview(amount: string) { if (!/^\d+(?:\.\d{1,6})?$/.test(amount) || Number(amount) <= 0) throw new Error("Enter a positive bridge amount."); return { from: "Ethereum Sepolia", to: "Arc Testnet", asset: "USDC" as const, amount, fee: "Demo route · no network fee" }; },
  execute(amount: string) { const preview = this.preview(amount); return { ...preview, label: "Demo bridge" as const }; },
};

export async function createAppKitBrowserAdapter(provider: BrowserEthereumProvider) {
  return createViemAdapterFromProvider({ provider: provider as Parameters<typeof createViemAdapterFromProvider>[0]["provider"], capabilities: { addressContext: "user-controlled", supportedChains } });
}

export async function bridgeToArc(provider: BrowserEthereumProvider, sender: string, recipient: string, amount: string, reference: string) {
  if (!isAddress(sender) || !isAddress(recipient)) throw new Error("A valid source and destination wallet are required.");
  const adapter = await createAppKitBrowserAdapter(provider);
  const result = await appKit.bridge({ from: { adapter, chain: EthereumSepolia }, to: { adapter, chain: ArcTestnet, recipientAddress: recipient }, amount, token: "USDC" });
  return {
    result,
    evidence: result.steps.map((step, index): SettlementEvidence => ({
      id: step.txHash || `${reference}-${index}`,
      operationType: "App Kit Bridge",
      capability: step.name,
      network: index === result.steps.length - 1 ? "Arc Testnet" : "Ethereum Sepolia",
      asset: "USDC",
      amount,
      sender,
      recipient,
      status: step.state === "success" ? "Confirmed" : step.state === "error" ? "Failed" : "Pending",
      transactionHash: step.txHash,
      explorerUrl: step.explorerUrl,
      timestamp: new Date().toISOString(),
      reference,
    })),
  };
}

export async function estimateBridgeToArc(provider: BrowserEthereumProvider, recipient: string, amount: string) {
  if (!isAddress(recipient)) throw new Error("A valid Arc destination is required.");
  const adapter = await createAppKitBrowserAdapter(provider);
  return appKit.estimateBridge({ from: { adapter, chain: EthereumSepolia }, to: { adapter, chain: ArcTestnet, recipientAddress: recipient }, amount, token: "USDC" });
}

export async function queryUnifiedBalance(provider: BrowserEthereumProvider) {
  const adapter = await createAppKitBrowserAdapter(provider);
  return appKit.unifiedBalance.getBalances({ token: "USDC", sources: { adapter }, includePending: true, networkType: "testnet" });
}

export async function depositUnifiedBalance(provider: BrowserEthereumProvider, amount: string) {
  const adapter = await createAppKitBrowserAdapter(provider);
  return appKit.unifiedBalance.deposit({ from: { adapter, chain: EthereumSepolia }, amount, token: "USDC" });
}

export async function spendUnifiedBalance(provider: BrowserEthereumProvider, recipient: string, amount: string) {
  if (!isAddress(recipient)) throw new Error("Enter a valid Arc recipient address.");
  const adapter = await createAppKitBrowserAdapter(provider);
  return appKit.unifiedBalance.spend({ amount, token: "USDC", from: { adapter }, to: { adapter, chain: ArcTestnet, recipientAddress: recipient } });
}
