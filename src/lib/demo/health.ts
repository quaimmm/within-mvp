import { isAddress } from "viem";
import { readArcFeatureFlags } from "../arc/feature-flags.ts";

export type HealthResponse = {
  status: "ok" | "degraded";
  timestamp: string;
  services: {
    application: "ready";
    policyGenerator: "local" | "configured" | "unavailable";
    policyPublisher: "mock" | "configured" | "unavailable";
    paymentProvider: "mock" | "configured" | "unavailable";
  };
  configuration: {
    mode: "demo" | "arc-testnet";
    arcRpc: "available" | "unavailable" | "unchecked";
    expectedChainId: 5042002;
    contracts: { policy: boolean; multisig: boolean; credit: boolean };
    appKit: { send: boolean; bridge: boolean; swap: boolean; unifiedBalance: boolean };
  };
};

const privateKeyValid = (value?: string) => Boolean(value && /^0x[0-9a-fA-F]{64}$/.test(value));
const addressValid = (value?: string) => Boolean(value && isAddress(value));

export function createHealthResponse(environment: NodeJS.ProcessEnv = process.env, rpcAvailable?: boolean): HealthResponse {
  const generator = environment.POLICY_GENERATOR || "local";
  const publisher = environment.POLICY_PUBLISHER || "mock";
  const payment = environment.PAYMENT_PROVIDER || "mock";
  const policyGenerator = generator === "local" ? "local" : generator === "openai" && Boolean(environment.OPENAI_API_KEY) ? "configured" : "unavailable";
  const policyPublisher = publisher === "mock" ? "mock" : publisher === "arc" && environment.ENABLE_ARC_POLICY_WRITES === "true" && privateKeyValid(environment.ARC_POLICY_ADMIN_PRIVATE_KEY) && addressValid(environment.ARC_POLICY_CONTRACT_ADDRESS) ? "configured" : "unavailable";
  const paymentProvider = payment === "mock" ? "mock" : payment === "arc" && privateKeyValid(environment.ARC_TREASURY_PRIVATE_KEY) && addressValid(environment.ARC_RECIPIENT_ADDRESS) && addressValid(environment.ARC_POLICY_CONTRACT_ADDRESS) ? "configured" : "unavailable";
  const flags = readArcFeatureFlags(environment);
  const mode = environment.NEXT_PUBLIC_WITHIN_MODE === "arc-testnet" ? "arc-testnet" : "demo";
  return {
    status: policyGenerator === "unavailable" || policyPublisher === "unavailable" || paymentProvider === "unavailable" ? "degraded" : "ok",
    timestamp: new Date().toISOString(),
    services: { application: "ready", policyGenerator, policyPublisher, paymentProvider },
    configuration: {
      mode,
      arcRpc: rpcAvailable === undefined ? "unchecked" : rpcAvailable ? "available" : "unavailable",
      expectedChainId: 5_042_002,
      contracts: {
        policy: addressValid(environment.NEXT_PUBLIC_WITHIN_POLICY_EXECUTOR_ADDRESS || environment.ARC_POLICY_CONTRACT_ADDRESS),
        multisig: addressValid(environment.NEXT_PUBLIC_WITHIN_MULTISIG_ADDRESS || environment.ARC_MULTISIG_CONTRACT_ADDRESS),
        credit: addressValid(environment.NEXT_PUBLIC_WITHIN_CREDIT_FACILITY_ADDRESS),
      },
      appKit: { send: flags.send, bridge: flags.bridge, swap: flags.swap, unifiedBalance: flags.unifiedBalance },
    },
  };
}
