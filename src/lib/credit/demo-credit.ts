import type { DemoState } from "@/data/demo-state";
import type { CreditApprovalType, CreditRequest, CreditState, CreditTermDays } from "./types";

export const CREDIT_RATE_BPS = 800;

export function calculateSimpleInterest(principal: number, annualRateBps: number, termDays: number): number {
  return Math.round((principal * (annualRateBps / 10_000) * termDays / 365) * 100) / 100;
}

export function creditOutstanding(credit: CreditState): number {
  return credit.loans.filter((loan) => loan.status === "Active").reduce((total, loan) => total + loan.outstandingPrincipal, 0);
}

export function creditAvailable(credit: CreditState): number {
  return Math.max(0, credit.creditLimit - creditOutstanding(credit));
}

export function classifyCreditRequest(amount: number, facilityStatus: CreditState["facilityStatus"]): CreditApprovalType {
  if (facilityStatus !== "Active") return "Blocked";
  return amount <= 1_000 ? "Standard finance approval" : "Treasury multisig";
}

export function createSeedCreditState(): CreditState {
  const mode = process.env.NEXT_PUBLIC_WITHIN_CREDIT_MODE === "live" ? "live" : "mock";
  return {
    enabled: process.env.NEXT_PUBLIC_WITHIN_CREDIT_ENABLED !== "false",
    mode,
    facilityStatus: "Active",
    creditLimit: 25_000,
    annualRateBps: CREDIT_RATE_BPS,
    facilityLiquidity: 25_000,
    borrower: "Northstar Labs Treasury",
    facilityAddress: process.env.NEXT_PUBLIC_WITHIN_CREDIT_FACILITY_ADDRESS || null,
    selectedRequestId: null,
    selectedLoanId: "LOAN-WORKING-CAPITAL-001",
    requests: [
      { id: "CR-STD-001", amount: 750, purpose: "Software procurement", department: "Engineering", termDays: 90, treasuryDestination: "", supportingNote: "", policyId: "POL-ENG-AI-001", status: "Awaiting finance approval", approvalType: "Standard finance approval", decisions: [], createdAt: "2026-07-22T09:00:00.000Z", disbursementId: null },
      { id: "CR-MSIG-001", amount: 5_000, purpose: "Supplier payment", department: "Operations", termDays: 180, treasuryDestination: "", supportingNote: "", policyId: "POL-SALES-TRAVEL-001", status: "Awaiting signatures", approvalType: "Treasury multisig", decisions: [{ signerId: "SIGNER-AMANDA", timestamp: "2026-07-22T09:15:00.000Z" }], createdAt: "2026-07-22T09:10:00.000Z", disbursementId: null },
    ],
    loans: [{ id: "LOAN-WORKING-CAPITAL-001", requestId: "CR-SEED-ACTIVE", originalPrincipal: 7_500, outstandingPrincipal: 7_500, totalDue: 7_795.89, amountRepaid: 0, purpose: "Working capital", termDays: 180, maturityDate: "2027-01-18", nextRepayment: 1_250, status: "Active" }],
    repayments: [],
  };
}

export type CreditRequestInput = { amount: number; purpose: string; department: string; termDays: CreditTermDays; treasuryDestination: string; supportingNote: string; policyId: string };

export function validateCreditRequest(input: CreditRequestInput, state: DemoState): void {
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Enter a positive USDC amount.");
  if (input.amount > creditAvailable(state.credit)) throw new Error("The request exceeds available credit.");
  if (!input.purpose.trim()) throw new Error("Choose a business purpose.");
  if (![30, 90, 180, 365].includes(input.termDays)) throw new Error("Choose a valid requested term.");
  if (state.credit.mode === "live" && !/^0x[0-9a-fA-F]{40}$/.test(input.treasuryDestination)) throw new Error("Enter a valid treasury destination address.");
}

function eventExists(state: DemoState, eventId: string) { return state.dashboard.activity.some((item) => item.eventId === eventId); }
function activity(state: DemoState, eventId: string, category: string, amount: number): DemoState["dashboard"]["activity"] {
  if (eventExists(state, eventId)) return state.dashboard.activity;
  return [{ id: `activity-${eventId}`, eventId, initials: "AM", employee: "Amanda Morgan", role: "Finance", merchant: "Company Credit", category, amount: `${amount.toLocaleString("en-GB")} USDC`, status: "Pending" as const }, ...state.dashboard.activity];
}

