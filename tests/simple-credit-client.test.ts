import assert from "node:assert/strict";
import test from "node:test";
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, getAddress } from "viem";
import type { BrowserEthereumProvider } from "../src/lib/arc/network.ts";
import { withinCreditFacilityAbi } from "../src/lib/contracts/within-credit-facility-abi.ts";
import {
  calculateCreditCapacity,
  confirmOnchainCreditRequest,
  createSubmittedOnchainCreditRequest,
  drawdownRequestId,
  evaluateDrawdownEligibility,
  latestLoanIsActive,
  prepareSimpleApproval,
  prepareSimpleDrawdown,
  prepareSimpleRepayment,
  readSimpleCreditField,
  readLatestLoan,
  readSimpleCreditOverview,
  readVerifiedOnchainDrawdowns,
  restoreOnchainCreditRequests,
  upsertOnchainCreditRequest,
  type OnchainCreditRequest,
  type VerifiedOnchainDrawdown,
} from "../src/lib/credit/simple-credit-client.ts";

const borrower = "0xCCE679E826618797208BB1Fba4418481d92fAaD0";

function reader(fail = "") {
  const methods: string[] = [];
  return {
    methods,
    client: {
      async getBlockNumber() { methods.push("eth_blockNumber"); return BigInt(100); },
      async readContract(args: Record<string, unknown>) {
        const method = String(args.functionName);
        methods.push(method);
        if (method === fail) throw new Error("RPC unavailable");
        if (method === "nextLoanId") return BigInt(8);
        if (method === "getLoan") return { outstandingPrincipal: BigInt(50_000_000), amountRepaid: BigInt(5_000_000), totalDue: BigInt(55_000_000), status: 1 };
        return BigInt(1_000_000);
      },
    },
  };
}

function provider() {
  const methods: string[] = [];
  const value: BrowserEthereumProvider = { request: async ({ method }) => {
    methods.push(method);
    if (method === "eth_chainId") return "0x4CEF52";
    if (method === "eth_accounts") return [borrower];
    if (method === "eth_call") return "0x";
    if (method === "eth_estimateGas") return "0x186a0";
    if (method === "eth_gasPrice") return "0x5d21dba00";
    throw new Error(`Unexpected ${method}`);
  } };
  return { value, methods };
}

test("overview performs only the required initial Arc reads", async () => {
  const mock = reader();
  const result = await readSimpleCreditOverview(mock.client, 100);
  assert.deepEqual(mock.methods, ["facilityBalance", "creditLimit", "availableCredit", "totalOutstandingPrincipal", "eth_blockNumber"]);
  assert.equal(result.facilityBalance.status, "success");
  assert.equal(mock.methods.includes("approvedBorrower"), false);
  assert.equal(mock.methods.includes("balanceOf"), false);
  assert.equal(mock.methods.includes("allowance"), false);
});

test("one failed overview field does not hide successful fields and retry works", async () => {
  const failed = reader("availableCredit");
  const first = await readSimpleCreditOverview(failed.client, 100);
  assert.equal(first.availableCredit.status, "error");
  assert.equal(first.facilityBalance.status, "success");
  const retried = reader();
  const second = await readSimpleCreditOverview(retried.client, 100);
  assert.equal(second.availableCredit.status, "success");
});

test("facilityBalance uses its direct uint256 read when the deployed function works", async () => {
  const mock = reader();
  const result = await readSimpleCreditField("facilityBalance", mock.client, 100);
  assert.deepEqual(mock.methods, ["facilityBalance"]);
  assert.deepEqual(result, { status: "success", value: BigInt(1_000_000) });
});

test("facilityBalance falls back to real USDC balanceOf only when the function is unavailable", async () => {
  const methods: string[] = [];
  const client = {
    async getBlockNumber() { return BigInt(1); },
    async readContract(args: Record<string, unknown>) {
      const method = String(args.functionName);
      methods.push(method);
      if (method === "facilityBalance") throw new Error("function selector was not recognized");
      if (method === "balanceOf") return BigInt(7_500_000);
      throw new Error(`Unexpected ${method}`);
    },
  };
  const result = await readSimpleCreditField("facilityBalance", client, 100);
  assert.deepEqual(methods, ["facilityBalance", "balanceOf"]);
  assert.deepEqual(result, { status: "success", value: BigInt(7_500_000) });
});

test("totalOutstandingPrincipal decodes bigint directly without mapping or serialisation", async () => {
  const methods: string[] = [];
  const client = {
    async getBlockNumber() { return BigInt(1); },
    async readContract(args: Record<string, unknown>) {
      methods.push(String(args.functionName));
      return BigInt(12_345_678);
    },
  };
  const result = await readSimpleCreditField("outstandingPrincipal", client, 100);
  assert.deepEqual(methods, ["totalOutstandingPrincipal"]);
  assert.deepEqual(result, { status: "success", value: BigInt(12_345_678) });
});

