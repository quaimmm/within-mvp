"use client";

import {
  createPublicClient,
  encodeFunctionData,
  formatEther,
  formatUnits,
  getAddress,
  isAddress,
  keccak256,
  parseEventLogs,
  parseUnits,
  stringToHex,
  type Address,
  type Hash,
  type TransactionReceipt,
  http,
} from "viem";
import { arcTestnet } from "viem/chains";
import { ARC_TESTNET, isArcTestnet, type BrowserEthereumProvider } from "../arc/network.ts";
import { withinCreditFacilityAbi } from "../contracts/within-credit-facility-abi.ts";
import { usdcAbi } from "../contracts/usdc-abi.ts";

export const SIMPLE_CREDIT_CONTRACT = getAddress("0x19a6E5ccfF0c9B463022FB46E61Aa7389f6dca53");
export const SIMPLE_CREDIT_DEPLOYMENT_BLOCK = BigInt(53_155_876);
export const SIMPLE_CREDIT_TIMEOUT_MS = 8_000;
export const SIMPLE_CREDIT_OVERVIEW_TIMEOUT_MS = 4_000;
export const SIMPLE_CREDIT_REQUESTS_KEY = "within:arc-credit-requests:v1";
export const simpleCreditPublicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(ARC_TESTNET.rpcUrl, { timeout: SIMPLE_CREDIT_TIMEOUT_MS, retryCount: 0 }),
});

type CreditReader = {
  getBlockNumber(): Promise<bigint>;
  readContract(args: Record<string, unknown>): Promise<unknown>;
};

type CreditHistoryReader = {
  getBlockNumber(): Promise<bigint>;
  getLogs(args: Record<string, unknown>): Promise<readonly unknown[]>;
  getTransactionReceipt(args: { hash: Hash }): Promise<TransactionReceipt>;
  readContract(args: Record<string, unknown>): Promise<unknown>;
};

export type CreditField<T> =
  | { status: "success"; value: T }
  | { status: "error"; value: null; message: string };

export type SimpleCreditOverview = {
  facilityBalance: CreditField<bigint>;
  creditLimit: CreditField<bigint>;
  availableCredit: CreditField<bigint>;
  outstandingPrincipal: CreditField<bigint>;
  latestBlock: CreditField<bigint>;
};
export type SimpleCreditFieldName = keyof SimpleCreditOverview;

export type LatestLoan = {
  id: bigint;
  outstandingPrincipal: bigint;
  amountRepaid: bigint;
  totalDue: bigint;
  status: number;
};

export type PreparedSimpleCreditWrite = {
  kind: "request" | "approve" | "repay";
  sender: Address;
  contract: Address;
  data: Hash;
  functionName: "requestDrawdown" | "approve" | "repay";
  rawAmount: bigint;
  gas: bigint;
  gasPrice: bigint;
  estimatedCost: string;
  loanId?: bigint;
  termDays?: number;
  purposeHash?: Hash;
};

export type OnchainCreditRequest = {
  transactionHash: Hash;
  submittedAt: string;
  amount: string;
  termDays: number;
  purpose: string;
  purposeHash: Hash;
  requestId: string | null;
  borrower: Address | null;
  status: "submitted" | "confirmed";
  contractStatus: number | null;
  blockNumber: string | null;
  confirmationUnavailable?: boolean;
};

export type VerifiedOnchainDrawdown = {
  requestId: bigint;
  transactionHash: Hash;
  blockNumber: bigint;
  borrower: Address;
  amount: bigint;
  termDays: number;
  purposeHash: Hash;
  contractStatus: number;
};

export type CreditCapacity = {
  contractAvailableCredit: bigint;
  reservedPendingAmount: bigint;
  effectiveAvailableToRequest: bigint;
  pendingRequestIds: bigint[];
};

