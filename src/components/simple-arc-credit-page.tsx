"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Address, Hash } from "viem";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/components/ui/section-title";
import { restoreBrowserWallet, subscribeWallet } from "@/lib/arc/browser-wallet";
import type { BrowserEthereumProvider } from "@/lib/arc/network";
import { ARC_TESTNET } from "@/lib/arc/network";
import { arcPublicClient } from "@/lib/contracts/arc-contract-clients";
import {
  SIMPLE_CREDIT_CONTRACT,
  SIMPLE_CREDIT_REQUESTS_KEY,
  calculateCreditCapacity,
  confirmOnchainCreditRequest,
  createSubmittedOnchainCreditRequest,
  evaluateDrawdownEligibility,
  latestLoanIsActive,
  mergeVerifiedOnchainRequests,
  prepareSimpleApproval,
  prepareSimpleDrawdown,
  prepareSimpleRepayment,
  readApprovedBorrower,
  readLiveCreditAccount,
  readLiveCreditChain,
  readLatestLoan,
  readRepaymentContext,
  readSimpleCreditField,
  readVerifiedOnchainDrawdowns,
  restoreOnchainCreditRequests,
  simpleUsdc,
  submitSimpleCreditWrite,
  upsertOnchainCreditRequest,
  type LatestLoan,
  type OnchainCreditRequest,
  type PreparedSimpleCreditWrite,
  type SimpleCreditFieldName,
  type VerifiedOnchainDrawdown,
} from "@/lib/credit/simple-credit-client";

type Drawer = "request" | "repay" | null;
type DisplayField = { status: "loading" | "success" | "unavailable"; value: bigint | null; error: string };
type DisplayFields = Record<SimpleCreditFieldName, DisplayField>;
type DrawerField<T> = { status: "idle" | "loading" | "success" | "error"; value: T | null; error: string };
const fieldNames: SimpleCreditFieldName[] = ["facilityBalance", "creditLimit", "availableCredit", "outstandingPrincipal", "latestBlock"];
const CREDIT_OVERVIEW_CACHE_KEY = "within:arc-credit-overview:v1";
const initialFields = (): DisplayFields => ({
  facilityBalance: { status: "loading", value: null, error: "" },
  creditLimit: { status: "loading", value: null, error: "" },
  availableCredit: { status: "loading", value: null, error: "" },
  outstandingPrincipal: { status: "loading", value: null, error: "" },
  latestBlock: { status: "loading", value: null, error: "" },
});
const inputClass = "mt-2 h-10 w-full rounded-lg border border-border bg-white px-3 text-[11px] outline-none focus:border-accent";

