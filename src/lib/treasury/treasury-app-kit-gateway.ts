"use client";

import { isAddress } from "viem";
import { AppKitSendPaymentProvider } from "../arc/app-kit-payment-provider.ts";
import { ARC_TESTNET, type BrowserEthereumProvider } from "../arc/network.ts";
import {
  estimateTreasuryBridge,
  executeTreasuryBridge,
  queryUnifiedBalance,
  TREASURY_BRIDGE_ROUTES,
  type TreasuryBridgeDirection,
} from "../arc/treasury-operations.ts";
import { AppKitTreasurySwapService, type TreasurySwapInput, type TreasurySwapQuote } from "../arc/treasury-swap.ts";
import type { AppKitPaymentInput, AppKitPaymentResult, PaymentEstimate } from "../arc/types.ts";

export type TreasuryWalletContext = {
  address: string | null;
  chainId: string | null;
  provider: BrowserEthereumProvider | null;
};

export type TreasuryCapabilityMode = "Live" | "Estimate" | "Read only";

export type TreasuryCapabilityState = {
  mode: TreasuryCapabilityMode;
  enabled: boolean;
};

export type TreasuryBridgeReview = {
  direction: TreasuryBridgeDirection;
  sourceNetwork: "Ethereum Sepolia" | "Arc Testnet";
  destinationNetwork: "Ethereum Sepolia" | "Arc Testnet";
  asset: "USDC";
  amount: string;
  destination: string;
  fees: string[];
  reviewedWallet: string;
  reviewedChainId: string;
};

export type TreasuryBridgeProgressStep = {
  name: string;
  state: "pending" | "success" | "error" | "noop";
  transactionHash?: string;
  explorerUrl?: string;
  errorMessage?: string;
  errorCategory?: string;
};

export type TreasuryBridgeExecutionResult = {
  state: "pending" | "success" | "error";
  provider: string;
  steps: TreasuryBridgeProgressStep[];
};

export type TreasuryUnifiedBalance = {
  confirmed: string;
  pending: string;
  available: string;
};

export function defaultTreasuryBridgeDestination(
  direction: TreasuryBridgeDirection,
  companyTreasuryAddress: string,
  connectedWalletAddress: string | null,
) {
  return direction === "ethereum-to-arc" ? companyTreasuryAddress : connectedWalletAddress || "";
}

type SendClient = Pick<AppKitSendPaymentProvider, "estimatePayment" | "executePayment">;
type SwapClient = Pick<AppKitTreasurySwapService, "estimate">;

export type TreasuryAppKitDependencies = {
  createSendClient: (wallet: TreasuryWalletContext) => SendClient;
  createSwapClient: (wallet: TreasuryWalletContext) => SwapClient;
  estimateBridge: typeof estimateTreasuryBridge;
  executeBridge: typeof executeTreasuryBridge;
  readUnifiedBalance: typeof queryUnifiedBalance;
};

const liveDependencies: TreasuryAppKitDependencies = {
  createSendClient: (wallet) => new AppKitSendPaymentProvider(wallet.provider, wallet.address, wallet.chainId),
  createSwapClient: (wallet) => new AppKitTreasurySwapService(wallet.provider, wallet.address, wallet.chainId),
  estimateBridge: estimateTreasuryBridge,
  executeBridge: executeTreasuryBridge,
  readUnifiedBalance: queryUnifiedBalance,
};

export function getTreasuryCapabilityStates(flags: {
  appKit: boolean;
  send: boolean;
  bridge: boolean;
  swap: boolean;
  unifiedBalance: boolean;
}): Record<"send" | "bridge" | "swap" | "unifiedBalance", TreasuryCapabilityState> {
  return {
    send: { mode: "Live", enabled: flags.appKit && flags.send },
    bridge: { mode: "Live", enabled: flags.appKit && flags.bridge },
    swap: { mode: "Estimate", enabled: flags.appKit && flags.swap },
    unifiedBalance: { mode: "Read only", enabled: flags.appKit && flags.unifiedBalance },
  };
}

async function verifyLiveWallet(
  wallet: TreasuryWalletContext,
  expectedChain?: { chainIdHex: string; name: string },
): Promise<{ address: string; chainId: string }> {
  if (!wallet.provider || !wallet.address || !isAddress(wallet.address)) throw new Error("Connect a finance wallet to continue.");
  const [accountsValue, chainValue] = await Promise.all([
    wallet.provider.request({ method: "eth_accounts" }),
    wallet.provider.request({ method: "eth_chainId" }),
  ]);
  const accounts = Array.isArray(accountsValue) ? accountsValue : [];
  const currentAddress = typeof accounts[0] === "string" ? accounts[0] : null;
  if (!currentAddress || currentAddress.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error("Wallet account changed. Review the operation again.");
  }
  if (typeof chainValue !== "string") throw new Error("The connected wallet did not return a network.");
  if (expectedChain && chainValue.toLowerCase() !== expectedChain.chainIdHex.toLowerCase()) {
    throw new Error(`Switch your wallet to ${expectedChain.name} to continue.`);
  }
  if (wallet.chainId && chainValue.toLowerCase() !== wallet.chainId.toLowerCase()) {
    throw new Error("Wallet network changed. Review the operation again.");
  }
  return { address: currentAddress, chainId: chainValue };
}

