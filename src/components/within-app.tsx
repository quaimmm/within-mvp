"use client";

import { useEffect, useRef, useState } from "react";
import {
  AnalyticsIcon,
  ApprovalIcon,
  CardIcon,
  CheckIcon,
  ChevronDownIcon,
  CloseIcon,
  OverviewIcon,
  RuleIcon,
  SettingsIcon,
  TeamIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/components/ui/section-title";
import { paymentStages, usePaymentExecution } from "@/hooks/use-payment-execution";
import type { PaymentRequest, PaymentResult } from "@/lib/payments/types";
import type { PolicyPublishRequest, PolicyPublishResult, SpendingPolicy } from "@/lib/policies/policy-publisher";
import { completeEmilyPayment, createCleanDemoState, DEMO_STORAGE_KEY, restoreDemoState } from "@/data/demo-state";
import type { DemoPage, DemoState, TransactionStatus } from "@/data/demo-state";
import { demoModeEnabled } from "@/lib/demo/demo-mode";
import { resetDemoState } from "@/lib/demo/reset-demo-state";

const navigation = [
  { label: "Dashboard", icon: OverviewIcon },
  { label: "Cards", icon: CardIcon },
  { label: "Approvals", icon: ApprovalIcon },
  { label: "Rules", icon: RuleIcon },
  { label: "Team", icon: TeamIcon },
  { label: "Analytics", icon: AnalyticsIcon },
  { label: "Settings", icon: SettingsIcon },
] as const;

type Page = DemoPage;

function Brand() {
  return (
    <div className="flex h-16 items-center gap-3 px-6">
      <span className="grid size-7 place-items-center rounded-[9px] bg-ink text-[11px] font-medium tracking-[-0.04em] text-white">W</span>
      <span className="text-[17px] font-medium tracking-[-0.045em] text-ink">within</span>
    </div>
  );
}

function Sidebar({ page, onNavigate }: { page: Page; onNavigate: (page: Page) => void }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-20 flex w-[224px] flex-col border-r border-border bg-sidebar">
      <Brand />
      <nav className="mt-7 flex flex-col gap-1 px-3" aria-label="Primary navigation">
        {navigation.map(({ label, icon: Icon }) => {
          const active = page === label;
          return (
            <button
              key={label}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => onNavigate(label)}
              className={`group flex h-10 items-center gap-3 rounded-lg px-3 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/20 ${
                active ? "bg-white text-ink shadow-hairline" : "text-muted hover:bg-white/60 hover:text-ink"
              }`}
            >
              <Icon className={active ? "text-accent" : "text-faint group-hover:text-muted"} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto p-3">
        <button className="flex w-full items-center gap-3 rounded-xl border border-transparent p-3 text-left transition-colors hover:border-border hover:bg-white/55">
          <span className="grid size-8 place-items-center rounded-full bg-ink text-[10px] font-medium text-white">AC</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium text-ink">Acme, Inc.</span>
            <span className="mt-0.5 block text-[10px] text-muted">Company workspace</span>
          </span>
          <ChevronDownIcon className="size-3.5 text-faint" />
        </button>
      </div>
    </aside>
  );
}

function TopNavigation({ page, onReset }: { page: Page; onReset: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") { setMenuOpen(false); setConfirmingReset(false); } };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menuOpen]);
  return (
    <header className="fixed left-[224px] right-0 top-0 z-10 flex h-[72px] items-center justify-between border-b border-border bg-canvas/95 px-10">
      <h1 className="text-[13px] font-medium tracking-[-0.02em] text-ink">{page}</h1>
      <div className="relative"><button aria-label="Open profile" aria-expanded={menuOpen} onClick={() => { setMenuOpen((open) => !open); setConfirmingReset(false); }} className="grid size-8 place-items-center rounded-full bg-[#e7e4dc] text-[10px] font-medium text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent/25">MK</button>{demoModeEnabled && menuOpen && <div className="absolute right-0 top-11 w-64 rounded-xl border border-border bg-white p-3 shadow-[0_18px_55px_rgba(23,24,21,0.12)]">{confirmingReset ? <div><p className="text-[11px] leading-5 text-ink">Reset the demo to its starting state?</p><div className="mt-3 flex justify-end gap-2"><Button onClick={() => setConfirmingReset(false)} className="h-8 px-3 text-[10px]">Cancel</Button><Button variant="primary" onClick={() => { onReset(); setMenuOpen(false); setConfirmingReset(false); }} className="h-8 px-3 text-[10px]">Reset</Button></div></div> : <button type="button" onClick={() => setConfirmingReset(true)} className="w-full rounded-lg px-2 py-2 text-left text-[11px] text-muted outline-none transition-colors hover:bg-canvas hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/20">Reset demo</button>}</div>}</div>
    </header>
  );
}

function StatusBadge({ status }: { status: TransactionStatus }) {
  const styles = {
    Approved: "text-success before:bg-success",
    Pending: "text-[#8a642b] before:bg-[#b88435]",
    Flagged: "text-[#9a4d45] before:bg-[#b85b51]",
  }[status];
  return <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium before:size-1 before:rounded-full ${styles}`}>{status}</span>;
}

type DecisionState = "idle" | "declining" | "declined";

const emilyPaymentRequest: PaymentRequest = {
  employeeId: "EMP-ENG-014",
  employeeName: "Emily Carter",
  merchant: "OpenAI",
  category: "AI Software",
  amount: 29,
  currency: "GBP",
  policyId: "POL-ENG-AI-001",
};

function shortenTransactionHash(hash?: string) {
  if (!hash) return "—";
  if (hash.length <= 18) return hash;
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

function PaymentExecutionView({ status, activeStage, result, errorMessage }: { status: "processing" | "completed" | "failed"; activeStage: number; result: PaymentResult | null; errorMessage: string | null }) {
  if (status === "completed" && result) {
    return (
      <div className="animate-decision-in">
        <div className="pt-12 text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-full bg-success-soft text-success"><CheckIcon className="size-5" /></span>
          <h2 className="mt-6 text-[28px] font-normal tracking-[-0.04em] text-ink">Payment completed</h2>
          <p className="mt-3 text-[14px] text-muted">£29.00 paid to OpenAI</p>
        </div>

        <details className="group mt-12 border-y border-border">
          <summary className="flex cursor-pointer list-none items-center justify-between py-4 text-[11px] font-medium text-muted marker:hidden">Receipt details<span className="text-faint transition-transform duration-200 group-open:rotate-45">＋</span></summary>
          <div className="border-t border-border pb-5 pt-1">
            <dl className="divide-y divide-border">
              {[["Settlement", `${result.settledAmount.toFixed(2)} ${result.settlementCurrency}`], ["Payment ID", result.paymentId], ["Status", "Completed"]].map(([label, value]) => <div key={label} className="flex items-center justify-between py-3"><dt className="text-[10px] text-muted">{label}</dt><dd className="text-[11px] font-medium text-ink">{value}</dd></div>)}
            </dl>
            <p className="mt-3 text-[9px] text-faint">Secured by programmable settlement</p>
            <details className="group/tech mt-4">
              <summary className="flex cursor-pointer list-none items-center justify-between py-2 text-[10px] text-muted marker:hidden">Technical details<span className="text-faint transition-transform duration-200 group-open/tech:rotate-45">＋</span></summary>
              <dl className="space-y-3 pt-3 text-[9px]">
                {(result.provider === "arc" ? [["Provider", "ArcPaymentProvider"], ["Network", "Arc Testnet"], ["Test settlement", `${result.settledAmount.toFixed(2)} ${result.settlementCurrency}`], ["Enforcement", "Onchain spending rule"], ["Contract", shortenTransactionHash(result.contractAddress)], ["Policy", result.policyId || emilyPaymentRequest.policyId], ["Transaction", shortenTransactionHash(result.transactionHash)]] : [["Provider", "MockPaymentProvider"], ["Network", "Demo environment"], ["Transaction reference", result.transactionHash || "—"], ["Policy ID", emilyPaymentRequest.policyId]]).map(([label, value]) => <div key={label} className="flex justify-between gap-5"><dt className="text-faint">{label}</dt><dd className="font-medium text-ink">{value}</dd></div>)}
                {result.provider === "arc" && result.explorerUrl && <a href={result.explorerUrl} target="_blank" rel="noreferrer" className="mt-4 inline-block text-[9px] text-accent hover:underline">View transaction</a>}
              </dl>
            </details>
          </div>
        </details>
      </div>
    );
  }

  const statusText = activeStage <= 1 ? "Checking rule" : activeStage === 2 ? "Authorising payment" : "Completing settlement";

  return (
    <div className="animate-decision-in">
      <div className="pt-12 text-center">
        <span role="status" aria-label={status === "failed" ? "Payment failed" : statusText} className="mx-auto block size-5 animate-spin rounded-full border border-accent/15 border-t-accent" />
        <p className="mt-7 text-[10px] text-muted">Emily Carter · OpenAI · £29.00</p>
        <h2 className="mt-3 text-[27px] font-normal tracking-[-0.04em] text-ink">{status === "failed" ? "Payment paused" : statusText}</h2>
        <div className="mx-auto mt-7 h-px w-44 overflow-hidden bg-border"><span className="block h-full bg-accent transition-[width] duration-500" style={{ width: `${Math.max(20, ((activeStage + 1) / paymentStages.length) * 100)}%` }} /></div>
      </div>

      <details className="group mt-12 border-y border-border">
        <summary className="flex cursor-pointer list-none items-center justify-between py-4 text-[10px] text-muted marker:hidden">View progress<span className="text-faint transition-transform duration-200 group-open:rotate-45">＋</span></summary>
        <div className="border-t border-border py-2">{paymentStages.map((stage, index) => <div key={stage} className="flex items-center gap-3 py-2.5"><span className={`grid size-4 place-items-center rounded-full ${index <= activeStage ? "bg-success-soft text-success" : "bg-placeholder text-faint"}`}>{index <= activeStage ? <CheckIcon className="size-2.5" /> : <span className="text-[7px]">{index + 1}</span>}</span><span className={`text-[10px] ${index <= activeStage ? "text-ink" : "text-faint"}`}>{stage}</span></div>)}</div>
      </details>

      {status === "failed" && (
        <div role="status" aria-live="polite" className="mt-7 border-l-2 border-[#b86a61] pl-4 animate-decision-in">
          {errorMessage?.split("\n").map((line, index) => index === 0 ? <p key={line} className="text-[12px] font-medium text-[#7f403a]">{line}</p> : <p key={line} className="mt-2 text-[11px] leading-5 text-muted">{line}</p>)}
        </div>
      )}
    </div>
  );
}

function ApprovalDrawer({ decision, completedPayment, paymentIdempotencyKey, onPaymentComplete, onDecline, onClose }: { decision: DecisionState; completedPayment: PaymentResult | null; paymentIdempotencyKey: string; onPaymentComplete: (result: PaymentResult) => void; onDecline: () => void; onClose: () => void }) {
  const payment = usePaymentExecution();
  const drawerRef = useRef<HTMLElement>(null);
  const working = payment.status === "processing" || decision === "declining";

  useEffect(() => {
    drawerRef.current?.focus();
    const closeWithEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && !working) onClose(); };
    window.addEventListener("keydown", closeWithEscape);
    return () => window.removeEventListener("keydown", closeWithEscape);
  }, [onClose, working]);

  async function approveAndExecute() {
    const result = await payment.execute(emilyPaymentRequest, paymentIdempotencyKey);
    if (result?.success) onPaymentComplete(result);
  }

  function safeClose() {
    if (payment.status !== "processing") onClose();
  }

  return (
    <>
      <button aria-label="Close approval drawer" onClick={safeClose} className="fixed inset-y-0 left-[224px] right-0 top-[72px] z-30 cursor-default bg-ink/10 opacity-100 backdrop-blur-[1px] animate-fade-in" />
      <aside ref={drawerRef} tabIndex={-1} aria-label="Approval review" className="fixed bottom-0 right-0 top-[72px] z-40 flex w-[500px] flex-col border-l border-border bg-surface shadow-[-24px_0_70px_rgba(23,24,21,0.10)] outline-none animate-drawer-in">
        {decision === "declined" ? (
          <div className="grid h-full place-items-center p-10 text-center animate-decision-in">
            <div>
              <span className="mx-auto grid size-16 place-items-center rounded-full bg-[#f6e9e7] text-[#9a4d45]"><CloseIcon className="size-6" /></span>
              <p className="mt-7 text-[10px] font-medium uppercase tracking-[0.14em] text-faint">Decision recorded</p>
              <h2 className="mt-3 text-[30px] font-normal tracking-[-0.045em] text-ink">Purchase declined.</h2>
              <p className="mx-auto mt-3 max-w-xs text-[12px] leading-5 text-muted">Emily’s £29 OpenAI purchase has been stopped and marked for the employee.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-border px-8 py-5">
              <p className="text-[11px] font-medium text-ink">Review purchase</p>
              <button aria-label="Close drawer" onClick={safeClose} disabled={working} className="grid size-8 place-items-center rounded-full text-muted transition-colors duration-200 hover:bg-canvas hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"><CloseIcon className="size-3.5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-8 py-7">
              {completedPayment ? <PaymentExecutionView status="completed" activeStage={paymentStages.length - 1} result={completedPayment} errorMessage={null} /> : payment.status !== "idle" ? <PaymentExecutionView status={payment.status} activeStage={payment.activeStage} result={payment.result} errorMessage={payment.errorMessage} /> : <>
              <div className="flex items-start justify-between gap-5 pt-2">
                <div><p className="text-[11px] text-muted">Emily Carter · Engineering</p><h2 className="mt-2 text-[26px] font-normal tracking-[-0.04em] text-ink">OpenAI</h2></div>
                <p className="text-[30px] font-normal tracking-[-0.045em] text-ink">£29</p>
              </div>

              <section className="mt-10 border-t border-border pt-6">
                <div className="flex items-center justify-between"><p className="text-[10px] text-muted">Rule result</p><span className="flex items-center gap-1.5 text-[10px] font-medium text-success"><i className="size-1 rounded-full bg-success" />Within rule</span></div>
                <p className="mt-4 text-[14px] leading-6 text-ink">Engineering can spend up to £300 per month on AI software.</p>
                <p className="mt-2 text-[10px] text-muted">No approval normally required</p>
              </section>

              <section className="mt-8 border-t border-border pt-6">
                <p className="text-[10px] text-muted">Why review it?</p>
                <p className="mt-3 text-[13px] leading-6 text-ink">First purchase from this merchant.</p>
              </section>

              <section className="mt-8 border-t border-border pt-6">
                <p className="text-[10px] text-accent">Recommendation</p>
                <p className="mt-3 text-[13px] leading-6 text-[#4e5260]">This purchase matches the company rule and Emily’s usual spending. Low risk.</p>
              </section>
              </>}
            </div>

            {payment.status === "failed" ? <div className="border-t border-border bg-white px-8 py-5"><Button onClick={payment.reset} className="h-11 w-full">Back to approval</Button></div> : completedPayment || payment.status === "completed" ? <div className="border-t border-border bg-white px-8 py-5"><Button onClick={safeClose} className="h-11 w-full">Close</Button></div> : <div className="grid grid-cols-2 gap-3 border-t border-border bg-white px-8 py-5">
              <Button onClick={onDecline} disabled={working} className="h-11">{decision === "declining" ? <span className="size-3.5 animate-spin rounded-full border border-muted/30 border-t-muted" /> : "Decline"}</Button>
              <Button variant="primary" onClick={approveAndExecute} disabled={working} className="h-11">{payment.status === "processing" ? <><span className="size-3.5 animate-spin rounded-full border border-white/35 border-t-white" />Processing</> : "Approve"}</Button>
            </div>}
          </>
        )}
      </aside>
    </>
  );
}

function Dashboard({ demoState, setDemoState }: { demoState: DemoState; setDemoState: React.Dispatch<React.SetStateAction<DemoState>> }) {
  const [decision, setDecision] = useState<DecisionState>("idle");
  const [toast, setToast] = useState<"approved" | "declined" | null>(null);
  const approvalTriggerRef = useRef<HTMLButtonElement>(null);
  const { dashboard } = demoState;

  function closeDrawer() {
    setDemoState((state) => ({ ...state, dashboard: { ...state.dashboard, drawerOpen: false } }));
    window.setTimeout(() => approvalTriggerRef.current?.focus(), 0);
  }

  function completePayment(result: PaymentResult) {
    if (!result.success) return;
    setDemoState((state) => completeEmilyPayment(state, result));
    setToast("approved");
    window.setTimeout(() => setToast(null), 3800);
  }

  function declineApproval() {
    if (decision !== "idle") return;
    setDecision("declining");
    window.setTimeout(() => {
      setDecision("declined");
      setDemoState((state) => state.dashboard.emilyInQueue ? ({ ...state, dashboard: { ...state.dashboard, pendingCount: Math.max(0, state.dashboard.pendingCount - 1), emilyInQueue: false, activity: state.dashboard.activity.map((item) => item.employee === "Emily Carter" ? { ...item, status: "Flagged" } : item) } }) : state);
      setToast("declined");
      window.setTimeout(() => {
        closeDrawer();
        setDecision("idle");
      }, 900);
      window.setTimeout(() => setToast(null), 3800);
    }, 650);
  }

  return (
    <div className="mx-auto max-w-[1120px]">
      <section className="pt-4">
        <p className="text-[11px] text-muted">Company spend this month</p>
        <h2 className="mt-3 text-[64px] font-normal leading-none tracking-[-0.06em] text-ink">£{dashboard.companySpend.toLocaleString("en-GB")}</h2>
        <p className="mt-5 text-[12px] text-success">8% below plan</p>

        <div className="mt-12 grid max-w-2xl grid-cols-3 divide-x divide-border border-t border-border pt-6">
          <div className="pr-8"><p className="text-[10px] text-muted">Budget remaining</p><p className="mt-2 text-[20px] font-normal tracking-[-0.03em] text-ink">£{dashboard.budgetRemaining.toLocaleString("en-GB")}</p></div>
          <div className="px-8"><p className="text-[10px] text-muted">Pending approvals</p><p className="mt-2 text-[20px] font-normal tracking-[-0.03em] text-ink transition-all duration-200">{dashboard.pendingCount}</p></div>
          <div className="pl-8"><p className="text-[10px] text-muted">Active rules</p><p className="mt-2 text-[20px] font-normal tracking-[-0.03em] text-ink">{dashboard.activeRuleCount}</p></div>
        </div>
      </section>

      <section className="mt-20 border-t border-border pt-8">
        <div className="flex items-start justify-between"><div><h3 className="text-[18px] font-normal tracking-[-0.03em] text-ink">Monthly spend</h3><p className="mt-2 text-[11px] text-muted">February — July</p></div><p className="text-[11px] text-muted">£42,310 in July</p></div>
        <div className="relative mt-10 h-[190px] border-b border-border">
          <div className="absolute inset-x-0 top-1/2 border-t border-border/60" />
          <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 900 190" preserveAspectRatio="none" aria-label="Monthly spend trend">
            <path d="M0 150 C95 144, 122 118, 180 124 S300 106, 360 112 S475 70, 540 82 S660 47, 720 61 S832 92,900 42" fill="none" stroke="#3157d5" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            {[0,180,360,540,720,900].map((x, index) => <circle key={x} cx={x} cy={[150,124,112,82,61,42][index]} r="3" fill="#f7f7f4" stroke="#3157d5" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />)}
          </svg>
          <div className="absolute -bottom-7 inset-x-0 flex justify-between text-[9px] text-faint"><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span><span>Jul</span></div>
        </div>
      </section>

      <div className="mt-24 grid grid-cols-[1.6fr_0.8fr] gap-16 border-t border-border pt-8">
        <section>
          <div><h3 className="text-[18px] font-normal tracking-[-0.03em] text-ink">Recent activity</h3><p className="mt-2 text-[11px] text-muted">Latest company purchases</p></div>
          <div className="mt-6 divide-y divide-border">
            {dashboard.activity.slice(0, 5).map((transaction) => (
              <div key={`${transaction.employee}-${transaction.merchant}`} className="grid grid-cols-[1fr_120px_90px] items-center gap-5 py-4">
                <div className="min-w-0"><p className="truncate text-[12px] font-medium text-ink">{transaction.merchant}</p><p className="mt-1 text-[10px] text-muted">{transaction.employee} · {transaction.category}</p></div>
                <p className="text-right text-[11px] font-medium tabular-nums text-ink">{transaction.amount}</p>
                <div className="text-right"><StatusBadge status={transaction.status} /></div>
              </div>
            ))}
          </div>
        </section>

        <section className="border-l border-border pl-10">
          <div><h3 className="text-[18px] font-normal tracking-[-0.03em] text-ink">Needs review</h3><p className="mt-2 text-[11px] text-muted">{dashboard.pendingCount} pending approvals</p></div>
          <div className="mt-6 divide-y divide-border">
            {[
              ...(dashboard.emilyInQueue ? [{ name: "Emily Carter", merchant: "OpenAI · First purchase", amount: "£29", review: true }] : []),
              { name: "Amelia Price", merchant: "The Hoxton", amount: "£846", review: false },
              { name: "Eva Romero", merchant: "Eurostar", amount: "£412", review: false },
            ].map((item) => item.review ? (
              <button ref={approvalTriggerRef} data-testid="emily-approval" onClick={() => setDemoState((state) => ({ ...state, dashboard: { ...state.dashboard, drawerOpen: true } }))} key={item.name} className="group flex w-full items-center gap-3 py-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/20">
                <div className="min-w-0 flex-1"><p className="truncate text-[11px] font-medium text-ink">{item.name}</p><p className="mt-1 truncate text-[9px] text-muted">{item.merchant}</p></div>
                <span className="text-[11px] font-medium text-ink">{item.amount}</span><span className="text-faint transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-accent">›</span>
              </button>
            ) : (
              <div key={item.name} className="flex items-center gap-3 py-4"><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-medium text-ink">{item.name}</p><p className="mt-1 truncate text-[9px] text-muted">{item.merchant}</p></div><span className="text-[11px] font-medium text-ink">{item.amount}</span></div>
            ))}
          </div>
        </section>
      </div>
      {dashboard.drawerOpen && <ApprovalDrawer decision={decision} completedPayment={dashboard.paymentResult} paymentIdempotencyKey={`APR-EMILY-OPENAI-${demoState.idempotency.payment}`} onPaymentComplete={completePayment} onDecline={declineApproval} onClose={() => { if (decision === "idle") closeDrawer(); }} />}
      {toast && (
        <div role="status" className="fixed bottom-6 right-6 z-50 flex min-w-[320px] items-center gap-3 rounded-[14px] border border-border bg-ink px-4 py-3.5 text-white shadow-[0_18px_60px_rgba(23,24,21,0.22)] animate-toast-in">
          <span className={`grid size-7 place-items-center rounded-full ${toast === "approved" ? "bg-[#356f56]" : "bg-[#925149]"}`}>{toast === "approved" ? <CheckIcon className="size-3.5" /> : <CloseIcon className="size-3" />}</span>
          <div><p className="text-[11px] font-medium">Purchase {toast}</p><p className="mt-0.5 text-[9px] text-white/55">Emily Carter · OpenAI · £29</p></div>
        </div>
      )}
      <div className="h-16" />
    </div>
  );
}

const policySuggestions = [
  "Engineers can buy AI tools up to £300/month",
  "Sales can book travel under £500",
  "Require approval for hotels above £200",
] as const;

function RulesPage({ demoState, setDemoState }: { demoState: DemoState; setDemoState: React.Dispatch<React.SetStateAction<DemoState>> }) {
  const description = demoState.rules.input;
  const rule = demoState.rules.generatedRule;
  const generationState = demoState.rules.generationState;
  const generationMessage = demoState.rules.generationMessage;
  const [generationLoading, setGenerationLoading] = useState(false);
  const [operation, setOperation] = useState<"publish" | "status" | null>(null);
  const [ruleError, setRuleError] = useState<string | null>(null);

  function setDescription(value: string) {
    setDemoState((state) => ({ ...state, rules: { ...state.rules, input: value } }));
  }

  function setRule(value: SpendingPolicy | null | ((current: SpendingPolicy | null) => SpendingPolicy | null)) {
    setDemoState((state) => ({ ...state, rules: { ...state.rules, generatedRule: typeof value === "function" ? value(state.rules.generatedRule) : value } }));
  }

  function setGenerationResult(stateValue: "idle" | "ready" | "error", message: string | null) {
    setDemoState((state) => ({ ...state, rules: { ...state.rules, generationState: stateValue, generationMessage: message } }));
  }

  const fieldClass = "mt-1.5 w-full bg-transparent text-[12px] text-ink outline-none placeholder:text-faint";

  function updateRule<Key extends keyof SpendingPolicy>(key: Key, value: SpendingPolicy[Key]) {
    setRule((current) => current ? { ...current, [key]: value } : current);
  }

  async function generateRule() {
    if (generationLoading) return;
    setGenerationLoading(true);
    setGenerationResult("idle", null);
    setRuleError(null);
    try {
      const response = await fetch("/api/policies/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: description }) });
      const result = await response.json() as { success: boolean; policy?: SpendingPolicy; message?: string };
      if (!response.ok || !result.success || !result.policy) throw new Error(result.message || "Rule could not be created.\nYour description has been preserved.");
      setRule(result.policy);
      setGenerationResult("ready", result.message || null);
    } catch (error) {
      setGenerationResult("error", error instanceof Error ? error.message : "Rule could not be created.\nYour description has been preserved.");
    } finally {
      setGenerationLoading(false);
    }
  }

  function settlementGuardFromResult(result: PolicyPublishResult) {
    return {
      maxPerTransactionUSDC: "0.05",
      periodLimitUSDC: "1.00",
      enforcement: result.provider === "arc" ? "onchain" as const : "mock" as const,
      transactionHash: result.transactionHash,
      explorerUrl: result.explorerUrl,
      contractAddress: result.contractAddress,
    };
  }

  async function activateRule() {
    if (!rule || operation || rule.businessLimit <= 0 || !rule.policyId) return;
    const updatedAt = new Date().toISOString();
    const request: PolicyPublishRequest = {
      policyId: rule.policyId,
      name: rule.name,
      businessLimit: rule.businessLimit,
      businessCurrency: rule.businessCurrency,
      settlementMaxPerTransactionUSDC: "0.05",
      settlementPeriodLimitUSDC: "1.00",
      active: true,
      idempotencyKey: `policy-publish:${rule.policyId}:${demoState.idempotency.publish}`,
    };
    setOperation("publish");
    setRuleError(null);
    try {
      const response = await fetch("/api/policies/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
      const result = await response.json() as PolicyPublishResult & { error?: string };
      if (!response.ok || !result.success) throw new Error(result.error || "Rule could not be activated.\nNo changes were published.");
      setDemoState((state) => ({ ...state, dashboard: { ...state.dashboard, activeRuleCount: state.rules.generatedRule?.active ? state.dashboard.activeRuleCount : state.dashboard.activeRuleCount + 1 }, rules: { ...state.rules, generatedRule: state.rules.generatedRule ? ({ ...state.rules.generatedRule, active: true, status: "Active", updatedAt, settlementGuard: settlementGuardFromResult(result) }) : null }, idempotency: { ...state.idempotency, publish: crypto.randomUUID() } }));
    } catch (error) {
      setRuleError(error instanceof Error ? error.message : "Rule could not be activated.\nNo changes were published.");
    } finally {
      setOperation(null);
    }
  }

  async function changeRuleStatus(active: boolean) {
    if (!rule || operation) return;
    const updatedAt = new Date().toISOString();
    const idempotencyKey = `policy-status:${rule.policyId}:${active}:${demoState.idempotency.status}`;
    setOperation("status");
    setRuleError(null);
    try {
      const response = await fetch("/api/policies/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ policyId: rule.policyId, active, idempotencyKey }) });
      const result = await response.json() as PolicyPublishResult & { error?: string };
      if (!response.ok || !result.success) throw new Error(result.error || "Rule status could not be changed.\nNo changes were published.");
      setDemoState((state) => ({ ...state, dashboard: { ...state.dashboard, activeRuleCount: Math.max(0, state.dashboard.activeRuleCount + (active ? 1 : -1)) }, rules: { ...state.rules, generatedRule: state.rules.generatedRule ? ({ ...state.rules.generatedRule, active, status: active ? "Active" : "Paused", updatedAt, settlementGuard: settlementGuardFromResult(result) }) : null }, idempotency: { ...state.idempotency, status: crypto.randomUUID() } }));
    } catch (error) {
      setRuleError(error instanceof Error ? error.message : "Rule status could not be changed.\nNo changes were published.");
    } finally {
      setOperation(null);
    }
  }

  return (
    <div className="mx-auto max-w-[920px]">
      <section>
        <h2 className="text-[42px] font-normal tracking-[-0.05em] text-ink">Create a spending rule</h2>
        <p className="mt-4 text-[13px] leading-6 text-muted">Describe the outcome. You can review every detail before the rule becomes active.</p>

        <div className="mt-10 rounded-[16px] border border-border-strong bg-white p-6 transition-colors duration-200 focus-within:border-accent">
          <textarea aria-label="Spending rule" placeholder="Describe what your team should be allowed to spend." value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-28 w-full resize-none bg-transparent text-[21px] font-normal leading-8 tracking-[-0.03em] text-ink outline-none placeholder:text-faint" />
        </div>

        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
          {policySuggestions.map((suggestion) => <span key={suggestion} className="text-[10px] text-muted transition-colors duration-200 hover:text-ink">{suggestion}</span>)}
        </div>
        <Button onClick={generateRule} aria-label={generationLoading ? "Creating rule" : "Generate rule"} disabled={generationLoading} variant="primary" className="mt-7 h-11 px-6">{generationLoading ? "Creating rule…" : "Generate rule"}</Button>
        {generationMessage && <div aria-live="polite" className={`mt-4 text-[10px] leading-5 ${generationState === "error" ? "text-[#9a4d45]" : "text-muted"}`}>{generationMessage.split("\n").map((line) => <p key={line}>{line}</p>)}</div>}
      </section>

      {rule && <section className="mt-20 border-t border-border pt-10">
        <p className="text-[10px] text-accent">{rule.confidence === "High" ? "Ready to review" : rule.confidence === "Medium" ? "Review suggested" : "Check the assumptions"}</p>
        <div className="mt-3 flex items-start justify-between gap-10"><div className="min-w-0 flex-1"><input aria-label="Rule name" value={rule.name} onChange={(event) => updateRule("name", event.target.value)} className="w-full bg-transparent text-[28px] font-normal tracking-[-0.04em] text-ink outline-none" /><textarea aria-label="Rule explanation" value={rule.explanation} onChange={(event) => updateRule("explanation", event.target.value)} rows={2} className="mt-3 w-full max-w-xl resize-none bg-transparent text-[12px] leading-5 text-muted outline-none" /></div><select aria-label="Risk level" value={rule.riskLevel} onChange={(event) => updateRule("riskLevel", event.target.value as SpendingPolicy["riskLevel"])} className="mt-2 bg-transparent text-[10px] text-success outline-none"><option>Low</option><option>Medium</option><option>High</option></select></div>

        <dl className="mt-9 grid grid-cols-4 divide-x divide-border border-y border-border py-6">
          <div className="px-6 pl-0"><dt className="text-[9px] text-faint">Who</dt><dd><input aria-label="Department" value={rule.department} onChange={(event) => updateRule("department", event.target.value)} className={fieldClass} /></dd></div>
          <div className="px-6"><dt className="text-[9px] text-faint">What</dt><dd><input aria-label="Category" value={rule.category} onChange={(event) => updateRule("category", event.target.value)} className={fieldClass} /></dd></div>
          <div className="px-6"><dt className="text-[9px] text-faint">Limit</dt><dd className="flex items-baseline gap-1"><span className="text-[12px] text-ink">£</span><input aria-label="Limit amount" type="number" min="0.01" step="0.01" value={rule.limitAmount} onChange={(event) => { const amount = Number(event.target.value); updateRule("limitAmount", amount); updateRule("businessLimit", amount); }} className={fieldClass} /></dd></div>
          <div className="px-6 pr-0"><dt className="text-[9px] text-faint">Approval</dt><dd><select aria-label="Approval requirement" value={rule.approvalRequired ? "required" : "not_required"} onChange={(event) => { const required = event.target.value === "required"; updateRule("approvalRequired", required); updateRule("approvalThreshold", required ? (rule.approvalThreshold || rule.limitAmount) : null); }} className={fieldClass}><option value="not_required">Not required</option><option value="required">Required</option></select></dd></div>
        </dl>

        <details className="group border-b border-border">
          <summary className="flex cursor-pointer list-none items-center justify-between py-5 text-[11px] text-muted marker:hidden">More options<span className="text-faint transition-transform duration-200 group-open:rotate-45">＋</span></summary>
          <dl className="grid grid-cols-2 gap-x-12 gap-y-5 border-t border-border py-6 text-[10px]"><div><dt className="text-faint">Description</dt><dd><textarea aria-label="Rule description" value={rule.description} onChange={(event) => updateRule("description", event.target.value)} rows={2} className={`${fieldClass} resize-none`} /></dd></div><div><dt className="text-faint">Limit cadence</dt><dd><select aria-label="Limit cadence" value={rule.limitType} onChange={(event) => updateRule("limitType", event.target.value as SpendingPolicy["limitType"])} className={fieldClass}><option value="monthly">Monthly</option><option value="per_transaction">Per transaction</option></select></dd></div><div><dt className="text-faint">Approval threshold</dt><dd><input aria-label="Approval threshold" type="number" disabled={!rule.approvalRequired} value={rule.approvalThreshold ?? ""} onChange={(event) => updateRule("approvalThreshold", Number(event.target.value))} className={`${fieldClass} disabled:opacity-40`} /></dd></div><div><dt className="text-faint">Recurring purchases</dt><dd><select aria-label="Recurring purchases" value={rule.recurringAllowed ? "allowed" : "not_allowed"} onChange={(event) => updateRule("recurringAllowed", event.target.value === "allowed")} className={fieldClass}><option value="allowed">Allowed</option><option value="not_allowed">Not allowed</option></select></dd></div><div><dt className="text-faint">Merchants</dt><dd><input aria-label="Merchant restrictions" value={rule.merchantRestrictions} onChange={(event) => updateRule("merchantRestrictions", event.target.value)} className={fieldClass} /></dd></div><div><dt className="text-faint">Time restrictions</dt><dd><input aria-label="Time restrictions" value={rule.timeRestrictions ?? ""} placeholder="None" onChange={(event) => updateRule("timeRestrictions", event.target.value || null)} className={fieldClass} /></dd></div><div><dt className="text-faint">Confidence</dt><dd><select aria-label="Confidence" value={rule.confidence} onChange={(event) => updateRule("confidence", event.target.value as SpendingPolicy["confidence"])} className={fieldClass}><option>High</option><option>Medium</option><option>Low</option></select></dd></div><div><dt className="text-faint">Currency</dt><dd><select aria-label="Currency" value={rule.businessCurrency} className={fieldClass}><option>GBP</option></select></dd></div><div className="col-span-2"><dt className="text-faint">Assumptions</dt><dd><textarea aria-label="Assumptions" value={rule.assumptions.join("\n")} onChange={(event) => updateRule("assumptions", event.target.value.split("\n").slice(0, 5))} rows={Math.max(2, rule.assumptions.length)} placeholder="None" className={`${fieldClass} resize-none`} /></dd></div><div><dt className="text-faint">Rule ID</dt><dd className="mt-1.5 text-ink">{rule.policyId}</dd></div>{rule.settlementGuard && <><div><dt className="text-faint">Enforcement</dt><dd className="mt-1.5 text-ink">{rule.settlementGuard.enforcement === "onchain" ? "Onchain spending rule" : "Demo environment"}</dd></div>{rule.settlementGuard.enforcement === "onchain" && <><div><dt className="text-faint">Settlement guard</dt><dd className="mt-1.5 text-ink">{rule.settlementGuard.maxPerTransactionUSDC} USDC per payment</dd></div><div><dt className="text-faint">Period guard</dt><dd className="mt-1.5 text-ink">{rule.settlementGuard.periodLimitUSDC} USDC per 30-day period</dd></div><div><dt className="text-faint">Contract</dt><dd className="mt-1.5 text-ink">{shortenTransactionHash(rule.settlementGuard.contractAddress)}</dd></div><div><dt className="text-faint">Transaction</dt><dd className="mt-1.5 text-ink">{shortenTransactionHash(rule.settlementGuard.transactionHash)}</dd></div>{rule.settlementGuard.explorerUrl && <div><a href={rule.settlementGuard.explorerUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">View transaction</a></div>}</>}</>}</dl>
        </details>

        <div className="mt-8 flex items-start justify-between gap-8"><div aria-live="polite">{rule.active && <p className="text-[11px] text-success">Rule active</p>}{ruleError && ruleError.split("\n").map((line) => <p key={line} className="text-[10px] leading-5 text-[#9a4d45]">{line}</p>)}</div>{!rule.active && <Button onClick={activateRule} disabled={Boolean(operation)} variant="primary" className="h-11 px-6">{operation === "publish" ? "Activating rule…" : "Activate rule"}</Button>}</div>
      </section>}

      <section className="mt-24 border-t border-border pt-10">
        <div><h3 className="text-[24px] font-normal tracking-[-0.04em] text-ink">Active rules</h3><p className="mt-2 text-[11px] text-muted">12 rules guide company spending.</p></div>
        <div className="mt-7 divide-y divide-border border-y border-border">
          {rule?.settlementGuard && <details className="group"><summary className="grid cursor-pointer list-none grid-cols-[190px_1fr_auto] items-center gap-8 py-5 marker:hidden"><span className="text-[12px] font-medium text-ink">{rule.name}</span><span className="text-[11px] text-muted">{rule.description}</span><span className={`flex items-center gap-2 text-[10px] ${rule.active ? "text-success" : "text-muted"}`}><i className={`size-1 rounded-full ${rule.active ? "bg-success" : "bg-faint"}`} />{rule.active ? "Rule active" : "Rule paused"}</span></summary><div className="pb-5 pl-[222px] text-[10px] text-muted"><button type="button" disabled={Boolean(operation)} onClick={() => changeRuleStatus(!rule.active)} className="transition-colors hover:text-ink disabled:opacity-50">{operation === "status" ? "Updating rule…" : rule.active ? "Pause rule" : "Reactivate rule"}</button></div></details>}
          {demoState.rules.seededRules.map((seededRule) => <details key={seededRule.policyId} className="group"><summary className="grid cursor-pointer list-none grid-cols-[190px_1fr_auto] items-center gap-8 py-5 marker:hidden"><span className="text-[12px] font-medium text-ink">{seededRule.name}</span><span className="text-[11px] text-muted">{seededRule.description}</span><span className={`flex items-center gap-2 text-[10px] ${seededRule.active ? "text-success" : "text-muted"}`}><i className={`size-1 rounded-full ${seededRule.active ? "bg-success" : "bg-faint"}`} />{seededRule.active ? "Rule active" : "Rule paused"}</span></summary><div className="pb-5 pl-[222px] text-[10px] text-muted">View history · Edit details</div></details>)}
        </div>
      </section>
      <div className="h-16" />
    </div>
  );
}

function PlaceholderPage({ page }: { page: Exclude<Page, "Dashboard"> }) {
  return (
    <div className="mx-auto max-w-[1120px]">
      <SectionTitle title={page} description={`A calm, focused home for ${page.toLowerCase()}.`} />
      <div className="mt-16 border-t border-border pt-8"><p className="text-[11px] text-muted">This area is ready for the next product flow.</p></div>
    </div>
  );
}

type HealthServices = { policyGenerator: "local" | "configured" | "unavailable"; policyPublisher: "mock" | "configured" | "unavailable"; paymentProvider: "mock" | "configured" | "unavailable" };

function SettingsPage() {
  const [services, setServices] = useState<HealthServices | null>(null);
  useEffect(() => { fetch("/api/health").then((response) => response.json()).then((result) => setServices(result.services)).catch(() => setServices(null)); }, []);
  const generator = services?.policyGenerator === "configured" ? "AI-powered" : "Local demo engine";
  const enforcement = services?.policyPublisher === "configured" ? "Arc Testnet" : "Demo environment";
  const payments = services?.paymentProvider === "configured" ? "Arc Testnet" : "Demo environment";
  return <div className="mx-auto max-w-[1120px]"><SectionTitle title="Settings" description="Workspace preferences and environment." /><section className="mt-16 max-w-xl border-t border-border pt-8"><h3 className="text-[18px] font-normal tracking-[-0.03em] text-ink">Demo environment</h3><dl className="mt-6 divide-y divide-border border-y border-border text-[11px]"><div className="flex justify-between py-4"><dt className="text-muted">Rule creation</dt><dd className="text-ink">{generator}</dd></div><div className="flex justify-between py-4"><dt className="text-muted">Rule enforcement</dt><dd className="text-ink">{enforcement}</dd></div><div className="flex justify-between py-4"><dt className="text-muted">Payments</dt><dd className="text-ink">{payments}</dd></div></dl></section></div>;
}

export default function WithinApp() {
  const [demoState, setDemoStateInternal] = useState<DemoState>(() => createCleanDemoState());
  const [hydrated, setHydrated] = useState(false);
  const [resetToast, setResetToast] = useState(false);
  const page = demoState.page;

  useEffect(() => {
    const restoration = window.setTimeout(() => {
      if (demoModeEnabled) setDemoStateInternal(restoreDemoState(sessionStorage.getItem(DEMO_STORAGE_KEY)));
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(restoration);
  }, []);

  useEffect(() => {
    if (demoModeEnabled && hydrated) sessionStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(demoState));
  }, [demoState, hydrated]);

  useEffect(() => {
    const closeDisclosures = (event: KeyboardEvent) => {
      if (event.key === "Escape") document.querySelectorAll("details[open]").forEach((details) => details.removeAttribute("open"));
    };
    window.addEventListener("keydown", closeDisclosures);
    return () => window.removeEventListener("keydown", closeDisclosures);
  }, []);

  const setDemoState: React.Dispatch<React.SetStateAction<DemoState>> = (action) => {
    setDemoStateInternal((current) => {
      const next = typeof action === "function" ? action(current) : action;
      if (demoModeEnabled) sessionStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  function setPage(nextPage: Page) {
    setDemoState((state) => ({ ...state, page: nextPage }));
  }

  function resetDemo() {
    setDemoStateInternal(resetDemoState(sessionStorage));
    setResetToast(true);
    window.setTimeout(() => setResetToast(false), 2600);
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <Sidebar page={page} onNavigate={setPage} />
      <TopNavigation page={page} onReset={resetDemo} />
      <main className="ml-[224px] min-h-screen pt-[72px]">
        <div className="px-10 py-14">{page === "Dashboard" ? <Dashboard key={demoState.idempotency.payment} demoState={demoState} setDemoState={setDemoState} /> : page === "Rules" ? <RulesPage key={demoState.idempotency.publish} demoState={demoState} setDemoState={setDemoState} /> : page === "Settings" ? <SettingsPage /> : <PlaceholderPage page={page} />}</div>
      </main>
      {resetToast && <div role="status" aria-live="polite" className="fixed bottom-6 right-6 z-50 rounded-xl bg-ink px-4 py-3 text-[11px] text-white shadow-[0_18px_60px_rgba(23,24,21,0.22)] animate-toast-in">Demo reset</div>}
    </div>
  );
}
