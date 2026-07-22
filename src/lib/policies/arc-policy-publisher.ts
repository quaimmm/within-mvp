import { createPublicClient, createWalletClient, getAddress, http, isAddress, keccak256, parseEther, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";
import { withinPolicyExecutorAbi } from "@/lib/contracts/within-policy-executor-abi";
import { ARC_TESTNET } from "@/lib/arc/network";
import { PolicyPublishingError } from "./policy-publisher";
import type { PolicyPublisher, PolicyPublishRequest, PolicyPublishResult } from "./policy-publisher";

type ArcPolicyConfiguration = {
  rpcUrl: string;
  privateKey: `0x${string}`;
  contractAddress: `0x${string}`;
};

function loadConfiguration(): ArcPolicyConfiguration {
  if (process.env.ENABLE_ARC_POLICY_WRITES !== "true") throw new PolicyPublishingError();
  const privateKey = process.env.ARC_POLICY_ADMIN_PRIVATE_KEY;
  const contractAddress = process.env.ARC_POLICY_CONTRACT_ADDRESS;
  if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) throw new PolicyPublishingError();
  if (!contractAddress || !isAddress(contractAddress)) throw new PolicyPublishingError();
  return {
    rpcUrl: process.env.ARC_RPC_URL || ARC_TESTNET.rpcUrl,
    privateKey: privateKey as `0x${string}`,
    contractAddress: getAddress(contractAddress),
  };
}

export class ArcPolicyPublisher implements PolicyPublisher {
  async publishPolicy(request: PolicyPublishRequest): Promise<PolicyPublishResult> {
    const maximum = parseEther(request.settlementMaxPerTransactionUSDC);
    const periodLimit = parseEther(request.settlementPeriodLimitUSDC);
    return this.write(request.policyId, request.active, "setPolicy", [maximum, periodLimit]);
  }

  async setPolicyStatus(policyId: string, active: boolean, idempotencyKey: string): Promise<PolicyPublishResult> {
    void idempotencyKey;
    return this.write(policyId, active, "setPolicyActive");
  }

  private async write(
    policyId: string,
    active: boolean,
    functionName: "setPolicy" | "setPolicyActive",
    limits?: [bigint, bigint],
  ): Promise<PolicyPublishResult> {
    try {
      const configuration = loadConfiguration();
      const account = privateKeyToAccount(configuration.privateKey);
      const transport = http(configuration.rpcUrl, { timeout: 20_000, retryCount: 2 });
      const publicClient = createPublicClient({ chain: arcTestnet, transport });
      const walletClient = createWalletClient({ account, chain: arcTestnet, transport });
      const owner = await publicClient.readContract({
        address: configuration.contractAddress,
        abi: withinPolicyExecutorAbi,
        functionName: "owner",
      });
      if (getAddress(owner) !== getAddress(account.address)) throw new PolicyPublishingError();

      const policyKey = keccak256(toBytes(policyId));
      let transactionHash: `0x${string}`;
      if (functionName === "setPolicy" && limits) {
        const simulation = await publicClient.simulateContract({
          account,
          address: configuration.contractAddress,
          abi: withinPolicyExecutorAbi,
          functionName,
          args: [policyKey, limits[0], limits[1], active],
        });
        transactionHash = await walletClient.writeContract(simulation.request);
      } else {
        const simulation = await publicClient.simulateContract({
          account,
          address: configuration.contractAddress,
          abi: withinPolicyExecutorAbi,
          functionName: "setPolicyActive",
          args: [policyKey, active],
        });
        transactionHash = await walletClient.writeContract(simulation.request);
      }
      const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash, confirmations: 1, timeout: 60_000 });
      if (receipt.status !== "success") throw new PolicyPublishingError();

      return {
        success: true,
        provider: "arc",
        network: "arc-testnet",
        policyId,
        policyKey,
        active,
        transactionHash,
        explorerUrl: `${ARC_TESTNET.explorerUrl}/tx/${transactionHash}`,
        contractAddress: configuration.contractAddress,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof PolicyPublishingError) throw error;
      throw new PolicyPublishingError();
    }
  }
}