export function calculateCreditCapacity(
  contractAvailableCredit: bigint,
  requests: readonly VerifiedOnchainDrawdown[],
): CreditCapacity {
  const pending = new Map<string, VerifiedOnchainDrawdown>();
  for (const request of requests) {
    if (request.contractStatus !== 1) continue;
    const key = `${ARC_TESTNET.chainId}:${SIMPLE_CREDIT_CONTRACT.toLowerCase()}:${request.requestId}`;
    if (!pending.has(key)) pending.set(key, request);
  }
  const confirmedPending = [...pending.values()];
  const reservedPendingAmount = confirmedPending.reduce((total, request) => total + request.amount, BigInt(0));
  return {
    contractAvailableCredit,
    reservedPendingAmount,
    effectiveAvailableToRequest: contractAvailableCredit > reservedPendingAmount
      ? contractAvailableCredit - reservedPendingAmount
      : BigInt(0),
    pendingRequestIds: confirmedPending.map((request) => request.requestId),
  };
}

export function evaluateDrawdownEligibility(input: {
  approvedBorrower: Address | null;
  connectedAccount: Address | null;
  chainId: string | null;
  availableCredit: bigint | null;
  amount: string;
  termDays: number;
  purpose: string;
}) {
  let rawAmount: bigint | null = null;
  try { rawAmount = parseUnits(input.amount, 6); } catch { rawAmount = null; }
  if (!input.connectedAccount) return { enabled: false, rawAmount, message: "Connect the borrower wallet to continue." };
  if (!input.approvedBorrower || input.connectedAccount.toLowerCase() !== input.approvedBorrower.toLowerCase()) return { enabled: false, rawAmount, message: "Wrong wallet connected." };
  if (!isArcTestnet(input.chainId)) return { enabled: false, rawAmount, message: "Switch MetaMask to Arc Testnet." };
  if (rawAmount === null || rawAmount <= BigInt(0) || input.termDays <= 0 || !input.purpose.trim()) return { enabled: false, rawAmount, message: "Enter a valid amount, term and purpose." };
  if (input.availableCredit === null) return { enabled: false, rawAmount, message: "Borrower details are temporarily unavailable." };
  if (rawAmount > input.availableCredit) return { enabled: false, rawAmount, message: "Requested amount exceeds the credit currently available after pending requests." };
  return { enabled: true, rawAmount, message: "" };
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function timed<T>(operation: () => Promise<T>, timeoutMs = SIMPLE_CREDIT_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Arc RPC request timed out.")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function withSimpleCreditTimeout<T>(operation: () => Promise<T>, timeoutMs = SIMPLE_CREDIT_TIMEOUT_MS) {
  return timed(operation, timeoutMs);
}

export async function readApprovedBorrower(reader: CreditReader = simpleCreditPublicClient as unknown as CreditReader): Promise<CreditField<Address>> {
  return field(() => reader.readContract({
    address: SIMPLE_CREDIT_CONTRACT,
    abi: withinCreditFacilityAbi,
    functionName: "approvedBorrower",
  }) as Promise<Address>);
}

export async function readLiveCreditAccount(provider: BrowserEthereumProvider): Promise<CreditField<Address | null>> {
  return field(async () => {
    const accounts = await provider.request({ method: "eth_accounts" });
    if (!Array.isArray(accounts) || !accounts[0]) return null;
    return accountFrom(accounts);
  });
}

export async function readLiveCreditChain(provider: BrowserEthereumProvider): Promise<CreditField<string | null>> {
  return field(async () => {
    const chainId = await provider.request({ method: "eth_chainId" });
    return typeof chainId === "string" ? chainId : null;
  });
}

async function field<T>(operation: () => Promise<T>, timeoutMs?: number): Promise<CreditField<T>> {
  try {
    return { status: "success", value: await timed(operation, timeoutMs) };
  } catch (error) {
    return { status: "error", value: null, message: message(error) };
  }
}

function functionUnavailable(error: unknown) {
  const detail = message(error).toLowerCase();
  return detail.includes("function selector was not recognized")
    || detail.includes("returned no data")
    || detail.includes("function does not exist")
    || detail.includes("unknown selector");
}

export async function readSimpleCreditField(
  name: SimpleCreditFieldName,
  reader: CreditReader = simpleCreditPublicClient as unknown as CreditReader,
  timeoutMs = SIMPLE_CREDIT_TIMEOUT_MS,
): Promise<CreditField<bigint>> {
  if (name === "latestBlock") return field(() => reader.getBlockNumber(), timeoutMs);

  const functionName = name === "outstandingPrincipal" ? "totalOutstandingPrincipal" : name;
  try {
    return { status: "success", value: await timed(() => reader.readContract({
      address: SIMPLE_CREDIT_CONTRACT,
      abi: withinCreditFacilityAbi,
      functionName,
    }) as Promise<bigint>, timeoutMs) };
  } catch (error) {
    if (!functionUnavailable(error)) return { status: "error", value: null, message: message(error) };
    try {
      if (name === "facilityBalance") {
        const balance = await timed(() => reader.readContract({
          address: ARC_TESTNET.usdcAddress,
          abi: usdcAbi,
          functionName: "balanceOf",
          args: [SIMPLE_CREDIT_CONTRACT],
        }) as Promise<bigint>, timeoutMs);
        return { status: "success", value: balance };
      }
      if (name === "outstandingPrincipal") {
        const creditLimit = await timed(() => reader.readContract({ address: SIMPLE_CREDIT_CONTRACT, abi: withinCreditFacilityAbi, functionName: "creditLimit" }) as Promise<bigint>, timeoutMs);
        const availableCredit = await timed(() => reader.readContract({ address: SIMPLE_CREDIT_CONTRACT, abi: withinCreditFacilityAbi, functionName: "availableCredit" }) as Promise<bigint>, timeoutMs);
        return { status: "success", value: creditLimit - availableCredit };
      }
    } catch (fallbackError) {
      return { status: "error", value: null, message: message(fallbackError) };
    }
    return { status: "error", value: null, message: message(error) };
  }
}

export async function readSimpleCreditOverview(
  reader: CreditReader = simpleCreditPublicClient as unknown as CreditReader,
  timeoutMs = SIMPLE_CREDIT_OVERVIEW_TIMEOUT_MS,
): Promise<SimpleCreditOverview> {
  const settled = await Promise.allSettled([
    readSimpleCreditField("facilityBalance", reader, timeoutMs),
    readSimpleCreditField("creditLimit", reader, timeoutMs),
    readSimpleCreditField("availableCredit", reader, timeoutMs),
    readSimpleCreditField("outstandingPrincipal", reader, timeoutMs),
    readSimpleCreditField("latestBlock", reader, timeoutMs),
  ]);
  const result = (index: number): CreditField<bigint> => {
    const entry = settled[index];
    return entry.status === "fulfilled"
      ? entry.value
      : { status: "error", value: null, message: message(entry.reason) };
  };
  const facilityBalance = result(0);
  const creditLimit = result(1);
  const availableCredit = result(2);
  const outstandingPrincipal = result(3);
  const latestBlock = result(4);
  return { facilityBalance, creditLimit, availableCredit, outstandingPrincipal, latestBlock };
}

export function restoreOnchainCreditRequests(value: string | null): OnchainCreditRequest[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is OnchainCreditRequest => {
      if (!item || typeof item !== "object") return false;
      const record = item as Partial<OnchainCreditRequest>;
      return typeof record.transactionHash === "string"
        && /^0x[0-9a-f]{64}$/i.test(record.transactionHash)
        && typeof record.submittedAt === "string"
        && typeof record.amount === "string"
        && /^\d+$/.test(record.amount)
        && typeof record.termDays === "number"
        && Number.isInteger(record.termDays)
        && record.termDays > 0
        && typeof record.purpose === "string"
        && typeof record.purposeHash === "string"
        && /^0x[0-9a-f]{64}$/i.test(record.purposeHash)
        && (record.requestId === null || (typeof record.requestId === "string" && /^\d+$/.test(record.requestId)))
        && (record.borrower === null || (typeof record.borrower === "string" && isAddress(record.borrower)))
        && (record.status === "submitted" || record.status === "confirmed")
        && (record.contractStatus === null || typeof record.contractStatus === "number")
        && (record.blockNumber === null || (typeof record.blockNumber === "string" && /^\d+$/.test(record.blockNumber)));
    });
  } catch {
    return [];
  }
}

