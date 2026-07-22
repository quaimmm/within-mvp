"use client";

import { ArcTestnet } from "@circle-fin/app-kit/chains";
import type { SwapEstimate, SwapResult } from "@circle-fin/app-kit";
import { createPublicClient, http, isAddress, parseUnits } from "viem";
import { arcTestnet } from "viem/chains";
import { appKit } from "./app-kit.ts";
import { createAppKitBrowserAdapter } from "./treasury-operations.ts";
import { ARC_TESTNET, isArcTestnet, type BrowserEthereumProvider } from "./network.ts";
import type { SettlementEvidence } from "./types.ts";
import type { DemoState } from "../../data/demo-state.ts";

export type TreasuryAsset = "USDC" | "EURC";
export type TreasurySwapInput = { fromAsset: TreasuryAsset; toAsset: TreasuryAsset; amount: string };
export type TreasurySwapQuote = { inputAmount: string; inputAsset: TreasuryAsset; estimatedOutput: string; outputAsset: TreasuryAsset; networkFee: string; route: string };
export type TreasurySwapExecution = { evidence: SettlementEvidence[]; confirmedOutput: string };

export function recordTreasuryConversionActivity(state: DemoState, input: TreasurySwapInput, mode: "Demo conversion" | "Arc Testnet"): DemoState {
  const category = `${input.fromAsset} → ${input.toAsset} · ${mode}`;
  const eventId = `swap:${mode}:${input.fromAsset}:${input.toAsset}:${input.amount}`;
  const item = { id: `activity-${eventId}`, eventId, initials: "AM", employee: "Amanda Morgan", role: "Finance", merchant: "Treasury conversion", category, amount: `${input.amount} ${input.fromAsset}`, status: "Approved" as const };
  if (state.dashboard.activity.some((entry) => entry.eventId === eventId)) return state;
  return { ...state, dashboard: { ...state.dashboard, activity: [item, ...state.dashboard.activity] } };
}

export async function executeSwapAndRefresh(execute: () => Promise<TreasurySwapExecution>, refresh: () => Promise<void>): Promise<TreasurySwapExecution> {
  const result = await execute();
  await refresh();
  return result;
}

export function validateTreasurySwap(input: TreasurySwapInput, balance?: string): void {
  if (input.fromAsset === input.toAsset) throw new Error("Choose two different treasury assets.");
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(input.amount) || Number(input.amount) <= 0) throw new Error("Enter a positive amount with up to 6 decimals.");
  if (balance !== undefined && parseUnits(input.amount, 6) > parseUnits(balance, 6)) throw new Error(`Insufficient ${input.fromAsset} balance.`);
}

export function assertSwapWallet(provider: BrowserEthereumProvider | null, address: string | null, chainId: string | null): asserts provider is BrowserEthereumProvider {
  if (!provider || !address || !isAddress(address)) throw new Error("Connect a treasury wallet first.");
  if (!isArcTestnet(chainId)) throw new Error(`Switch to ${ARC_TESTNET.chainName}.`);
}

export function mapSwapEstimate(estimate: SwapEstimate): TreasurySwapQuote {
  const gasFee = estimate.fees?.find((fee) => fee.type === "gas");
  const routeFees = estimate.fees?.filter((fee) => fee.type !== "gas").map((fee) => fee.type).filter(Boolean) ?? [];
  return { inputAmount: estimate.amountIn, inputAsset: estimate.tokenIn as TreasuryAsset, estimatedOutput: estimate.estimatedOutput.amount, outputAsset: estimate.tokenOut as TreasuryAsset, networkFee: gasFee?.amount ? `${gasFee.amount} ${gasFee.token}` : "Shown in wallet", route: routeFees.length ? [...new Set(routeFees)].join(" · ") : "Circle App Kit" };
}

type SwapStep = { txHash?: string; explorerUrl?: string; state?: string; name?: string; chain?: string };

export function mapConfirmedSwap(result: Pick<SwapResult, "txHash" | "explorerUrl" | "fromAddress" | "amountIn" | "amountOut" | "tokenIn" | "tokenOut" | "progress"> & { steps?: readonly SwapStep[] }, reference: string, timestamp = new Date().toISOString()): TreasurySwapExecution {
  if (result.progress.status !== "DONE") throw new Error("The treasury conversion has not completed.");
  if (!result.txHash) throw new Error("App Kit did not return a transaction hash.");
  const steps = result.steps?.length ? result.steps : [{ txHash: result.txHash, explorerUrl: result.explorerUrl, state: "success", name: "swap" }];
  const output = result.amountOut ?? "Not returned";
  return { confirmedOutput: output, evidence: steps.map((step, index) => {
    if (!step.txHash) throw new Error("A conversion step did not return a transaction hash.");
    return { id: step.txHash, operationType: "App Kit Swap", capability: step.name || `swap step ${index + 1}`, network: step.chain || ARC_TESTNET.chainName, asset: result.tokenOut as TreasuryAsset, amount: output, inputAsset: result.tokenIn as TreasuryAsset, inputAmount: result.amountIn, outputAsset: result.tokenOut as TreasuryAsset, outputAmount: output, sender: result.fromAddress, status: step.state === "error" ? "Failed" : step.state === "success" || result.progress.status === "DONE" ? "Confirmed" : "Pending", transactionHash: step.txHash, explorerUrl: step.explorerUrl, timestamp, reference };
  }) };
}

export class AppKitTreasurySwapService {
  constructor(private readonly provider: BrowserEthereumProvider | null, private readonly address: string | null, private readonly chainId: string | null) {}

  private async params(input: TreasurySwapInput) {
    assertSwapWallet(this.provider, this.address, this.chainId);
    validateTreasurySwap(input);
    const adapter = await createAppKitBrowserAdapter(this.provider);
    return { from: { adapter, chain: ArcTestnet }, tokenIn: input.fromAsset, tokenOut: input.toAsset, amountIn: input.amount } as const;
  }

  async estimate(input: TreasurySwapInput): Promise<TreasurySwapQuote> { return mapSwapEstimate(await appKit.estimateSwap(await this.params(input))); }

  async execute(input: TreasurySwapInput, reference: string): Promise<TreasurySwapExecution> {
    const result = await appKit.swap(await this.params(input));
    if (result.progress.status !== "DONE") throw new Error(result.progress.substatusMessage || "The treasury conversion remains pending.");
    const client = createPublicClient({ chain: arcTestnet, transport: http(ARC_TESTNET.rpcUrl) });
    const receipt = await client.waitForTransactionReceipt({ hash: result.txHash as `0x${string}`, confirmations: 1, timeout: 90_000 });
    if (receipt.status !== "success") throw new Error("The treasury conversion was not confirmed on Arc Testnet.");
    return mapConfirmedSwap(result, reference);
  }
}

export const mockTreasurySwap = {
  estimate(input: TreasurySwapInput): TreasurySwapQuote { validateTreasurySwap(input, "1000"); return { inputAmount: input.amount, inputAsset: input.fromAsset, estimatedOutput: input.amount, outputAsset: input.toAsset, networkFee: "Demo only", route: "Deterministic demo" }; },
  execute(input: TreasurySwapInput) { validateTreasurySwap(input, "1000"); return { id: `DEMO-SWAP-${input.fromAsset}-${input.toAsset}-${input.amount}`, confirmedOutput: input.amount, label: "Demo conversion" } as const; },
};
