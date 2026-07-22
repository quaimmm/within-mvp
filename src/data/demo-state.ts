import type { PaymentResult } from "../lib/payments/types.ts";
import type { SpendingPolicy } from "../lib/policies/policy-publisher.ts";
import type { MultisigRequest } from "../lib/multisig/types.ts";
import { createSeedCreditState } from "../lib/credit/demo-credit.ts";
import type { CreditState } from "../lib/credit/types.ts";

export const DEMO_STATE_VERSION = 6;
export const DEMO_STORAGE_KEY = "within:demo-state";

export type DemoPage = "Dashboard" | "Cards" | "Approvals" | "Rules" | "Credit" | "Team" | "Analytics" | "Settings";
export type TransactionStatus = "Approved" | "Pending" | "Declined" | "Flagged";
export type DashboardTransaction = { id: string; eventId?: string; initials: string; employee: string; role: string; merchant: string; category: string; amount: string; status: TransactionStatus };
export type SeededRule = { policyId: string; name: string; description: string; active: boolean };
export type ApprovalRisk = "Low" | "Medium" | "High";
export type DemoApproval = {
  id: string; employeeId: string; employeeName: string; department: string; merchant: string; category: string; amount: number; currency: "GBP";
  status: TransactionStatus; risk: ApprovalRisk; policyId: string; ruleName: string; ruleDescription: string; approvalNote: string;
  reviewReason: string; recommendation: string; requestedAt: string;
  approvalType: "Auto-approved" | "Standard" | "Treasury multisig" | "Blocked"; multisigRequestId: string | null;
  requestStatus?: "Draft" | "Pending" | "Auto-approved" | "Blocked" | "Ready to settle" | "Completed" | "Declined" | "Cancelled";
  requesterEmail?: string; businessReason?: string; settlementAmount?: number | null; settlementAsset?: "USDC"; supportingNote?: string; requestedDate?: string; attachmentName?: string | null; evaluationReason?: string;
};
export type TreasurySigner = { id: string; name: string; role: string; email: string; walletAddress: string | null; active: boolean };
export type TeamMember = {
  id: string; name: string; email: string; department: string; role: string; monthlySpend: number; monthlyLimit: number;
  cardStatus: "Active" | "Frozen" | "No card"; accountStatus: "Active" | "Inactive" | "Invited"; assignedRules: string[];
};
export type CompanyCard = { id: string; memberId: string; employeeName: string; department: string; lastFour: string; monthlyLimit: number; spent: number; status: "Active" | "Frozen"; assignedRules: string[]; recentTransactions: string[] };
export type Integration = { id: string; name: string; purpose: string; connected: boolean };
export type CompanySettings = { companyName: string; emailDomain: string; financeEmail: string; currency: "GBP"; timezone: string; requireCompanyEmails: boolean };
export type WalletSession = { address: string | null; chainId: string | null };

export type DemoState = {
  version: typeof DEMO_STATE_VERSION;
  signedIn: boolean;
  signedInUser: { name: string; email: string; role: string };
  page: DemoPage;
  dashboard: {
    companySpend: number; budgetRemaining: number; pendingCount: number; activeRuleCount: number; activity: DashboardTransaction[];
    drawerOpen: boolean; selectedApprovalId: string | null; paymentStatus: "idle" | "completed"; paymentResult: PaymentResult | null;
  };
  approvals: DemoApproval[];
  rules: { input: string; generatedRule: SpendingPolicy | null; seededRules: SeededRule[]; generationState: "idle" | "ready" | "error"; generationMessage: string | null };
  members: TeamMember[];
  cards: CompanyCard[];
  integrations: Integration[];
  company: CompanySettings;
  wallet: WalletSession;
  settingsSection: "Company" | "People & access" | "Connections" | "Treasury" | "Demo environment";
  treasury: { address: string | null; balance: string | null; policyContract: string | null; threshold: number; currentSignerId: string; signers: TreasurySigner[]; requests: MultisigRequest[]; bridgeDemo: { amount: string; destination: string; status: "idle" | "preview" | "processing" | "completed" }; swapDemo: { fromAsset: "EURC" | "USDC"; toAsset: "EURC" | "USDC"; amount: string; status: "idle" | "preview" | "processing" | "completed" } };
  credit: CreditState;
  analytics: { monthly: { label: string; value: number }[]; categories: { label: string; value: number }[]; departments: { label: string; value: number }[]; merchants: { label: string; value: number }[] };
  idempotency: { payment: string; publish: string; status: string };
};

