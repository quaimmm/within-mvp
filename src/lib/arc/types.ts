import type { BrowserEthereumProvider } from "./network";

export type ArcWalletProviderDetail = {
  info: { uuid: string; name: string; icon?: string; rdns?: string };
  provider: BrowserEthereumProvider;
};

export type ArcWalletState = {
  address: `0x${string}` | null;
  chainId: string | null;
  provider: BrowserEthereumProvider | null;
  walletName: string | null;
  walletId: string | null;
};

export type SettlementOperationType =
  | "App Kit Send"
  | "App Kit Bridge"
  | "App Kit Swap"
  | "Unified Balance deposit"
  | "Unified Balance spend"
  | "Multisig contract approval"
  | "Multisig contract execution"
  | "Credit drawdown request"
  | "Credit approval"
  | "Credit disbursement"
  | "Credit repayment"
  | "Credit facility funding";

export type SettlementEvidence = {
  id: string;
  operationType: SettlementOperationType;
  capability: string;
  network: string;
  asset: "USDC" | "EURC";
  amount: string;
  inputAsset?: "USDC" | "EURC";
  inputAmount?: string;
  outputAsset?: "USDC" | "EURC";
  outputAmount?: string;
  sender?: string;
  recipient?: string;
  status: "Pending" | "Confirmed" | "Failed";
  transactionHash?: string;
  explorerUrl?: string;
  timestamp: string;
  reference: string;
  contractAddress?: string;
  loanId?: string;
  requestId?: string;
  signerThreshold?: string;
};

export type AppKitPaymentInput = {
  recipient: string;
  amount: string;
  reference: string;
  businessAmount?: number;
  businessCurrency?: "GBP";
};

export type PaymentEstimate = {
  fee: string;
  feeUnit: "wei";
  gas: bigint;
  gasPrice: bigint;
};

export type AppKitPaymentResult = {
  success: true;
  transactionHash: string;
  explorerUrl?: string;
  sender: string;
  recipient: string;
  amount: string;
  evidence: SettlementEvidence;
};
