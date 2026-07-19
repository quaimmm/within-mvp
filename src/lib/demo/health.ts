import { isAddress } from "viem";

export type HealthResponse = {
  status: "ok" | "degraded";
  timestamp: string;
  services: {
    application: "ready";
    policyGenerator: "local" | "configured" | "unavailable";
    policyPublisher: "mock" | "configured" | "unavailable";
    paymentProvider: "mock" | "configured" | "unavailable";
  };
};

const privateKeyValid = (value?: string) => Boolean(value && /^0x[0-9a-fA-F]{64}$/.test(value));
const addressValid = (value?: string) => Boolean(value && isAddress(value));

export function createHealthResponse(environment: NodeJS.ProcessEnv = process.env): HealthResponse {
  const generator = environment.POLICY_GENERATOR || "local";
  const publisher = environment.POLICY_PUBLISHER || "mock";
  const payment = environment.PAYMENT_PROVIDER || "mock";
  const policyGenerator = generator === "local" ? "local" : generator === "openai" && Boolean(environment.OPENAI_API_KEY) ? "configured" : "unavailable";
  const policyPublisher = publisher === "mock" ? "mock" : publisher === "arc" && environment.ENABLE_ARC_POLICY_WRITES === "true" && privateKeyValid(environment.ARC_POLICY_ADMIN_PRIVATE_KEY) && addressValid(environment.ARC_POLICY_CONTRACT_ADDRESS) ? "configured" : "unavailable";
  const paymentProvider = payment === "mock" ? "mock" : payment === "arc" && privateKeyValid(environment.ARC_TREASURY_PRIVATE_KEY) && addressValid(environment.ARC_RECIPIENT_ADDRESS) && addressValid(environment.ARC_POLICY_CONTRACT_ADDRESS) ? "configured" : "unavailable";
  return {
    status: policyGenerator === "unavailable" || policyPublisher === "unavailable" || paymentProvider === "unavailable" ? "degraded" : "ok",
    timestamp: new Date().toISOString(),
    services: { application: "ready", policyGenerator, policyPublisher, paymentProvider },
  };
}