export const seedApprovals: DemoApproval[] = [
  { id: "APR-EMILY-OPENAI", employeeId: "EMP-ENG-014", employeeName: "Emily Carter", department: "Engineering", merchant: "OpenAI", category: "AI Software", amount: 29, currency: "GBP", status: "Pending", risk: "Low", policyId: "POL-ENG-AI-001", ruleName: "Engineering AI Tools", ruleDescription: "Engineering can spend up to £300 per month on AI software.", approvalNote: "No approval normally required", reviewReason: "First purchase from this merchant.", recommendation: "This purchase matches the company rule and Emily’s usual spending. Low risk.", requestedAt: "Today, 10:24", approvalType: "Standard", multisigRequestId: null },
  { id: "APR-DANIEL-BA", employeeId: "EMP-SALES-009", employeeName: "Daniel Foster", department: "Sales", merchant: "British Airways", category: "Travel", amount: 1480, currency: "GBP", status: "Pending", risk: "Medium", policyId: "POL-SALES-TRAVEL-001", ruleName: "Sales Travel", ruleDescription: "Sales travel is reviewed against the team allowance.", approvalNote: "Treasury approval required", reviewReason: "Payment exceeds the £1,000 treasury threshold", recommendation: "Confirm the itinerary, then collect two treasury signer approvals.", requestedAt: "Today, 09:12", approvalType: "Treasury multisig", multisigRequestId: "MSIG-BA-001" },
  { id: "APR-SARAH-HOXTON", employeeId: "EMP-MKT-005", employeeName: "Sarah Ahmed", department: "Marketing", merchant: "The Hoxton", category: "Accommodation", amount: 535, currency: "GBP", status: "Flagged", risk: "High", policyId: "POL-HOTEL-APPROVAL-001", ruleName: "Hotels above £200", ruleDescription: "Hotels above £200 per night require review.", approvalNote: "Manager approval required", reviewReason: "The nightly rate is above the company limit.", recommendation: "Request an itemised itinerary before approving this purchase.", requestedAt: "Yesterday, 16:48", approvalType: "Standard", multisigRequestId: null },
  { id: "APR-JAMES-FIGMA", employeeId: "EMP-DES-003", employeeName: "James Wilson", department: "Design", merchant: "Figma", category: "Design Software", amount: 48, currency: "GBP", status: "Approved", risk: "Low", policyId: "POL-MKT-SOFT-001", ruleName: "Marketing Software", ruleDescription: "Design and marketing software under £100 is allowed.", approvalNote: "No approval required", reviewReason: "Automatically checked against the rule.", recommendation: "This purchase is within the team software allowance.", requestedAt: "Yesterday, 13:05", approvalType: "Standard", multisigRequestId: null },
];
export const seedEmilyApproval = seedApprovals[0];

export const seedTransactions: DashboardTransaction[] = [
  { id: "activity-multisig-approval-seed-1", eventId: "MSIG-BA-001:approval:SIGNER-OLIVIA", initials: "OB", employee: "Olivia Bennett", role: "Finance", merchant: "British Airways", category: "Signer approved · 1 of 2", amount: "£1,480.00", status: "Approved" },
  { id: "activity-multisig-request-seed-1", eventId: "MSIG-BA-001:created", initials: "DF", employee: "Daniel Foster", role: "Sales", merchant: "British Airways", category: "Multisig request created", amount: "£1,480.00", status: "Pending" },
  { id: "activity-openai-purchase-seed-1", eventId: "APR-EMILY-OPENAI:pending", initials: "EC", employee: "Emily Carter", role: "Engineering", merchant: "OpenAI", category: "AI Software", amount: "£29.00", status: "Pending" },
  { id: "activity-figma-purchase-seed-1", initials: "SM", employee: "Sarah Miles", role: "Product", merchant: "Figma", category: "Software", amount: "£68.00", status: "Approved" },
  { id: "activity-aws-purchase-seed-1", initials: "DR", employee: "Daniel Reed", role: "Engineering", merchant: "AWS", category: "Infrastructure", amount: "£1,248.40", status: "Approved" },
  { id: "activity-hoxton-purchase-seed-1", initials: "AP", employee: "Amelia Price", role: "Sales", merchant: "The Hoxton", category: "Travel", amount: "£846.00", status: "Pending" },
  { id: "activity-apple-purchase-seed-1", initials: "JL", employee: "Jonas Lind", role: "Operations", merchant: "Apple", category: "Equipment", amount: "£2,399.00", status: "Flagged" },
  { id: "activity-notion-purchase-seed-1", initials: "AM", employee: "Amanda Morgan", role: "Finance", merchant: "Notion", category: "Software", amount: "£192.00", status: "Approved" },
];