export function upsertOnchainCreditRequest(records: OnchainCreditRequest[], record: OnchainCreditRequest) {
  return [record, ...records.filter((item) => item.transactionHash.toLowerCase() !== record.transactionHash.toLowerCase())];
}

export function createSubmittedOnchainCreditRequest(
  prepared: PreparedSimpleCreditWrite,
  purpose: string,
  transactionHash: Hash,
  submittedAt = new Date().toISOString(),
): OnchainCreditRequest {
  if (prepared.kind !== "request" || prepared.termDays === undefined || prepared.purposeHash === undefined) {
    throw new Error("Only a prepared drawdown can create a submitted request record.");
  }
  return {
    transactionHash,
    submittedAt,
    amount: prepared.rawAmount.toString(),
    termDays: prepared.termDays,
    purpose,
    purposeHash: prepared.purposeHash,
    requestId: null,
    borrower: prepared.sender,
    status: "submitted",
    contractStatus: null,
    blockNumber: null,
    confirmationUnavailable: false,
  };
}

export async function confirmOnchainCreditRequest(
  record: OnchainCreditRequest,
  client = simpleCreditPublicClient,
): Promise<OnchainCreditRequest> {
  const receipt = await client.getTransactionReceipt({ hash: record.transactionHash });
  if (receipt.status !== "success") throw new Error("The Arc transaction reverted.");
  const requestId = record.requestId === null ? drawdownRequestId(receipt) : BigInt(record.requestId);
  const request = await client.readContract({
    address: SIMPLE_CREDIT_CONTRACT,
    abi: withinCreditFacilityAbi,
    functionName: "getDrawdownRequest",
    args: [requestId],
  });
  return {
    ...record,
    requestId: requestId.toString(),
    borrower: request.borrower,
    status: "confirmed",
    contractStatus: Number(request.status),
    blockNumber: receipt.blockNumber.toString(),
    confirmationUnavailable: false,
  };
}

