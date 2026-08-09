import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { decodeFunctionData, getAddress } from "viem";
import type { BrowserEthereumProvider } from "../src/lib/arc/network.ts";
import { withinEmployeeCreditAbi } from "../src/lib/contracts/within-employee-credit-abi.ts";
import {
  EMPLOYEE_CREDIT_LIMIT,
  createEmployeeCreditEvidence,
  employeeCreditStateAfterSubmissionError,
  employeeCreditRepaymentStep,
  isEmployeeCreditConfirmationEnabled,
  nextEmployeeCreditInstalment,
  prepareEmployeeCreditApproval,
  prepareEmployeeCreditDraw,
  prepareEmployeeCreditFunding,
  prepareEmployeeCreditRepayment,
  readArcLatestBlock,
  readEmployeeCreditAccount,
  readEmployeeCreditAvailable,
  readEmployeeCreditEligibility,
  readEmployeeCreditLimit,
  readEmployeeCreditPool,
  readEmployeeCreditSnapshot,
  recoverEmployeeCreditEvidence,
  restoreEmployeeCreditEvidence,
  submitEmployeeCreditWrite,
  validateEmployeeCreditDraw,
  type EmployeeCreditAccount,
  type EmployeeCreditSnapshot,
} from "../src/lib/credit/employee-credit-client.ts";

const employee = getAddress("0x9ba306481F3e4E719a0152E61AABb54953ec3033");
const other = getAddress("0xCCE679E826618797208BB1Fba4418481d92fAaD0");
const contract = getAddress("0x1234567890123456789012345678901234567890");
const future = BigInt(Math.floor(Date.now() / 1_000) + 86_400);
const inactiveAccount: EmployeeCreditAccount = {
  outstanding: BigInt(0),
  totalBorrowed: BigInt(0),
  totalRepaid: BigInt(0),
  instalmentAmount: BigInt(0),
  totalInstalments: 0,
  instalmentsPaid: 0,
  firstDueDate: BigInt(0),
  nextDueDate: BigInt(0),
  active: false,
};
const eligibleSnapshot: EmployeeCreditSnapshot = {
  eligible: true,
  account: inactiveAccount,
  availableCredit: EMPLOYEE_CREDIT_LIMIT,
  poolBalance: BigInt(5_000_000_000),
  latestBlock: BigInt(100),
};

function wallet(initialAccount = employee) {
  let selected = initialAccount;
  const methods: string[] = [];
  const provider: BrowserEthereumProvider = {
    request: async ({ method }) => {
      methods.push(method);
      if (method === "eth_chainId") return "0x4CEF52";
      if (method === "eth_accounts") return [selected];
      if (method === "eth_call") return "0x";
      if (method === "eth_estimateGas") return "0x186a0";
      if (method === "eth_gasPrice") return "0x5d21dba00";
      if (method === "eth_sendTransaction") return `0x${"12".repeat(32)}`;
      throw new Error(`Unexpected ${method}`);
    },
  };
  return { provider, methods, select: (account: typeof employee) => { selected = account; } };
}

