export type MultisigDecision = { signerId: string; decision: "Approved" | "Declined"; timestamp: string };
export type MultisigStatus = "Awaiting signatures" | "Ready to settle" | "Settlement submitted" | "Settlement confirmed" | "Declined" | "Expired";
export type MultisigRequest = { id: string; approvalId: string; required: number; expiresAt: string; status: MultisigStatus; decisions: MultisigDecision[]; settlementId: string | null; transactionReference?: string | null };
export interface MultisigProvider { approve(request: MultisigRequest, signerId: string): Promise<MultisigRequest>; settle(request: MultisigRequest): Promise<MultisigRequest>; }

export function approveMultisig(request: MultisigRequest, signerId: string, active: boolean, now = new Date()): MultisigRequest {
  if (!active) throw new Error("Inactive signers cannot approve.");
  if (new Date(request.expiresAt) <= now) return { ...request, status: "Expired" };
  if (["Declined", "Expired", "Settlement confirmed"].includes(request.status)) throw new Error("This request can no longer be approved.");
  if (request.decisions.some((decision) => decision.signerId === signerId)) throw new Error("This signer has already decided.");
  const decisions = [...request.decisions, { signerId, decision: "Approved" as const, timestamp: now.toISOString() }];
  return { ...request, decisions, status: decisions.filter((decision) => decision.decision === "Approved").length >= request.required ? "Ready to settle" : "Awaiting signatures" };
}

export function settleMultisig(request: MultisigRequest): MultisigRequest {
  if (request.status !== "Ready to settle") throw new Error("The approval threshold has not been reached.");
  if (request.settlementId) throw new Error("Settlement has already been submitted.");
  return { ...request, status: "Settlement confirmed", settlementId: `DEMO-${request.id}` };
}
