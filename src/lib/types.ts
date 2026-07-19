export type View = "overview" | "team" | "approvals" | "rules" | "payment";

export type PaymentStatus = "approved" | "pending" | "settled";

export type TeamMember = {
  id: string;
  name: string;
  role: string;
  initials: string;
  spent: number;
  available: number;
  activeRules: number;
  status: "active" | "paused";
};

export type Payment = {
  id: string;
  merchant: string;
  employee: string;
  category: string;
  amount: number;
  time: string;
  status: PaymentStatus;
};
