"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { Address } from "viem";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/components/ui/section-title";
import { restoreBrowserWallet, subscribeWallet } from "@/lib/arc/browser-wallet";
import type { BrowserEthereumProvider } from "@/lib/arc/network";
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
  prepareEmployeeCreditFunding,
  prepareEmployeeCreditRepayment,
  readArcLatestBlock,
  readArcPublicChainId,
  readEmployeeCreditAccount,
  readEmployeeCreditAllowance,
  readEmployeeCreditAvailable,
  readEmployeeCreditEligibility,
  readEmployeeCreditLimit,
  readEmployeeCreditPool,
  readEmployeeCreditTokenBalance,
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

type Drawer = "draw" | "repay" | "fund" | null;
type ReadState = "idle" | "loading" | "success" | "error";
type FieldState<T> = { status: ReadState; value: T | null; error: string };
const inputClass = "mt-2 h-10 w-full rounded-lg border border-border bg-white px-3 text-[11px] outline-none focus:border-accent";
const emptyField = <T,>(): FieldState<T> => ({ status: "idle", value: null, error: "" });
const ARC_READ_SPACING_MS = 1_100;

function dateLabel(timestamp: bigint) {
  if (timestamp === BigInt(0)) return "—";
  return new Date(Number(timestamp) * 1_000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function EmployeeCreditPage() {
  const [provider, setProvider] = useState<BrowserEthereumProvider | null>(null);
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
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
  const [firstDueDate, setFirstDueDate] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [prepared, setPrepared] = useState<PreparedEmployeeCreditWrite | null>(null);
  const [evidence, setEvidence] = useState<EmployeeCreditEvidence | null>(null);
  const [transactionState, setTransactionState] = useState<CreditTransactionState>("idle");
  const [currentTransactionHash, setCurrentTransactionHash] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [allowance, setAllowance] = useState<bigint | null>(null);
  const [employeeUsdcBalance, setEmployeeUsdcBalance] = useState<bigint | null>(null);
  const [message, setMessage] = useState("");
  const refreshGeneration = useRef(0);
  const submitting = useRef(false);

  const refresh = useCallback(async (
    walletProvider?: BrowserEthereumProvider | null,
    walletAccount?: Address | null,
    walletChainId?: string | null,
  ) => {
    const generation = ++refreshGeneration.current;
    const loadField = async <T,>(
      setter: Dispatch<SetStateAction<FieldState<T>>>,
      read: () => Promise<T>,
    ) => {
      setter({ status: "loading", value: null, error: "" });
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
        if (refreshGeneration.current === generation) setter(result);
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

    let nextProvider = walletProvider;
    let nextAccount = walletAccount;
    let nextChain = walletChainId;
    if (walletProvider === undefined) {
      const restored = await restoreBrowserWallet();
      nextProvider = restored?.provider ?? null;
      nextAccount = restored?.address as Address | null ?? null;
      nextChain = restored?.chainId ?? null;
    }
    if (refreshGeneration.current !== generation) return;
    setProvider(nextProvider ?? null);
    setAccount(nextAccount ?? null);
    setChainId(nextChain ?? null);

    if (!nextAccount || !EMPLOYEE_CREDIT_CONTRACT) {
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
      await loadField(setEligibility, () => readEmployeeCreditEligibility(nextAccount));
      await spaceReads();
      await loadField(setAvailableCredit, () => readEmployeeCreditAvailable(nextAccount));
      await spaceReads();
      await loadField(setCreditAccount, () => readEmployeeCreditAccount(nextAccount));
    })();
  }, []);

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
      void refresh();
    });
  }, [recover, refresh]);

  useEffect(() => {
    if (!provider) return;
    return subscribeWallet(provider, { address: account, chainId }, (next) => {
      const nextAccount = next.address as Address | null;
      setAccount(nextAccount);
      setChainId(next.chainId);
      setPrepared(null);
      setTransactionState("idle");
      setCurrentTransactionHash(null);
      setReviewed(false);
      setMessage(nextAccount ? "Wallet account changed. Review and prepare again." : "Connect MetaMask to continue.");
      void refresh(provider, nextAccount, next.chainId);
    });
  // The selected provider owns this listener; account and chain updates arrive through it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  async function openRepayment() {
    setDrawer("repay");
    setPrepared(null);
    setTransactionState("idle");
    setCurrentTransactionHash(null);
    setMessage("");
    if (account && creditAccount.value?.active && creditAccount.value.outstanding > BigInt(0)) {
      const [nextAllowance, nextBalance] = await Promise.allSettled([
        readEmployeeCreditAllowance(account),
        readEmployeeUsdcBalance(account),
      ]);
      setAllowance(nextAllowance.status === "fulfilled" ? nextAllowance.value : null);
      setEmployeeUsdcBalance(nextBalance.status === "fulfilled" ? nextBalance.value : null);
    }
  }

  function reviewCredit() {
    if (!snapshot || !firstDueDate) return setMessage("Choose a first payment date.");
    try {
      validateEmployeeCreditDraw(amount, instalments, BigInt(Math.floor(new Date(`${firstDueDate}T12:00:00`).getTime() / 1_000)), snapshot);
      setReviewed(true);
      setPrepared(null);
      setMessage("Review complete. Prepare the transaction when ready.");
    } catch (error) {
      setReviewed(false);
      setMessage(error instanceof Error ? error.message : "Credit details are invalid.");
    }
  }

  async function prepareDraw() {
    if (!provider || !snapshot || !firstDueDate || !reviewed) return;
    try {
      const dueDate = BigInt(Math.floor(new Date(`${firstDueDate}T12:00:00`).getTime() / 1_000));
      const next = await prepareEmployeeCreditDraw(provider, amount, instalments, dueDate, snapshot);
      setPrepared(next);
      setTransactionState("prepared");
      setCurrentTransactionHash(null);
      setMessage("Prepared — not submitted.");
    } catch (error) {
      setPrepared(null);
      setMessage(error instanceof Error ? error.message : "Preparation failed.");
    }
  }

  async function prepareRepayment() {
    const liveAccount = creditAccount.value;
    if (!provider || !liveAccount?.active || liveAccount.outstanding <= BigInt(0)) return;
    try {
      const due = nextEmployeeCreditInstalment(liveAccount);
      const next = employeeCreditRepaymentStep(liveAccount, allowance ?? BigInt(0)) === "approve"
        ? await prepareEmployeeCreditApproval(provider, due)
        : await prepareEmployeeCreditRepayment(provider, liveAccount);
      setPrepared(next);
      setTransactionState("prepared");
      setCurrentTransactionHash(null);
      setMessage(next.kind === "approve" ? "USDC approval prepared. Repayment remains a separate transaction." : "Repayment prepared — not submitted.");
    } catch (error) {
      setPrepared(null);
      setMessage(error instanceof Error ? error.message : "Preparation failed.");
    }
  }

  async function prepareFunding() {
    if (!provider) return setMessage("Connect the funding wallet first.");
    try {
      const next = await prepareEmployeeCreditFunding(provider, amount);
      setPrepared(next);
      setTransactionState("prepared");
      setCurrentTransactionHash(null);
      setMessage("Funding prepared — not submitted.");
    } catch (error) {
      setPrepared(null);
      setMessage(error instanceof Error ? error.message : "Funding preparation failed.");
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
      const currentAccount = account;
      if (currentAccount) {
        const nextAccount = await readEmployeeCreditAccount(currentAccount);
        setCreditAccount({ status: "success", value: nextAccount, error: "" });
        if (prepared.kind === "repay") {
          const nextAvailable = await readEmployeeCreditAvailable(currentAccount);
          const nextPool = await readEmployeeCreditPool();
          setAvailableCredit({ status: "success", value: nextAvailable, error: "" });
          setPoolBalance({ status: "success", value: nextPool, error: "" });
          setEmployeeUsdcBalance(await readEmployeeUsdcBalance(currentAccount));
          setAllowance(await readEmployeeCreditAllowance(currentAccount));
        }
        if (prepared.kind === "fund") {
          const [tokenBalance, contractPoolBalance] = await Promise.all([
            readEmployeeCreditTokenBalance(),
            readEmployeeCreditPool(),
          ]);
          if (tokenBalance !== contractPoolBalance) throw new Error("Pool balance verification did not match the USDC token balance.");
        }
        void refresh(provider, currentAccount, chainId);
        if (prepared.kind === "approve") {
          setAllowance(await readEmployeeCreditAllowance(currentAccount));
          setPrepared(null);
          setEvidence(null);
          sessionStorage.removeItem(EMPLOYEE_CREDIT_EVIDENCE_KEY);
          setMessage("USDC approval confirmed. Prepare the repayment as a separate transaction.");
        } else {
          setMessage(
            prepared.kind === "draw" ? "Credit received on Arc Testnet." :
            prepared.kind === "fund" ? "Credit pool funded on Arc Testnet." :
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
    field.status === "loading" ? "Loading…" :
    field.status === "success" && field.value !== null ? formatter(field.value) :
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
    ["Outstanding", creditAccount.status === "loading" ? "Loading…" : creditAccount.status === "success" && creditAccount.value !== null ? employeeUsdc(creditAccount.value.outstanding) : "Unavailable"],
    ["Next payment", active ? employeeUsdc(nextPayment) : "—"],
    ["Repayment plan", active && creditAccount.value ? `${creditAccount.value.instalmentsPaid} of ${creditAccount.value.totalInstalments} paid` : "No active credit"],
    ["Pool liquidity", fieldLabel(poolBalance)],
    ["Latest Arc block", fieldLabel(latestBlock, (value) => value.toString())],
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
        <Button onClick={()=>void refresh(provider, account, chainId)} disabled={isRefreshing}>{isRefreshing?"Refreshing…":"Refresh"}</Button>
        <Button onClick={()=>{setDrawer("fund");setAmount("5");setPrepared(null);setTransactionState("idle");setCurrentTransactionHash(null);setMessage("");}}>Fund pool</Button>
        <Button onClick={()=>void openRepayment()} disabled={!active}>Make repayment</Button>
        <Button variant="primary" onClick={()=>{setDrawer("draw");setReviewed(false);setPrepared(null);setTransactionState("idle");setCurrentTransactionHash(null);setMessage("");}} disabled={!snapshot?.eligible||active||snapshot.poolBalance===BigInt(0)}>Use credit</Button>
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
      <div className="flex justify-between gap-8 py-4"><dt className="text-muted">Connected employee</dt><dd className="break-all text-right">{account??"Not connected"}</dd></div>
      <div className="flex justify-between gap-8 py-4"><dt className="text-muted">Contract</dt><dd className="break-all text-right">{EMPLOYEE_CREDIT_CONTRACT??"Not deployed"}</dd></div>
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
    {evidence?<section className="mt-14 border-t border-border pt-7"><p className="text-[13px]">{evidence.status==="confirmed"?"Transaction confirmed on Arc Testnet":evidence.status==="failed"?"Transaction failed on Arc Testnet":"Transaction submitted · Awaiting confirmation"}</p><a className="mt-3 block break-all text-[10px] text-accent" href={`${ARC_TESTNET.explorerUrl}/tx/${evidence.transactionHash}`} target="_blank" rel="noreferrer">{evidence.transactionHash}</a>{evidence.blockNumber&&<p className="mt-2 text-[10px] text-muted">Block {evidence.blockNumber}</p>}{evidence.status==="submitted"&&<Button className="mt-4" onClick={()=>void recover(evidence)}>Check status</Button>}</section>:<p className="mt-14 border-t border-border pt-7 text-[10px] text-muted">No locally recorded transactions on this device.</p>}
    {drawer&&<><button aria-label="Close credit drawer" className="fixed inset-y-0 left-[224px] right-0 top-[72px] z-30 bg-ink/10" onClick={()=>setDrawer(null)}/><aside className="fixed bottom-0 right-0 top-[72px] z-40 w-[520px] overflow-y-auto border-l border-border bg-white p-8 shadow-[-24px_0_70px_rgba(23,24,21,.08)]">
      <div className="flex justify-between"><h2 className="text-[28px]">{drawer==="draw"?"Use credit":drawer==="fund"?"Fund credit pool":"Make repayment"}</h2><button aria-label="Close drawer" onClick={()=>setDrawer(null)}>×</button></div>
      {drawer==="fund"?<>
        <p className="mt-8 text-[10px] leading-5 text-muted">Transfer USDC to the Employee Credit pool. Arc gas remains separate from the transfer amount.</p>
        <label className="mt-6 block text-[10px] text-muted">Amount<input className={inputClass} value={amount} onChange={(event)=>{setAmount(event.target.value);setPrepared(null);setMessage("");}}/></label>
        {!prepared&&<Button variant="primary" className="mt-7 w-full" onClick={()=>void prepareFunding()}>Prepare funding</Button>}
      </>:drawer==="draw"?<>
        <label className="mt-8 block text-[10px] text-muted">Amount<input className={inputClass} value={amount} onChange={(event)=>{setAmount(event.target.value);setReviewed(false);setPrepared(null);}}/></label>
        <label className="mt-5 block text-[10px] text-muted">Repayment plan<select className={inputClass} value={instalments} onChange={(event)=>{setInstalments(Number(event.target.value));setReviewed(false);setPrepared(null);}}><option value={1}>Next payday</option><option value={2}>2 monthly instalments</option><option value={3}>3 monthly instalments</option></select></label>
        <label className="mt-5 block text-[10px] text-muted">First payment date<input type="date" className={inputClass} value={firstDueDate} onChange={(event)=>{setFirstDueDate(event.target.value);setReviewed(false);setPrepared(null);}}/></label>
        {!reviewed?<Button variant="primary" className="mt-7 w-full" onClick={reviewCredit}>Review credit</Button>:!prepared?<Button variant="primary" className="mt-7 w-full" onClick={()=>void prepareDraw()}>Prepare transaction</Button>:null}
      </>:creditAccount.value?.active&&creditAccount.value.outstanding>BigInt(0)?<>
        <p className="mt-8 text-[10px] text-muted">Early repayment is available. You can repay this instalment early.</p>
        <dl className="mt-6 divide-y divide-border border-y border-border text-[10px]"><div className="flex justify-between py-4"><dt className="text-muted">Outstanding balance</dt><dd>{employeeUsdc(creditAccount.value.outstanding)}</dd></div><div className="flex justify-between py-4"><dt className="text-muted">Next repayment amount</dt><dd>{employeeUsdc(nextPayment)}</dd></div><div className="flex justify-between py-4"><dt className="text-muted">Next due date</dt><dd>{dateLabel(creditAccount.value.nextDueDate)}</dd></div><div className="flex justify-between py-4"><dt className="text-muted">Instalments paid</dt><dd>{creditAccount.value.instalmentsPaid}</dd></div><div className="flex justify-between py-4"><dt className="text-muted">Total instalments</dt><dd>{creditAccount.value.totalInstalments}</dd></div><div className="flex justify-between py-4"><dt className="text-muted">Employee USDC balance</dt><dd>{employeeUsdcBalance===null?"Unavailable":employeeUsdc(employeeUsdcBalance)}</dd></div><div className="flex justify-between py-4"><dt className="text-muted">Current USDC allowance</dt><dd>{allowance===null?"Unavailable":employeeUsdc(allowance)}</dd></div></dl>
        {!prepared&&<Button variant="primary" className="mt-7 w-full" onClick={()=>void prepareRepayment()}>{(allowance??BigInt(0))<nextPayment?"Prepare USDC approval":"Prepare repayment"}</Button>}
      </>:<p className="mt-8 text-[10px] text-muted">No active employee credit.</p>}
      {prepared&&<dl className="mt-8 divide-y divide-border border-y border-border text-[10px]">{[
        ["Connected wallet",prepared.sender],["Transaction target",prepared.contract],["Pool recipient",prepared.kind==="fund"?EMPLOYEE_CREDIT_CONTRACT??"Not configured":"—"],["Amount",employeeUsdc(prepared.rawAmount)],["Raw amount",prepared.rawAmount.toString()],["Native value","0"],["Instalments",prepared.instalments?.toString()??"—"],["First due date",prepared.firstDueDate?dateLabel(prepared.firstDueDate):"—"],["Estimated instalment",prepared.instalments?employeeUsdc((prepared.rawAmount+BigInt(prepared.instalments)-BigInt(1))/BigInt(prepared.instalments)):employeeUsdc(prepared.rawAmount)],["Gas estimate",prepared.gas.toString()],["Estimated total cost",prepared.estimatedCost],["Network","Arc Testnet"],
      ].map(([label,value])=><div key={label} className="grid grid-cols-[130px_1fr] gap-5 py-4"><dt className="text-muted">{label}</dt><dd className="break-all">{value}</dd></div>)}</dl>}
      {prepared&&<Button variant="primary" className="mt-7 w-full" onClick={()=>void confirmPrepared()} disabled={!confirmEnabled}>{transactionState==="walletPending"?"Waiting for wallet…":prepared.kind==="draw"?"Confirm credit in wallet":prepared.kind==="approve"?"Approve USDC in wallet":prepared.kind==="fund"?"Confirm funding in wallet":"Confirm repayment in wallet"}</Button>}
      {prepared&&!currentTransactionHash&&(transactionState==="failed"||transactionState==="cancelled")&&<Button className="mt-3 w-full" onClick={resetPreparedTransaction}>Reset prepared transaction</Button>}
      {message&&<p role="status" className="mt-5 text-[10px] leading-5 text-muted">{message}</p>}
    </aside></>}
  </div>;
}
