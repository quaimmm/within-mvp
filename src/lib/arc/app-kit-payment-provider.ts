"use client";

import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import { ArcTestnet } from "@circle-fin/app-kit/chains";
import { createPublicClient, http, isAddress } from "viem";
import { arcTestnet } from "viem/chains";
import { appKit } from "./app-kit.ts";
import { ARC_TESTNET, isArcTestnet, type BrowserEthereumProvider } from "./network.ts";
import type { AppKitPaymentInput, AppKitPaymentResult, PaymentEstimate } from "./types.ts";

export function isAppKitEligibleApproval(approvalType: "Standard" | "Treasury multisig"): boolean { return approvalType === "Standard"; }

export function appKitErrorMessage(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? Number((error as { code?: unknown }).code) : 0;
  if (code === 4001) return "The wallet request was rejected. No funds were transferred.";
  return error instanceof Error ? error.message : "The Arc operation could not be completed.";
}

export function mapConfirmedSendStep(step: { state: string; txHash?: string; explorerUrl?: string; errorMessage?: string }, details: { sender: string; recipient: string; amount: string; reference: string }): AppKitPaymentResult {
  if (step.state !== "success" || !step.txHash) throw new Error(step.errorMessage || "Arc App Kit did not return a confirmed transaction hash.");
  return { success: true, transactionHash: step.txHash, explorerUrl: step.explorerUrl, sender: details.sender, recipient: details.recipient, amount: details.amount, evidence: { id: step.txHash, operationType: "App Kit Send", capability: "send", network: ARC_TESTNET.chainName, asset: "USDC", amount: details.amount, sender: details.sender, recipient: details.recipient, status: "Confirmed", transactionHash: step.txHash, explorerUrl: step.explorerUrl, timestamp: new Date().toISOString(), reference: details.reference } };
}

export function validateAppKitPayment(input: Pick<AppKitPaymentInput, "recipient" | "amount">): void {
  if (!isAddress(input.recipient)) throw new Error("Enter a valid recipient address.");
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(input.amount) || Number(input.amount) <= 0) throw new Error("Enter a positive USDC amount with up to 6 decimals.");
}

export function buildSendParams<TAdapter>(adapter: TAdapter, input: AppKitPaymentInput) {
  validateAppKitPayment(input);
  return { from: { adapter, chain: ArcTestnet }, to: input.recipient, amount: input.amount, token: "USDC" as const };
}

export class AppKitSendPaymentProvider {
  constructor(private readonly provider: BrowserEthereumProvider | null, private readonly connectedAddress: string | null, private readonly chainId: string | null) {}

  private async context(input: AppKitPaymentInput) {
    if (!this.provider || !this.connectedAddress || !isAddress(this.connectedAddress)) throw new Error("Connect a treasury wallet first.");
    if (!isArcTestnet(this.chainId)) throw new Error(`Switch to ${ARC_TESTNET.chainName}.`);
    const adapter = await createViemAdapterFromProvider({
      provider: this.provider as Parameters<typeof createViemAdapterFromProvider>[0]["provider"],
      capabilities: { addressContext: "user-controlled", supportedChains: [ArcTestnet] },
    });
    return buildSendParams(adapter, input);
  }

  async estimatePayment(input: AppKitPaymentInput): Promise<PaymentEstimate> {
    const estimate = await appKit.estimateSend(await this.context(input));
    return { fee: estimate.fee, feeUnit: "wei", gas: estimate.gas, gasPrice: estimate.gasPrice };
  }

  async executePayment(input: AppKitPaymentInput): Promise<AppKitPaymentResult> {
    const params = await this.context(input);
    const step = await appKit.send(params);
    if (step.state !== "success" || !step.txHash) throw new Error(step.errorMessage || "Arc App Kit did not return a confirmed transaction hash.");
    const publicClient = createPublicClient({ chain: arcTestnet, transport: http(ARC_TESTNET.rpcUrl) });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: step.txHash as `0x${string}`, confirmations: 1, timeout: 90_000 });
    if (receipt.status !== "success") throw new Error("The payment was not confirmed on Arc Testnet.");
    return mapConfirmedSendStep(step, { sender: this.connectedAddress!, recipient: input.recipient, amount: input.amount, reference: input.reference });
  }
}
