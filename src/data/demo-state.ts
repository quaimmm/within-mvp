import type { PaymentResult } from "../lib/payments/types.ts";
import type { SpendingPolicy } from "../lib/policies/policy-publisher.ts";

export const DEMO_STATE_VERSION = 1;
export const DEMO_STORAGE_KEY = "within:demo-state";

export type DemoPage = "Dashboard" | "Cards" | "Approvals" | "Rules" | "Team" | "Analytics" | "Settings";
export type TransactionStatus = "Approved" | "Pending" | "Flagged";
export type DashboardTransaction = { initials: string; employee: string; role: string; merchant: string; category: string; amount: string; status: TransactionStatus };
export type SeededRule = { policyId: string; name: string; description: string; active: boolean };

export type DemoState = {
  version: typeof DEMO_STATE_VERSION;
  page: DemoPage;
  dashboard: {
    companySpend: number;
    budgetRemaining: number;
    pendingCount: number;
    activeRuleCount: number;
    activity: DashboardTransaction[];
    emilyInQueue: boolean;
    drawerOpen: boolean;
    paymentStatus: "idle" | "completed";
    paymentResult: PaymentResult | null;
  };
  rules: {
    input: string;
    generatedRule: SpendingPolicy | null;
    seededRules: SeededRule[];
    generationState: "idle" | "ready" | "error";
    generationMessage: string | null;
  };
  idempotency: { payment: string; publish: string; status: string };
};

export const seedTransactions: DashboardTransaction[] = [
  { initials: "EC", employee: "Emily Carter", role: "Engineering", merchant: "OpenAI", category: "AI Software", amount: "£29.00", status: "Pending" },
  { initials: "SM", employee: "Sarah Miles", role: "Product", merchant: "Figma", category: "Software", amount: "£68.00", status: "Approved" },
  { initials: "DR", employee: "Daniel Reed", role: "Engineering", merchant: "AWS", category: "Infrastructure", amount: "£1,248.40", status: "Approved" },
  { initials: "AP", employee: "Amelia Price", role: "Sales", merchant: "The Hoxton", category: "Travel", amount: "£846.00", status: "Pending" },
  { initials: "JL", employee: "Jonas Lind", role: "Operations", merchant: "Apple", category: "Equipment", amount: "£2,399.00", status: "Flagged" },
  { initials: "MK", employee: "Mert Kara", role: "Leadership", merchant: "Notion", category: "Software", amount: "£192.00", status: "Approved" },
];

export const seedRules: SeededRule[] = [
  { policyId: "POL-ENG-AI-001", name: "Engineering AI software", description: "Up to £300 each month for approved AI tools.", active: true },
  { policyId: "POL-SALES-TRAVEL-001", name: "Sales travel", description: "Travel under £500 without approval.", active: true },
  { policyId: "POL-HOTEL-APPROVAL-001", name: "Hotel approval", description: "Approval required above £200 per night.", active: true },
];

function freshId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createCleanDemoState(): DemoState {
  return {
    version: DEMO_STATE_VERSION,
    page: "Dashboard",
    dashboard: { companySpend: 42_310, budgetRemaining: 57_690, pendingCount: 3, activeRuleCount: 12, activity: seedTransactions.map((item) => ({ ...item })), emilyInQueue: true, drawerOpen: false, paymentStatus: "idle", paymentResult: null },
    rules: { input: "", generatedRule: null, seededRules: seedRules.map((rule) => ({ ...rule })), generationState: "idle", generationMessage: null },
    idempotency: { payment: freshId(), publish: freshId(), status: freshId() },
  };
}

export function restoreDemoState(raw: string | null): DemoState {
  if (!raw) return createCleanDemoState();
  try {
    const value = JSON.parse(raw) as Partial<DemoState>;
    if (value.version !== DEMO_STATE_VERSION || !value.dashboard || !value.rules || !value.idempotency || !Array.isArray(value.dashboard.activity) || !Array.isArray(value.rules.seededRules)) return createCleanDemoState();
    const clean = createCleanDemoState();
    const restored = value as DemoState;
    return {
      ...clean,
      ...restored,
      dashboard: {
        ...clean.dashboard,
        ...restored.dashboard,
        drawerOpen: Boolean(restored.dashboard.drawerOpen),
        paymentStatus: restored.dashboard.paymentStatus === "completed" && restored.dashboard.paymentResult ? "completed" : "idle",
        paymentResult: restored.dashboard.paymentStatus === "completed" ? restored.dashboard.paymentResult : null,
      },
      rules: { ...clean.rules, ...restored.rules, generationState: restored.rules.generationState === "ready" || restored.rules.generationState === "error" ? restored.rules.generationState : "idle" },
    };
  } catch {
    return createCleanDemoState();
  }
}

export function completeEmilyPayment(state: DemoState, result: PaymentResult): DemoState {
  if (!state.dashboard.emilyInQueue || state.dashboard.paymentStatus === "completed") return state;
  return {
    ...state,
    dashboard: {
      ...state.dashboard,
      pendingCount: Math.max(0, state.dashboard.pendingCount - 1),
      emilyInQueue: false,
      paymentStatus: "completed",
      paymentResult: result,
      activity: state.dashboard.activity.map((item) => item.employee === "Emily Carter" && item.merchant === "OpenAI" ? { ...item, status: "Approved" } : item),
    },
  };
}
