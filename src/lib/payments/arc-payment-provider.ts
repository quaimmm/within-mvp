import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  keccak256,
  parseEther,
  toBytes,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";
import { withinPolicyExecutorAbi } from "@/lib/contracts/within-policy-executor-abi";
import { GENERIC_PAYMENT_FAILURE, PaymentExecutionError } from "./payment-execution-error";
import type { PaymentProvider, PaymentRequest, PaymentResult } from "./types";

const ARC_EXPLORER_URL = "https://testnet.arcscan.app";
const DEFAULT_ARC_RPC_URL = "https://rpc.testnet.arc.network";
const DEFAULT_TEST_SETTLEMENT = "0.01";

type ArcConfiguration = {
  rpcUrl: string;
  privateKey: `0x${string}`;
  recipientAddress: `0x${string}`;
  contractAddress: `0x${string}`;
  settlementAmount: string;
};

function loadArcConfiguration(): ArcConfiguration {
  const rpcUrl = process.env.ARC_RPC_URL || DEFAULT_ARC_RPC_URL;
  const privateKey = process.env.ARC_TREASURY_PRIVATE_KEY;
  const recipientAddress = process.env.ARC_RECIPIENT_ADDRESS;
  const contractAddress = process.env.ARC_POLICY_CONTRACT_ADDRESS;
  const settlementAmount = process.env.ARC_TEST_SETTLEMENT_USDC || DEFAULT_TEST_SETTLEMENT;

  if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) throw new PaymentExecutionError();
  if (!recipientAddress || !isAddress(recipientAddress)) throw new PaymentExecutionError();
  if (!contractAddress || !isAddress(contractAddress)) throw new PaymentExecutionError();

  const settlementValue = Number(settlementAmount);
  if (!Number.isFinite(settlementValue) || settlementValue <= 0) throw new PaymentExecutionError();

  return {
    rpcUrl,
    privateKey: privateKey as `0x${string}`,
    recipientAddress,
    contractAddress,
    settlementAmount,
  };
}

function mapContractError(error: unknown): PaymentExecutionError {
  let errorName: string | undefined;
  if (error instanceof BaseError) {
    const reverted = error.walk((cause) => cause instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) errorName = reverted.data?.errorName;
  }

  const messages: Record<string, string> = {
    PolicyInactive: "This spending rule is currently paused.",
    TransactionLimitExceeded: "This payment is above the rule limit.",
    PeriodLimitExceeded: "This rule has reached its current spending limit.",
    ExecutionAlreadyUsed: "This payment has already been processed.",
  };

  return new PaymentExecutionError((errorName && messages[errorName]) || GENERIC_PAYMENT_FAILURE);
}

export class ArcPaymentProvider implements PaymentProvider {
  async executePayment(request: PaymentRequest, idempotencyKey: string): Promise<PaymentResult> {
    try {
      const configuration = loadArcConfiguration();
      const account = privateKeyToAccount(configuration.privateKey);
      const transport = http(configuration.rpcUrl, { timeout: 20_000, retryCount: 2 });
      const publicClient = createPublicClient({ chain: arcTestnet, transport });
      const walletClient = createWalletClient({ account, chain: arcTestnet, transport });
      const settlementValue = parseEther(configuration.settlementAmount);
      const executionId = keccak256(toBytes(idempotencyKey));
      const policyKey = keccak256(toBytes(request.policyId));

      const simulation = await publicClient.simulateContract({
        account,
        address: configuration.contractAddress,
        abi: withinPolicyExecutorAbi,
        functionName: "executePayment",
        args: [executionId, policyKey, configuration.recipientAddress],
        value: settlementValue,
      });
      const transactionHash = await walletClient.writeContract(simulation.request);
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: transactionHash,
        confirmations: 1,
        timeout: 60_000,
      });

      if (receipt.status !== "success") throw new PaymentExecutionError();

      return {
        success: true,
        paymentId: `WTH-ARC-${transactionHash.slice(2, 10).toUpperCase()}`,
        provider: "arc",
        network: "arc-testnet",
        businessAmount: request.amount,
        businessCurrency: request.currency,
        settledAmount: Number(configuration.settlementAmount),
        settlementCurrency: "USDC",
        transactionHash,
        explorerUrl: `${ARC_EXPLORER_URL}/tx/${transactionHash}`,
        contractAddress: configuration.contractAddress,
        policyId: request.policyId,
        executionId,
        timestamp: new Date().toISOString(),
        isTestnet: true,
      };
    } catch (error) {
      if (error instanceof PaymentExecutionError) throw error;
      throw mapContractError(error);
    }
  }
}
