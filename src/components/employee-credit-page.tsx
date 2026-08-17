"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { Address } from "viem";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/components/ui/section-title";
import { useWallet } from "@/components/wallet-provider";
import { ARC_TESTNET } from "@/lib/arc/network";
import { isArcTestnet } from "@/lib/arc/network";
import {
  EMPLOYEE_CREDIT_CONTRACT,
  EMPLOYEE_CREDIT_EVIDENCE_KEY,
  createEmployeeCreditEvidence,
  employeeUsdc,
  employeeCreditStateAfterSubmissionError,
  employeeCreditRepaymentStep,
  isEmployeeCreditConfirmationEnabled,
  nextEmployeeCreditInstalment,
  prepareEmployeeCreditApproval,
  prepareEmployeeCreditDraw,
  prepareEmployeeCreditRepayment,
  readArcLatestBlock,
  readArcPublicChainId,
  readEmployeeCreditAccount,
  readEmployeeCreditAllowance,
  readEmployeeCreditAvailable,
  readEmployeeCreditConfirmedState,
  readEmployeeCreditEligibility,
  readEmployeeCreditLimit,
  readEmployeeCreditPool,
  readEmployeeUsdcBalance,
  recoverEmployeeCreditEvidence,
  restoreEmployeeCreditEvidence,
  submitEmployeeCreditWrite,
  validateEmployeeCreditDraw,
  type EmployeeCreditEvidence,
  type EmployeeCreditSnapshot,
  type CreditTransactionState,
  type PreparedEmployeeCreditWrite,
} from "@/lib/credit/employee-credit-client";

type Drawer = "draw" | "repay" | null;
type ReadState = "idle" | "loading" | "success" | "error";
type FieldState<T> = { status: ReadState; value: T | null; error: string };
const inputClass = "mt-2 h-10 w-full rounded-lg border border-border bg-white px-3 text-[11px] outline-none focus:border-accent";
const emptyField = <T,>(): FieldState<T> => ({ status: "idle", value: null, error: "" });
const ARC_READ_SPACING_MS = 1_100;

const DEFAULT_FIRST_REPAYMENT_DELAY_SECONDS = BigInt(30 * 24 * 60 * 60);

