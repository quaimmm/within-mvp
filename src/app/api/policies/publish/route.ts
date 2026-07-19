import { NextResponse } from "next/server";
import { parseEther } from "viem";
import { createPolicyPublisher } from "@/lib/policies/create-policy-publisher";
import { PolicyPublishingError } from "@/lib/policies/policy-publisher";
import type { PolicyPublishRequest, PolicyPublishResult } from "@/lib/policies/policy-publisher";

export const runtime = "nodejs";

const globalPublishing = globalThis as typeof globalThis & {
  withinPolicyPublishing?: Map<string, Promise<PolicyPublishResult>>;
};
const executions = globalPublishing.withinPolicyPublishing ?? new Map<string, Promise<PolicyPublishResult>>();
globalPublishing.withinPolicyPublishing = executions;

const decimalPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/;

function isValidRequest(value: unknown): value is PolicyPublishRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<PolicyPublishRequest>;
  if (
    typeof request.policyId !== "string" || !request.policyId.trim() ||
    typeof request.name !== "string" || !request.name.trim() ||
    typeof request.businessLimit !== "number" || !Number.isFinite(request.businessLimit) || request.businessLimit <= 0 ||
    request.businessCurrency !== "GBP" ||
    typeof request.settlementMaxPerTransactionUSDC !== "string" || !decimalPattern.test(request.settlementMaxPerTransactionUSDC) ||
    typeof request.settlementPeriodLimitUSDC !== "string" || !decimalPattern.test(request.settlementPeriodLimitUSDC) ||
    typeof request.active !== "boolean" ||
    typeof request.idempotencyKey !== "string" || !request.idempotencyKey.trim() || request.idempotencyKey.length > 200
  ) return false;

  try {
    const maximum = parseEther(request.settlementMaxPerTransactionUSDC);
    const period = parseEther(request.settlementPeriodLimitUSDC);
    return maximum > BigInt(0) && period > BigInt(0) && maximum <= period;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  let payload: unknown;
  try { payload = await request.json(); } catch { return NextResponse.json({ error: "Invalid rule request." }, { status: 400 }); }
  if (!isValidRequest(payload)) return NextResponse.json({ error: "Invalid rule request." }, { status: 400 });

  const existing = executions.get(payload.idempotencyKey);
  if (existing) {
    try { return NextResponse.json(await existing); } catch { return NextResponse.json({ error: "Rule could not be activated.\nNo changes were published." }, { status: 502 }); }
  }

  const execution = createPolicyPublisher().publishPolicy(payload);
  executions.set(payload.idempotencyKey, execution);
  try {
    return NextResponse.json(await execution);
  } catch (error) {
    executions.delete(payload.idempotencyKey);
    const message = error instanceof PolicyPublishingError ? error.safeMessage : "Rule could not be activated.\nNo changes were published.";
    console.error("[policies/publish]", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
