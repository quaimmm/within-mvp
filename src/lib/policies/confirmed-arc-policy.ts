import { createPublicClient, http, type Address, type Hash } from "viem";
import { arcTestnet } from "viem/chains";
import { ARC_TESTNET } from "../arc/network.ts";
import { withinPolicyExecutorAbi } from "../contracts/within-policy-executor-abi.ts";

export const CONFIRMED_ARC_POLICY = {
  contractAddress: "0x0C2cde1a2438d6A0fED4b58Bd1461F60EAbD32BB" as Address,
  policyKey: "0x75e49c4e76b45adfbde7cc4347d034a8069286cf569b832ddb8580513e153861" as Hash,
  transactionHash: "0x6a8cf3172152a11dc135b9cdd950e744628a52206e9a04af8831220eb57d6d28" as Hash,
  blockNumber: 53_273_135,
  maxPerTransaction: BigInt("50000000000000000"),
  periodLimit: BigInt("1000000000000000000"),
  maxPerTransactionDisplay: "0.05",
  periodLimitDisplay: "1.00",
} as const;

export type ConfirmedArcPolicyState = {
  exists: boolean;
  active: boolean;
  maxPerTransaction: bigint;
  periodLimit: bigint;
};

export type PolicyReader = {
  readContract(parameters: {
    address: Address;
    abi: typeof withinPolicyExecutorAbi;
    functionName: "policies";
    args: readonly [Hash];
  }): Promise<readonly [boolean, boolean, bigint, bigint]>;
};

const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(ARC_TESTNET.rpcUrl, { timeout: 20_000, retryCount: 2 }),
});

declare global {
  interface Window {
    __WITHIN_ARC_METHOD_COUNTS__?: Record<string, number>;
  }
}

export function recordReadOnlyArcMethod(method: string) {
  if (typeof window === "undefined" || process.env.NODE_ENV === "production") return;
  const counts = window.__WITHIN_ARC_METHOD_COUNTS__ ?? {};
  counts[method] = (counts[method] ?? 0) + 1;
  counts.eth_sendTransaction ??= 0;
  window.__WITHIN_ARC_METHOD_COUNTS__ = counts;
}

export async function readConfirmedArcPolicy(
  reader: PolicyReader = publicClient as unknown as PolicyReader,
): Promise<ConfirmedArcPolicyState> {
  recordReadOnlyArcMethod("eth_call");
  const [exists, active, maxPerTransaction, periodLimit] = await reader.readContract({
    address: CONFIRMED_ARC_POLICY.contractAddress,
    abi: withinPolicyExecutorAbi,
    functionName: "policies",
    args: [CONFIRMED_ARC_POLICY.policyKey],
  });

  return { exists, active, maxPerTransaction, periodLimit };
}

export function isExpectedConfirmedArcPolicy(policy: ConfirmedArcPolicyState): boolean {
  return policy.exists
    && policy.active
    && policy.maxPerTransaction === CONFIRMED_ARC_POLICY.maxPerTransaction
    && policy.periodLimit === CONFIRMED_ARC_POLICY.periodLimit;
}