export async function readVerifiedOnchainDrawdowns(
  client: CreditHistoryReader = simpleCreditPublicClient as unknown as CreditHistoryReader,
  requestSpacingMs = 1_100,
): Promise<VerifiedOnchainDrawdown[]> {
  const latestBlock = await timed(() => client.getBlockNumber(), SIMPLE_CREDIT_TIMEOUT_MS);
  if (requestSpacingMs > 0) await new Promise((resolve) => setTimeout(resolve, requestSpacingMs));
  const nextRequestId = await timed(() => client.readContract({
    address: SIMPLE_CREDIT_CONTRACT,
    abi: withinCreditFacilityAbi,
    functionName: "nextRequestId",
  }) as Promise<bigint>, SIMPLE_CREDIT_TIMEOUT_MS);
  const expectedRequestCount = nextRequestId > BigInt(0) ? nextRequestId - BigInt(1) : BigInt(0);
  if (expectedRequestCount === BigInt(0)) return [];
  if (requestSpacingMs > 0) await new Promise((resolve) => setTimeout(resolve, requestSpacingMs));
  const logs: unknown[] = [];
  const discoveredIds = new Set<string>();
  const maximumRange = BigInt(10_000);
  for (let toBlock = latestBlock; toBlock >= SIMPLE_CREDIT_DEPLOYMENT_BLOCK;) {
    const fromBlock = toBlock - maximumRange + BigInt(1) > SIMPLE_CREDIT_DEPLOYMENT_BLOCK
      ? toBlock - maximumRange + BigInt(1)
      : SIMPLE_CREDIT_DEPLOYMENT_BLOCK;
    const rangeLogs = await timed(() => client.getLogs({
      address: SIMPLE_CREDIT_CONTRACT,
      event: withinCreditFacilityAbi.find((item) => item.type === "event" && item.name === "DrawdownRequested"),
      fromBlock,
      toBlock,
    }), SIMPLE_CREDIT_TIMEOUT_MS);
    logs.push(...rangeLogs);
    for (const candidate of rangeLogs) {
      const requestId = (candidate as { args?: { requestId?: bigint } }).args?.requestId;
      if (requestId !== undefined) discoveredIds.add(requestId.toString());
    }
    if (BigInt(discoveredIds.size) >= expectedRequestCount || fromBlock === SIMPLE_CREDIT_DEPLOYMENT_BLOCK) break;
    toBlock = fromBlock - BigInt(1);
    if (requestSpacingMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, requestSpacingMs));
    }
  }

  const verified: VerifiedOnchainDrawdown[] = [];
  for (const candidate of logs) {
    try {
      const log = candidate as {
        transactionHash?: Hash | null;
        blockNumber?: bigint | null;
        args?: { requestId?: bigint };
      };
      if (!log.transactionHash || log.blockNumber === null || log.blockNumber === undefined || log.args?.requestId === undefined) {
        throw new Error("Drawdown event is missing confirmed chain evidence.");
      }
      const receipt = await timed(
        () => client.getTransactionReceipt({ hash: log.transactionHash! }),
        SIMPLE_CREDIT_TIMEOUT_MS,
      );
      if (receipt.status !== "success") throw new Error("Drawdown transaction reverted.");
      if (requestSpacingMs > 0) await new Promise((resolve) => setTimeout(resolve, requestSpacingMs));
      const receiptEvents = parseEventLogs({
        abi: withinCreditFacilityAbi,
        eventName: "DrawdownRequested",
        logs: receipt.logs,
      });
      const receiptEvent = receiptEvents.find((event) => event.args.requestId === log.args!.requestId);
      if (!receiptEvent) throw new Error("Drawdown request event was not found in the confirmed receipt.");
      const request = await timed(() => client.readContract({
        address: SIMPLE_CREDIT_CONTRACT,
        abi: withinCreditFacilityAbi,
        functionName: "getDrawdownRequest",
        args: [log.args!.requestId!],
      }) as Promise<{
        borrower: Address;
        amount: bigint;
        termDays: number;
        purposeHash: Hash;
        status: number;
      }>, SIMPLE_CREDIT_TIMEOUT_MS);
      verified.push({
        requestId: log.args.requestId,
        transactionHash: log.transactionHash,
        blockNumber: receipt.blockNumber,
        borrower: request.borrower,
        amount: request.amount,
        termDays: Number(request.termDays),
        purposeHash: request.purposeHash,
        contractStatus: Number(request.status),
      });
    } catch {
      // Only fully verified receipt + contract-read pairs are returned.
    }
    if (requestSpacingMs > 0) await new Promise((resolve) => setTimeout(resolve, requestSpacingMs));
  }

  const unique = new Map<string, VerifiedOnchainDrawdown>();
  for (const request of verified) {
    const key = `${ARC_TESTNET.chainId}:${SIMPLE_CREDIT_CONTRACT.toLowerCase()}:${request.requestId}`;
    if (!unique.has(key)) unique.set(key, request);
  }
  return [...unique.values()].sort((a, b) => Number(b.requestId - a.requestId));
}

