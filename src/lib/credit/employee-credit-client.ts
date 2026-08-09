"use client";

import {
  createPublicClient,
  decodeFunctionResult,
  encodeFunctionData,
  formatEther,
  formatUnits,
  getAddress,
  isAddress,
  parseUnits,
  http,
  type Address,
  type Hash,
  type TransactionReceipt,
} from "viem";
import { arcTestnet } from "viem/chains";
import { ARC_TESTNET, isArcTestnet, type BrowserEthereumProvider } from "../arc/network.ts";
import { ARC_PUBLIC_ADDRESSES } from "../arc/feature-flags.ts";
import { withinEmployeeCreditAbi } from "../contracts/within-employee-credit-abi.ts";
import { usdcAbi } from "../contracts/usdc-abi.ts";

export const EMPLOYEE_CREDIT_LIMIT = BigInt(2_000_000_000);
export const EMPLOYEE_CREDIT_EVIDENCE_KEY = "within:employee-credit:evidence:v1";
const configuredAddress = ARC_PUBLIC_ADDRESSES.employeeCredit;
export const EMPLOYEE_CREDIT_CONTRACT: Address | null =
  configuredAddress && isAddress(configuredAddress) ? getAddress(configuredAddress) : null;

export type EmployeeCreditAccount = {
  outstanding: bigint;
  totalBorrowed: bigint;
  totalRepaid: bigint;
  instalmentAmount: bigint;
  totalInstalments: number;
  instalmentsPaid: number;
  firstDueDate: bigint;
  nextDueDate: bigint;
  active: boolean;
};

export type EmployeeCreditSnapshot = {
  eligible: boolean;
  account: EmployeeCreditAccount;
  availableCredit: bigint;
  poolBalance: bigint;
  latestBlock: bigint;
};

export type PreparedEmployeeCreditWrite = {
  kind: "draw" | "approve" | "repay" | "fund";
  sender: Address;
  contract: Address;
  employeeCreditContract: Address;
  data: Hash;
  gas: bigint;
  gasPrice: bigint;
  estimatedCost: string;
  rawAmount: bigint;
  instalments?: number;
  firstDueDate?: bigint;
};

export type EmployeeCreditEvidence = {
  kind: PreparedEmployeeCreditWrite["kind"];
  transactionHash: Hash;
  sender: Address;
  submittedAt: string;
  rawAmount: string;
  instalments?: number;
  firstDueDate?: string;
  status: "submitted" | "confirmed" | "failed";
  blockNumber: string | null;
};

export type CreditTransactionState = "idle" | "prepared" | "walletPending" | "submitted" | "confirmed" | "failed" | "cancelled";

export function isEmployeeCreditConfirmationEnabled(input: {
  state: CreditTransactionState;
  hasPreparedTransaction: boolean;
  isSubmitting: boolean;
  transactionHash: string | null;
  preparationIsCurrent: boolean;
}) {
  return input.state === "prepared" &&
    input.hasPreparedTransaction &&
    !input.isSubmitting &&
    input.transactionHash === null &&
    input.preparationIsCurrent;
}

export function employeeCreditStateAfterSubmissionError(error: unknown, transactionHash: string | null): CreditTransactionState {
  const code = error && typeof error === "object" && "code" in error ? Number(error.code) : null;
  if (code === 4001 && transactionHash === null) return "prepared";
  return transactionHash ? "submitted" : "failed";
}

type ReadClient = {
  getBlockNumber(): Promise<bigint>;
  getChainId(): Promise<number>;
  getTransactionReceipt(args: { hash: Hash }): Promise<TransactionReceipt>;
  waitForTransactionReceipt?(args: { hash: Hash }): Promise<TransactionReceipt>;
  readContract(args: Record<string, unknown>): Promise<unknown>;
};

export const employeeCreditPublicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(ARC_TESTNET.rpcUrl, { timeout: 5_000, retryCount: 0 }),
});

export const EMPLOYEE_CREDIT_READ_TIMEOUT_MS = 5_000;

async function timedRead<T>(operation: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Arc RPC read timed out after 5 seconds.")), EMPLOYEE_CREDIT_READ_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function requireContract(override?: Address): Address {
  const contract = override ?? EMPLOYEE_CREDIT_CONTRACT;
  if (!contract) throw new Error("Employee Credit is not deployed yet.");
  return contract;
}