export function SimpleArcCreditPage() {
  const [fields, setFields] = useState<DisplayFields>(initialFields);
  const [onchainRequests, setOnchainRequests] = useState<OnchainCreditRequest[]>([]);
  const [verifiedDrawdowns, setVerifiedDrawdowns] = useState<VerifiedOnchainDrawdown[]>([]);
  const [historyStatus, setHistoryStatus] = useState<"loading" | "success" | "error">("loading");
  const [lastSuccessfulRead, setLastSuccessfulRead] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [provider, setProvider] = useState<BrowserEthereumProvider | null>(null);
  const [borrower, setBorrower] = useState<Address | null>(null);
  const [connectedAccount, setConnectedAccount] = useState<Address | null>(null);
  const [connectedChainId, setConnectedChainId] = useState<string | null>(null);
  const [borrowerRead, setBorrowerRead] = useState<DrawerField<Address>>({ status: "idle", value: null, error: "" });
  const [requestAvailable, setRequestAvailable] = useState<DrawerField<bigint>>({ status: "idle", value: null, error: "" });
  const [requestFacility, setRequestFacility] = useState<DrawerField<bigint>>({ status: "idle", value: null, error: "" });
  const [latestLoan, setLatestLoan] = useState<LatestLoan | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [allowance, setAllowance] = useState<bigint | null>(null);
  const [amount, setAmount] = useState("750");
  const [termDays, setTermDays] = useState(90);
  const [purpose, setPurpose] = useState("Software procurement");
  const [prepared, setPrepared] = useState<PreparedSimpleCreditWrite | null>(null);
  const [hash, setHash] = useState<Hash | null>(null);
  const [message, setMessage] = useState("");
  const [overviewRefreshing, setOverviewRefreshing] = useState(false);
  const overviewRunning = useRef(false);
  const submitting = useRef(false);
  const recoveryRunning = useRef(new Set<Hash>());
  const historyRunning = useRef(false);

  const storeRequest = useCallback((record: OnchainCreditRequest) => {
    setOnchainRequests((current) => {
      const next = upsertOnchainCreditRequest(current, record);
      sessionStorage.setItem(SIMPLE_CREDIT_REQUESTS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const refreshRequestHistory = useCallback(async () => {
    if (historyRunning.current) return;
    historyRunning.current = true;
    setHistoryStatus("loading");
    try {
      const verified = await readVerifiedOnchainDrawdowns();
      setVerifiedDrawdowns(verified);
      setOnchainRequests((current) => {
        const next = mergeVerifiedOnchainRequests(current, verified);
        sessionStorage.setItem(SIMPLE_CREDIT_REQUESTS_KEY, JSON.stringify(next));
        return next;
      });
      setHistoryStatus("success");
    } catch {
      setHistoryStatus("error");
    } finally {
      historyRunning.current = false;
    }
  }, []);

  const recoverRequest = useCallback(async (record: OnchainCreditRequest, announce = false) => {
    if (recoveryRunning.current.has(record.transactionHash)) return;
    recoveryRunning.current.add(record.transactionHash);
    try {
      const confirmed = await confirmOnchainCreditRequest(record);
      storeRequest(confirmed);
      if (announce) setMessage("Request recorded on Arc Testnet.");
    } catch {
      storeRequest({ ...record, confirmationUnavailable: true });
      if (announce) setMessage("Request submitted — confirmation temporarily unavailable.");
    } finally {
      recoveryRunning.current.delete(record.transactionHash);
    }
  }, [storeRequest]);

  const refreshFields = useCallback(async (names: SimpleCreditFieldName[]) => {
    if (overviewRunning.current) return;
    overviewRunning.current = true;
    setOverviewRefreshing(true);
    setFields((current) => {
      const next = { ...current };
      for (const name of names) {
        if (next[name].status !== "success") next[name] = { ...next[name], status: "loading", error: "" };
      }
      return next;
    });
    try {
      const settled = await Promise.allSettled(names.map((name) => readSimpleCreditField(name, undefined, 4_000)));
      settled.forEach((settledResult, index) => {
        const name = names[index];
        try {
          const result = settledResult.status === "fulfilled"
            ? settledResult.value
            : { status: "error" as const, value: null, message: settledResult.reason instanceof Error ? settledResult.reason.message : String(settledResult.reason) };
          setFields((current) => ({
            ...current,
            [name]: result.status === "success"
              ? { status: "success", value: result.value, error: "" }
              : { status: "unavailable", value: null, error: result.message },
          }));
          if (result.status === "success") setLastSuccessfulRead(new Date().toISOString());
        } finally {
          setFields((current) => current[name].status === "loading"
            ? { ...current, [name]: { status: "unavailable", value: null, error: "Arc read did not complete." } }
            : current);
        }
      });
    } finally {
      overviewRunning.current = false;
      setOverviewRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let cachedFields: Partial<Record<SimpleCreditFieldName, string>> = {};
    try {
      cachedFields = JSON.parse(sessionStorage.getItem(CREDIT_OVERVIEW_CACHE_KEY) || "{}") as Partial<Record<SimpleCreditFieldName, string>>;
    } catch {
      sessionStorage.removeItem(CREDIT_OVERVIEW_CACHE_KEY);
    }
    const restoredRequests = restoreOnchainCreditRequests(sessionStorage.getItem(SIMPLE_CREDIT_REQUESTS_KEY));
    queueMicrotask(() => {
      setFields((current) => {
        const next = { ...current };
        for (const name of fieldNames) if (cachedFields[name] && /^\d+$/.test(cachedFields[name]!)) next[name] = { status: "success", value: BigInt(cachedFields[name]!), error: "" };
        return next;
      });
      setOnchainRequests(restoredRequests);
      for (const request of restoredRequests) {
        void recoverRequest(request);
      }
      void refreshRequestHistory();
    });
    void refreshFields(fieldNames);
  }, [recoverRequest, refreshFields, refreshRequestHistory]);
  useEffect(() => {
    const cached = Object.fromEntries(fieldNames.flatMap((name) => fields[name].status === "success" && fields[name].value !== null ? [[name, fields[name].value.toString()]] : []));
    sessionStorage.setItem(CREDIT_OVERVIEW_CACHE_KEY, JSON.stringify(cached));
  }, [fields]);
  useEffect(() => {
    if (!provider || drawer !== "request") return;
    return subscribeWallet(
      provider,
      { address: connectedAccount, chainId: connectedChainId },
      (next) => {
        setConnectedAccount(next.address as Address | null);
        setConnectedChainId(next.chainId);
        setPrepared(null);
        setHash(null);
        setMessage(next.address ? "MetaMask account changed. Prepare the transaction again." : "");
      },
    );
  // Listener ownership follows only the selected provider and drawer lifecycle.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawer, provider]);

  async function loadRequestDetails() {
    setDrawerLoading(true);
    setBorrowerRead({ status: "loading", value: null, error: "" });
    setRequestAvailable({ status: "loading", value: null, error: "" });
    setRequestFacility({ status: "loading", value: null, error: "" });
    try {
      const wallet = await restoreBrowserWallet();
      setProvider(wallet?.provider ?? null);
      if (wallet?.provider) {
        const accountResult = await readLiveCreditAccount(wallet.provider);
        setConnectedAccount(accountResult.status === "success" ? accountResult.value : null);
        const chainResult = await readLiveCreditChain(wallet.provider);
        setConnectedChainId(chainResult.status === "success" ? chainResult.value : null);
      } else {
        setConnectedAccount(null);
        setConnectedChainId(null);
      }

      const overviewWaitStarted = Date.now();
      while (overviewRunning.current && Date.now() - overviewWaitStarted < 8_000) {
        await new Promise((resolve) => window.setTimeout(resolve, 100));
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1_200));
      const borrowerResult = await readApprovedBorrower();
      setBorrowerRead(borrowerResult.status === "success"
        ? { status: "success", value: borrowerResult.value, error: "" }
        : { status: "error", value: null, error: borrowerResult.message });
      setBorrower(borrowerResult.status === "success" ? borrowerResult.value : null);

      await new Promise((resolve) => window.setTimeout(resolve, 1_200));
      const availableResult = await readSimpleCreditField("availableCredit");
      setRequestAvailable(availableResult.status === "success"
        ? { status: "success", value: availableResult.value, error: "" }
        : { status: "error", value: null, error: availableResult.message });

      await new Promise((resolve) => window.setTimeout(resolve, 1_200));
      const facilityResult = await readSimpleCreditField("facilityBalance");
      setRequestFacility(facilityResult.status === "success"
        ? { status: "success", value: facilityResult.value, error: "" }
        : { status: "error", value: null, error: facilityResult.message });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Drawer read failed.";
      setBorrowerRead((current) => current.status === "loading" ? { status: "error", value: null, error: detail } : current);
      setRequestAvailable((current) => current.status === "loading" ? { status: "error", value: null, error: detail } : current);
      setRequestFacility((current) => current.status === "loading" ? { status: "error", value: null, error: detail } : current);
    } finally {
      setDrawerLoading(false);
    }
  }

  async function openRequest() {
    setDrawer("request"); setPrepared(null); setHash(null); setMessage("");
    await loadRequestDetails();
  }

  async function openRepayment() {
    setDrawer("repay"); setDrawerLoading(true); setPrepared(null); setHash(null); setMessage("");
    try {
      const wallet = await restoreBrowserWallet();
      if (!wallet?.provider || !wallet.address) throw new Error("Connect MetaMask first.");
      const context = await readRepaymentContext();
      setProvider(wallet.provider);
      setBorrower(context.borrower);
      setLatestLoan(context.loan);
      setBalance(context.balance);
      setAllowance(context.allowance);
      if (wallet.address.toLowerCase() !== context.borrower.toLowerCase()) throw new Error("Connected MetaMask account is not the approved borrower.");
      if (!latestLoanIsActive(context.loan)) setMessage("No active onchain loan available for repayment.");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "";
      setMessage(detail.startsWith("Connect MetaMask") || detail.includes("approved borrower") ? detail : "Repayment details are temporarily unavailable.");
    } finally {
      setDrawerLoading(false);
    }
  }

  async function prepareRequest() {
    if (!provider || !borrower || !canPrepareRequest) return;
    try {
      const next = await prepareSimpleDrawdown(provider, amount, termDays, purpose);
      if (next.sender.toLowerCase() !== borrower.toLowerCase()) throw new Error("Connected MetaMask account is not the approved borrower.");
      setPrepared(next);
      setMessage("Prepared — not submitted.");
    } catch (error) {
      setPrepared(null);
      setMessage(error instanceof Error ? error.message : "Request preparation failed.");
    }
  }

  async function prepareRepayment() {
    if (!provider || !latestLoanIsActive(latestLoan) || !latestLoan) return;
    try {
      const rawAmount = BigInt(Math.round(Number(amount) * 1_000_000));
      if (rawAmount <= BigInt(0) || rawAmount > latestLoan.outstandingPrincipal) throw new Error("Enter an amount up to the outstanding principal.");
      if ((balance ?? BigInt(0)) < rawAmount) throw new Error("Borrower USDC balance is insufficient.");
      const next = (allowance ?? BigInt(0)) < rawAmount
        ? await prepareSimpleApproval(provider, amount)
        : await prepareSimpleRepayment(provider, latestLoan.id, amount);
      setPrepared(next);
      setMessage(next.kind === "approve" ? "USDC approval prepared. Repayment will remain a separate transaction." : "Repayment prepared. Review before confirming in MetaMask.");
    } catch (error) {
      setPrepared(null);
      setMessage(error instanceof Error ? error.message : "Repayment preparation failed.");
    }
  }

  async function confirmPrepared() {
    if (!provider || !prepared || submitting.current || hash) return;
    submitting.current = true;
    try {
      const previousPrincipal = latestLoan?.outstandingPrincipal ?? null;
      const transactionHash = await submitSimpleCreditWrite(provider, prepared);
      setHash(transactionHash);
      if (prepared.kind === "request") {
        const request = createSubmittedOnchainCreditRequest(prepared, purpose, transactionHash);
        storeRequest(request);
        setMessage("Request submitted — awaiting confirmation.");
        await recoverRequest(request, true);
        await refreshRequestHistory();
        await refreshFields(fieldNames);
        return;
      }

      setMessage("Transaction submitted. Waiting for Arc Testnet.");
      const receipt = await arcPublicClient.waitForTransactionReceipt({ hash: transactionHash, timeout: 90_000 });
      if (receipt.status !== "success") throw new Error("The Arc transaction reverted.");

      if (prepared.kind === "approve" && latestLoan) {
        const context = await readRepaymentContext();
        setAllowance(context.allowance);
        setBalance(context.balance);
        const repayment = await prepareSimpleRepayment(provider, latestLoan.id, amount);
        setPrepared(repayment);
        setHash(null);
        setMessage("USDC approval confirmed. Repayment prepared as a separate transaction.");
      } else if (prepared.kind === "repay" && latestLoan) {
        const updated = await readLatestLoan();
        setLatestLoan(updated);
        if (!updated || previousPrincipal === null || updated.outstandingPrincipal >= previousPrincipal) throw new Error("Repayment receipt succeeded, but outstanding principal did not change.");
        setMessage("Repayment confirmed on Arc Testnet.");
      }
      await refreshFields(fieldNames);
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? Number(error.code) : null;
      if (code === 4001 && !hash) {
        setMessage("Wallet confirmation cancelled — no transaction submitted.");
      } else {
        setMessage(error instanceof Error ? error.message : "Transaction confirmation failed.");
      }
    } finally {
      submitting.current = false;
    }
  }

  const displayField = (key: SimpleCreditFieldName, format: (value: bigint) => string) => {
    const entry = fields[key];
    if (entry.status === "loading") return "Loading…";
    return entry.status === "success" && entry.value !== null ? format(entry.value) : "Unavailable";
  };
  const failedFields = fieldNames.filter((name) => fields[name].status === "unavailable");
  const anyLoading = fieldNames.some((name) => fields[name].status === "loading");
  const contractAvailableCredit = fields.availableCredit.status === "success" ? fields.availableCredit.value : null;
  const capacity = contractAvailableCredit !== null && historyStatus === "success"
    ? calculateCreditCapacity(contractAvailableCredit, verifiedDrawdowns)
    : null;
  const borrowerAuthorised = Boolean(
    borrowerRead.status === "success"
    && borrowerRead.value
    && connectedAccount
    && borrowerRead.value.toLowerCase() === connectedAccount.toLowerCase(),
  );
  const eligibility = evaluateDrawdownEligibility({
    approvedBorrower: borrowerRead.status === "success" ? borrowerRead.value : null,
    connectedAccount,
    chainId: connectedChainId,
    availableCredit: requestAvailable.status === "success" && historyStatus === "success"
      ? calculateCreditCapacity(requestAvailable.value!, verifiedDrawdowns).effectiveAvailableToRequest
      : null,
    amount,
    termDays,
    purpose,
  });
  const canPrepareRequest = Boolean(provider && borrowerAuthorised && borrowerRead.status === "success" && historyStatus === "success" && eligibility.enabled);
  const requestGuidance = borrowerRead.status === "error" || requestAvailable.status === "error" || historyStatus === "error"
    ? "Borrower details are temporarily unavailable."
    : eligibility.message;

  const reviewRows = prepared ? [
    ["Sender", prepared.sender],
    ["Contract", prepared.contract],
    ["Function", prepared.functionName],
    ["Raw amount", prepared.rawAmount.toString()],
    ["Gas estimate", prepared.gas.toString()],
    ["Estimated cost", prepared.estimatedCost],
  ] : [];

  return <div className="mx-auto max-w-[1120px]">
    <div className="flex items-start justify-between">
      <SectionTitle title="Company Credit" description="Minimal live credit state on Arc Testnet."/>
      <div className="flex gap-3">
        <Button onClick={()=>void Promise.all([refreshFields(fieldNames),refreshRequestHistory()])} disabled={overviewRefreshing||historyStatus==="loading"}>{overviewRefreshing||historyStatus==="loading"?"Refreshing…":"Refresh onchain state"}</Button>
        <Button onClick={()=>void openRepayment()}>Make repayment</Button>
        <Button variant="primary" onClick={()=>void openRequest()}>Request funds</Button>
      </div>
    </div>
    {failedFields.length>0&&<div className="mt-9 text-[10px] text-muted"><div className="flex items-center gap-4"><span>Some Arc values are unavailable.</span><Button onClick={()=>void refreshFields(failedFields)} disabled={anyLoading}>Retry</Button></div>{process.env.NODE_ENV==="development"&&<details className="mt-4 border-t border-border pt-4 text-[9px] text-faint"><summary className="cursor-pointer text-ink">Developer read details</summary><dl className="mt-3 grid grid-cols-[180px_1fr] gap-x-5 gap-y-2"><dt>facilityBalance error</dt><dd className="break-all">{fields.facilityBalance.error||"None"}</dd><dt>totalOutstandingPrincipal error</dt><dd className="break-all">{fields.outstandingPrincipal.error||"None"}</dd><dt>RPC provider</dt><dd className="break-all">{ARC_TESTNET.rpcUrl}</dd><dt>Last successful read</dt><dd>{lastSuccessfulRead?new Date(lastSuccessfulRead).toLocaleString():"None"}</dd></dl></details>}</div>}
    <section className="mt-14 grid grid-cols-4 divide-x divide-border border-y border-border py-8">
      {[
        ["Credit limit",displayField("creditLimit",simpleUsdc)],
        ["Pending requests",historyStatus==="loading"?"Loading…":historyStatus==="error"?"Unavailable":simpleUsdc(capacity?.reservedPendingAmount??BigInt(0))],
        ["Available to request",historyStatus==="loading"?"Loading…":historyStatus==="error"||capacity===null?"Unavailable":simpleUsdc(capacity.effectiveAvailableToRequest)],
        ["Outstanding principal",displayField("outstandingPrincipal",simpleUsdc)],
      ].map(([label,value],index)=><div key={label} className={index===0?"pr-8":"px-8"}><p className="text-[9px] text-muted">{label}</p><p className="mt-3 text-[17px]">{value}</p></div>)}
    </section>
    <dl className="mt-12 divide-y divide-border border-y border-border text-[10px]">
      <div className="flex justify-between py-4"><dt className="text-muted">Network</dt><dd>Arc Testnet</dd></div>
      <div className="flex justify-between py-4"><dt className="text-muted">Facility balance</dt><dd>{displayField("facilityBalance",simpleUsdc)}</dd></div>
      <div className="flex justify-between py-4"><dt className="text-muted">Latest block</dt><dd>{displayField("latestBlock",(value)=>value.toString())}</dd></div>
      <div className="flex justify-between gap-8 py-4"><dt className="text-muted">Credit contract</dt><dd className="break-all text-right">{SIMPLE_CREDIT_CONTRACT}</dd></div>
      {process.env.NODE_ENV==="development"&&<div className="flex justify-between py-4"><dt className="text-muted">Contract available credit</dt><dd>{displayField("availableCredit",simpleUsdc)}</dd></div>}
    </dl>
    <section className="mt-20">
      <div className="flex items-end justify-between">
        <div><h2 className="text-[26px] tracking-[-0.03em]">Onchain requests</h2><p className="mt-2 text-[10px] text-muted">Drawdown requests recorded through the credit contract.</p></div>
      </div>
      {onchainRequests.length === 0
        ? <p className="mt-8 border-t border-border py-8 text-[10px] text-muted">No onchain requests recorded in this browser yet.</p>
        : <div className="mt-8 divide-y divide-border border-y border-border">
          {onchainRequests.map((request) => {
            const status = request.status === "confirmed"
              ? "Request recorded on Arc Testnet"
              : request.confirmationUnavailable
                ? "Request submitted — confirmation temporarily unavailable"
                : "Request submitted · Awaiting confirmation";
            const contractStatus = request.contractStatus === 1 ? "Pending" : request.contractStatus === 2 ? "Cancelled" : request.contractStatus === 3 ? "Disbursed" : request.status === "submitted" ? "Submitted" : "Recorded";
            return <article key={request.transactionHash} className="py-7">
              <div className="flex items-start justify-between gap-8">
                <div><p className="text-[13px]">{status}</p><p className="mt-2 text-[10px] text-muted">{simpleUsdc(BigInt(request.amount))} · {request.termDays} days · {contractStatus}</p></div>
                {request.status === "submitted"&&<Button onClick={()=>void recoverRequest(request)}>Check status</Button>}
              </div>
              <dl className="mt-6 grid grid-cols-2 gap-x-12 gap-y-4 text-[10px]">
                <div><dt className="text-muted">Request ID</dt><dd className="mt-1">{request.requestId??"Awaiting event"}</dd></div>
                <div><dt className="text-muted">Block number</dt><dd className="mt-1">{request.blockNumber??"Awaiting confirmation"}</dd></div>
                <div><dt className="text-muted">Purpose</dt><dd className="mt-1">{request.purpose||request.purposeHash}</dd></div>
                <div><dt className="text-muted">Purpose hash</dt><dd className="mt-1 break-all">{request.purposeHash}</dd></div>
                <div><dt className="text-muted">Borrower</dt><dd className="mt-1 break-all">{request.borrower??"Awaiting contract read"}</dd></div>
                <div><dt className="text-muted">Transaction</dt><dd className="mt-1 break-all"><a className="text-accent" href={`${ARC_TESTNET.explorerUrl}/tx/${request.transactionHash}`} target="_blank" rel="noreferrer">{request.transactionHash}</a></dd></div>
              </dl>
              {fields.facilityBalance.status==="success"&&fields.facilityBalance.value===BigInt(0)&&<p className="mt-5 text-[10px] text-muted">Request can be recorded, but disbursement requires facility liquidity.</p>}
            </article>;
          })}
        </div>}
    </section>
    {drawer&&<><button aria-label="Close credit drawer" className="fixed inset-y-0 left-[224px] right-0 top-[72px] z-30 bg-ink/10" onClick={()=>setDrawer(null)}/><aside className="fixed bottom-0 right-0 top-[72px] z-40 w-[520px] overflow-y-auto border-l border-border bg-white p-8 shadow-[-24px_0_70px_rgba(23,24,21,.08)]">
      <div className="flex justify-between"><h2 className="text-[28px]">{drawer==="request"?"Request funds":"Make repayment"}</h2><button aria-label="Close drawer" onClick={()=>setDrawer(null)}>×</button></div>
      {drawerLoading?<p className="mt-8 text-[10px] text-muted">Loading onchain details…</p>:<>
        {drawer==="request"&&<><dl className="mt-7 divide-y divide-border border-y border-border text-[10px]"><div className="flex justify-between gap-8 py-4"><dt className="text-muted">Connected wallet</dt><dd className="break-all text-right">{connectedAccount||"Disconnected"}</dd></div><div className="flex justify-between gap-8 py-4"><dt className="text-muted">Required borrower wallet</dt><dd className="break-all text-right">{borrowerRead.value||"Unavailable"}</dd></div><div className="flex justify-between py-4"><dt className="text-muted">Available to request</dt><dd>{requestAvailable.value===null||historyStatus!=="success"?"Unavailable":simpleUsdc(calculateCreditCapacity(requestAvailable.value,verifiedDrawdowns).effectiveAvailableToRequest)}</dd></div><div className="flex justify-between py-4"><dt className="text-muted">Facility balance</dt><dd>{requestFacility.value===null?"Unavailable":simpleUsdc(requestFacility.value)}</dd></div></dl>{requestGuidance&&<div className="mt-5 flex items-center justify-between gap-4"><p className="text-[10px] text-muted">{requestGuidance}</p>{(borrowerRead.status==="error"||requestAvailable.status==="error"||historyStatus==="error")&&<Button onClick={()=>void Promise.all([loadRequestDetails(),refreshRequestHistory()])}>Retry</Button>}</div>}{requestFacility.status==="success"&&requestFacility.value===BigInt(0)&&<p className="mt-5 text-[10px] leading-5 text-muted">The request can be recorded, but disbursement requires facility funding.</p>}</>}
        {drawer==="repay"&&latestLoanIsActive(latestLoan)&&latestLoan&&<dl className="mt-7 divide-y divide-border border-y border-border text-[10px]"><div className="flex justify-between py-4"><dt className="text-muted">Latest loan</dt><dd>#{latestLoan.id}</dd></div><div className="flex justify-between py-4"><dt className="text-muted">Outstanding</dt><dd>{simpleUsdc(latestLoan.outstandingPrincipal)}</dd></div><div className="flex justify-between py-4"><dt className="text-muted">USDC balance</dt><dd>{balance===null?"Unavailable":simpleUsdc(balance)}</dd></div><div className="flex justify-between py-4"><dt className="text-muted">Allowance</dt><dd>{allowance===null?"Unavailable":simpleUsdc(allowance)}</dd></div></dl>}
        <label className="mt-7 block text-[10px] text-muted">Amount in USDC<input className={inputClass} value={amount} onChange={(event)=>{setAmount(event.target.value);setPrepared(null);setHash(null);}}/></label>
        {drawer==="request"&&<><label className="mt-5 block text-[10px] text-muted">Term<select className={inputClass} value={termDays} onChange={(event)=>{setTermDays(Number(event.target.value));setPrepared(null);}}>{[30,90,180,365].map((value)=><option key={value} value={value}>{value} days</option>)}</select></label><label className="mt-5 block text-[10px] text-muted">Purpose<input className={inputClass} value={purpose} onChange={(event)=>{setPurpose(event.target.value);setPrepared(null);}}/></label></>}
        <Button variant="primary" className="mt-7 w-full" onClick={drawer==="request"?prepareRequest:prepareRepayment} disabled={drawer==="request"?!canPrepareRequest||Boolean(hash):!provider||!latestLoanIsActive(latestLoan)||Boolean(hash)}>Prepare {drawer==="request"?"request":"repayment"}</Button>
        {prepared&&<dl className="mt-7 divide-y divide-border border-y border-border text-[10px]">{reviewRows.map(([label,value])=><div key={label} className="grid grid-cols-[120px_1fr] gap-5 py-4"><dt className="text-muted">{label}</dt><dd className="break-all">{value}</dd></div>)}</dl>}
        {prepared&&<Button variant="primary" className="mt-7 w-full" onClick={confirmPrepared} disabled={Boolean(hash)}>Confirm {prepared.kind==="request"?"request":prepared.kind==="approve"?"USDC approval":"repayment"} in wallet</Button>}
        {hash&&<a className="mt-5 block break-all text-[10px] text-accent" href={`${ARC_TESTNET.explorerUrl}/tx/${hash}`} target="_blank" rel="noreferrer">{hash}</a>}
        {message&&<p role="status" className="mt-5 text-[10px] leading-5 text-muted">{message}</p>}
      </>}
    </aside></>}
  </div>;
}