export function mergeVerifiedOnchainRequests(
  localRecords: readonly OnchainCreditRequest[],
  verified: readonly VerifiedOnchainDrawdown[],
): OnchainCreditRequest[] {
  const confirmed = verified.map((request) => {
    const local = localRecords.find((record) =>
      record.transactionHash.toLowerCase() === request.transactionHash.toLowerCase()
      || record.requestId === request.requestId.toString());
    return {
      transactionHash: request.transactionHash,
      submittedAt: local?.submittedAt ?? "",
      amount: request.amount.toString(),
      termDays: request.termDays,
      purpose: local?.purpose ?? "",
      purposeHash: request.purposeHash,
      requestId: request.requestId.toString(),
      borrower: request.borrower,
      status: "confirmed" as const,
      contractStatus: request.contractStatus,
      blockNumber: request.blockNumber.toString(),
      confirmationUnavailable: false,
    };
  });
  const pendingSubmissions = localRecords.filter((record) =>
    record.status === "submitted"
    && !confirmed.some((item) => item.transactionHash.toLowerCase() === record.transactionHash.toLowerCase()));
  return [...confirmed, ...pendingSubmissions];
}

export async function readRequestContext(reader: CreditReader = simpleCreditPublicClient as unknown as CreditReader) {
  const [approvedBorrower, availableCredit, facilityBalance] = await Promise.all([
    timed(() => reader.readContract({ address: SIMPLE_CREDIT_CONTRACT, abi: withinCreditFacilityAbi, functionName: "approvedBorrower" }) as Promise<Address>),
    timed(() => reader.readContract({ address: SIMPLE_CREDIT_CONTRACT, abi: withinCreditFacilityAbi, functionName: "availableCredit" }) as Promise<bigint>),
    timed(() => reader.readContract({ address: SIMPLE_CREDIT_CONTRACT, abi: withinCreditFacilityAbi, functionName: "facilityBalance" }) as Promise<bigint>),
  ]);
  return { approvedBorrower, availableCredit, facilityBalance };
}

