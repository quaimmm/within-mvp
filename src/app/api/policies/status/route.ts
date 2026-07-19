import { NextResponse } from "next/server";
import { createPolicyPublisher } from "@/lib/policies/create-policy-publisher";
import { PolicyPublishingError } from "@/lib/policies/policy-publisher";
import type { PolicyPublishResult } from "@/lib/policies/policy-publisher";

export const runtime = "nodejs";

type PolicyStatusRequest = { policyId: string; active: boolean; idempotencyKey: string };
const globalStatuses = globalThis as typeof globalThis & {
  withinPolicyStatuses?: Map<string, Promise<PolicyPublishResult>>;
};
const executions = globalStatuses.withinPolicyStatuses ?? new Map<string, Promise<PolicyPublishResult>>();
globalStatuses.withinPolicyStatuses = executions;

function isValidRequest(value: unknown): value is PolicyStatusRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<PolicyStatusRequest>;
  return typeof request.policyId === "string" && Boolean(request.policyId.trim()) &&
    typeof request.active === "boolean" && typeof request.idempotencyKey === "string" &&
    Boolean(request.idempotencyKey.trim()) && request.idempotencyKey.length <= 200;
}

export async function POST(request: Request) {
  let payload: unknown;
  try { payload = await request.json(); } catch { return NextResponse.json({ error: "Invalid rule request." }, { status: 400 }); }
  if (!isValidRequest(payload)) return NextResponse.json({ error: "Invalid rule request." }, { status: 400 });

  const existing = executions.get(payload.idempotencyKey);
  if (existing) {
    try { return NextResponse.json(await existing); } catch { return NextResponse.json({ error: "Rule status could not be changed.\nNo changes were published." }, { status: 502 }); }
  }

  const execution = createPolicyPublisher().setPolicyStatus(payload.policyId, payload.active, payload.idempotencyKey);
  executions.set(payload.idempotencyKey, execution);
  try {
    return NextResponse.json(await execution);
  } catch (error) {
    executions.delete(payload.idempotencyKey);
    const message = error instanceof PolicyPublishingError ? error.safeMessage : "Rule status could not be changed.\nNo changes were published.";
    console.error("[policies/status]", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