function accountFrom(value: unknown): Address {
  const account = Array.isArray(value) ? value[0] : null;
  if (typeof account !== "string" || !isAddress(account)) throw new Error("Connect MetaMask first.");
  return getAddress(account);
}

export async function readEmployeeCreditSnapshot(
  employee: Address,
  client: ReadClient = employeeCreditPublicClient as unknown as ReadClient,
  contractOverride?: Address,
): Promise<EmployeeCreditSnapshot> {
  const eligible = await readEmployeeCreditEligibility(employee, client, contractOverride);
  const account = await readEmployeeCreditAccount(employee, client, contractOverride);
  const availableCredit = await readEmployeeCreditAvailable(employee, client, contractOverride);
  const poolBalance = await readEmployeeCreditPool(client, contractOverride);
  const latestBlock = await readArcLatestBlock(client);
  return {
    eligible,
    account,
    availableCredit,
    poolBalance,
    latestBlock,
  };
}

export async function readEmployeeCreditEligibility(
  employee: Address,
  client: ReadClient = employeeCreditPublicClient as unknown as ReadClient,
  contractOverride?: Address,
) {
  return timedRead(() => client.readContract({
    address: requireContract(contractOverride),
    abi: withinEmployeeCreditAbi,
    functionName: "isEmployeeEligible",
    args: [employee],
  }) as Promise<boolean>);
}

export async function readEmployeeCreditAvailable(
  employee: Address,
  client: ReadClient = employeeCreditPublicClient as unknown as ReadClient,
  contractOverride?: Address,
  blockNumber?: bigint,
) {
  return timedRead(() => client.readContract({
    address: requireContract(contractOverride),
    abi: withinEmployeeCreditAbi,
    functionName: "availableCredit",
    args: [employee],
    ...(blockNumber === undefined ? {} : { blockNumber }),
  }) as Promise<bigint>);
}

export async function readEmployeeCreditAccount(
  employee: Address,
  client: ReadClient = employeeCreditPublicClient as unknown as ReadClient,
  contractOverride?: Address,
  blockNumber?: bigint,
) {
  return timedRead(() => client.readContract({
    address: requireContract(contractOverride),
    abi: withinEmployeeCreditAbi,
    functionName: "getCreditAccount",
    args: [employee],
    ...(blockNumber === undefined ? {} : { blockNumber }),
  }) as Promise<EmployeeCreditAccount>);
}

export async function readEmployeeCreditPool(
  client: ReadClient = employeeCreditPublicClient as unknown as ReadClient,
  contractOverride?: Address,
  blockNumber?: bigint,
) {
  return timedRead(() => client.readContract({
    address: requireContract(contractOverride),
    abi: withinEmployeeCreditAbi,
    functionName: "poolBalance",
    ...(blockNumber === undefined ? {} : { blockNumber }),
  }) as Promise<bigint>);
}

export async function readEmployeeCreditTokenBalance(
  client: ReadClient = employeeCreditPublicClient as unknown as ReadClient,
  contractOverride?: Address,
) {
  return timedRead(() => client.readContract({
    address: ARC_TESTNET.usdcAddress,
    abi: usdcAbi,
    functionName: "balanceOf",
    args: [requireContract(contractOverride)],
  }) as Promise<bigint>);
}

export async function readEmployeeCreditLimit(
  client: ReadClient = employeeCreditPublicClient as unknown as ReadClient,
  contractOverride?: Address,
) {
  return timedRead(() => client.readContract({
    address: requireContract(contractOverride),
    abi: withinEmployeeCreditAbi,
    functionName: "MAX_CREDIT_LIMIT",
  }) as Promise<bigint>);
}

export async function readArcLatestBlock(
  client: ReadClient = employeeCreditPublicClient as unknown as ReadClient,
) {
  return timedRead(() => client.getBlockNumber());
}

export async function readArcPublicChainId(
  client: ReadClient = employeeCreditPublicClient as unknown as ReadClient,
) {
  return timedRead(() => client.getChainId());
}

