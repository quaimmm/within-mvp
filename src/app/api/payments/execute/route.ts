import { NextResponse } from "next/server";
import { createPaymentProvider } from "@/lib/payments/create-payment-provider";
import { GENERIC_PAYMENT_FAILURE, PaymentExecutionError } from "@/lib/payments/payment-execution-error";
import type { ExecutePaymentPayload, PaymentResult } from "@/lib/payments/types";

export const runtime = "nodejs";

const globalExecutions = globalThis as typeof globalThis & {
  withinPaymentExecutions?: Map<string, Promise<PaymentResult>>;
};

const executions = globalExecutions.withinPaymentExecutions ?? new Map<string, Promise<PaymentResult>>();
globalExecutions.withinPaymentExecutions = executions;

function isValidPayload(value: unknown): value is ExecutePaymentPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<ExecutePaymentPayload>;
  const request = payload.request;

  return Boolean(
    typeof payload.idempotencyKey === "string" &&
    payload.idempotencyKey.length > 0 &&
    payload.idempotencyKey.length <= 128 &&
    request &&
    typeof request.employeeId === "string" &&
    typeof request.employeeName === "string" &&
    typeof request.merchant === "string" &&
    typeof request.category === "string" &&
    typeof request.amount === "number" &&
    Number.isFinite(request.amount) &&
    request.amount > 0 &&
    request.currency === "GBP" &&
    typeof request.policyId === "string"
  );
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid payment request." }, { status: 400 });
  }

  if (!isValidPayload(payload)) {
    return NextResponse.json({ error: "Invalid payment request." }, { status: 400 });
  }

  const existingExecution = executions.get(payload.idempotencyKey);
  if (existingExecution) {
    try {
      return NextResponse.json(await existingExecution);
    } catch {
      return NextResponse.json({ error: "Payment could not be completed." }, { status: 502 });
    }
  }

  const execution = createPaymentProvider().executePayment(payload.request, payload.idempotencyKey);
  executions.set(payload.idempotencyKey, execution);

  try {
    const result = await execution;
    return NextResponse.json(result);
  } catch (error) {
    executions.delete(payload.idempotencyKey);
    const message = error instanceof Error ? `${error.name}: ${error.message}` : "Unknown payment execution error";
    console.error("[payments/execute]", message);
    const safeMessage = error instanceof PaymentExecutionError ? error.safeMessage : GENERIC_PAYMENT_FAILURE;
    return NextResponse.json({ error: safeMessage }, { status: 502 });
  }
}
