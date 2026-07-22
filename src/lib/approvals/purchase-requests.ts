import type { DemoApproval, DemoState, SeededRule } from "../../data/demo-state.ts";

export type PurchaseRequestForm = { requester: string; requesterEmail: string; department: string; merchant: string; category: string; businessReason: string; amount: string; currency: "GBP"; settlementAmount: string; settlementAsset: "USDC"; requestedDate: string; matchedRuleId: string; risk: "Low" | "Medium" | "High"; supportingNote: string; attachmentName: string | null };
export type RequestEvaluation = { approvalType: DemoApproval["approvalType"]; requestStatus: NonNullable<DemoApproval["requestStatus"]>; matchedRule: SeededRule | null; reason: string; requiredApprovers: string; settlementMethod: string; arcStatus: string };

export const emptyPurchaseRequest = (): PurchaseRequestForm => ({ requester: "Amanda Morgan", requesterEmail: "amanda@northstar.io", department: "Engineering", merchant: "", category: "AI Software", businessReason: "", amount: "", currency: "GBP", settlementAmount: "0.01", settlementAsset: "USDC", requestedDate: new Date().toISOString().slice(0, 10), matchedRuleId: "POL-ENG-AI-001", risk: "Low", supportingNote: "", attachmentName: null });
export const purchaseSamples: Record<string, Partial<PurchaseRequestForm>> = {
  "Standard software purchase": { department: "Engineering", merchant: "OpenAI", category: "AI Software", businessReason: "Software for product development", amount: "29", matchedRuleId: "POL-ENG-AI-001", risk: "Low" },
  "Travel approval": { department: "Sales", merchant: "British Airways", category: "Travel", businessReason: "Customer meeting travel", amount: "684", matchedRuleId: "POL-SALES-TRAVEL-001", risk: "Medium" },
  "Multisig treasury payment": { department: "Sales", merchant: "British Airways", category: "Travel", businessReason: "International customer meeting", amount: "1480", matchedRuleId: "POL-SALES-TRAVEL-001", risk: "Medium" },
};

export function validatePurchaseRequest(form: PurchaseRequestForm): void {
  if (!form.merchant.trim()) throw new Error("Merchant is required.");
  if (!Number.isFinite(Number(form.amount)) || Number(form.amount) <= 0) throw new Error("Enter a positive purchase amount.");
  if (!/^[^@\s]+@northstar\.io$/i.test(form.requesterEmail)) throw new Error("Use a Northstar work email.");
  if (!form.businessReason.trim()) throw new Error("Business reason is required.");
  if (form.settlementAmount && (!Number.isFinite(Number(form.settlementAmount)) || Number(form.settlementAmount) <= 0)) throw new Error("Settlement amount must be positive.");
}

export function evaluatePurchaseRequest(form: PurchaseRequestForm, rules: SeededRule[]): RequestEvaluation {
  validatePurchaseRequest(form);
  const rule = rules.find((item) => item.policyId === form.matchedRuleId) ?? null;
  const amount = Number(form.amount);
  const blocked = /gambl|casino|betting/i.test(`${form.merchant} ${form.category}`) || Boolean(rule && !rule.active);
  if (blocked) return { approvalType: "Blocked", requestStatus: "Blocked", matchedRule: rule, reason: rule && !rule.active ? "The matched rule is paused." : "The merchant category is blocked.", requiredApprovers: "None", settlementMethod: "Not available", arcStatus: "No settlement" };
  if (amount < 300 && rule?.active) return { approvalType: "Auto-approved", requestStatus: "Auto-approved", matchedRule: rule, reason: "The request is below £300 and matches an active rule.", requiredApprovers: "None", settlementMethod: "Company card", arcStatus: "Ready for payment" };
  if (amount <= 1000) return { approvalType: "Standard", requestStatus: "Pending", matchedRule: rule, reason: "A manager review is required for requests from £300 to £1,000.", requiredApprovers: "One manager", settlementMethod: "Company card", arcStatus: "Settlement follows approval" };
  return { approvalType: "Treasury multisig", requestStatus: "Pending", matchedRule: rule, reason: "Payments above £1,000 require the treasury threshold.", requiredApprovers: "2 of 3 treasury signers", settlementMethod: "Treasury multisig", arcStatus: "Settlement follows signer approval" };
}

function event(state: DemoState, eventId: string, category: string, approval: DemoApproval): DemoState {
  if (state.dashboard.activity.some((item) => item.eventId === eventId)) return state;
  return { ...state, dashboard: { ...state.dashboard, activity: [{ id: `activity-${eventId}`, eventId, initials: approval.employeeName.split(" ").map((part) => part[0]).join(""), employee: approval.employeeName, role: approval.department, merchant: approval.merchant, category, amount: `£${approval.amount.toFixed(2)}`, status: approval.status }, ...state.dashboard.activity] } };
}