export function EmployeeCreditPage() {
  const walletSession = useWallet();
  const provider = walletSession.wallet.provider;
  const account = walletSession.wallet.address as Address | null;
  const chainId = walletSession.wallet.chainId;
  const [eligibility, setEligibility] = useState<FieldState<boolean>>(emptyField);
  const [creditAccount, setCreditAccount] = useState<FieldState<EmployeeCreditSnapshot["account"]>>(emptyField);
  const [availableCredit, setAvailableCredit] = useState<FieldState<bigint>>(emptyField);
  const [poolBalance, setPoolBalance] = useState<FieldState<bigint>>(emptyField);
  const [creditLimit, setCreditLimit] = useState<FieldState<bigint>>(emptyField);
  const [latestBlock, setLatestBlock] = useState<FieldState<bigint>>(emptyField);
  const [rpcChainId, setRpcChainId] = useState<FieldState<number>>(emptyField);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [amount, setAmount] = useState("750");
  const [instalments, setInstalments] = useState(3);
  const [firstDueDate, setFirstDueDate] = useState<bigint | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [prepared, setPrepared] = useState<PreparedEmployeeCreditWrite | null>(null);
  const [evidence, setEvidence] = useState<EmployeeCreditEvidence | null>(null);
  const [approvalEvidence, setApprovalEvidence] = useState<EmployeeCreditEvidence | null>(null);
  const [transactionState, setTransactionState] = useState<CreditTransactionState>("idle");
  const [currentTransactionHash, setCurrentTransactionHash] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [allowance, setAllowance] = useState<bigint | null>(null);
  const [employeeUsdcBalance, setEmployeeUsdcBalance] = useState<bigint | null>(null);
  const [repaymentDetailsLoading, setRepaymentDetailsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const refreshGeneration = useRef(0);
  const submitting = useRef(false);
  const evidenceInitialized = useRef(false);
  const walletInitialized = useRef(false);
  const repaymentPreparationGeneration = useRef(0);

  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    const loadField = async <T,>(
      setter: Dispatch<SetStateAction<FieldState<T>>>,
      read: () => Promise<T>,
    ) => {
      setter((current) => ({ status: "loading", value: current.value, error: "" }));
      let result: FieldState<T> = { status: "error", value: null, error: "Unknown Arc RPC error." };
      try {
        result = { status: "success", value: await read(), error: "" };
      } catch (error) {
        result = {
          status: "error",
          value: null,
          error: error instanceof Error ? error.message : "Unknown Arc RPC error.",
        };
      } finally {
        // Every individual read leaves loading, and an older refresh cannot overwrite a newer one.
        if (refreshGeneration.current === generation) {
          setter((current) => ({ ...result, value: result.value ?? current.value }));
        }
      }
    };

    const spaceReads = () => new Promise<void>((resolve) => setTimeout(resolve, ARC_READ_SPACING_MS));
    // Arc's public endpoint rate-limits request bursts. Reads stay independent, but are
    // deliberately spaced so one page render does not create its own rate-limit failure.
    const publicReadQueue = (async () => {
      await loadField(setLatestBlock, readArcLatestBlock);
      await spaceReads();
      await loadField(setRpcChainId, readArcPublicChainId);
      await spaceReads();
      await loadField(setCreditLimit, readEmployeeCreditLimit);
      await spaceReads();
      await loadField(setPoolBalance, readEmployeeCreditPool);
    })();

    if (refreshGeneration.current !== generation) return;

    if (!account || !EMPLOYEE_CREDIT_CONTRACT) {
      const unavailable = {
        status: "error" as const,
        value: null,
        error: !EMPLOYEE_CREDIT_CONTRACT
          ? "Employee Credit contract is not configured."
          : "Connect MetaMask to read employee-specific credit.",
      };
      setEligibility(unavailable);
      setCreditAccount(unavailable);
      setAvailableCredit(unavailable);
      return;
    }
    void (async () => {
      await publicReadQueue;
      if (refreshGeneration.current !== generation) return;
      await spaceReads();
      await loadField(setEligibility, () => readEmployeeCreditEligibility(account));
      await spaceReads();
      await loadField(setAvailableCredit, () => readEmployeeCreditAvailable(account));
      await spaceReads();
      await loadField(setCreditAccount, () => readEmployeeCreditAccount(account));
    })();
  }, [account]);

  const recover = useCallback(async (stored: EmployeeCreditEvidence) => {
    try {
      const confirmed = await recoverEmployeeCreditEvidence(stored);
      setEvidence(confirmed);
      sessionStorage.setItem(EMPLOYEE_CREDIT_EVIDENCE_KEY, JSON.stringify(confirmed));
      setTransactionState(confirmed.status);
      setCurrentTransactionHash(confirmed.transactionHash);
      setMessage(confirmed.status === "failed" ? "Transaction failed on Arc Testnet." : "");
      await refresh();
    } catch {
      setMessage("Transaction submitted — confirmation temporarily unavailable.");
    }
  }, [refresh]);

  useEffect(() => {
    if (evidenceInitialized.current) return;
    evidenceInitialized.current = true;
    queueMicrotask(() => {
      const stored = restoreEmployeeCreditEvidence(sessionStorage.getItem(EMPLOYEE_CREDIT_EVIDENCE_KEY));
      if (stored) {
        setEvidence(stored);
        if (stored.status === "submitted") {
          setTransactionState("submitted");
          setCurrentTransactionHash(stored.transactionHash);
          void recover(stored);
        } else {
          setTransactionState(stored.status);
          setCurrentTransactionHash(stored.transactionHash);
        }
      }
    });
  }, [recover, refresh]);

  useEffect(() => {
    if (walletInitialized.current) {
      repaymentPreparationGeneration.current += 1;
      setPrepared(null);
      setApprovalEvidence(null);
      setTransactionState("idle");
      setCurrentTransactionHash(null);
      setReviewed(false);
      setMessage(account ? "Wallet account or network changed. Review and prepare again." : "Connect MetaMask to continue.");
    } else {
      walletInitialized.current = true;
    }
    void refresh();
  }, [account, chainId, provider, refresh]);

  async function prepareRepaymentStep(
    liveAccount: EmployeeCreditSnapshot["account"],
    liveAllowance: bigint,
  ) {
    if (!provider || !liveAccount.active || liveAccount.outstanding <= BigInt(0)) return;
    const due = nextEmployeeCreditInstalment(liveAccount);
    const next = employeeCreditRepaymentStep(liveAccount, liveAllowance) === "approve"
      ? await prepareEmployeeCreditApproval(provider, due)
      : await prepareEmployeeCreditRepayment(provider, liveAccount);
    setPrepared(next);
    setTransactionState("prepared");
    setCurrentTransactionHash(null);
    setMessage(next.kind === "approve" ? "Step 1 of 2 — Approve USDC" : "Confirm repayment");
  }

  async function openRepayment() {
    const generation = ++repaymentPreparationGeneration.current;
    setDrawer("repay");
    setPrepared(null);
    setApprovalEvidence(null);
    setTransactionState("idle");
    setCurrentTransactionHash(null);
    setMessage("");
    setAllowance(null);
    setEmployeeUsdcBalance(null);
    if (account && creditAccount.value?.active && creditAccount.value.outstanding > BigInt(0)) {
      setRepaymentDetailsLoading(true);
      try {
        const [nextAllowance, nextBalance] = await Promise.allSettled([
          readEmployeeCreditAllowance(account),
          readEmployeeUsdcBalance(account),
        ]);
        if (repaymentPreparationGeneration.current !== generation) return;
        const liveAllowance = nextAllowance.status === "fulfilled" ? nextAllowance.value : null;
        setAllowance(liveAllowance);
        setEmployeeUsdcBalance(nextBalance.status === "fulfilled" ? nextBalance.value : null);
        if (liveAllowance !== null) await prepareRepaymentStep(creditAccount.value, liveAllowance);
      } catch (error) {
        if (repaymentPreparationGeneration.current === generation) {
          setMessage(error instanceof Error ? error.message : "Repayment preparation failed.");
        }
      } finally {
        if (repaymentPreparationGeneration.current === generation) setRepaymentDetailsLoading(false);
      }
    }
  }

  async function reviewCredit() {
    if (!provider || !snapshot) return;
    const dueDate = BigInt(Math.floor(Date.now() / 1_000)) + DEFAULT_FIRST_REPAYMENT_DELAY_SECONDS;
    try {
      validateEmployeeCreditDraw(amount, instalments, dueDate, snapshot);
      const next = await prepareEmployeeCreditDraw(provider, amount, instalments, dueDate, snapshot);
      setFirstDueDate(dueDate);
      setReviewed(true);
      setPrepared(next);
      setTransactionState("prepared");
      setCurrentTransactionHash(null);
      setMessage("Review complete. Confirm in your wallet when ready.");
    } catch (error) {
      setReviewed(false);
      setPrepared(null);
      setMessage(error instanceof Error ? error.message : "Credit details are invalid.");
    }
  }

  async function prepareRepayment() {
    const liveAccount = creditAccount.value;
    if (!provider || !liveAccount?.active || liveAccount.outstanding <= BigInt(0) || allowance === null) return;
    try {
      await prepareRepaymentStep(liveAccount, allowance);
    } catch (error) {
      setPrepared(null);
      setMessage(error instanceof Error ? error.message : "Preparation failed.");
    }
  }

  async function confirmPrepared() {
    if (!provider || !prepared || submitting.current || isSubmitting || transactionState !== "prepared" || currentTransactionHash) return;
    submitting.current = true;
    setIsSubmitting(true);
    setTransactionState("walletPending");
    let submittedHash = currentTransactionHash;
    try {
      const transactionHash = await submitEmployeeCreditWrite(provider, prepared);
      submittedHash = transactionHash;
      setCurrentTransactionHash(transactionHash);
      setTransactionState("submitted");
      const submitted = createEmployeeCreditEvidence(prepared, transactionHash);
      setEvidence(submitted);
      sessionStorage.setItem(EMPLOYEE_CREDIT_EVIDENCE_KEY, JSON.stringify(submitted));
      setMessage("Transaction submitted — awaiting confirmation.");
      const confirmed = await recoverEmployeeCreditEvidence(submitted);
      setEvidence(confirmed);
      setTransactionState(confirmed.status);
      sessionStorage.setItem(EMPLOYEE_CREDIT_EVIDENCE_KEY, JSON.stringify(confirmed));
      if (confirmed.status !== "confirmed") {
        setMessage("Transaction failed on Arc Testnet.");
        return;
      }
      const currentAccount = account;
      if (currentAccount) {
        const confirmedBlock = BigInt(confirmed.blockNumber ?? "0");
        const confirmedState = prepared.kind === "repay" || prepared.kind === "draw"
          ? await readEmployeeCreditConfirmedState(currentAccount, confirmedBlock)
          : null;
        const nextAccount = confirmedState?.account ?? await readEmployeeCreditAccount(currentAccount);
        setCreditAccount({ status: "success", value: nextAccount, error: "" });
        if (prepared.kind === "repay" || prepared.kind === "draw") {
          setAvailableCredit({ status: "success", value: confirmedState!.availableCredit, error: "" });
          setPoolBalance({ status: "success", value: confirmedState!.poolBalance, error: "" });
          setEmployeeUsdcBalance(confirmedState!.employeeUsdcBalance);
          setAllowance(confirmedState!.allowance);
          setLatestBlock({ status: "success", value: confirmedBlock, error: "" });
        }
        if (prepared.kind !== "repay" && prepared.kind !== "draw") void refresh();
        if (prepared.kind === "approve") {
          const refreshedAllowance = await readEmployeeCreditAllowance(currentAccount);
          setAllowance(refreshedAllowance);
          setApprovalEvidence(confirmed);
          setEvidence(null);
          sessionStorage.removeItem(EMPLOYEE_CREDIT_EVIDENCE_KEY);
          const due = nextEmployeeCreditInstalment(nextAccount);
          if (refreshedAllowance < due) {
            setPrepared(null);
            setTransactionState("idle");
            setCurrentTransactionHash(null);
            setMessage("USDC approval confirmed, but the refreshed allowance is still insufficient.");
          } else {
            const repayment = await prepareEmployeeCreditRepayment(provider, nextAccount);
            setPrepared(repayment);
            setTransactionState("prepared");
            setCurrentTransactionHash(null);
            setMessage("Step 2 of 2 — Confirm repayment");
          }
        } else {
          setMessage(
            prepared.kind === "draw" ? "Credit received on Arc Testnet." :
            nextAccount.active ? "Instalment repaid on Arc Testnet." : "Credit fully repaid."
          );
        }
      }
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? Number(error.code) : null;
      if (code === 4001 && !submittedHash) {
        setTransactionState("prepared");
        setMessage("Wallet confirmation cancelled.");
      } else {
        setTransactionState(employeeCreditStateAfterSubmissionError(error, submittedHash));
        setMessage(error instanceof Error ? error.message : "Transaction failed.");
      }
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  }

  function resetPreparedTransaction() {
    setPrepared(null);
    setReviewed(false);
    setTransactionState("idle");
    setCurrentTransactionHash(null);
    setMessage("");
  }

  const snapshot: EmployeeCreditSnapshot | null =
    eligibility.status === "success" && eligibility.value !== null &&
    creditAccount.status === "success" && creditAccount.value !== null &&
    availableCredit.status === "success" && availableCredit.value !== null &&
    poolBalance.status === "success" && poolBalance.value !== null &&
    latestBlock.status === "success" && latestBlock.value !== null
      ? {
          eligible: eligibility.value,
          account: creditAccount.value,
          availableCredit: availableCredit.value,
          poolBalance: poolBalance.value,
          latestBlock: latestBlock.value,
        }
      : null;
  const active = creditAccount.status === "success" && creditAccount.value?.active === true && creditAccount.value.outstanding > BigInt(0);
  const nextPayment = active && creditAccount.value ? nextEmployeeCreditInstalment(creditAccount.value) : BigInt(0);
  const fieldLabel = (field: FieldState<bigint>, formatter = employeeUsdc) =>
    field.value !== null ? formatter(field.value) :
    field.status === "loading" ? "Loading…" :
    "Unavailable";
  const isRefreshing = [eligibility, creditAccount, availableCredit, poolBalance, creditLimit, latestBlock, rpcChainId]
    .some((field) => field.status === "loading");
  const maximumDrawable =
    availableCredit.value !== null && poolBalance.value !== null && creditLimit.value !== null
      ? [availableCredit.value, poolBalance.value, creditLimit.value].reduce((lowest, value) => value < lowest ? value : lowest)
      : BigInt(0);
  const preparedWalletMatches = Boolean(prepared && account && prepared.sender.toLowerCase() === account.toLowerCase());
  const drawPreparedIsCurrent = Boolean(
    prepared?.kind === "draw" &&
    preparedWalletMatches &&
    isArcTestnet(chainId) &&
    eligibility.value === true &&
    prepared.rawAmount > BigInt(0) &&
    prepared.rawAmount <= maximumDrawable &&
    prepared.firstDueDate &&
    prepared.firstDueDate > BigInt(0),
  );
  const confirmEnabled = isEmployeeCreditConfirmationEnabled({
    state: transactionState,
    hasPreparedTransaction: prepared !== null,
    isSubmitting,
    transactionHash: currentTransactionHash,
    preparationIsCurrent: Boolean(prepared && (prepared.kind === "draw" ? drawPreparedIsCurrent : preparedWalletMatches && isArcTestnet(chainId))),
  });
  const summary = [
    ["Available credit", fieldLabel(availableCredit)],
    ["Outstanding", creditAccount.value !== null ? employeeUsdc(creditAccount.value.outstanding) : creditAccount.status === "loading" ? "Loading…" : "Unavailable"],
    ["Next repayment", active ? employeeUsdc(nextPayment) : "—"],
    ["Eligibility", eligibility.value !== null ? eligibility.value ? "Eligible" : "Not eligible" : eligibility.status === "loading" ? "Checking…" : "Unavailable"],
    ["Repayment progress", active && creditAccount.value ? `${creditAccount.value.instalmentsPaid} / ${creditAccount.value.totalInstalments}` : "No active credit"],
    ["Pool liquidity", fieldLabel(poolBalance)],
  ];
  const diagnosticErrors: Array<[string, FieldState<unknown>]> = [
    ["Eligibility", eligibility],
    ["Available credit", availableCredit],
    ["Credit account", creditAccount],
    ["Pool liquidity", poolBalance],
    ["Latest block", latestBlock],
    ["Credit limit", creditLimit],
    ["RPC chain ID", rpcChainId],
  ];

  return <div className="mx-auto max-w-[1120px]">
    <div className="flex items-start justify-between">
      <SectionTitle title="Employee Credit" description="Simple employee credit, settled on Arc Testnet."/>
      <div className="flex gap-3">
        <Button onClick={()=>void refresh()} disabled={isRefreshing}>{isRefreshing?"Refreshing…":"Refresh"}</Button>
        <Button onClick={()=>void openRepayment()} disabled={!active}>Make repayment</Button>
        <Button variant="primary" onClick={()=>{setDrawer("draw");setFirstDueDate(null);setReviewed(false);setPrepared(null);setTransactionState("idle");setCurrentTransactionHash(null);setMessage("");}} disabled={!snapshot?.eligible||active||snapshot.poolBalance===BigInt(0)}>Use credit</Button>
      </div>
    </div>
    {!EMPLOYEE_CREDIT_CONTRACT&&<p className="mt-9 text-[10px] text-muted">Employee Credit is awaiting its Arc Testnet deployment.</p>}
    {account&&eligibility.status==="success"&&!eligibility.value&&<p className="mt-9 text-[10px] text-muted">This wallet is not eligible for Employee Credit. Eligibility is managed onchain by the company.</p>}
    {eligibility.value===true&&poolBalance.status==="success"&&poolBalance.value===BigInt(0)&&<p className="mt-9 text-[10px] text-muted">Credit is available, but the pool must be funded before it can be used.</p>}
    <section className="mt-14 grid grid-cols-3 divide-x divide-border border-y border-border py-8">
      {summary.slice(0,3).map(([label,value],index)=><div key={label} className={index===0?"pr-8":"px-8"}><p className="text-[9px] text-muted">{label}</p><p className="mt-3 text-[17px]">{value}</p></div>)}
    </section>
    <dl className="mt-12 divide-y divide-border border-y border-border text-[10px]">
      {summary.slice(3).map(([label,value])=><div key={label} className="flex justify-between py-4"><dt className="text-muted">{label}</dt><dd>{value}</dd></div>)}
    </dl>
    {!active&&<p className="mt-8 text-[10px] text-muted">No active employee credit.</p>}
    {process.env.NODE_ENV === "development" && <details className="mt-8 border-t border-border pt-5 text-[9px] text-muted">
      <summary className="cursor-pointer">Arc read diagnostics</summary>
      <dl className="mt-4 space-y-2">
        <div className="flex justify-between gap-8"><dt>RPC URL</dt><dd className="break-all text-right">{ARC_TESTNET.rpcUrl}</dd></div>
        <div className="flex justify-between gap-8"><dt>Resolved contract</dt><dd className="break-all text-right">{EMPLOYEE_CREDIT_CONTRACT ?? "Not configured"}</dd></div>
        <div className="flex justify-between gap-8"><dt>RPC chain ID</dt><dd>{rpcChainId.status === "success" && rpcChainId.value !== null ? rpcChainId.value : "Unavailable"}</dd></div>
        {diagnosticErrors.filter(([, field]) => field.status === "error").map(([label, field]) =>
          <div key={`${label}-error`} className="grid grid-cols-[110px_1fr] gap-8">
            <dt>{label} error</dt>
            <dd className="break-all text-right">{field.error}</dd>
          </div>
        )}
      </dl>
    </details>}
    {evidence&&<section className="mt-14 border-t border-border pt-7"><p className="text-[9px] text-muted">Arc transaction</p><p className="mt-2 text-[17px] text-ink">{employeeUsdc(BigInt(evidence.rawAmount))}</p><p className={`mt-2 text-[11px] ${evidence.status==="confirmed"?"text-success":evidence.status==="failed"?"text-[#9a4d45]":"text-muted"}`}>{evidence.status==="confirmed"?"✓ Final on Arc":evidence.status==="failed"?"Transaction failed":"Transaction pending"}</p><p className="mt-2 text-[9px] text-muted">Arc Testnet</p><a className="mt-3 inline-block text-[10px] text-accent hover:underline" href={`${ARC_TESTNET.explorerUrl}/tx/${evidence.transactionHash}`} target="_blank" rel="noreferrer">View on ArcScan ↗</a>{evidence.status==="submitted"&&<Button className="ml-4" onClick={()=>void recover(evidence)}>Check status</Button>}<details className="mt-5 text-[9px] text-muted"><summary>Transaction details</summary><dl className="mt-3 space-y-2"><div className="grid grid-cols-[80px_1fr] gap-4"><dt>Hash</dt><dd className="break-all">{evidence.transactionHash}</dd></div>{evidence.blockNumber&&<div className="grid grid-cols-[80px_1fr] gap-4"><dt>Block</dt><dd>{evidence.blockNumber}</dd></div>}</dl></details></section>}
    {drawer&&<><button aria-label="Close credit drawer" className="fixed inset-y-0 left-[224px] right-0 top-[72px] z-30 bg-ink/10" onClick={()=>setDrawer(null)}/><aside className="fixed bottom-0 right-0 top-[72px] z-40 w-[520px] overflow-y-auto border-l border-border bg-white p-8 shadow-[-24px_0_70px_rgba(23,24,21,.08)]">
      <div className="flex justify-between"><h2 className="text-[28px]">{drawer==="draw"?"Use credit":"Make repayment"}</h2><button aria-label="Close drawer" onClick={()=>setDrawer(null)}>×</button></div>
      {drawer==="draw"?<>
        <label className="mt-8 block text-[10px] text-muted">Amount<input className={inputClass} value={amount} onChange={(event)=>{setAmount(event.target.value);setReviewed(false);setPrepared(null);}}/></label>
        <label className="mt-5 block text-[10px] text-muted">Repayment count<select className={inputClass} value={instalments} onChange={(event)=>{setInstalments(Number(event.target.value));setFirstDueDate(null);setReviewed(false);setPrepared(null);}}><option value={1}>1 repayment</option><option value={2}>2 repayments</option><option value={3}>3 repayments</option></select></label>
        {!reviewed&&!prepared?<Button variant="primary" className="mt-7 w-full" onClick={()=>void reviewCredit()}>Review credit</Button>:null}
      </>:creditAccount.value?.active&&creditAccount.value.outstanding>BigInt(0)?<>
        <p className="mt-8 text-[10px] text-muted">Early repayment is available. You can repay this instalment early.</p>
        <dl className="mt-6 divide-y divide-border border-y border-border text-[10px]"><div className="flex justify-between py-4"><dt className="text-muted">Outstanding</dt><dd>{employeeUsdc(creditAccount.value.outstanding)}</dd></div><div className="flex justify-between py-4"><dt className="text-muted">Next repayment</dt><dd>{employeeUsdc(nextPayment)}</dd></div><div className="flex justify-between py-4"><dt className="text-muted">Repayment progress</dt><dd>{creditAccount.value.instalmentsPaid} / {creditAccount.value.totalInstalments}</dd></div><div className="flex justify-between py-4"><dt className="text-muted">USDC balance</dt><dd>{employeeUsdcBalance===null?"Unavailable":employeeUsdc(employeeUsdcBalance)}</dd></div></dl>
        {repaymentDetailsLoading&&<p className="mt-5 text-[10px] text-muted">Checking allowance…</p>}
        {!prepared&&!repaymentDetailsLoading&&allowance!==null&&<Button variant="primary" className="mt-7 w-full" onClick={()=>void prepareRepayment()}>{allowance<nextPayment?"Prepare USDC approval":"Prepare repayment"}</Button>}
        {approvalEvidence&&<p className="mt-5 text-[10px] text-muted">USDC approved. Continue to repayment.</p>}
      </>:<p className="mt-8 text-[10px] text-muted">No active employee credit.</p>}
      {prepared&&<dl className="mt-8 divide-y divide-border border-y border-border text-[10px]">{[
        ["Amount",employeeUsdc(prepared.rawAmount)],["Repayment count",prepared.instalments?.toString()??"—"],["Next repayment",prepared.instalments?employeeUsdc((prepared.rawAmount+BigInt(prepared.instalments)-BigInt(1))/BigInt(prepared.instalments)):employeeUsdc(prepared.rawAmount)],["Network","Arc Testnet"],
      ].map(([label,value])=><div key={label} className="grid grid-cols-[130px_1fr] gap-5 py-4"><dt className="text-muted">{label}</dt><dd className="break-all">{value}</dd></div>)}</dl>}
      {prepared&&<Button variant="primary" className="mt-7 w-full" onClick={()=>void confirmPrepared()} disabled={!confirmEnabled}>{transactionState==="walletPending"?"Waiting for wallet…":prepared.kind==="draw"?"Confirm credit in wallet":prepared.kind==="approve"?"Approve USDC in wallet":prepared.kind==="fund"?"Confirm funding in wallet":"Confirm repayment in wallet"}</Button>}
      {prepared&&!currentTransactionHash&&(transactionState==="failed"||transactionState==="cancelled")&&<Button className="mt-3 w-full" onClick={resetPreparedTransaction}>Reset prepared transaction</Button>}
      {message&&<p role="status" className="mt-5 text-[10px] leading-5 text-muted">{message}</p>}
    </aside></>}
  </div>;
}