function validateBridgeInput(destination: string, amount: string): void {
  if (!isAddress(destination)) throw new Error("Enter a valid bridge destination address.");
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(amount) || Number(amount) <= 0) {
    throw new Error("Enter a positive USDC amount with up to 6 decimals.");
  }
}

export function treasuryBridgeErrorMessage(error: unknown): string {
  const details = error as { code?: number; message?: string; errorMessage?: string; errorCategory?: string } | undefined;
  const message = details?.errorMessage || details?.message || (error instanceof Error ? error.message : "");
  const normalised = message.toLowerCase();
  if (details?.code === 4001 || details?.errorCategory === "user_rejected" || normalised.includes("user rejected")) {
    return "Wallet confirmation was cancelled. No bridge was submitted.";
  }
  if (normalised.includes("insufficient") && normalised.includes("usdc")) return "Insufficient USDC on the source network.";
  if (normalised.includes("insufficient funds") || normalised.includes("gas")) return "Insufficient source-chain gas to complete the bridge.";
  return message || "Bridge execution failed.";
}

export class TreasuryAppKitGateway {
  private sendPending = false;
  private bridgePending = false;

  constructor(
    private readonly wallet: TreasuryWalletContext,
    private readonly dependencies: TreasuryAppKitDependencies = liveDependencies,
  ) {}

  async reviewSend(input: AppKitPaymentInput): Promise<PaymentEstimate> {
    await verifyLiveWallet(this.wallet, { chainIdHex: ARC_TESTNET.chainIdHex, name: ARC_TESTNET.chainName });
    return this.dependencies.createSendClient(this.wallet).estimatePayment(input);
  }

  async confirmSend(input: AppKitPaymentInput): Promise<AppKitPaymentResult> {
    if (this.sendPending) throw new Error("This send is already being submitted.");
    this.sendPending = true;
    try {
      await verifyLiveWallet(this.wallet, { chainIdHex: ARC_TESTNET.chainIdHex, name: ARC_TESTNET.chainName });
      return await this.dependencies.createSendClient(this.wallet).executePayment(input);
    } finally {
      this.sendPending = false;
    }
  }

  async reviewSwap(input: TreasurySwapInput): Promise<TreasurySwapQuote> {
    await verifyLiveWallet(this.wallet, { chainIdHex: ARC_TESTNET.chainIdHex, name: ARC_TESTNET.chainName });
    return this.dependencies.createSwapClient(this.wallet).estimate(input);
  }

  async reviewBridge(direction: TreasuryBridgeDirection, destination: string, amount: string): Promise<TreasuryBridgeReview> {
    validateBridgeInput(destination, amount);
    const route = TREASURY_BRIDGE_ROUTES[direction];
    const reviewedWallet = await verifyLiveWallet(this.wallet, { chainIdHex: route.sourceChainIdHex, name: route.sourceName });
    const result = await this.dependencies.estimateBridge(this.wallet.provider!, direction, destination, amount);
    const fees = [
      ...result.gasFees.map((fee) => `${fee.name}: ${fee.fees?.fee ?? "Unavailable"} ${fee.token}`),
      ...result.fees.map((fee) => `${fee.type}: ${fee.amount ?? "Unavailable"} ${fee.token}`),
    ];
    return {
      direction,
      sourceNetwork: route.sourceName,
      destinationNetwork: route.destinationName,
      asset: "USDC",
      amount,
      destination,
      fees,
      reviewedWallet: reviewedWallet.address,
      reviewedChainId: reviewedWallet.chainId,
    };
  }

  async confirmBridge(review: TreasuryBridgeReview, reference: string): Promise<TreasuryBridgeExecutionResult> {
    if (this.bridgePending) throw new Error("This bridge is already being submitted.");
    this.bridgePending = true;
    try {
      const route = TREASURY_BRIDGE_ROUTES[review.direction];
      const currentWallet = await verifyLiveWallet(this.wallet, { chainIdHex: route.sourceChainIdHex, name: route.sourceName });
      if (currentWallet.address.toLowerCase() !== review.reviewedWallet.toLowerCase() || currentWallet.chainId.toLowerCase() !== review.reviewedChainId.toLowerCase()) {
        throw new Error("Wallet account or network changed. Review the bridge again.");
      }
      const execution = await this.dependencies.executeBridge(
        this.wallet.provider!,
        currentWallet.address,
        review.direction,
        review.destination,
        review.amount,
        reference,
      );
      return {
        state: execution.result.state,
        provider: execution.result.provider,
        steps: execution.result.steps.map((step) => ({
          name: step.name,
          state: step.state,
          transactionHash: step.txHash,
          explorerUrl: step.explorerUrl,
          errorMessage: step.errorMessage,
          errorCategory: step.errorCategory,
        })),
      };
    } finally {
      this.bridgePending = false;
    }
  }

  async readUnifiedBalance(): Promise<TreasuryUnifiedBalance> {
    await verifyLiveWallet(this.wallet);
    const result = await this.dependencies.readUnifiedBalance(this.wallet.provider!);
    return {
      confirmed: result.totalConfirmedBalance,
      pending: result.totalPendingBalance ?? "0",
      available: result.totalConfirmedBalance,
    };
  }
}