export function formFromApproval(item: DemoApproval): PurchaseRequestForm { return { requester: item.employeeName, requesterEmail: item.requesterEmail ?? "amanda@northstar.io", department: item.department, merchant: item.merchant, category: item.category, businessReason: item.businessReason ?? item.reviewReason, amount: String(item.amount), currency: item.currency, settlementAmount: item.settlementAmount == null ? "" : String(item.settlementAmount), settlementAsset: item.settlementAsset ?? "USDC", requestedDate: item.requestedDate ?? new Date().toISOString().slice(0, 10), matchedRuleId: item.policyId, risk: item.risk, supportingNote: item.supportingNote ?? "", attachmentName: item.attachmentName ?? null }; }

export function savePurchaseRequest(state: DemoState, form: PurchaseRequestForm, requestId?: string, submit = false): DemoState {
  validatePurchaseRequest(form);
  const existing = requestId ? state.approvals.find((item) => item.id === requestId) : undefined;
  const evaluation = evaluatePurchaseRequest(form, state.rules.seededRules);
  const id = existing?.id ?? `APR-DEMO-${state.approvals.length + 1}`;
  const matched = evaluation.matchedRule;
  const approval: DemoApproval = { id, employeeId: existing?.employeeId ?? "EMP-FIN-001", employeeName: form.requester, requesterEmail: form.requesterEmail, department: form.department, merchant: form.merchant.trim(), category: form.category, businessReason: form.businessReason.trim(), amount: Number(form.amount), currency: "GBP", status: submit ? evaluation.approvalType === "Auto-approved" ? "Approved" : evaluation.approvalType === "Blocked" ? "Flagged" : "Pending" : "Pending", risk: form.risk, policyId: matched?.policyId ?? form.matchedRuleId, ruleName: matched?.name ?? "No matching active rule", ruleDescription: matched?.description ?? "Manual review required.", approvalNote: evaluation.requiredApprovers, reviewReason: evaluation.reason, recommendation: evaluation.reason, requestedAt: "Just now", approvalType: submit ? evaluation.approvalType : "Standard", multisigRequestId: submit && evaluation.approvalType === "Treasury multisig" ? `MSIG-${id}` : null, requestStatus: submit ? evaluation.requestStatus : "Draft", settlementAmount: form.settlementAmount ? Number(form.settlementAmount) : null, settlementAsset: "USDC", supportingNote: form.supportingNote, requestedDate: form.requestedDate, attachmentName: form.attachmentName, evaluationReason: evaluation.reason };
  const approvals = existing ? state.approvals.map((item) => item.id === id ? approval : item) : [approval, ...state.approvals];
  let requests = state.treasury.requests.filter((item) => item.approvalId !== id);
  if (submit && evaluation.approvalType === "Treasury multisig") requests = [{ id: `MSIG-${id}`, approvalId: id, required: state.treasury.threshold, expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(), status: "Awaiting signatures", decisions: [], settlementId: null }, ...requests];
  const pendingCount = approvals.filter((item) => ["Pending", "Blocked"].includes(item.requestStatus ?? "") || (!item.requestStatus && (item.status === "Pending" || item.status === "Flagged"))).length;
  let next = { ...state, approvals, treasury: { ...state.treasury, requests }, dashboard: { ...state.dashboard, pendingCount } };
  next = event(next, `${id}:${existing ? "edited" : "created"}`, existing ? "Request edited" : "Request created", approval);
  if (submit) next = event(next, `${id}:submitted`, "Request submitted", approval);
  return next;
}

export function cancelPurchaseRequest(state: DemoState, id: string): DemoState { const item = state.approvals.find((entry) => entry.id === id); if (!item) return state; const approvals = state.approvals.map((entry) => entry.id === id ? { ...entry, requestStatus: "Cancelled" as const } : entry); const next = { ...state, approvals, treasury: { ...state.treasury, requests: state.treasury.requests.filter((entry) => entry.approvalId !== id) }, dashboard: { ...state.dashboard, pendingCount: Math.max(0, state.dashboard.pendingCount - 1) } }; return event(next, `${id}:cancelled`, "Request cancelled", { ...item, status: "Declined" }); }
export function duplicatePurchaseRequest(state: DemoState, id: string): DemoState { const item = state.approvals.find((entry) => entry.id === id); return item ? savePurchaseRequest(state, formFromApproval(item), undefined, false) : state; }