export const seedRules: SeededRule[] = [
  { policyId: "POL-ENG-AI-001", name: "Engineering AI Tools", description: "Up to £300 each month for approved AI tools.", active: true },
  { policyId: "POL-SALES-TRAVEL-001", name: "Sales travel", description: "Travel under £500 without approval.", active: true },
  { policyId: "POL-HOTEL-APPROVAL-001", name: "Hotel approval", description: "Approval required above £200 per night.", active: true },
];

export const seedMembers: TeamMember[] = [
  { id: "EMP-ENG-014", name: "Emily Carter", email: "emily@northstar.io", department: "Engineering", role: "Senior Engineer", monthlySpend: 186, monthlyLimit: 300, cardStatus: "Active", accountStatus: "Active", assignedRules: ["Engineering AI Tools"] },
  { id: "EMP-SALES-009", name: "Daniel Foster", email: "daniel@northstar.io", department: "Sales", role: "Account Executive", monthlySpend: 1420, monthlyLimit: 2000, cardStatus: "Active", accountStatus: "Active", assignedRules: ["Sales Travel"] },
  { id: "EMP-MKT-005", name: "Sarah Ahmed", email: "sarah@northstar.io", department: "Marketing", role: "Marketing Manager", monthlySpend: 892, monthlyLimit: 1200, cardStatus: "Active", accountStatus: "Active", assignedRules: ["Marketing Software", "Hotels above £200"] },
  { id: "EMP-DES-003", name: "James Wilson", email: "james@northstar.io", department: "Design", role: "Product Designer", monthlySpend: 374, monthlyLimit: 800, cardStatus: "Active", accountStatus: "Active", assignedRules: ["Marketing Software"] },
  { id: "EMP-FIN-001", name: "Amanda Morgan", email: "amanda@northstar.io", department: "Finance", role: "Finance Administrator", monthlySpend: 0, monthlyLimit: 1000, cardStatus: "No card", accountStatus: "Active", assignedRules: ["Finance operations"] },
  { id: "EMP-OPS-007", name: "Michael Reed", email: "michael@northstar.io", department: "Operations", role: "Operations Analyst", monthlySpend: 218, monthlyLimit: 600, cardStatus: "Frozen", accountStatus: "Active", assignedRules: ["Operations purchases"] },
];

export const seedCards: CompanyCard[] = [
  { id: "CARD-4812", memberId: "EMP-ENG-014", employeeName: "Emily Carter", department: "Engineering", lastFour: "4812", monthlyLimit: 300, spent: 186, status: "Active", assignedRules: ["Engineering AI Tools"], recentTransactions: ["OpenAI · £29.00", "GitHub · £16.00"] },
  { id: "CARD-2941", memberId: "EMP-SALES-009", employeeName: "Daniel Foster", department: "Sales", lastFour: "2941", monthlyLimit: 2000, spent: 1420, status: "Active", assignedRules: ["Sales Travel"], recentTransactions: ["British Airways · £684.00", "Trainline · £86.40"] },
  { id: "CARD-8850", memberId: "EMP-MKT-005", employeeName: "Sarah Ahmed", department: "Marketing", lastFour: "8850", monthlyLimit: 1200, spent: 892, status: "Active", assignedRules: ["Marketing Software"], recentTransactions: ["The Hoxton · £535.00", "Canva · £24.00"] },
  { id: "CARD-1107", memberId: "EMP-OPS-007", employeeName: "Michael Reed", department: "Operations", lastFour: "1107", monthlyLimit: 600, spent: 218, status: "Frozen", assignedRules: ["Operations purchases"], recentTransactions: ["Uber · £34.20", "Staples · £76.00"] },
];