async function prepare(
  provider: BrowserEthereumProvider,
  kind: PreparedEmployeeCreditWrite["kind"],
  contract: Address,
  data: Hash,
  rawAmount: bigint,
  employeeCreditContract: Address = contract,
) {
  const chainId = await provider.request({ method: "eth_chainId" });
  if (typeof chainId !== "string" || !isArcTestnet(chainId)) throw new Error("Switch MetaMask to Arc Testnet.");
  const sender = accountFrom(await provider.request({ method: "eth_accounts" }));
  const transaction = { from: sender, to: contract, data, value: "0x0" };
  await provider.request({ method: "eth_call", params: [transaction, "latest"] });
  const gasValue = await provider.request({ method: "eth_estimateGas", params: [transaction] });
  const gasPriceValue = await provider.request({ method: "eth_gasPrice" });
  if (typeof gasValue !== "string" || typeof gasPriceValue !== "string") throw new Error("Gas estimate unavailable.");
  const gas = BigInt(gasValue);
  const gasPrice = BigInt(gasPriceValue);
  return { kind, sender, contract, employeeCreditContract, data, rawAmount, gas, gasPrice, estimatedCost: `${formatEther(gas * gasPrice)} native USDC` };
}

export async function prepareEmployeeCreditFunding(
  provider: BrowserEthereumProvider,
  amount: string,
  contractOverride?: Address,
): Promise<PreparedEmployeeCreditWrite> {
  const contract = requireContract(contractOverride);
  let rawAmount: bigint;
  try {
    rawAmount = parseUnits(amount, 6);
  } catch {
    throw new Error("Enter a valid USDC amount.");
  }
  if (rawAmount <= BigInt(0)) throw new Error("Enter a USDC amount above zero.");

  const chainId = await provider.request({ method: "eth_chainId" });
  if (typeof chainId !== "string" || !isArcTestnet(chainId)) throw new Error("Switch MetaMask to Arc Testnet.");
  const sender = accountFrom(await provider.request({ method: "eth_accounts" }));
  const data = encodeFunctionData({
    abi: usdcAbi,
    functionName: "transfer",
    args: [contract, rawAmount],
  });
  const transaction = {
    from: sender,
    to: ARC_TESTNET.usdcAddress,
    data,
    value: "0x0",
  };

  try {
    await provider.request({ method: "eth_call", params: [transaction, "latest"] });
  } catch (error) {
    const details = error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "Unknown ERC-20 simulation error.";
    throw new Error(`USDC transfer simulation failed: ${details}`, { cause: error });
  }

  const balanceData = encodeFunctionData({ abi: usdcAbi, functionName: "balanceOf", args: [sender] });
  const [tokenBalanceResult, gasValue, gasPriceValue, nativeBalanceValue] = await Promise.all([
    provider.request({
      method: "eth_call",
      params: [{ from: sender, to: ARC_TESTNET.usdcAddress, data: balanceData, value: "0x0" }, "latest"],
    }),
    provider.request({ method: "eth_estimateGas", params: [transaction] }),
    provider.request({ method: "eth_gasPrice" }),
    provider.request({ method: "eth_getBalance", params: [sender, "latest"] }),
  ]);
  if (
    typeof tokenBalanceResult !== "string" ||
    typeof gasValue !== "string" ||
    typeof gasPriceValue !== "string" ||
    typeof nativeBalanceValue !== "string"
  ) {
    throw new Error("Funding balance or gas estimate is unavailable.");
  }
  const tokenBalance = decodeFunctionResult({
    abi: usdcAbi,
    functionName: "balanceOf",
    data: tokenBalanceResult as Hash,
  });
  const gas = BigInt(gasValue);
  const gasPrice = BigInt(gasPriceValue);
  const nativeBalance = BigInt(nativeBalanceValue);
  const estimatedGasCost = gas * gasPrice;
  if (tokenBalance < rawAmount) throw new Error("The connected wallet does not have enough USDC.");
  if (nativeBalance <= estimatedGasCost) throw new Error("Keep some native USDC in the wallet for Arc gas.");

  return {
    kind: "fund",
    sender,
    contract: ARC_TESTNET.usdcAddress,
    employeeCreditContract: contract,
    data,
    rawAmount,
    gas,
    gasPrice,
    estimatedCost: `${formatEther(estimatedGasCost)} native USDC`,
  };
}

