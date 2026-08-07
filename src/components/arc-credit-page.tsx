"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Hash } from "viem";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/components/ui/section-title";
import type { DemoState } from "@/data/demo-state";
import { restoreBrowserWallet } from "@/lib/arc/browser-wallet";
import type { BrowserEthereumProvider } from "@/lib/arc/network";
import { ARC_TESTNET } from "@/lib/arc/network";
import {
  ARC_CREDIT_CONTRACT,
  ARC_CREDIT_STORAGE_KEY,
  CreditReadCoordinator,
  displayUsdc,
  prepareDrawdown,
  prepareRepayment,
  prepareUsdcApproval,
  readArcCreditSnapshot,
  requestIdFromReceipt,
  submitPreparedCreditWrite,
  type ArcCreditSnapshot,
  type ArcCreditReadFailure,
  type PreparedCreditWrite,
} from "@/lib/credit/arc-credit-live";
import { arcPublicClient } from "@/lib/contracts/arc-contract-clients";

const fieldClass = "mt-2 h-10 w-full rounded-lg border border-border bg-white px-3 text-[11px] text-ink outline-none focus:border-accent";
type CreditReadStatus = "idle" | "loading" | "success" | "error";

export function CreditPage({}: { state: DemoState; setState: React.Dispatch<React.SetStateAction<DemoState>> }) {
  const [provider, setProvider] = useState<BrowserEthereumProvider | null>(null);
  const [account, setAccount] = useState<`0x${string}` | null>(null);
  const [snapshot, setSnapshot] = useState<ArcCreditSnapshot | null>(null);
  const [readStatus, setReadStatus] = useState<CreditReadStatus>("idle");
  const [isReading, setIsReading] = useState(false);
  const [readFailures, setReadFailures] = useState<ArcCreditReadFailure[]>([]);
  const [drawer, setDrawer] = useState<"request" | "repay" | null>(null);
  const [amount, setAmount] = useState("750");
  const [term, setTerm] = useState(90);
  const [purpose, setPurpose] = useState("Software procurement");
  const [prepared, setPrepared] = useState<PreparedCreditWrite | null>(null);
  const [hash, setHash] = useState<Hash | null>(null);
  const [submittedKind, setSubmittedKind] = useState<PreparedCreditWrite["kind"] | null>(null);
  const [message, setMessage] = useState("");
  const submitting = useRef(false);
  const readCoordinator = useRef(new CreditReadCoordinator());
  const mounted = useRef(true);

  const refresh = useCallback(async (restart = false) => {
    const coordinator = readCoordinator.current;
    if (coordinator.isLoading && !restart) return;
    setReadStatus("loading");
    setIsReading(true);
    try {
      const result = await coordinator.run(
        (signal) => readArcCreditSnapshot(null, { timeoutMs: 10_000, signal }),
        restart,
      );
      if (!result || !mounted.current) return;
      setSnapshot(result.snapshot);
      setReadFailures(result.failures);
      setReadStatus(result.failures.length > 0 ? "error" : "success");
    } catch (error) {
      if (!mounted.current || (error instanceof Error && error.message === "Request cancelled.")) return;
      setReadFailures([{
        method: "credit-state batch",
        endpoint: ARC_TESTNET.rpcUrl,
        message: error instanceof Error ? error.message : "Arc RPC temporarily unavailable",
        timeout: error instanceof Error && error.message.toLowerCase().includes("timed out"),
        rateLimited: error instanceof Error && /429|rate limit|request limit/i.test(error.message),
      }]);
      setReadStatus("error");
    } finally {
      if (mounted.current && !coordinator.isLoading) setIsReading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const coordinator = readCoordinator.current;
    mounted.current = true;
    restoreBrowserWallet().then((wallet) => {
      if (!active) return;
      setProvider(wallet?.provider ?? null);
      setAccount(wallet?.address ?? null);
      void refresh();
    }).catch(() => void refresh());
    Promise.resolve().then(() => {
      const stored = sessionStorage.getItem(ARC_CREDIT_STORAGE_KEY);
      if (!active || !stored) return;
      try {
        const record = JSON.parse(stored) as { hash?: string; kind?: PreparedCreditWrite["kind"] };
        if (record.hash && /^0x[0-9a-f]{64}$/i.test(record.hash)) {
          setHash(record.hash as Hash);
          setSubmittedKind(record.kind ?? null);
          setMessage("Transaction submitted. Confirmation is temporarily unavailable.");
        }
      } catch {
        if (/^0x[0-9a-f]{64}$/i.test(stored)) setHash(stored as Hash);
      }
    });
    return () => {
      active = false;
      mounted.current = false;
      coordinator.abort();
    };
  // Initial Arc reads only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (readStatus === "error") return;
    const poll = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const interval = window.setInterval(poll, 30_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [readStatus, refresh]);

  async function prepareRequest() {
    if (!provider) { setMessage("Connect a wallet on the connection page first."); return; }
    try {
      const next = await prepareDrawdown(provider, amount, term, purpose);
      if (snapshot?.borrower && next.sender.toLowerCase() !== snapshot.borrower.toLowerCase()) throw new Error("Connected wallet is not the approved borrower.");
      setPrepared(next);
      setMessage("Request prepared. Review before wallet confirmation.");
    } catch (error) {
      setPrepared(null);
      setMessage(error instanceof Error ? error.message : "Request preparation failed.");
    }
  }

  async function preparePayment() {
    if (!provider || !snapshot?.activeLoan || !account) return;
    try {
      const raw = BigInt(Math.round(Number(amount) * 1_000_000));
      if (!snapshot.borrower || account.toLowerCase() !== snapshot.borrower.toLowerCase()) throw new Error("Connected wallet is not the borrower.");
      if (raw <= BigInt(0) || raw > snapshot.activeLoan.outstandingPrincipal) throw new Error("Enter an amount up to the outstanding amount.");
      if ((snapshot.walletBalance ?? BigInt(0)) < raw) throw new Error("Insufficient USDC balance.");
      setPrepared((snapshot.allowance ?? BigInt(0)) < raw ? await prepareUsdcApproval(provider, amount) : await prepareRepayment(provider, snapshot.activeLoan.id, amount));
      setMessage((snapshot.allowance ?? BigInt(0)) < raw ? "USDC approval prepared. Repayment remains a separate transaction." : "Repayment prepared. Review before wallet confirmation.");
    } catch (error) {
      setPrepared(null);
      setMessage(error instanceof Error ? error.message : "Repayment preparation failed.");
    }
  }

  async function confirm() {
    if (!provider || !prepared || submitting.current || hash) return;
    submitting.current = true;
    let submittedHash: Hash | null = null;
    try {
      const transactionHash = await submitPreparedCreditWrite(provider, prepared);
      submittedHash = transactionHash;
      sessionStorage.setItem(ARC_CREDIT_STORAGE_KEY, JSON.stringify({ hash: transactionHash, kind: prepared.kind }));
      setHash(transactionHash);
      setSubmittedKind(prepared.kind);
      setMessage("Transaction submitted. Checking Arc Testnet confirmation.");
      const receipt = await arcPublicClient.waitForTransactionReceipt({ hash: transactionHash });
      if (receipt.status !== "success") throw new Error("The Arc transaction reverted.");
      if (prepared.kind === "request") {
        const requestId = requestIdFromReceipt(receipt);
        await arcPublicClient.readContract({ address: ARC_CREDIT_CONTRACT, abi: (await import("@/lib/contracts/within-credit-facility-abi")).withinCreditFacilityAbi, functionName: "getDrawdownRequest", args: [requestId] });
        setMessage("Request recorded on Arc Testnet.");
      } else if (prepared.kind === "approve") {
        await refresh();
        setHash(null);
        sessionStorage.removeItem(ARC_CREDIT_STORAGE_KEY);
        setPrepared(null);
        setMessage("USDC approval confirmed. Prepare the repayment as a separate transaction.");
      } else {
        await refresh();
        setMessage("Repayment confirmed on Arc Testnet.");
      }
    } catch (error) {
      setMessage(submittedHash ? "Transaction submitted. Confirmation is temporarily unavailable." : error instanceof Error ? error.message : "Transaction could not be submitted.");
    } finally {
      submitting.current = false;
    }
  }

  async function checkStatus() {
    if (!hash) return;
    try {
      const receipt = await arcPublicClient.getTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The Arc transaction reverted.");
      if (submittedKind === "request") {
        const requestId = requestIdFromReceipt(receipt);
        await arcPublicClient.readContract({ address: ARC_CREDIT_CONTRACT, abi: (await import("@/lib/contracts/within-credit-facility-abi")).withinCreditFacilityAbi, functionName: "getDrawdownRequest", args: [requestId] });
        setMessage("Request recorded on Arc Testnet.");
      } else {
        await refresh();
        setMessage(submittedKind === "repay" ? "Repayment confirmed on Arc Testnet." : "USDC approval confirmed. Prepare repayment as a separate transaction.");
      }
    } catch {
      setMessage("Transaction submitted. Confirmation is temporarily unavailable.");
    }
  }

  const rows = prepared ? [
    ["Sender", prepared.sender],
    ["Contract", prepared.contract],
    ["Function", prepared.functionName],
    ["Amount", `${amount} USDC`],
    ["Raw amount", prepared.rawAmount.toString()],
    ...(prepared.termDays ? [["Term", `${prepared.termDays} days`], ["Purpose", purpose], ["Encoded purpose", prepared.purposeHash ?? ""]] : []),
    ["Gas estimate", prepared.gas.toString()],
    ["Estimated cost", prepared.estimatedCost],
  ] : [];
  const pendingValue = readStatus === "idle" || (readStatus === "loading" && !snapshot) ? "Reading…" : "Unavailable";
  const valueOrPending = (value: bigint | null | undefined) => value === null || value === undefined ? pendingValue : displayUsdc(value);
  const activeLoanFailed = readFailures.some((failure) => failure.method === "nextLoanId" || failure.method === "getLoan");
  const activeLoanValue = snapshot?.activeLoan
    ? `#${snapshot.activeLoan.id}`
    : activeLoanFailed || readStatus === "error" && !snapshot
      ? "Unavailable"
      : readStatus === "loading" && !snapshot
        ? "Reading…"
        : "None";

  return <div className="mx-auto max-w-[1120px]">
    <div className="flex items-start justify-between"><SectionTitle title="Company Credit" description="Arc Testnet credit state and transactions." /><div className="flex gap-3"><Button onClick={() => void refresh(true)} disabled={isReading}>{isReading ? "Reading…" : "Refresh onchain state"}</Button><Button onClick={() => { setDrawer("repay"); setPrepared(null); }} disabled={!snapshot?.activeLoan}>Make repayment</Button><Button variant="primary" onClick={() => { setDrawer("request"); setPrepared(null); }}>Request funds</Button></div></div>
    {readStatus === "error" && <div className="mt-10 flex items-center gap-4 text-[11px] text-muted"><span>Arc state temporarily unavailable.</span><button type="button" className="text-ink underline decoration-border underline-offset-4 disabled:opacity-50" onClick={() => void refresh(true)} disabled={isReading}>Retry</button></div>}
    <section className="mt-12"><p className="text-[10px] text-muted">Available credit</p><p className="mt-3 text-[52px] tracking-[-.055em]">{valueOrPending(snapshot?.availableCredit)}</p><div className="mt-9 grid grid-cols-5 divide-x divide-border border-y border-border py-6">{[["Facility balance",valueOrPending(snapshot?.facilityBalance)],["Outstanding",valueOrPending(snapshot?.outstandingPrincipal)],["Active loan",activeLoanValue],["Contract",ARC_CREDIT_CONTRACT],["Latest read block",snapshot?.blockNumber?.toString()??pendingValue]].map(([label,value],index)=><div key={label} className={index===0?"pr-6":"px-6"}><p className="text-[9px] text-muted">{label}</p><p className="mt-2 break-all text-[12px]">{value}</p></div>)}</div></section>
    {readStatus === "success" && !snapshot?.activeLoan && <p className="mt-8 text-[10px] text-muted">No active onchain loan available for repayment.</p>}
    <section className="mt-16 border-t border-border pt-9"><h3 className="text-[20px]">Onchain state</h3><dl className="mt-5 divide-y divide-border border-y border-border text-[10px]">{[["Network",ARC_TESTNET.chainName],["Borrower",snapshot?.borrower??pendingValue],["Borrower USDC balance",valueOrPending(snapshot?.walletBalance)],["USDC allowance",valueOrPending(snapshot?.allowance)]].map(([label,value])=><div key={label} className="flex justify-between gap-8 py-4"><dt className="text-muted">{label}</dt><dd className="text-right">{value}</dd></div>)}</dl></section>
    {process.env.NODE_ENV !== "production" && readFailures.length > 0 && <details className="mt-6 border-t border-border pt-4 text-[9px] text-muted"><summary className="cursor-pointer text-ink">Developer read details</summary><div className="mt-4 space-y-4">{readFailures.map((failure, index)=><dl key={`${failure.method}-${index}`} className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-1"><dt>Failed method</dt><dd>{failure.method}</dd><dt>RPC provider</dt><dd className="break-all">{failure.endpoint}</dd><dt>Message</dt><dd className="break-all">{failure.message}</dd><dt>Status</dt><dd>{failure.timeout ? "Timeout" : failure.rateLimited ? "Rate limited" : "RPC error"}</dd></dl>)}</div></details>}
    {drawer && <><button aria-label="Close credit transaction drawer" onClick={() => setDrawer(null)} className="fixed inset-y-0 left-[224px] right-0 top-[72px] z-30 bg-ink/10"/><aside className="fixed bottom-0 right-0 top-[72px] z-40 w-[540px] overflow-y-auto border-l border-border bg-white p-8 shadow-[-24px_0_70px_rgba(23,24,21,.08)]"><div className="flex justify-between"><h2 className="text-[28px]">{drawer==="request"?"Request funds":"Make repayment"}</h2><button aria-label="Close drawer" onClick={() => setDrawer(null)}>×</button></div><label className="mt-8 block text-[10px] text-muted">Amount in USDC<input value={amount} onChange={(event)=>{setAmount(event.target.value);setPrepared(null);}} className={fieldClass}/></label>{drawer==="request"&&<><label className="mt-5 block text-[10px] text-muted">Term<select value={term} onChange={(event)=>{setTerm(Number(event.target.value));setPrepared(null);}} className={fieldClass}>{[30,90,180,365].map(value=><option key={value} value={value}>{value} days</option>)}</select></label><label className="mt-5 block text-[10px] text-muted">Purpose<input value={purpose} onChange={(event)=>{setPurpose(event.target.value);setPrepared(null);}} className={fieldClass}/></label></>}<Button variant="primary" className="mt-7 w-full" onClick={drawer==="request"?prepareRequest:preparePayment} disabled={drawer==="repay"&&!snapshot?.activeLoan||Boolean(hash)}>Prepare {drawer==="request"?"request":"repayment"}</Button>{prepared&&<dl className="mt-7 divide-y divide-border border-y border-border text-[10px]">{rows.map(([label,value])=><div key={label} className="grid grid-cols-[130px_1fr] gap-5 py-4"><dt className="text-muted">{label}</dt><dd className="break-all">{value}</dd></div>)}</dl>}{prepared&&<Button variant="primary" className="mt-7 w-full" onClick={confirm} disabled={Boolean(hash)}>Confirm {prepared.kind==="request"?"request":prepared.kind==="approve"?"USDC approval":"repayment"} in wallet</Button>}{hash&&<><a className="mt-5 block break-all text-[10px] text-accent" href={`${ARC_TESTNET.explorerUrl}/tx/${hash}`} target="_blank" rel="noreferrer">{hash}</a><Button onClick={checkStatus} className="mt-4">Check status</Button></>}{message&&<p role="status" className="mt-5 text-[10px] text-muted">{message}</p>}</aside></>}
  </div>;
}