const seedIntegrations: Integration[] = [
  { id: "google", name: "Google Workspace", purpose: "Employee directory and work-email verification", connected: true },
  { id: "slack", name: "Slack", purpose: "Approval notifications", connected: true },
  { id: "xero", name: "Xero", purpose: "Accounting reconciliation", connected: false },
  { id: "quickbooks", name: "QuickBooks", purpose: "Accounting reconciliation", connected: false },
  { id: "entra", name: "Microsoft Entra ID", purpose: "Single sign-on and directory sync", connected: false },
];

function freshId(): string { return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

function activitySlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "event";
}

export function migrateActivityRecords(records: unknown[]): DashboardTransaction[] {
  const occurrences = new Map<string, number>();
  const seenEvents = new Set<string>();
  const seenIds = new Set<string>();
  return records.flatMap((record) => {
    if (!record || typeof record !== "object") return [];
    const item = record as Partial<DashboardTransaction>;
    if (!item.employee || !item.merchant || !item.category || !item.amount || !item.status || !item.initials || !item.role) return [];
    if (item.eventId && seenEvents.has(item.eventId)) return [];
    if (item.eventId) seenEvents.add(item.eventId);
    const base = item.eventId || [item.employee, item.merchant, item.category, item.amount, item.status].map(activitySlug).join("-");
    const occurrence = (occurrences.get(base) ?? 0) + 1;
    occurrences.set(base, occurrence);
    const candidate = item.id || `activity-migrated-${activitySlug(base)}-${occurrence}`;
    const id = seenIds.has(candidate) ? `${candidate}-${occurrence}` : candidate;
    seenIds.add(id);
    return [{ ...item, id } as DashboardTransaction];
  });
}

export function createCleanDemoState(): DemoState {
  return {
    version: DEMO_STATE_VERSION,
    signedIn: false,
    signedInUser: { name: "Amanda Morgan", email: "amanda@northstar.io", role: "Administrator" },
    page: "Dashboard",
    dashboard: { companySpend: 42_310, budgetRemaining: 57_690, pendingCount: 3, activeRuleCount: 12, activity: clone(seedTransactions), drawerOpen: false, selectedApprovalId: null, paymentStatus: "idle", paymentResult: null },
    approvals: clone(seedApprovals),
    rules: { input: "", generatedRule: null, seededRules: clone(seedRules), generationState: "idle", generationMessage: null },
    members: clone(seedMembers), cards: clone(seedCards), integrations: clone(seedIntegrations),
    company: { companyName: "Northstar Labs", emailDomain: "northstar.io", financeEmail: "finance@northstar.io", currency: "GBP", timezone: "Europe/London", requireCompanyEmails: true },
    wallet: { address: null, chainId: null },
    settingsSection: "Company",
    treasury: { address: null, balance: null, policyContract: null, threshold: 2, currentSignerId: "SIGNER-AMANDA", signers: [{ id: "SIGNER-AMANDA", name: "Amanda Morgan", role: "Administrator", email: "amanda@northstar.io", walletAddress: null, active: true }, { id: "SIGNER-OLIVIA", name: "Olivia Bennett", role: "Finance Director", email: "olivia@northstar.io", walletAddress: null, active: true }, { id: "SIGNER-NOAH", name: "Noah Patel", role: "Company Director", email: "noah@northstar.io", walletAddress: null, active: true }], requests: [{ id: "MSIG-BA-001", approvalId: "APR-DANIEL-BA", required: 2, expiresAt: "2026-08-19T12:00:00.000Z", status: "Awaiting signatures", decisions: [{ signerId: "SIGNER-OLIVIA", decision: "Approved", timestamp: "2026-07-20T09:15:00.000Z" }], settlementId: null }], bridgeDemo: { amount: "0.01", destination: "", status: "idle" }, swapDemo: { fromAsset: "EURC", toAsset: "USDC", amount: "10", status: "idle" } },
    credit: createSeedCreditState(),
    analytics: {
      monthly: [{ label: "Feb", value: 28400 }, { label: "Mar", value: 31800 }, { label: "Apr", value: 30900 }, { label: "May", value: 35600 }, { label: "Jun", value: 37100 }, { label: "Jul", value: 42310 }],
      categories: [{ label: "Software", value: 12840 }, { label: "Travel", value: 9420 }, { label: "Meals", value: 6750 }, { label: "Accommodation", value: 5310 }, { label: "Transport", value: 4180 }, { label: "Office", value: 3810 }],
      departments: [{ label: "Engineering", value: 13680 }, { label: "Sales", value: 10940 }, { label: "Marketing", value: 8720 }, { label: "Operations", value: 5460 }, { label: "Finance", value: 3510 }],
      merchants: [{ label: "AWS", value: 5280 }, { label: "British Airways", value: 3840 }, { label: "OpenAI", value: 2960 }, { label: "The Hoxton", value: 2420 }, { label: "Figma", value: 1870 }],
    },
    idempotency: { payment: freshId(), publish: freshId(), status: freshId() },
  };
}

