export type CreditTermDays = 30 | 90 | 180 | 365;
export type CreditApprovalType = "Standard finance approval" | "Treasury multisig" | "Blocked";
export type CreditRequestStatus = "Draft" | "Awaiting finance approval" | "Awaiting signatures" | "Ready to disburse" | "Disbursed" | "Declined" | "Cancelled" | "Blocked";
export type CreditLoanStatus = "Active" | "Repaid" | "Cancelled" | "Defaulted";

export type CreditDecision = { signerId: string; timestamp: string };
export type CreditRequest = {
  id: string;
  amount: number;
  purpose: string;
  department: string;
  termDays: CreditTermDays;
  treasuryDestination: string;
  supportingNote: string;
  policyId: string;
  status: CreditRequestStatus;
  approvalType: CreditApprovalType;
  decisions: CreditDecision[];
  createdAt: string;
  disbursementId: string | null;
};

export type CreditLoan = {
  id: string;
  requestId: string;
  originalPrincipal: number;
  outstandingPrincipal: number;
  totalDue: number;
  amountRepaid: number;
  purpose: string;
  termDays: CreditTermDays;
  maturityDate: string;
  nextRepayment: number;
  status: CreditLoanStatus;
};

export type CreditRepayment = {
  id: string;
  loanId: string;
  amount: number;
  timestamp: string;
  mode: "Demo repayment" | "Arc Testnet";
  transactionHash?: string;
  explorerUrl?: string;
};

export type CreditState = {
  enabled: boolean;
  mode: "mock" | "live";
  facilityStatus: "Active" | "Paused" | "Blocked";
  creditLimit: number;
  annualRateBps: number;
  facilityLiquidity: number;
  borrower: string;
  facilityAddress: string | null;
  selectedRequestId: string | null;
  selectedLoanId: string | null;
  requests: CreditRequest[];
  loans: CreditLoan[];
  repayments: CreditRepayment[];
};
