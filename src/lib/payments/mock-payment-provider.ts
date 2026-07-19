import type { PaymentProvider, PaymentRequest, PaymentResult } from "./types";

// Developer demo switch. Keep false for the default successful walkthrough.
export const SIMULATE_PAYMENT_FAILURE = false;

export class MockPaymentProvider implements PaymentProvider {
  async executePayment(request: PaymentRequest, idempotencyKey: string): Promise<PaymentResult> {
    void idempotencyKey;
    await new Promise((resolve) => setTimeout(resolve, 900));

    if (SIMULATE_PAYMENT_FAILURE) {
      throw new Error("Simulated payment execution failure");
    }

    return {
      success: true,
      paymentId: "WTH-2026-00482",
      provider: "mock",
      network: "demo",
      businessAmount: request.amount,
      businessCurrency: request.currency,
      settledAmount: request.amount,
      settlementCurrency: "USDC",
      transactionHash: "0x7f3a...91c2",
      timestamp: "2026-07-19T10:42:31.000Z",
      isTestnet: true,
    };
  }
}