export function restoreDemoState(raw: string | null): DemoState {
  if (!raw) return createCleanDemoState();
  try {
    const value = JSON.parse(raw) as DemoState;
    if (value.version !== DEMO_STATE_VERSION || typeof value.signedIn !== "boolean" || !value.dashboard || !value.rules || !value.company || !value.wallet || !value.treasury || !value.credit || !value.idempotency || !Array.isArray(value.approvals) || !Array.isArray(value.members) || !Array.isArray(value.cards) || !Array.isArray(value.integrations) || !Array.isArray(value.treasury.signers) || !Array.isArray(value.treasury.requests) || !Array.isArray(value.credit.requests) || !Array.isArray(value.credit.loans) || !Array.isArray(value.credit.repayments) || !value.analytics || !Array.isArray(value.dashboard.activity) || !Array.isArray(value.rules.seededRules)) return createCleanDemoState();
    const clean = createCleanDemoState();
    return { ...clean, ...value, dashboard: { ...clean.dashboard, ...value.dashboard, activity: migrateActivityRecords(value.dashboard.activity), drawerOpen: false, selectedApprovalId: null, paymentStatus: value.dashboard.paymentStatus === "completed" && value.dashboard.paymentResult ? "completed" : "idle", paymentResult: value.dashboard.paymentStatus === "completed" ? value.dashboard.paymentResult : null }, rules: { ...clean.rules, ...value.rules, generationState: value.rules.generationState === "ready" || value.rules.generationState === "error" ? value.rules.generationState : "idle" }, wallet: { ...clean.wallet, ...value.wallet }, credit: { ...clean.credit, ...value.credit, selectedRequestId: null } };
  } catch { return createCleanDemoState(); }
}

export function completeApprovalPayment(state: DemoState, approvalId: string, result: PaymentResult): DemoState {
  const approval = state.approvals.find((item) => item.id === approvalId);
  if (!approval || approval.status === "Approved" || state.dashboard.paymentStatus === "completed") return state;
  const activityIndex = state.dashboard.activity.findIndex((item) => item.employee === approval.employeeName && item.merchant === approval.merchant);
  const eventId = `${approval.id}:payment-completed`;
  const nextActivity = activityIndex >= 0 ? state.dashboard.activity.map((item, index) => index === activityIndex ? { ...item, status: "Approved" as const } : item) : state.dashboard.activity.some((item) => item.eventId === eventId) ? state.dashboard.activity : [{ id: `activity-${eventId}`, eventId, initials: approval.employeeName.split(" ").map((part) => part[0]).join(""), employee: approval.employeeName, role: approval.department, merchant: approval.merchant, category: approval.category, amount: `£${approval.amount.toFixed(2)}`, status: "Approved" as const }, ...state.dashboard.activity];
  const createdRequest = Boolean(approval.requestStatus);
  return { ...state, dashboard: { ...state.dashboard, companySpend: state.dashboard.companySpend + (createdRequest ? approval.amount : 0), budgetRemaining: Math.max(0, state.dashboard.budgetRemaining - (createdRequest ? approval.amount : 0)), pendingCount: Math.max(0, state.dashboard.pendingCount - 1), paymentStatus: "completed", paymentResult: result, activity: nextActivity }, approvals: state.approvals.map((item) => item.id === approvalId ? { ...item, status: "Approved", requestStatus: "Completed" } : item) };
}

export function completeEmilyPayment(state: DemoState, result: PaymentResult): DemoState { return completeApprovalPayment(state, "APR-EMILY-OPENAI", result); }