test("retry can rerun only failed fields without touching successful public reads", async () => {
  const first = reader("facilityBalance");
  const overview = await readSimpleCreditOverview(first.client, 100);
  const failed = (Object.entries(overview) as Array<[keyof typeof overview, (typeof overview)[keyof typeof overview]]>)
    .filter(([, value]) => value.status === "error")
    .map(([name]) => name);
  assert.deepEqual(failed, ["facilityBalance"]);
  const retry = reader();
  for (const name of failed) await readSimpleCreditField(name, retry.client, 100);
  assert.deepEqual(retry.methods, ["facilityBalance"]);
  assert.equal(retry.methods.includes("eth_sendTransaction"), false);
});

test("overview timeout settles instead of leaving loading pending", async () => {
  const never = new Promise<never>(() => {});
  const client = { getBlockNumber: () => never, readContract: () => never };
  const started = Date.now();
  const result = await readSimpleCreditOverview(client, 20);
  assert.equal(Object.values(result).every((entry) => entry.status === "error"), true);
  assert.equal(Date.now() - started < 500, true);
});

test("request preparation encodes six-decimal requestDrawdown and never broadcasts", async () => {
  const mock = provider();
  const prepared = await prepareSimpleDrawdown(mock.value, "750.25", 90, "Software procurement");
  const decoded = decodeFunctionData({ abi: withinCreditFacilityAbi, data: prepared.data });
  assert.equal(decoded.functionName, "requestDrawdown");
  assert.equal(decoded.args[0], BigInt(750_250_000));
  assert.equal(mock.methods.includes("eth_sendTransaction"), false);
  assert.equal(mock.methods.some((method) => method.includes("sign")), false);
});

test("wallet-returned hash becomes the submitted request record immediately without a fake ID", async () => {
  const mock = provider();
  const prepared = await prepareSimpleDrawdown(mock.value, "750", 90, "Software procurement");
  const transactionHash = `0x${"34".repeat(32)}` as const;
  const record = createSubmittedOnchainCreditRequest(prepared, "Software procurement", transactionHash, "2026-07-26T12:00:00.000Z");
  assert.equal(record.transactionHash, transactionHash);
  assert.equal(record.requestId, null);
  assert.equal(record.status, "submitted");
  assert.equal(record.amount, "750000000");
  assert.equal(mock.methods.includes("eth_sendTransaction"), false);
});

test("overview starts all independent reads before any one settles", async () => {
  const started: string[] = [];
  const resolvers = new Map<string, (value: bigint) => void>();
  const pending = (name: string) => new Promise<bigint>((resolve) => {
    started.push(name);
    resolvers.set(name, resolve);
  });
  const client = {
    getBlockNumber: () => pending("eth_blockNumber"),
    readContract: (args: Record<string, unknown>) => pending(String(args.functionName)),
  };
  const overview = readSimpleCreditOverview(client, 100);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(started, ["facilityBalance", "creditLimit", "availableCredit", "totalOutstandingPrincipal", "eth_blockNumber"]);
  for (const resolve of resolvers.values()) resolve(BigInt(1));
  assert.equal((await overview).latestBlock.status, "success");
});

test("latest-loan lookup reads only nextLoanId and the single latest loan", async () => {
  const mock = reader();
  const loan = await readLatestLoan(mock.client);
  assert.deepEqual(mock.methods, ["nextLoanId", "getLoan"]);
  assert.equal(loan?.id, BigInt(7));
  assert.equal(latestLoanIsActive(loan), true);
  assert.equal(latestLoanIsActive(null), false);
});

test("approval and repayment remain separate prepared transactions without writes", async () => {
  const approvalProvider = provider();
  const approval = await prepareSimpleApproval(approvalProvider.value, "10");
  const repaymentProvider = provider();
  const repayment = await prepareSimpleRepayment(repaymentProvider.value, BigInt(7), "10");
  assert.equal(approval.kind, "approve");
  assert.equal(repayment.kind, "repay");
  assert.notEqual(approval.contract, repayment.contract);
  assert.equal(approvalProvider.methods.includes("eth_sendTransaction"), false);
  assert.equal(repaymentProvider.methods.includes("eth_sendTransaction"), false);
});

test("drawdown request ID comes from the confirmed event", () => {
  const topics = encodeEventTopics({ abi: withinCreditFacilityAbi, eventName: "DrawdownRequested", args: { requestId: BigInt(42), borrower: getAddress(borrower) } });
  const data = encodeAbiParameters(
    [{ type: "uint256" }, { type: "uint32" }, { type: "bytes32" }],
    [BigInt(750_000_000), 90, `0x${"ab".repeat(32)}`],
  );
  assert.equal(drawdownRequestId({ logs: [{ address: borrower, topics, data }] } as never), BigInt(42));
});