export function validateEmployeeCreditDraw(amount: string, instalments: number, firstDueDate: bigint, snapshot: EmployeeCreditSnapshot) {
  let rawAmount: bigint;
  try { rawAmount = parseUnits(amount, 6); } catch { throw new Error("Enter a valid USDC amount."); }
  if (!snapshot.eligible) throw new Error("This wallet is not eligible for employee credit.");
  if (snapshot.account.active) throw new Error("Repay the active credit before using more.");
  if (rawAmount <= BigInt(0) || rawAmount > EMPLOYEE_CREDIT_LIMIT || rawAmount > snapshot.availableCredit) throw new Error("Enter an amount up to 2,000 USDC.");
  if (![1, 2, 3].includes(instalments)) throw new Error("Choose a valid repayment plan.");
  if (firstDueDate <= BigInt(Math.floor(Date.now() / 1_000))) throw new Error("Choose a future first payment date.");
  if (rawAmount > snapshot.poolBalance) throw new Error("The credit pool does not have enough liquidity.");
  return { rawAmount, instalmentAmount: (rawAmount + BigInt(instalments) - BigInt(1)) / BigInt(instalments) };
}

export async function prepareEmployeeCreditDraw(
  provider: BrowserEthereumProvider,
  amount: string,
  instalments: number,
  firstDueDate: bigint,
  snapshot: EmployeeCreditSnapshot,
  contractOverride?: Address,
): Promise<PreparedEmployeeCreditWrite> {
  const contract = requireContract(contractOverride);
  const { rawAmount } = validateEmployeeCreditDraw(amount, instalments, firstDueDate, snapshot);
  const data = encodeFunctionData({ abi: withinEmployeeCreditAbi, functionName: "drawCredit", args: [rawAmount, instalments, firstDueDate] });
  return { ...(await prepare(provider, "draw", contract, data, rawAmount)), instalments, firstDueDate };
}

export async function readEmployeeCreditAllowance(
  employee: Address,
  client: ReadClient = employeeCreditPublicClient as unknown as ReadClient,
  contractOverride?: Address,
  blockNumber?: bigint,
) {
  return timedRead(() => client.readContract({
    address: ARC_TESTNET.usdcAddress,
    abi: usdcAbi,
    functionName: "allowance",
    args: [employee, requireContract(contractOverride)],
    ...(blockNumber === undefined ? {} : { blockNumber }),
  }) as Promise<bigint>);
}

export async function readEmployeeUsdcBalance(
  employee: Address,
  client: ReadClient = employeeCreditPublicClient as unknown as ReadClient,
  blockNumber?: bigint,
) {
  return timedRead(() => client.readContract({
    address: ARC_TESTNET.usdcAddress,
    abi: usdcAbi,
    functionName: "balanceOf",
    args: [employee],
    ...(blockNumber === undefined ? {} : { blockNumber }),
  }) as Promise<bigint>);
}

export async function readEmployeeCreditConfirmedState(
  employee: Address,
  blockNumber: bigint,
  client: ReadClient = employeeCreditPublicClient as unknown as ReadClient,
  contractOverride?: Address,
) {
  const [account, availableCredit, poolBalance, allowance, employeeUsdcBalance] = await Promise.all([
    readEmployeeCreditAccount(employee, client, contractOverride, blockNumber),
    readEmployeeCreditAvailable(employee, client, contractOverride, blockNumber),
    readEmployeeCreditPool(client, contractOverride, blockNumber),
    readEmployeeCreditAllowance(employee, client, contractOverride, blockNumber),
    readEmployeeUsdcBalance(employee, client, blockNumber),
  ]);
  return { account, availableCredit, poolBalance, allowance, employeeUsdcBalance };
}

export function nextEmployeeCreditInstalment(account: EmployeeCreditAccount) {
  return account.outstanding < account.instalmentAmount ? account.outstanding : account.instalmentAmount;
}

export function employeeCreditRepaymentStep(account: EmployeeCreditAccount, allowance: bigint) {
  if (!account.active || account.outstanding <= BigInt(0)) return "unavailable" as const;
  return allowance < nextEmployeeCreditInstalment(account) ? "approve" as const : "repay" as const;
}