export async function readLatestLoan(reader: CreditReader = simpleCreditPublicClient as unknown as CreditReader): Promise<LatestLoan | null> {
  const nextLoanId = await timed(() => reader.readContract({ address: SIMPLE_CREDIT_CONTRACT, abi: withinCreditFacilityAbi, functionName: "nextLoanId" }) as Promise<bigint>);
  if (nextLoanId <= BigInt(1)) return null;
  const id = nextLoanId - BigInt(1);
  const loan = await timed(() => reader.readContract({ address: SIMPLE_CREDIT_CONTRACT, abi: withinCreditFacilityAbi, functionName: "getLoan", args: [id] }) as Promise<{ outstandingPrincipal: bigint; amountRepaid: bigint; totalDue: bigint; status: number }>);
  return { id, outstandingPrincipal: loan.outstandingPrincipal, amountRepaid: loan.amountRepaid, totalDue: loan.totalDue, status: Number(loan.status) };
}

export async function readRepaymentContext(reader: CreditReader = simpleCreditPublicClient as unknown as CreditReader) {
  const [loan, borrower] = await Promise.all([
    readLatestLoan(reader),
    timed(() => reader.readContract({ address: SIMPLE_CREDIT_CONTRACT, abi: withinCreditFacilityAbi, functionName: "approvedBorrower" }) as Promise<Address>),
  ]);
  const [balance, allowance] = await Promise.all([
    timed(() => reader.readContract({ address: ARC_TESTNET.usdcAddress, abi: usdcAbi, functionName: "balanceOf", args: [borrower] }) as Promise<bigint>),
    timed(() => reader.readContract({ address: ARC_TESTNET.usdcAddress, abi: usdcAbi, functionName: "allowance", args: [borrower, SIMPLE_CREDIT_CONTRACT] }) as Promise<bigint>),
  ]);
  return { loan, borrower, balance, allowance };
}

function accountFrom(value: unknown): Address {
  const account = Array.isArray(value) ? value[0] : null;
  if (typeof account !== "string" || !isAddress(account)) throw new Error("Connect MetaMask first.");
  return getAddress(account);
}