test("submitted request persistence keeps the real hash and no fabricated request ID", () => {
  const record: OnchainCreditRequest = {
    transactionHash: `0x${"12".repeat(32)}`,
    submittedAt: "2026-07-26T12:00:00.000Z",
    amount: "750000000",
    termDays: 90,
    purpose: "Software procurement",
    purposeHash: `0x${"ab".repeat(32)}`,
    requestId: null,
    borrower: getAddress(borrower),
    status: "submitted",
    contractStatus: null,
    blockNumber: null,
  };
  const stored = upsertOnchainCreditRequest([], record);
  assert.deepEqual(restoreOnchainCreditRequests(JSON.stringify(stored)), stored);
  assert.equal(stored[0].requestId, null);
  assert.deepEqual(restoreOnchainCreditRequests(JSON.stringify([{ ...record, transactionHash: "fake" }])), []);
});

test("receipt recovery derives request ID from the event and reads the confirmed request without a write", async () => {
  const requestHash = `0x${"12".repeat(32)}` as const;
  const purposeHash = `0x${"ab".repeat(32)}` as const;
  const topics = encodeEventTopics({ abi: withinCreditFacilityAbi, eventName: "DrawdownRequested", args: { requestId: BigInt(42), borrower: getAddress(borrower) } });
  const data = encodeAbiParameters(
    [{ type: "uint256" }, { type: "uint32" }, { type: "bytes32" }],
    [BigInt(750_000_000), 90, purposeHash],
  );
  const methods: string[] = [];
  const client = {
    async getTransactionReceipt() {
      methods.push("eth_getTransactionReceipt");
      return { status: "success", blockNumber: BigInt(777), logs: [{ address: borrower, topics, data }] };
    },
    async readContract(args: Record<string, unknown>) {
      methods.push(String(args.functionName));
      return { borrower: getAddress(borrower), amount: BigInt(750_000_000), termDays: 90, purposeHash, status: 1, loanId: BigInt(0) };
    },
  };
  const record: OnchainCreditRequest = {
    transactionHash: requestHash,
    submittedAt: "2026-07-26T12:00:00.000Z",
    amount: "750000000",
    termDays: 90,
    purpose: "Software procurement",
    purposeHash,
    requestId: null,
    borrower: getAddress(borrower),
    status: "submitted",
    contractStatus: null,
    blockNumber: null,
  };
  const confirmed = await confirmOnchainCreditRequest(record, client as never);
  assert.equal(confirmed.requestId, "42");
  assert.equal(confirmed.status, "confirmed");
  assert.equal(confirmed.blockNumber, "777");
  assert.deepEqual(methods, ["eth_getTransactionReceipt", "getDrawdownRequest"]);
  assert.equal(methods.includes("eth_sendTransaction"), false);
});

function verifiedRequest(requestId: bigint, amount: bigint, contractStatus = 1): VerifiedOnchainDrawdown {
  return {
    requestId,
    transactionHash: `0x${requestId.toString(16).padStart(64, "0")}`,
    blockNumber: BigInt(53_273_135) + requestId,
    borrower: getAddress(borrower),
    amount,
    termDays: 90,
    purposeHash: `0x${"ab".repeat(32)}`,
    contractStatus,
  };
}

test("one confirmed pending request reduces available-to-request while preserving raw contract credit", () => {
  const capacity = calculateCreditCapacity(BigInt(25_000_000_000), [verifiedRequest(BigInt(1), BigInt(750_000_000))]);
  assert.equal(capacity.contractAvailableCredit, BigInt(25_000_000_000));
  assert.equal(capacity.reservedPendingAmount, BigInt(750_000_000));
  assert.equal(capacity.effectiveAvailableToRequest, BigInt(24_250_000_000));
  assert.deepEqual(capacity.pendingRequestIds, [BigInt(1)]);
});

test("multiple pending requests are summed and duplicate request IDs count once", () => {
  const first = verifiedRequest(BigInt(1), BigInt(750_000_000));
  const duplicate = { ...first, transactionHash: `0x${"ff".repeat(32)}` as const };
  const second = verifiedRequest(BigInt(2), BigInt(751_000_000));
  const capacity = calculateCreditCapacity(BigInt(25_000_000_000), [first, duplicate, second]);
  assert.equal(capacity.reservedPendingAmount, BigInt(1_501_000_000));
  assert.equal(capacity.effectiveAvailableToRequest, BigInt(23_499_000_000));
  assert.deepEqual(capacity.pendingRequestIds, [BigInt(1), BigInt(2)]);
});

