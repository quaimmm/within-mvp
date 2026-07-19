import { ArcPaymentProvider } from "./arc-payment-provider";
import { MockPaymentProvider } from "./mock-payment-provider";
import type { PaymentProvider } from "./types";

export function createPaymentProvider(providerName = process.env.PAYMENT_PROVIDER || "mock"): PaymentProvider {
  if (providerName === "mock") return new MockPaymentProvider();
  if (providerName === "arc") return new ArcPaymentProvider();
  throw new Error(`Unsupported payment provider: ${providerName}`);
}
