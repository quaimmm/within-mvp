export type SettlementGuard = {
  maxPerTransactionUSDC: string;
  periodLimitUSDC: string;
  enforcement: "mock" | "onchain";
  transactionHash?: string;
  explorerUrl?: string;
  contractAddress?: string;
};

export type SpendingPolicy = {
  id: string;
  policyId: string;
  name: string;
  description: string;
  department: string;
  category: string;
  limitType: "monthly" | "per_transaction";
  limitAmount: number;
  businessLimit: number;
  businessCurrency: "GBP";
  approvalRequired: boolean;
  approvalThreshold: number | null;
  recurringAllowed: boolean;
  merchantRestrictions: string;
  timeRestrictions: string | null;
  riskLevel: "Low" | "Medium" | "High";
  explanation: string;
  confidence: "High" | "Medium" | "Low";
  assumptions: string[];
  status: "Draft" | "Active" | "Paused";
  active: boolean;
  createdAt: string;
  updatedAt: string;
  settlementGuard?: SettlementGuard;
};

export type PolicyPublishRequest = {
  policyId: string;
  name: string;
  businessLimit: number;
  businessCurrency: "GBP";
  settlementMaxPerTransactionUSDC: string;
  settlementPeriodLimitUSDC: string;
  active: boolean;
  idempotencyKey: string;
};

export type PolicyPublishResult = {
  success: boolean;
  provider: "mock" | "arc";
  network: "demo" | "arc-testnet";
  policyId: string;
  policyKey: `0x${string}`;
  active: boolean;
  transactionHash?: `0x${string}`;
  explorerUrl?: string;
  contractAddress?: `0x${string}`;
  timestamp: string;
};

export interface PolicyPublisher {
  publishPolicy(request: PolicyPublishRequest): Promise<PolicyPublishResult>;
  setPolicyStatus(policyId: string, active: boolean, idempotencyKey: string): Promise<PolicyPublishResult>;
}

export class PolicyPublishingError extends Error {
  constructor(public readonly safeMessage = "Rule could not be activated.\nNo changes were published.") {
    super(safeMessage);
    this.name = "PolicyPublishingError";
  }
}
