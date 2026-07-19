export type PaymentRequest = {
  employeeId: string;
  employeeName: string;
  merchant: string;
  category: string;
  amount: number;
  currency: "GBP";
  policyId: string;
};

export type PaymentResult = {
  success: boolean;
  paymentId: string;
  provider: "mock" | "arc";
  network: "demo" | "arc-testnet";
  businessAmount: number;
  businessCurrency: "GBP";
  settledAmount: number;
  settlementCurrency: "USDC";
  transactionHash?: string;
  explorerUrl?: string;
  contractAddress?: string;
  policyId?: string;
  executionId?: string;
  timestamp: string;
  isTestnet: boolean;
};

export interface PaymentProvider {
  executePayment(request: PaymentRequest, idempotencyKey: string): Promise<PaymentResult>;
}

export type ExecutePaymentPayload = {
  idempotencyKey: string;
  request: PaymentRequest;
};
