"use client";

import { useCallback, useRef, useState } from "react";
import type { ExecutePaymentPayload, PaymentRequest, PaymentResult } from "@/lib/payments/types";

export const paymentStages = [
  "Policy approved",
  "Spending rule validated",
  "Payment authorised",
  "USDC settlement completed",
  "Receipt generated",
] as const;

export type PaymentExecutionStatus = "idle" | "processing" | "completed" | "failed";

const wait = (duration: number) => new Promise((resolve) => setTimeout(resolve, duration));

export function usePaymentExecution() {
  const [status, setStatus] = useState<PaymentExecutionStatus>("idle");
  const [activeStage, setActiveStage] = useState(-1);
  const [result, setResult] = useState<PaymentResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const executionLocked = useRef(false);

  const execute = useCallback(async (request: PaymentRequest, idempotencyKey: string) => {
    if (executionLocked.current) return null;
    executionLocked.current = true;
    setStatus("processing");
    setResult(null);
    setErrorMessage(null);
    setActiveStage(0);

    await wait(480);
    setActiveStage(1);
    await wait(480);
    setActiveStage(2);

    try {
      const payload: ExecutePaymentPayload = { request, idempotencyKey };
      const response = await fetch("/api/payments/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(failure?.error || "Payment could not be completed.\nNo funds were transferred.\nThe approval remains pending.");
      }
      const paymentResult = await response.json() as PaymentResult;
      if (!paymentResult.success) throw new Error("Payment execution failed");
      setActiveStage(3);
      await wait(520);
      setActiveStage(4);
      await wait(520);
      setResult(paymentResult);
      setStatus("completed");
      return paymentResult;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Payment could not be completed.\nNo funds were transferred.\nThe approval remains pending.");
      setStatus("failed");
      return null;
    } finally {
      executionLocked.current = false;
    }
  }, []);

  const reset = useCallback(() => {
    if (status === "processing") return;
    setStatus("idle");
    setActiveStage(-1);
    setResult(null);
    setErrorMessage(null);
  }, [status]);

  return { status, activeStage, result, errorMessage, execute, reset };
}
