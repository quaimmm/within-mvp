"use client";

import { createPublicClient, createWalletClient, custom, formatUnits, getAddress, http, isAddress, parseUnits, type Address, type Hash } from "viem";
import { arcTestnet } from "viem/chains";
import { ARC_TESTNET, isArcTestnet, type BrowserEthereumProvider } from "../arc/network.ts";
import { withinPolicyExecutorAbi } from "./within-policy-executor-abi.ts";
import { withinMultisigExecutorAbi } from "./within-multisig-executor-abi.ts";
import { withinCreditFacilityAbi } from "./within-credit-facility-abi.ts";
import { usdcAbi } from "./usdc-abi.ts";

export const USDC_TOKEN_DECIMALS = 6;
export const arcPublicClient = createPublicClient({ chain: arcTestnet, transport: http(ARC_TESTNET.rpcUrl, { timeout: 20_000, retryCount: 2 }) });

export type ConfirmedArcWrite = { transactionHash: Hash; explorerUrl: string; blockNumber: bigint };

export function parseUsdc(value: string): bigint {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(value)) throw new ArcContractClientError("Enter a USDC amount with no more than 6 decimals.");
  return parseUnits(value, USDC_TOKEN_DECIMALS);
}
export function formatUsdc(value: bigint): string { return formatUnits(value, USDC_TOKEN_DECIMALS); }

export class ArcContractClientError extends Error {
  constructor(message: string, options?: { cause?: unknown }) { super(message, options); this.name = "ArcContractClientError"; }
}

async function walletContext(provider: BrowserEthereumProvider) {
  const chainId = await provider.request({ method: "eth_chainId" });
  if (typeof chainId !== "string" || !isArcTestnet(chainId)) throw new ArcContractClientError(`Switch to ${ARC_TESTNET.chainName}.`);
  const accounts = await provider.request({ method: "eth_accounts" }) as string[];
  if (!accounts[0] || !isAddress(accounts[0])) throw new ArcContractClientError("Connect a wallet first.");
  const account = getAddress(accounts[0]);
  return { account, walletClient: createWalletClient({ account, chain: arcTestnet, transport: custom(provider) }) };
}

async function confirmed(hash: Hash): Promise<ConfirmedArcWrite> {
  const receipt = await arcPublicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 90_000 });
  if (receipt.status !== "success") throw new ArcContractClientError("The Arc transaction reverted. No state was confirmed.");
  return { transactionHash: hash, explorerUrl: `${ARC_TESTNET.explorerUrl}/tx/${hash}`, blockNumber: receipt.blockNumber };
}

async function write(provider: BrowserEthereumProvider, address: Address, abi: readonly object[], functionName: string, args: readonly unknown[] = []): Promise<ConfirmedArcWrite> {
  try {
    const { account, walletClient } = await walletContext(provider);
    const simulation = await arcPublicClient.simulateContract({ account, address, abi, functionName, args } as never);
    return confirmed(await walletClient.writeContract(simulation.request as never));
  } catch (error) {
    if (error instanceof ArcContractClientError) throw error;
    throw new ArcContractClientError(error instanceof Error ? error.message : "The Arc transaction could not be completed.", { cause: error });
  }
}

export class ArcPolicyContractClient {
  constructor(private provider: BrowserEthereumProvider, private address: Address) {}
  read(policyId: Hash) { return arcPublicClient.readContract({ address: this.address, abi: withinPolicyExecutorAbi, functionName: "policies", args: [policyId] }); }
  async setPolicy(policyId: Hash, maxPerTransaction: bigint, periodLimit: bigint, active: boolean) { const result = await write(this.provider, this.address, withinPolicyExecutorAbi, "setPolicy", [policyId, maxPerTransaction, periodLimit, active]); return { ...result, policy: await this.read(policyId) }; }
  async setActive(policyId: Hash, active: boolean) { const result = await write(this.provider, this.address, withinPolicyExecutorAbi, "setPolicyActive", [policyId, active]); return { ...result, policy: await this.read(policyId) }; }
}

export class ArcMultisigContractClient {
  constructor(private provider: BrowserEthereumProvider, private address: Address) {}
  read(transactionId: Hash) { return arcPublicClient.readContract({ address: this.address, abi: withinMultisigExecutorAbi, functionName: "getTransaction", args: [transactionId] }); }
  async propose(transactionId: Hash, recipient: Address, value: bigint, data: Hash, expiresAt: bigint) { const result = await write(this.provider, this.address, withinMultisigExecutorAbi, "propose", [transactionId, recipient, value, data, expiresAt]); return { ...result, transaction: await this.read(transactionId) }; }
  async approve(transactionId: Hash) { const result = await write(this.provider, this.address, withinMultisigExecutorAbi, "approve", [transactionId]); return { ...result, transaction: await this.read(transactionId) }; }
  async execute(transactionId: Hash) { const result = await write(this.provider, this.address, withinMultisigExecutorAbi, "execute", [transactionId]); return { ...result, transaction: await this.read(transactionId) }; }
}

export class ArcCreditContractClient {
  constructor(private provider: BrowserEthereumProvider, private address: Address) {}
  readLoan(loanId: bigint) { return arcPublicClient.readContract({ address: this.address, abi: withinCreditFacilityAbi, functionName: "getLoan", args: [loanId] }); }
  readRequest(requestId: bigint) { return arcPublicClient.readContract({ address: this.address, abi: withinCreditFacilityAbi, functionName: "getDrawdownRequest", args: [requestId] }); }
  async request(amount: string, termDays: number, purposeHash: Hash) { return write(this.provider, this.address, withinCreditFacilityAbi, "requestDrawdown", [parseUsdc(amount), termDays, purposeHash]); }
  async disburse(requestId: bigint) { const result = await write(this.provider, this.address, withinCreditFacilityAbi, "approveAndDisburse", [requestId]); return { ...result, request: await this.readRequest(requestId) }; }
  async repay(loanId: bigint, amount: string) { const result = await write(this.provider, this.address, withinCreditFacilityAbi, "repay", [loanId, parseUsdc(amount)]); return { ...result, loan: await this.readLoan(loanId) }; }
}

export class ArcUsdcContractClient {
  constructor(private provider: BrowserEthereumProvider, private address: Address = ARC_TESTNET.usdcAddress) {}
  balanceOf(account: Address) { return arcPublicClient.readContract({ address: this.address, abi: usdcAbi, functionName: "balanceOf", args: [account] }); }
  allowance(owner: Address, spender: Address) { return arcPublicClient.readContract({ address: this.address, abi: usdcAbi, functionName: "allowance", args: [owner, spender] }); }
  approve(spender: Address, amount: string) { return write(this.provider, this.address, usdcAbi, "approve", [spender, parseUsdc(amount)]); }
}
