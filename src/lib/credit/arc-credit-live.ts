import { encodeFunctionData, formatEther, formatUnits, getAddress, isAddress, keccak256, parseEventLogs, parseUnits, stringToHex, type Address, type Hash, type TransactionReceipt } from "viem";
import { ARC_TESTNET, isArcTestnet, type BrowserEthereumProvider } from "../arc/network.ts";
import { arcPublicClient } from "../contracts/arc-contract-clients.ts";
import { withinCreditFacilityAbi } from "../contracts/within-credit-facility-abi.ts";
import { usdcAbi } from "../contracts/usdc-abi.ts";

export const ARC_CREDIT_CONTRACT = "0x19a6e5ccff0c9b463022fb46e61aa7389f6dca53" as Address;
export const ARC_CREDIT_STORAGE_KEY = "within:arc-credit-transactions:v1";

export type ArcCreditSnapshot = {
  blockNumber: bigint | null;
  borrower: Address | null;
  facilityBalance: bigint | null;
  availableCredit: bigint | null;
  outstandingPrincipal: bigint | null;
  walletBalance: bigint | null;
  allowance: bigint | null;
  activeLoan: { id: bigint; outstandingPrincipal: bigint; amountRepaid: bigint; totalDue: bigint; borrower: Address } | null;
};

export type ArcCreditReadFailure = {
  method: string;
  endpoint: string;
  message: string;
  timeout: boolean;
  rateLimited: boolean;
};

export type ArcCreditReadResult = {
  snapshot: ArcCreditSnapshot;
  failures: ArcCreditReadFailure[];
};

export type PreparedCreditWrite = {
  kind: "request" | "approve" | "repay";
  sender: Address;
  contract: Address;
  functionName: "requestDrawdown" | "approve" | "repay";
  data: Hash;
  gas: bigint;
  gasPrice: bigint;
  estimatedCost: string;
  rawAmount: bigint;
  termDays?: number;
  purposeHash?: Hash;
  loanId?: bigint;
};

function normaliseAccount(value: unknown): Address {
  const account = Array.isArray(value) ? value[0] : null;
  if (typeof account !== "string" || !isAddress(account)) throw new Error("Connect a wallet first.");
  return getAddress(account);
}

type CreditReadClient = {
  getBlockNumber(): Promise<bigint>;
  readContract(args: Record<string, unknown>): Promise<unknown>;
};

export class CreditReadCoordinator {
  private controller: AbortController | null = null;
  private runId = 0;

  get isLoading() {
    return this.controller !== null;
  }

  async run<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    restart = false,
  ): Promise<T | undefined> {
    if (this.controller && !restart) return undefined;

    this.controller?.abort();
    const controller = new AbortController();
    const runId = ++this.runId;
    this.controller = controller;

    try {
      const result = await operation(controller.signal);
      return this.runId === runId ? result : undefined;
    } finally {
      if (this.runId === runId) this.controller = null;
    }
  }

  abort() {
    this.runId += 1;
    this.controller?.abort();
    this.controller = null;
  }
}

