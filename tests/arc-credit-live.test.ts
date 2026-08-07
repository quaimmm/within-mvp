import assert from "node:assert/strict";
import test from "node:test";
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, getAddress } from "viem";
import type { BrowserEthereumProvider } from "../src/lib/arc/network.ts";
import { withinCreditFacilityAbi } from "../src/lib/contracts/within-credit-facility-abi.ts";
import {
  CreditReadCoordinator,
  prepareDrawdown,
  prepareRepayment,
  prepareUsdcApproval,
  readArcCreditSnapshot,
  requestIdFromReceipt,
} from "../src/lib/credit/arc-credit-live.ts";

const borrower = "0xCCE679E826618797208BB1Fba4418481d92fAaD0";

function preparationProvider() {
  const methods: string[] = [];
  const provider: BrowserEthereumProvider = {
    async request({ method }) {
      methods.push(method);
      if (method === "eth_chainId") return "0x4CEF52";
      if (method === "eth_accounts") return [borrower];
      if (method === "eth_call") return "0x";
      if (method === "eth_estimateGas") return "0x186a0";
      if (method === "eth_gasPrice") return "0x5d21dba00";
      throw new Error(`Unexpected method ${method}`);
    },
  };
  return { provider, methods };
}

test("drawdown preparation uses six-decimal units and performs no wallet write", async () => {
  const mock = preparationProvider();
  const prepared = await prepareDrawdown(mock.provider, "750.25", 90, "Software procurement");
  assert.equal(prepared.rawAmount, BigInt(750_250_000));
  const decoded = decodeFunctionData({ abi: withinCreditFacilityAbi, data: prepared.data });
  assert.equal(decoded.functionName, "requestDrawdown");
  assert.equal(decoded.args[0], BigInt(750_250_000));
  assert.equal(decoded.args[1], 90);
  assert.equal(mock.methods.includes("eth_sendTransaction"), false);
  assert.equal(mock.methods.some((method) => method.includes("sign")), false);
});

test("allowance approval and repayment are separate prepared transactions", async () => {
  const approvalMock = preparationProvider();
  const approval = await prepareUsdcApproval(approvalMock.provider, "10");
  const repaymentMock = preparationProvider();
  const repayment = await prepareRepayment(repaymentMock.provider, BigInt(7), "10");
  assert.equal(approval.kind, "approve");
  assert.equal(repayment.kind, "repay");
  assert.notEqual(approval.contract, repayment.contract);
  assert.equal(approvalMock.methods.includes("eth_sendTransaction"), false);
  assert.equal(repaymentMock.methods.includes("eth_sendTransaction"), false);
});

test("real drawdown request ID is extracted from the receipt event", () => {
  const topics = encodeEventTopics({ abi: withinCreditFacilityAbi, eventName: "DrawdownRequested", args: { requestId: BigInt(42), borrower: getAddress(borrower) } });
  const data = encodeAbiParameters(
    [{ type: "uint256" }, { type: "uint32" }, { type: "bytes32" }],
    [BigInt(750_000_000), 90, `0x${"ab".repeat(32)}`],
  );
  const requestId = requestIdFromReceipt({ logs: [{ address: borrower, topics, data }] } as never);
  assert.equal(requestId, BigInt(42));
});

function creditReadClient(overrides: Record<string, unknown | Error> = {}) {
  const methods: string[] = [];
  return {
    methods,
    client: {
      async getBlockNumber() {
        methods.push("eth_blockNumber");
        const value = overrides.eth_blockNumber;
        if (value instanceof Error) throw value;
        return (value as bigint | undefined) ?? BigInt(123);
      },
      async readContract(args: Record<string, unknown>) {
        const method = String(args.functionName);
        methods.push(method);
        const value = overrides[method];
        if (value instanceof Error) throw value;
        if (value !== undefined) return value;
        if (method === "approvedBorrower") return borrower;
        if (method === "nextLoanId") return BigInt(1);
        if (method === "balanceOf") return BigInt(2_000_000);
        if (method === "allowance") return BigInt(1_000_000);
        return BigInt(5_000_000);
      },
    },
  };
}

test("credit read returns real successful values without wallet writes", async () => {
  const mock = creditReadClient();
  const result = await readArcCreditSnapshot(null, { client: mock.client, timeoutMs: 100 });
  assert.equal(result.failures.length, 0);
  assert.equal(result.snapshot.borrower, borrower);
  assert.equal(result.snapshot.walletBalance, BigInt(2_000_000));
  assert.equal(result.snapshot.allowance, BigInt(1_000_000));
  assert.equal(mock.methods.includes("eth_sendTransaction"), false);
});

test("RPC rejection preserves partial values and marks only the failed field unavailable", async () => {
  const mock = creditReadClient({ availableCredit: new Error("RPC rejected") });
  const result = await readArcCreditSnapshot(null, { client: mock.client, timeoutMs: 100 });
  assert.equal(result.snapshot.availableCredit, null);
  assert.equal(result.snapshot.facilityBalance, BigInt(5_000_000));
  assert.equal(result.failures.some((failure) => failure.method === "availableCredit"), true);
});

test("RPC rate limits are classified and never replaced with demo values", async () => {
  const mock = creditReadClient({ allowance: new Error("HTTP 429: request limit reached") });
  const result = await readArcCreditSnapshot(null, { client: mock.client, timeoutMs: 100 });
  assert.equal(result.snapshot.allowance, null);
  assert.equal(result.failures.some((failure) => failure.method === "USDC.allowance" && failure.rateLimited), true);
});

test("credit read batch times out and settles instead of remaining pending", async () => {
  const never = new Promise<never>(() => {});
  const client = {
    getBlockNumber: () => never,
    readContract: () => never,
  };
  const started = Date.now();
  const result = await readArcCreditSnapshot(null, { client, timeoutMs: 25 });
  assert.equal(result.failures.length > 0, true);
  assert.equal(result.failures.every((failure) => failure.timeout), true);
  assert.equal(Date.now() - started < 500, true);
});

test("read coordinator prevents overlaps and clears loading after failure", async () => {
  const coordinator = new CreditReadCoordinator();
  let resolveFirst!: (value: string) => void;
  let calls = 0;
  const first = coordinator.run(() => {
    calls += 1;
    return new Promise<string>((resolve) => { resolveFirst = resolve; });
  });
  const overlap = await coordinator.run(async () => {
    calls += 1;
    return "overlap";
  });
  assert.equal(overlap, undefined);
  assert.equal(calls, 1);
  resolveFirst("done");
  assert.equal(await first, "done");
  await assert.rejects(coordinator.run(async () => { throw new Error("RPC failed"); }));
  assert.equal(coordinator.isLoading, false);
});

test("retry replaces a failed read with fresh onchain values", async () => {
  const coordinator = new CreditReadCoordinator();
  await assert.rejects(coordinator.run(async () => { throw new Error("temporary failure"); }));
  const result = await coordinator.run(async () => "fresh", true);
  assert.equal(result, "fresh");
  assert.equal(coordinator.isLoading, false);
});