export function saveCreditRequest(state: DemoState, input: CreditRequestInput, submit: boolean, requestId?: string): DemoState {
  validateCreditRequest(input, state);
  const existing = requestId ? state.credit.requests.find((request) => request.id === requestId) : undefined;
  if (existing && existing.status !== "Draft") throw new Error("Only draft credit requests can be edited.");
  const id = existing?.id ?? `CR-${state.credit.requests.length + 1}-${Math.round(input.amount)}`;
  const approvalType = submit ? classifyCreditRequest(input.amount, state.credit.facilityStatus) : "Standard finance approval";
  const status: CreditRequest["status"] = !submit ? "Draft" : approvalType === "Blocked" ? "Blocked" : approvalType === "Treasury multisig" ? "Awaiting signatures" : "Awaiting finance approval";
  const next: CreditRequest = { id, ...input, status, approvalType, decisions: [], createdAt: existing?.createdAt ?? new Date().toISOString(), disbursementId: null };
  const requests = existing ? state.credit.requests.map((request) => request.id === id ? next : request) : [next, ...state.credit.requests];
  const eventId = `credit:${id}:${submit ? "submitted" : "draft"}`;
  return { ...state, credit: { ...state.credit, requests, selectedRequestId: id }, dashboard: { ...state.dashboard, activity: activity(state, eventId, submit ? "Drawdown request submitted" : "Credit draft created", input.amount) } };
}

export function approveCreditRequest(state: DemoState, requestId: string): DemoState {
  const request = state.credit.requests.find((item) => item.id === requestId);
  if (!request || !["Awaiting finance approval", "Awaiting signatures"].includes(request.status)) return state;
  const signer = state.treasury.signers.find((item) => item.id === state.treasury.currentSignerId);
  if (!signer?.active || request.decisions.some((decision) => decision.signerId === signer.id)) return state;
  const decisions = [...request.decisions, { signerId: signer.id, timestamp: new Date().toISOString() }];
  const required = request.approvalType === "Treasury multisig" ? 2 : 1;
  const status = decisions.length >= required ? "Ready to disburse" : request.status;
  return { ...state, credit: { ...state.credit, requests: state.credit.requests.map((item) => item.id === requestId ? { ...item, decisions, status } : item) }, dashboard: { ...state.dashboard, activity: activity(state, `credit:${requestId}:approval:${signer.id}`, `Credit approval recorded · ${decisions.length} of ${required}`, request.amount) } };
}

export function disburseCreditRequest(state: DemoState, requestId: string): DemoState {
  if (state.credit.mode !== "mock") return state;
  const request = state.credit.requests.find((item) => item.id === requestId);
  if (!request || request.status !== "Ready to disburse" || request.disbursementId || request.amount > creditAvailable(state.credit) || request.amount > state.credit.facilityLiquidity) return state;
  const interest = calculateSimpleInterest(request.amount, state.credit.annualRateBps, request.termDays);
  const loanId = `LOAN-${request.id}`;
  const maturity = new Date(Date.now() + request.termDays * 86_400_000).toISOString().slice(0, 10);
  const loan = { id: loanId, requestId, originalPrincipal: request.amount, outstandingPrincipal: request.amount, totalDue: request.amount + interest, amountRepaid: 0, purpose: request.purpose, termDays: request.termDays, maturityDate: maturity, nextRepayment: Math.min(request.amount, Math.round(request.amount / 6 * 100) / 100), status: "Active" as const };
  return { ...state, credit: { ...state.credit, facilityLiquidity: state.credit.facilityLiquidity - request.amount, requests: state.credit.requests.map((item) => item.id === requestId ? { ...item, status: "Disbursed", disbursementId: `DEMO-${request.id}` } : item), loans: [loan, ...state.credit.loans], selectedLoanId: loanId }, dashboard: { ...state.dashboard, activity: activity(state, `credit:${requestId}:disbursed`, "Demo disbursement", request.amount) } };
}

export function repayCreditLoan(state: DemoState, loanId: string, amount: number): DemoState {
  if (state.credit.mode !== "mock") return state;
  const loan = state.credit.loans.find((item) => item.id === loanId);
  if (!loan || loan.status !== "Active" || !Number.isFinite(amount) || amount <= 0 || amount > loan.outstandingPrincipal) return state;
  const eventId = `credit:${loanId}:repayment:${loan.amountRepaid + amount}`;
  if (state.credit.repayments.some((item) => item.id === eventId)) return state;
  const remaining = Math.round((loan.outstandingPrincipal - amount) * 100) / 100;
  return { ...state, credit: { ...state.credit, facilityLiquidity: state.credit.facilityLiquidity + amount, loans: state.credit.loans.map((item) => item.id === loanId ? { ...item, outstandingPrincipal: remaining, amountRepaid: item.amountRepaid + amount, status: remaining === 0 ? "Repaid" : "Active" } : item), repayments: [{ id: eventId, loanId, amount, timestamp: new Date().toISOString(), mode: "Demo repayment" }, ...state.credit.repayments] }, dashboard: { ...state.dashboard, activity: activity(state, eventId, "Demo repayment", amount) } };
}