class CreditReadRequestError extends Error {
  constructor(
    readonly method: string,
    message: string,
    readonly timeout = false,
    readonly rateLimited = false,
  ) {
    super(message);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function rateLimited(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return message.includes("429") || message.includes("rate limit") || message.includes("request limit reached");
}

async function boundedRead<T>(
  method: string,
  operation: () => Promise<T>,
  deadline: number,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) throw new CreditReadRequestError(method, "Request cancelled.");
  const remaining = Math.max(0, deadline - Date.now());
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortHandler: (() => void) | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new CreditReadRequestError(method, "Arc RPC request timed out.", true)), remaining);
  });
  const aborted = new Promise<never>((_, reject) => {
    if (!signal) return;
    abortHandler = () => reject(new CreditReadRequestError(method, "Request cancelled."));
    signal.addEventListener("abort", abortHandler, { once: true });
  });
  try {
    return await Promise.race([
      operation().catch((error) => {
        if (error instanceof CreditReadRequestError) throw error;
        throw new CreditReadRequestError(method, errorMessage(error), false, rateLimited(error));
      }),
      timeout,
      aborted,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    if (signal && abortHandler) signal.removeEventListener("abort", abortHandler);
  }
}

export async function readArcCreditSnapshot(
  _account?: Address | null,
  options: { timeoutMs?: number; signal?: AbortSignal; client?: CreditReadClient } = {},
): Promise<ArcCreditReadResult> {
  const client = options.client ?? arcPublicClient as unknown as CreditReadClient;
  const deadline = Date.now() + Math.min(options.timeoutMs ?? 10_000, 10_000);
  const readContract = <T>(method: string, args: Record<string, unknown>) =>
    boundedRead(method, () => client.readContract(args) as Promise<T>, deadline, options.signal);

  const borrowerTask = readContract<Address>("approvedBorrower", { address: ARC_CREDIT_CONTRACT, abi: withinCreditFacilityAbi, functionName: "approvedBorrower" });
  const tasks = {
    blockNumber: boundedRead("eth_blockNumber", () => client.getBlockNumber(), deadline, options.signal),
    borrower: borrowerTask,
    facilityBalance: readContract<bigint>("facilityBalance", { address: ARC_CREDIT_CONTRACT, abi: withinCreditFacilityAbi, functionName: "facilityBalance" }),
    availableCredit: readContract<bigint>("availableCredit", { address: ARC_CREDIT_CONTRACT, abi: withinCreditFacilityAbi, functionName: "availableCredit" }),
    outstandingPrincipal: readContract<bigint>("totalOutstandingPrincipal", { address: ARC_CREDIT_CONTRACT, abi: withinCreditFacilityAbi, functionName: "totalOutstandingPrincipal" }),
    walletBalance: boundedRead(
      "USDC.balanceOf",
      async () => {
        const borrower = await borrowerTask;
        return client.readContract({ address: ARC_TESTNET.usdcAddress, abi: usdcAbi, functionName: "balanceOf", args: [borrower] }) as Promise<bigint>;
      },
      deadline,
      options.signal,
    ),
    allowance: boundedRead(
      "USDC.allowance",
      async () => {
        const borrower = await borrowerTask;
        return client.readContract({ address: ARC_TESTNET.usdcAddress, abi: usdcAbi, functionName: "allowance", args: [borrower, ARC_CREDIT_CONTRACT] }) as Promise<bigint>;
      },
      deadline,
      options.signal,
    ),
    activeLoan: readContract<bigint>("nextLoanId", { address: ARC_CREDIT_CONTRACT, abi: withinCreditFacilityAbi, functionName: "nextLoanId" }).then(async (nextLoanId) => {
      for (let id = nextLoanId - BigInt(1), checked = 0; id > BigInt(0) && checked < 20; id -= BigInt(1), checked += 1) {
        const loan = await readContract<{ outstandingPrincipal: bigint; amountRepaid: bigint; totalDue: bigint; status: number }>("getLoan", { address: ARC_CREDIT_CONTRACT, abi: withinCreditFacilityAbi, functionName: "getLoan", args: [id] });
        if (loan.status === 1) return { id, outstandingPrincipal: loan.outstandingPrincipal, amountRepaid: loan.amountRepaid, totalDue: loan.totalDue };
      }
      return null;
    }),
  };
  const keys = Object.keys(tasks) as Array<keyof typeof tasks>;
  const settled = await Promise.allSettled(keys.map((key) => tasks[key]));
  const values = new Map<string, unknown>();
  const failures: ArcCreditReadFailure[] = [];
  settled.forEach((result, index) => {
    const key = keys[index];
    if (result.status === "fulfilled") values.set(key, result.value);
    else {
      const error = result.reason instanceof CreditReadRequestError
        ? result.reason
        : new CreditReadRequestError(String(key), errorMessage(result.reason), false, rateLimited(result.reason));
      failures.push({ method: error.method, endpoint: ARC_TESTNET.rpcUrl, message: error.message, timeout: error.timeout, rateLimited: error.rateLimited });
    }
  });
  const borrower = (values.get("borrower") as Address | undefined) ?? null;
  const active = values.get("activeLoan") as Omit<NonNullable<ArcCreditSnapshot["activeLoan"]>, "borrower"> | null | undefined;
  return {
    snapshot: {
      blockNumber: (values.get("blockNumber") as bigint | undefined) ?? null,
      borrower,
      facilityBalance: (values.get("facilityBalance") as bigint | undefined) ?? null,
      availableCredit: (values.get("availableCredit") as bigint | undefined) ?? null,
      outstandingPrincipal: (values.get("outstandingPrincipal") as bigint | undefined) ?? null,
      walletBalance: (values.get("walletBalance") as bigint | undefined) ?? null,
      allowance: (values.get("allowance") as bigint | undefined) ?? null,
      activeLoan: active && borrower ? { ...active, borrower } : null,
    },
    failures,
  };
}

async function prepare(provider: BrowserEthereumProvider, contract: Address, functionName: PreparedCreditWrite["functionName"], data: Hash, rawAmount: bigint): Promise<Omit<PreparedCreditWrite, "kind">> {
  const chainId = await provider.request({ method: "eth_chainId" });
  if (typeof chainId !== "string" || !isArcTestnet(chainId)) throw new Error("Switch to Arc Testnet.");
  const sender = normaliseAccount(await provider.request({ method: "eth_accounts" }));
  const transaction = { from: sender, to: contract, data, value: "0x0" };
  await provider.request({ method: "eth_call", params: [transaction, "latest"] });
  const gasHex = await provider.request({ method: "eth_estimateGas", params: [transaction] });
  const gasPriceHex = await provider.request({ method: "eth_gasPrice" });
  if (typeof gasHex !== "string" || typeof gasPriceHex !== "string") throw new Error("Gas estimation is unavailable.");
  const gas = BigInt(gasHex);
  const gasPrice = BigInt(gasPriceHex);
  return { sender, contract, functionName, data, gas, gasPrice, estimatedCost: `${formatEther(gas * gasPrice)} native USDC`, rawAmount };
}

export async function prepareDrawdown(provider: BrowserEthereumProvider, amount: string, termDays: number, purpose: string): Promise<PreparedCreditWrite> {
  const rawAmount = parseUnits(amount, 6);
  if (rawAmount <= BigInt(0) || termDays <= 0 || !purpose.trim()) throw new Error("Enter an amount, term and purpose.");
  const purposeHash = keccak256(stringToHex(purpose.trim()));
  const data = encodeFunctionData({ abi: withinCreditFacilityAbi, functionName: "requestDrawdown", args: [rawAmount, termDays, purposeHash] });
  return { kind: "request", ...(await prepare(provider, ARC_CREDIT_CONTRACT, "requestDrawdown", data, rawAmount)), termDays, purposeHash };
}

export async function prepareUsdcApproval(provider: BrowserEthereumProvider, amount: string): Promise<PreparedCreditWrite> {
  const rawAmount = parseUnits(amount, 6);
  const data = encodeFunctionData({ abi: usdcAbi, functionName: "approve", args: [ARC_CREDIT_CONTRACT, rawAmount] });
  return { kind: "approve", ...(await prepare(provider, ARC_TESTNET.usdcAddress, "approve", data, rawAmount)) };
}

export async function prepareRepayment(provider: BrowserEthereumProvider, loanId: bigint, amount: string): Promise<PreparedCreditWrite> {
  const rawAmount = parseUnits(amount, 6);
  const data = encodeFunctionData({ abi: withinCreditFacilityAbi, functionName: "repay", args: [loanId, rawAmount] });
  return { kind: "repay", ...(await prepare(provider, ARC_CREDIT_CONTRACT, "repay", data, rawAmount)), loanId };
}

export async function submitPreparedCreditWrite(provider: BrowserEthereumProvider, prepared: PreparedCreditWrite): Promise<Hash> {
  const accounts = await provider.request({ method: "eth_accounts" });
  const sender = normaliseAccount(accounts);
  const chainId = await provider.request({ method: "eth_chainId" });
  if (sender.toLowerCase() !== prepared.sender.toLowerCase() || typeof chainId !== "string" || !isArcTestnet(chainId)) throw new Error("Wallet changed. Prepare again.");
  const hash = await provider.request({ method: "eth_sendTransaction", params: [{ from: sender, to: prepared.contract, data: prepared.data, value: "0x0", gas: `0x${prepared.gas.toString(16)}` }] });
  if (typeof hash !== "string" || !/^0x[0-9a-f]{64}$/i.test(hash)) throw new Error("Wallet did not return a transaction hash.");
  return hash as Hash;
}

export function requestIdFromReceipt(receipt: TransactionReceipt): bigint {
  const event = parseEventLogs({ abi: withinCreditFacilityAbi, logs: receipt.logs, eventName: "DrawdownRequested" })[0];
  if (!event) throw new Error("Drawdown request event was not found.");
  return event.args.requestId;
}

export const displayUsdc = (value: bigint | null) => value === null ? "Unavailable" : `${formatUnits(value, 6)} USDC`;