test("old Company Credit page is archived and the Employee Credit page is rendered", async () => {
  const source = await readFile(new URL("../src/components/within-app.tsx", import.meta.url), "utf8");
  assert.match(source, /<EmployeeCreditPage(?: key=\{walletSessionVersion\})? \/>/);
  assert.doesNotMatch(source, /<SimpleArcCreditPage \/>/);
  const page = await readFile(new URL("../src/components/employee-credit-page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /demoState|Request funds|approveAndDisburse|multisig/i);
  assert.doesNotMatch(page, /full-page|Loading onchain state/);
  assert.doesNotMatch(page, /Your credit limit/);
  assert.match(page, /grid grid-cols-3 divide-x/);
  assert.match(page, /This wallet is not eligible for Employee Credit\. Eligibility is managed onchain by the company\./);
  assert.match(page, /disabled=\{!snapshot\?\.eligible\|\|active\|\|snapshot\.poolBalance===BigInt\(0\)\}/);
  assert.match(page, /process\.env\.NODE_ENV === "development" && <details/);
  assert.match(page, /Arc read diagnostics/);
});

test("initial snapshot performs only the five required reads", async () => {
  const calls: string[] = [];
  const client = {
    async getBlockNumber() { calls.push("eth_blockNumber"); return BigInt(101); },
    async getTransactionReceipt() { throw new Error("not used"); },
    async readContract(args: Record<string, unknown>) {
      const method = String(args.functionName);
      calls.push(method);
      if (method === "isEmployeeEligible") return true;
      if (method === "getCreditAccount") return inactiveAccount;
      if (method === "availableCredit") return EMPLOYEE_CREDIT_LIMIT;
      if (method === "poolBalance") return BigInt(5_000_000_000);
      throw new Error(`Unexpected ${method}`);
    },
  };
  const snapshot = await readEmployeeCreditSnapshot(employee, client, contract);
  assert.deepEqual(calls, ["isEmployeeEligible", "getCreditAccount", "availableCredit", "poolBalance", "eth_blockNumber"]);
  assert.equal(snapshot.availableCredit, EMPLOYEE_CREDIT_LIMIT);
});

test("public credit reads remain independent and preserve valid zero values", async () => {
  const calls: string[] = [];
  const client = {
    async getChainId() { return 5_042_002; },
    async getBlockNumber() { calls.push("eth_blockNumber"); return BigInt(53_963_526); },
    async getTransactionReceipt() { throw new Error("not used"); },
    async readContract(args: Record<string, unknown>) {
      const method = String(args.functionName);
      calls.push(method);
      if (method === "isEmployeeEligible") return true;
      if (method === "availableCredit") return EMPLOYEE_CREDIT_LIMIT;
      if (method === "getCreditAccount") return inactiveAccount;
      if (method === "poolBalance") return BigInt(0);
      if (method === "MAX_CREDIT_LIMIT") return EMPLOYEE_CREDIT_LIMIT;
      throw new Error(`Unexpected ${method}`);
    },
  };

  assert.equal(await readEmployeeCreditEligibility(employee, client, contract), true);
  assert.equal(await readEmployeeCreditAvailable(employee, client, contract), EMPLOYEE_CREDIT_LIMIT);
  assert.deepEqual(await readEmployeeCreditAccount(employee, client, contract), inactiveAccount);
  assert.equal(await readEmployeeCreditPool(client, contract), BigInt(0));
  assert.equal(await readEmployeeCreditLimit(client, contract), EMPLOYEE_CREDIT_LIMIT);
  assert.equal(await readArcLatestBlock(client), BigInt(53_963_526));
  assert.deepEqual(calls, [
    "isEmployeeEligible",
    "availableCredit",
    "getCreditAccount",
    "poolBalance",
    "MAX_CREDIT_LIMIT",
    "eth_blockNumber",
  ]);
});

test("one failed credit read cannot hide successful public fields", async () => {
  const client = {
    async getChainId() { return 5_042_002; },
    async getBlockNumber() { return BigInt(53_963_526); },
    async getTransactionReceipt() { throw new Error("not used"); },
    async readContract(args: Record<string, unknown>) {
      if (args.functionName === "availableCredit") throw new Error("request limit reached");
      if (args.functionName === "poolBalance") return BigInt(0);
      if (args.functionName === "getCreditAccount") return inactiveAccount;
      throw new Error("not used");
    },
  };

  await assert.rejects(readEmployeeCreditAvailable(employee, client, contract), /request limit reached/);
  assert.equal(await readEmployeeCreditPool(client, contract), BigInt(0));
  assert.equal((await readEmployeeCreditAccount(employee, client, contract)).outstanding, BigInt(0));
  assert.equal(await readArcLatestBlock(client), BigInt(53_963_526));
});

test("eligibility, maximum limit, and pool liquidity gate credit preparation", () => {
  assert.throws(() => validateEmployeeCreditDraw("750", 3, future, { ...eligibleSnapshot, eligible: false }), /not eligible/);
  assert.throws(() => validateEmployeeCreditDraw("2000.000001", 3, future, eligibleSnapshot), /up to 2,000/);
  assert.throws(() => validateEmployeeCreditDraw("750", 3, future, { ...eligibleSnapshot, poolBalance: BigInt(1) }), /liquidity/);
  assert.equal(validateEmployeeCreditDraw("750", 3, future, eligibleSnapshot).instalmentAmount, BigInt(250_000_000));
});

test("eligible employee preparation encodes drawCredit and performs no write", async () => {
  const mock = wallet();
  const prepared = await prepareEmployeeCreditDraw(mock.provider, "750", 3, future, eligibleSnapshot, contract);
  const decoded = decodeFunctionData({ abi: withinEmployeeCreditAbi, data: prepared.data });
  assert.equal(decoded.functionName, "drawCredit");
  assert.deepEqual(decoded.args, [BigInt(750_000_000), 3, future]);
  assert.equal(mock.methods.includes("eth_sendTransaction"), false);
});

test("pool funding prepares an ERC-20 transfer of 5 USDC with zero native value", async () => {
  const methods: Array<{ method: string; params?: unknown[] }> = [];
  const provider: BrowserEthereumProvider = {
    request: async ({ method, params }) => {
      methods.push({ method, params });
      if (method === "eth_chainId") return "0x4CEF52";
      if (method === "eth_accounts") return [other];
      if (method === "eth_call") {
        const transaction = (params?.[0] ?? {}) as { data?: string };
        if (transaction.data?.startsWith("0x70a08231")) return `0x${BigInt(100_000_000).toString(16).padStart(64, "0")}`;
        return `0x${BigInt(1).toString(16).padStart(64, "0")}`;
      }
      if (method === "eth_estimateGas") return "0x186a0";
      if (method === "eth_gasPrice") return "0x5d21dba00";
      if (method === "eth_getBalance") return "0x21e19e0c9bab2400000";
      throw new Error(`Unexpected ${method}`);
    },
  };

  const prepared = await prepareEmployeeCreditFunding(provider, "5", contract);
  const tokenDecoded = decodeFunctionData({ abi: [
    { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  ] as const, data: prepared.data });
  assert.equal(tokenDecoded.functionName, "transfer");
  assert.deepEqual(tokenDecoded.args, [contract, BigInt(5_000_000)]);
  assert.equal(prepared.rawAmount, BigInt(5_000_000));
  assert.equal(prepared.contract, getAddress("0x3600000000000000000000000000000000000000"));
  const simulation = methods.find(({ method }) => method === "eth_call");
  assert.deepEqual((simulation?.params?.[0] as { to: string; value: string }), {
    from: other,
    to: getAddress("0x3600000000000000000000000000000000000000"),
    data: prepared.data,
    value: "0x0",
  });
  assert.equal(methods.some(({ method }) => method === "eth_sendTransaction"), false);
});

test("explicit confirmation writes exactly once and account changes block submission", async () => {
  const mock = wallet();
  const prepared = await prepareEmployeeCreditDraw(mock.provider, "750", 3, future, eligibleSnapshot, contract);
  await submitEmployeeCreditWrite(mock.provider, prepared);
  assert.equal(mock.methods.filter((method) => method === "eth_sendTransaction").length, 1);

  const changed = wallet();
  const reviewed = await prepareEmployeeCreditDraw(changed.provider, "750", 3, future, eligibleSnapshot, contract);
  changed.select(other);
  await assert.rejects(submitEmployeeCreditWrite(changed.provider, reviewed), /account changed/);
  assert.equal(changed.methods.filter((method) => method === "eth_sendTransaction").length, 0);
});

test("prepared credit without a hash enables confirmation and a submitted hash disables it", () => {
  assert.equal(isEmployeeCreditConfirmationEnabled({
    state: "prepared",
    hasPreparedTransaction: true,
    isSubmitting: false,
    transactionHash: null,
    preparationIsCurrent: true,
  }), true);
  assert.equal(isEmployeeCreditConfirmationEnabled({
    state: "submitted",
    hasPreparedTransaction: true,
    isSubmitting: false,
    transactionHash: `0x${"56".repeat(32)}`,
    preparationIsCurrent: true,
  }), false);
});

test("stale submission without a real hash is discarded and wallet cancellation returns to prepared", () => {
  const stale = JSON.stringify({
    kind: "draw",
    transactionHash: "",
    sender: employee,
    submittedAt: new Date().toISOString(),
    rawAmount: "1000000",
    status: "submitted",
    blockNumber: null,
  });
  assert.equal(restoreEmployeeCreditEvidence(stale), null);
  assert.equal(employeeCreditStateAfterSubmissionError({ code: 4001 }, null), "prepared");
  assert.equal(employeeCreditStateAfterSubmissionError(new Error("RPC unavailable"), null), "failed");
});

test("opening a new credit form clears the current transaction boundary", async () => {
  const page = await readFile(new URL("../src/components/employee-credit-page.tsx", import.meta.url), "utf8");
  assert.match(page, /setDrawer\("draw"\);setReviewed\(false\);setPrepared\(null\);setTransactionState\("idle"\);setCurrentTransactionHash\(null\)/);
  assert.doesNotMatch(page, /disabled=\{evidence\?\.status===["']submitted["']\}/);
});

test("USDC approval and repayment are separate prepared transactions", async () => {
  const account = { ...inactiveAccount, active: true, outstanding: BigInt(750_000_000), instalmentAmount: BigInt(250_000_000), totalInstalments: 3 };
  const approvalWallet = wallet();
  const approval = await prepareEmployeeCreditApproval(approvalWallet.provider, nextEmployeeCreditInstalment(account), contract);
  const repaymentWallet = wallet();
  const repayment = await prepareEmployeeCreditRepayment(repaymentWallet.provider, account, contract);
  assert.equal(approval.kind, "approve");
  assert.equal(repayment.kind, "repay");
  assert.notEqual(approval.contract, repayment.contract);
  assert.equal(approvalWallet.methods.includes("eth_sendTransaction"), false);
  assert.equal(repaymentWallet.methods.includes("eth_sendTransaction"), false);
});

test("active credit uses one shared account, allows early repayment, and calculates the next amount", async () => {
  const futureAccount = {
    ...inactiveAccount,
    active: true,
    outstanding: BigInt(15_000_000),
    instalmentAmount: BigInt(5_000_000),
    totalInstalments: 3,
    nextDueDate: future + BigInt(2_592_000),
  };
  assert.equal(nextEmployeeCreditInstalment(futureAccount), BigInt(5_000_000));
  assert.equal(employeeCreditRepaymentStep(futureAccount, BigInt(0)), "approve");
  assert.equal(employeeCreditRepaymentStep(futureAccount, BigInt(5_000_000)), "repay");
  await prepareEmployeeCreditRepayment(wallet().provider, futureAccount, contract);

  const finalAccount = { ...futureAccount, outstanding: BigInt(3_000_000) };
  assert.equal(nextEmployeeCreditInstalment(finalAccount), BigInt(3_000_000));

  const page = await readFile(new URL("../src/components/employee-credit-page.tsx", import.meta.url), "utf8");
  assert.match(page, /creditAccount\.value\?\.active&&creditAccount\.value\.outstanding>BigInt\(0\)/);
  assert.doesNotMatch(page, /snapshot\?\.account\.active/);
  assert.match(page, /You can repay this instalment early/);
});

test("approval and repayment writes each revalidate the live account and submit once", async () => {
  const liveAccount = {
    ...inactiveAccount,
    active: true,
    outstanding: BigInt(15_000_000),
    instalmentAmount: BigInt(5_000_000),
    totalInstalments: 3,
  };
  const client = {
    async getChainId() { return 5_042_002; },
    async getBlockNumber() { return BigInt(1); },
    async getTransactionReceipt() { throw new Error("not used"); },
    async readContract(args: Record<string, unknown>) {
      if (args.functionName === "getCreditAccount") return liveAccount;
      throw new Error("Unexpected read");
    },
  };
  const approvalWallet = wallet();
  const approval = await prepareEmployeeCreditApproval(approvalWallet.provider, BigInt(5_000_000), contract);
  await submitEmployeeCreditWrite(approvalWallet.provider, approval, client);
  assert.equal(approvalWallet.methods.filter((method) => method === "eth_sendTransaction").length, 1);

  const repaymentWallet = wallet();
  const repayment = await prepareEmployeeCreditRepayment(repaymentWallet.provider, liveAccount, contract);
  await submitEmployeeCreditWrite(repaymentWallet.provider, repayment, client);
  assert.equal(repaymentWallet.methods.filter((method) => method === "eth_sendTransaction").length, 1);
});

test("repayment is unavailable without active credit and final account state closes", async () => {
  await assert.rejects(prepareEmployeeCreditRepayment(wallet().provider, inactiveAccount, contract), /No active/);
  const final = { ...inactiveAccount, totalBorrowed: BigInt(750_000_000), totalRepaid: BigInt(750_000_000) };
  assert.equal(final.active, false);
  assert.equal(final.outstanding, BigInt(0));
  assert.equal(employeeCreditRepaymentStep(final, BigInt(1_000_000)), "unavailable");
});

test("hash persistence and receipt retry never fabricate or resubmit", async () => {
  const mock = wallet();
  const prepared = await prepareEmployeeCreditDraw(mock.provider, "750", 3, future, eligibleSnapshot, contract);
  const transactionHash = `0x${"34".repeat(32)}` as const;
  const evidence = createEmployeeCreditEvidence(prepared, transactionHash);
  assert.equal(evidence.transactionHash, transactionHash);
  assert.deepEqual(restoreEmployeeCreditEvidence(JSON.stringify(evidence)), evidence);
  assert.equal(restoreEmployeeCreditEvidence(JSON.stringify({ ...evidence, transactionHash: "fake" })), null);

  const receiptMethods: string[] = [];
  const client = {
    async getBlockNumber() { return BigInt(1); },
    async readContract() { throw new Error("not used"); },
    async getTransactionReceipt() {
      receiptMethods.push("eth_getTransactionReceipt");
      return { status: "success", blockNumber: BigInt(777), logs: [] };
    },
  };
  const confirmed = await recoverEmployeeCreditEvidence(evidence, client as never);
  assert.equal(confirmed.blockNumber, "777");
  assert.deepEqual(receiptMethods, ["eth_getTransactionReceipt"]);
  assert.equal(receiptMethods.includes("eth_sendTransaction"), false);
});