export async function prepareEmployeeCreditApproval(provider: BrowserEthereumProvider, rawAmount: bigint, contractOverride?: Address) {
  const contract = requireContract(contractOverride);
  const data = encodeFunctionData({ abi: usdcAbi, functionName: "approve", args: [contract, rawAmount] });
  return prepare(provider, "approve", ARC_TESTNET.usdcAddress, data, rawAmount, contract);
}

export async function prepareEmployeeCreditRepayment(provider: BrowserEthereumProvider, account: EmployeeCreditAccount, contractOverride?: Address) {
  if (!account.active) throw new Error("No active employee credit.");
  const rawAmount = nextEmployeeCreditInstalment(account);
  const data = encodeFunctionData({ abi: withinEmployeeCreditAbi, functionName: "repayNextInstalment" });
  return prepare(provider, "repay", requireContract(contractOverride), data, rawAmount);
}

export async function submitEmployeeCreditWrite(
  provider: BrowserEthereumProvider,
  prepared: PreparedEmployeeCreditWrite,
  client: ReadClient = employeeCreditPublicClient as unknown as ReadClient,
): Promise<Hash> {
  const sender = accountFrom(await provider.request({ method: "eth_accounts" }));
  const chainId = await provider.request({ method: "eth_chainId" });
  if (sender.toLowerCase() !== prepared.sender.toLowerCase() || typeof chainId !== "string" || !isArcTestnet(chainId)) {
    throw new Error("Wallet account changed. Prepare the transaction again.");
  }
  if (prepared.kind === "approve" || prepared.kind === "repay") {
    const liveAccount = await readEmployeeCreditAccount(sender, client, prepared.employeeCreditContract);
    if (!liveAccount.active || liveAccount.outstanding <= BigInt(0)) throw new Error("No active employee credit.");
    if (prepared.kind === "repay" && prepared.rawAmount !== nextEmployeeCreditInstalment(liveAccount)) {
      throw new Error("Credit balance changed. Prepare the repayment again.");
    }
  }
  const hash = await provider.request({
    method: "eth_sendTransaction",
    params: [{ from: sender, to: prepared.contract, data: prepared.data, value: "0x0", gas: `0x${prepared.gas.toString(16)}` }],
  });
  if (typeof hash !== "string" || !/^0x[0-9a-f]{64}$/i.test(hash)) throw new Error("MetaMask did not return a transaction hash.");
  return hash as Hash;
}

export function createEmployeeCreditEvidence(prepared: PreparedEmployeeCreditWrite, transactionHash: Hash): EmployeeCreditEvidence {
  return {
    kind: prepared.kind,
    transactionHash,
    sender: prepared.sender,
    submittedAt: new Date().toISOString(),
    rawAmount: prepared.rawAmount.toString(),
    instalments: prepared.instalments,
    firstDueDate: prepared.firstDueDate?.toString(),
    status: "submitted",
    blockNumber: null,
  };
}

export async function recoverEmployeeCreditEvidence(
  evidence: EmployeeCreditEvidence,
  client: ReadClient = employeeCreditPublicClient as unknown as ReadClient,
) {
  const receipt = client.waitForTransactionReceipt
    ? await client.waitForTransactionReceipt({ hash: evidence.transactionHash })
    : await client.getTransactionReceipt({ hash: evidence.transactionHash });
  return {
    ...evidence,
    status: receipt.status === "success" ? "confirmed" as const : "failed" as const,
    blockNumber: receipt.blockNumber.toString(),
  };
}

export function restoreEmployeeCreditEvidence(value: string | null): EmployeeCreditEvidence | null {
  if (!value) return null;
  try {
    const evidence = JSON.parse(value) as EmployeeCreditEvidence;
    if (!/^0x[0-9a-f]{64}$/i.test(evidence.transactionHash) || !isAddress(evidence.sender)) return null;
    if (!["draw", "approve", "repay", "fund"].includes(evidence.kind)) return null;
    if (!["submitted", "confirmed", "failed"].includes(evidence.status)) return null;
    return evidence;
  } catch {
    return null;
  }
}

export const employeeUsdc = (value: bigint) => `${formatUnits(value, 6)} USDC`;