test("unconfirmed, cancelled, and disbursed requests do not reserve capacity twice", () => {
  const submittedOnly: OnchainCreditRequest = {
    transactionHash: `0x${"12".repeat(32)}`,
    submittedAt: "2026-07-26T12:00:00.000Z",
    amount: "900000000",
    termDays: 90,
    purpose: "Unconfirmed",
    purposeHash: `0x${"ab".repeat(32)}`,
    requestId: null,
    borrower: getAddress(borrower),
    status: "submitted",
    contractStatus: null,
    blockNumber: null,
  };
  const capacity = calculateCreditCapacity(BigInt(25_000_000_000), [
    verifiedRequest(BigInt(2), BigInt(751_000_000), 2),
    verifiedRequest(BigInt(3), BigInt(1_000_000_000), 3),
  ]);
  assert.equal(capacity.reservedPendingAmount, BigInt(0));
  assert.equal(capacity.effectiveAvailableToRequest, BigInt(25_000_000_000));
  assert.equal(submittedOnly.requestId, null);
});

test("reverted request receipts are excluded from verified onchain history", async () => {
  const requestId = BigInt(7);
  const transactionHash = `0x${"77".repeat(32)}` as const;
  const client = {
    async getBlockNumber() {
      return BigInt(53_200_000);
    },
    async getLogs() {
      return [{ transactionHash, blockNumber: BigInt(53_200_000), args: { requestId } }];
    },
    async getTransactionReceipt() {
      return { status: "reverted", blockNumber: BigInt(53_200_000), logs: [] };
    },
    async readContract(args: Record<string, unknown>) {
      if (args.functionName === "nextRequestId") return BigInt(2);
      throw new Error("getDrawdownRequest must not run for a reverted receipt");
    },
  };
  assert.deepEqual(await readVerifiedOnchainDrawdowns(client as never, 0), []);
});

test("request above effective availability is blocked with pending-capacity guidance", () => {
  const result = evaluateDrawdownEligibility({
    approvedBorrower: getAddress(borrower),
    connectedAccount: getAddress(borrower),
    chainId: "0x4CEF52",
    availableCredit: BigInt(23_499_000_000),
    amount: "23500",
    termDays: 90,
    purpose: "Software procurement",
  });
  assert.equal(result.enabled, false);
  assert.equal(result.message, "Requested amount exceeds the credit currently available after pending requests.");
});

test("borrower eligibility distinguishes connected, wrong, and authorised wallets", () => {
  const base = { approvedBorrower: getAddress(borrower), chainId: "0x4CEF52", availableCredit: BigInt(25_000_000_000), amount: "750", termDays: 90, purpose: "Software procurement" };
  assert.equal(evaluateDrawdownEligibility({ ...base, connectedAccount: null }).message, "Connect the borrower wallet to continue.");
  assert.equal(evaluateDrawdownEligibility({ ...base, connectedAccount: getAddress("0x1234567890123456789012345678901234567890") }).message, "Wrong wallet connected.");
  const authorised = evaluateDrawdownEligibility({ ...base, connectedAccount: getAddress(borrower) });
  assert.equal(authorised.enabled, true);
  assert.equal(authorised.rawAmount, BigInt(750_000_000));
});

test("account changes immediately recompute borrower validation", () => {
  const base = { approvedBorrower: getAddress(borrower), chainId: "0x4CEF52", availableCredit: BigInt(25_000_000_000), amount: "750", termDays: 90, purpose: "Software procurement" };
  assert.equal(evaluateDrawdownEligibility({ ...base, connectedAccount: getAddress(borrower) }).enabled, true);
  assert.equal(evaluateDrawdownEligibility({ ...base, connectedAccount: getAddress("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd") }).enabled, false);
});

test("zero facility liquidity is not part of requestDrawdown eligibility", () => {
  const result = evaluateDrawdownEligibility({
    approvedBorrower: getAddress(borrower),
    connectedAccount: getAddress(borrower),
    chainId: "0x4CEF52",
    availableCredit: BigInt(25_000_000_000),
    amount: "750",
    termDays: 90,
    purpose: "Software procurement",
  });
  assert.equal(result.enabled, true);
});

test("simulation errors preserve the actual revert reason and perform zero writes", async () => {
  const methods: string[] = [];
  const simulationError = new Error("execution reverted: CreditLimitExceeded()");
  const mock: BrowserEthereumProvider = { request: async ({ method }) => {
    methods.push(method);
    if (method === "eth_chainId") return "0x4CEF52";
    if (method === "eth_accounts") return [borrower];
    if (method === "eth_call") throw simulationError;
    throw new Error(`Unexpected ${method}`);
  } };
  await assert.rejects(prepareSimpleDrawdown(mock, "750", 90, "Software procurement"), /CreditLimitExceeded/);
  assert.equal(methods.includes("eth_sendTransaction"), false);
});
