"use client";

import { isAddress } from "viem";
import { AppKitSendPaymentProvider } from "../arc/app-kit-payment-provider.ts";
import { ARC_TESTNET, isArcTestnet, type BrowserEthereumProvider } from "../arc/network.ts";
import { estimateBridgeToArc, queryUnifiedBalance } from "../arc/treasury-operations.ts";
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
  sourceNetwork: "Ethereum Sepolia";
  destinationNetwork: "Arc Testnet";
  asset: "USDC";
  amount: string;
  destination: string;
  fees: string[];
};

export type TreasuryUnifiedBalance = {
  confirmed: string;
  pending: string;
  available: string;
};

type SendClient = Pick<AppKitSendPaymentProvider, "estimatePayment" | "executePayment">;
type SwapClient = Pick<AppKitTreasurySwapService, "estimate">;

export type TreasuryAppKitDependencies = {
  createSendClient: (wallet: TreasuryWalletContext) => SendClient;
  createSwapClient: (wallet: TreasuryWalletContext) => SwapClient;
  estimateBridge: typeof estimateBridgeToArc;
  readUnifiedBalance: typeof queryUnifiedBalance;
};

const liveDependencies: TreasuryAppKitDependencies = {
  createSendClient: (wallet) => new AppKitSendPaymentProvider(wallet.provider, wallet.address, wallet.chainId),
  createSwapClient: (wallet) => new AppKitTreasurySwapService(wallet.provider, wallet.address, wallet.chainId),
  estimateBridge: estimateBridgeToArc,
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
    bridge: { mode: "Estimate", enabled: flags.appKit && flags.bridge },
    swap: { mode: "Estimate", enabled: flags.appKit && flags.swap },
    unifiedBalance: { mode: "Read only", enabled: flags.appKit && flags.unifiedBalance },
  };
}

async function verifyLiveWallet(wallet: TreasuryWalletContext, requireArc: boolean): Promise<void> {
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
  if (requireArc && !isArcTestnet(chainValue)) throw new Error(`Switch to ${ARC_TESTNET.chainName}.`);
  if (wallet.chainId && chainValue.toLowerCase() !== wallet.chainId.toLowerCase()) {
    throw new Error("Wallet network changed. Review the operation again.");
  }
}

function validateBridgeInput(destination: string, amount: string): void {
  if (!isAddress(destination)) throw new Error("Enter a valid Arc destination address.");
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(amount) || Number(amount) <= 0) {
    throw new Error("Enter a positive USDC amount with up to 6 decimals.");
  }
}

export class TreasuryAppKitGateway {
  private sendPending = false;

  constructor(
    private readonly wallet: TreasuryWalletContext,
    private readonly dependencies: TreasuryAppKitDependencies = liveDependencies,
  ) {}

  async reviewSend(input: AppKitPaymentInput): Promise<PaymentEstimate> {
    await verifyLiveWallet(this.wallet, true);
    return this.dependencies.createSendClient(this.wallet).estimatePayment(input);
  }

  async confirmSend(input: AppKitPaymentInput): Promise<AppKitPaymentResult> {
    if (this.sendPending) throw new Error("This send is already being submitted.");
    this.sendPending = true;
    try {
      await verifyLiveWallet(this.wallet, true);
      return await this.dependencies.createSendClient(this.wallet).executePayment(input);
    } finally {
      this.sendPending = false;
    }
  }

  async reviewSwap(input: TreasurySwapInput): Promise<TreasurySwapQuote> {
    await verifyLiveWallet(this.wallet, true);
    return this.dependencies.createSwapClient(this.wallet).estimate(input);
  }

  async reviewBridge(destination: string, amount: string): Promise<TreasuryBridgeReview> {
    validateBridgeInput(destination, amount);
    await verifyLiveWallet(this.wallet, false);
    const result = await this.dependencies.estimateBridge(this.wallet.provider!, destination, amount);
    const fees = [
      ...result.gasFees.map((fee) => `${fee.name}: ${fee.fees?.fee ?? "Unavailable"} ${fee.token}`),
      ...result.fees.map((fee) => `${fee.type}: ${fee.amount ?? "Unavailable"} ${fee.token}`),
    ];
    return {
      sourceNetwork: "Ethereum Sepolia",
      destinationNetwork: "Arc Testnet",
      asset: "USDC",
      amount,
      destination,
      fees,
    };
  }

  async readUnifiedBalance(): Promise<TreasuryUnifiedBalance> {
    await verifyLiveWallet(this.wallet, false);
    const result = await this.dependencies.readUnifiedBalance(this.wallet.provider!);
    return {
      confirmed: result.totalConfirmedBalance,
      pending: result.totalPendingBalance ?? "0",
      available: result.totalConfirmedBalance,
    };
  }
}
