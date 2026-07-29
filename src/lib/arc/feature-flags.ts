export function readArcFeatureFlags(env: Record<string, string | undefined>) {
  const appKit = env.NEXT_PUBLIC_ARC_APP_KIT_ENABLED === "true";
  return { appKit, send: appKit && env.NEXT_PUBLIC_ARC_SEND_ENABLED === "true", bridge: appKit && env.NEXT_PUBLIC_ARC_BRIDGE_ENABLED === "true", unifiedBalance: appKit && env.NEXT_PUBLIC_ARC_UNIFIED_BALANCE_ENABLED === "true", swap: appKit && env.NEXT_PUBLIC_ARC_SWAP_ENABLED === "true" };
}

const flags = readArcFeatureFlags(process.env);
export const ARC_APP_KIT_ENABLED = flags.appKit;
export const ARC_SEND_ENABLED = flags.send;
export const ARC_BRIDGE_ENABLED = flags.bridge;
export const ARC_UNIFIED_BALANCE_ENABLED = flags.unifiedBalance;
export const ARC_SWAP_ENABLED = flags.swap;

export const ARC_PUBLIC_ADDRESSES = {
  treasury: process.env.NEXT_PUBLIC_WITHIN_TREASURY_ADDRESS || "",
  merchant: process.env.NEXT_PUBLIC_DEMO_MERCHANT_ADDRESS || "",
  multisig: process.env.NEXT_PUBLIC_WITHIN_MULTISIG_ADDRESS || "",
  policyExecutor: process.env.NEXT_PUBLIC_WITHIN_POLICY_EXECUTOR_ADDRESS || "",
  creditFacility: process.env.NEXT_PUBLIC_WITHIN_CREDIT_FACILITY_ADDRESS || "",
  employeeCredit: process.env.NEXT_PUBLIC_WITHIN_EMPLOYEE_CREDIT_ADDRESS || "",
} as const;