async function prepare(
  provider: BrowserEthereumProvider,
  contract: Address,
  functionName: PreparedSimpleCreditWrite["functionName"],
  data: Hash,
  rawAmount: bigint,
) {
  const chainId = await provider.request({ method: "eth_chainId" });
  if (typeof chainId !== "string" || !isArcTestnet(chainId)) throw new Error("Switch to Arc Testnet.");
  const sender = accountFrom(await provider.request({ method: "eth_accounts" }));
  const transaction = { from: sender, to: contract, data, value: "0x0" };
  await provider.request({ method: "eth_call", params: [transaction, "latest"] });
  const gasValue = await provider.request({ method: "eth_estimateGas", params: [transaction] });
  const gasPriceValue = await provider.request({ method: "eth_gasPrice" });
  if (typeof gasValue !== "string" || typeof gasPriceValue !== "string") throw new Error("Gas estimate unavailable.");
  const gas = BigInt(gasValue);
  const gasPrice = BigInt(gasPriceValue);
  return { sender, contract, functionName, data, rawAmount, gas, gasPrice, estimatedCost: `${formatEther(gas * gasPrice)} native USDC` };
}

export async function prepareSimpleDrawdown(provider: BrowserEthereumProvider, amount: string, termDays: number, purpose: string): Promise<PreparedSimpleCreditWrite> {
  const rawAmount = parseUnits(amount, 6);
  if (rawAmount <= BigInt(0) || termDays <= 0 || !purpose.trim()) throw new Error("Enter an amount, term and purpose.");
  const purposeHash = keccak256(stringToHex(purpose.trim()));
  const data = encodeFunctionData({ abi: withinCreditFacilityAbi, functionName: "requestDrawdown", args: [rawAmount, termDays, purposeHash] });
  return { kind: "request", ...(await prepare(provider, SIMPLE_CREDIT_CONTRACT, "requestDrawdown", data, rawAmount)), termDays, purposeHash };
}

export async function prepareSimpleApproval(provider: BrowserEthereumProvider, amount: string): Promise<PreparedSimpleCreditWrite> {
  const rawAmount = parseUnits(amount, 6);
  const data = encodeFunctionData({ abi: usdcAbi, functionName: "approve", args: [SIMPLE_CREDIT_CONTRACT, rawAmount] });
  return { kind: "approve", ...(await prepare(provider, ARC_TESTNET.usdcAddress, "approve", data, rawAmount)) };
}

export async function prepareSimpleRepayment(provider: BrowserEthereumProvider, loanId: bigint, amount: string): Promise<PreparedSimpleCreditWrite> {
  const rawAmount = parseUnits(amount, 6);
  const data = encodeFunctionData({ abi: withinCreditFacilityAbi, functionName: "repay", args: [loanId, rawAmount] });
  return { kind: "repay", ...(await prepare(provider, SIMPLE_CREDIT_CONTRACT, "repay", data, rawAmount)), loanId };
}

export async function submitSimpleCreditWrite(provider: BrowserEthereumProvider, prepared: PreparedSimpleCreditWrite): Promise<Hash> {
  const sender = accountFrom(await provider.request({ method: "eth_accounts" }));
  const chainId = await provider.request({ method: "eth_chainId" });
  if (sender.toLowerCase() !== prepared.sender.toLowerCase() || typeof chainId !== "string" || !isArcTestnet(chainId)) {
    throw new Error("MetaMask account changed. Prepare the transaction again.");
  }
  const hash = await provider.request({ method: "eth_sendTransaction", params: [{ from: sender, to: prepared.contract, data: prepared.data, value: "0x0", gas: `0x${prepared.gas.toString(16)}` }] });
  if (typeof hash !== "string" || !/^0x[0-9a-f]{64}$/i.test(hash)) throw new Error("MetaMask did not return a transaction hash.");
  return hash as Hash;
}

export function drawdownRequestId(receipt: TransactionReceipt): bigint {
  const event = parseEventLogs({ abi: withinCreditFacilityAbi, eventName: "DrawdownRequested", logs: receipt.logs })[0];
  if (!event) throw new Error("Drawdown request event was not found.");
  return event.args.requestId;
}

export const simpleUsdc = (value: bigint) => `${formatUnits(value, 6)} USDC`;
export const latestLoanIsActive = (loan: LatestLoan | null) => Boolean(loan && loan.status === 1 && loan.outstandingPrincipal > BigInt(0));
