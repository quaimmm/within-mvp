"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/components/ui/section-title";
import type { DemoState } from "@/data/demo-state";
import {
  ARC_APP_KIT_ENABLED,
  ARC_BRIDGE_ENABLED,
  ARC_SEND_ENABLED,
  ARC_SWAP_ENABLED,
  ARC_UNIFIED_BALANCE_ENABLED,
} from "@/lib/arc/feature-flags";
import { ARC_TESTNET, isArcTestnet, shortenAddress } from "@/lib/arc/network";

type TreasuryCapability = "Send" | "Bridge" | "Swap";
type TreasuryWallet = { address: string | null; chainId: string | null };

const capabilities = [
  { name: "Unified Balance", description: "One spendable USDC balance across supported networks.", enabled: ARC_UNIFIED_BALANCE_ENABLED },
  { name: "Bridge", description: "Bring treasury liquidity into Arc.", enabled: ARC_BRIDGE_ENABLED },
  { name: "Swap", description: "Exchange supported stablecoins for treasury needs.", enabled: ARC_SWAP_ENABLED },
  { name: "Send", description: "Transfer USDC on Arc.", enabled: ARC_SEND_ENABLED },
  { name: "USDC-native gas", description: "No separate ETH gas balance required.", enabled: ARC_APP_KIT_ENABLED },
] as const;

const operationFlags: Record<TreasuryCapability, boolean> = {
  Send: ARC_SEND_ENABLED,
  Bridge: ARC_BRIDGE_ENABLED,
  Swap: ARC_SWAP_ENABLED,
};

const fieldClass = "mt-3 h-11 w-full border-b border-border bg-transparent text-[12px] text-ink outline-none transition-colors placeholder:text-faint focus:border-accent disabled:cursor-not-allowed disabled:text-faint";

function displayBalance(value: string | null, enabled: boolean, connected: boolean) {
  if (!enabled) return "Feature disabled";
  if (!connected) return "Not connected";
  return value ? `${value} USDC` : "Unavailable";
}

function CapabilityStatus({ enabled }: { enabled: boolean }) {
  return <span className={`text-[9px] ${enabled ? "text-success" : "text-muted"}`}>{enabled ? "Available" : "Feature disabled"}</span>;
}

export function TreasuryPage({ state, wallet }: { state: DemoState; wallet: TreasuryWallet }) {
  const [operation, setOperation] = useState<TreasuryCapability>("Send");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  const connected = Boolean(wallet.address);
  const onArc = isArcTestnet(wallet.chainId);
  const enabled = operationFlags[operation];
  const canReview = enabled && connected && onArc && amount.trim().length > 0 && (operation !== "Send" || recipient.trim().length > 0);
  const balance = displayBalance(state.treasury.balance, ARC_UNIFIED_BALANCE_ENABLED, connected);
  const availableBalance = ARC_UNIFIED_BALANCE_ENABLED ? (connected ? "Unavailable" : "Not connected") : "Feature disabled";
  const pendingBalance = ARC_UNIFIED_BALANCE_ENABLED ? (connected ? "Unavailable" : "Not connected") : "Feature disabled";
  const networkStatus = connected ? (onArc ? "Arc Testnet · Connected" : "Wrong network") : "Not connected";

  function prepareReview() {
    if (!canReview) return;
    setReviewMessage(`${operation} review prepared. No transaction has been submitted.`);
  }

  return <div className="mx-auto max-w-[1120px]">
    <div className="flex items-start justify-between gap-10">
      <SectionTitle title="Treasury" description="Manage company liquidity on Arc." />
      <div className="pt-1 text-right">
        <p className="text-[9px] uppercase tracking-[0.14em] text-faint">Network status</p>
        <p className="mt-2 text-[11px] text-ink"><span className={`mr-2 inline-block size-1.5 rounded-full ${onArc ? "bg-success" : "bg-faint"}`} />{networkStatus}</p>
        {wallet.address && <p className="mt-1 text-[9px] text-muted">{shortenAddress(wallet.address)}</p>}
      </div>
    </div>

    <section className="mt-14 border-y border-border py-8" aria-labelledby="treasury-overview-title">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[9px] uppercase tracking-[0.14em] text-faint">Treasury overview</p>
          <h2 id="treasury-overview-title" className="mt-3 text-[24px] tracking-[-0.035em]">Unified USDC</h2>
        </div>
        <CapabilityStatus enabled={ARC_UNIFIED_BALANCE_ENABLED} />
      </div>
      <div className="mt-9 grid grid-cols-3 divide-x divide-border">
        {[["Unified USDC balance", balance], ["Available to spend", availableBalance], ["Pending balance", pendingBalance]].map(([label, value], index) => <div key={label} className={index === 0 ? "pr-8" : "px-8"}>
          <p className="text-[10px] text-muted">{label}</p>
          <p className="mt-3 text-[22px] tracking-[-0.035em]">{value}</p>
        </div>)}
      </div>
      <p className="mt-7 text-[9px] leading-4 text-faint">Balances are shown only when returned by the existing Unified Balance integration. No local balance is generated.</p>
    </section>

    <section className="mt-20" aria-labelledby="move-money-title">
      <div className="flex items-end justify-between gap-10">
        <div>
          <h2 id="move-money-title" className="text-[24px] tracking-[-0.035em]">Move money</h2>
          <p className="mt-3 text-[11px] leading-5 text-muted">Treasury liquidity operations use the existing Arc providers and current feature flags.</p>
        </div>
        <div className="flex border-b border-border" role="tablist" aria-label="Treasury operations">
          {(["Send", "Bridge", "Swap"] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={operation === item} onClick={() => { setOperation(item); setReviewMessage(""); }} className={`min-w-20 px-4 pb-3 text-[11px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${operation === item ? "border-b border-ink text-ink" : "text-muted hover:text-ink"}`}>{item}</button>)}
        </div>
      </div>

      <div className="mt-10 grid grid-cols-[1.1fr_.9fr] gap-16 border-t border-border pt-9">
        <div>
          <div className="flex items-center justify-between">
            <h3 className="text-[18px] tracking-[-0.025em]">{operation}</h3>
            <CapabilityStatus enabled={enabled} />
          </div>
          <p className="mt-3 max-w-xl text-[10px] leading-5 text-muted">
            {operation === "Send" ? "Transfer USDC from the company treasury on Arc." : operation === "Bridge" ? "Bring USDC into your Within treasury from another supported network." : "Convert supported stablecoins for treasury needs on Arc."}
          </p>
          <div className="mt-8 grid grid-cols-2 gap-6">
            {operation === "Send" && <label className="text-[10px] text-muted">Recipient<input aria-label="Treasury recipient" value={recipient} onChange={(event) => { setRecipient(event.target.value); setReviewMessage(""); }} placeholder={enabled ? "0x…" : "Feature disabled"} disabled={!enabled} className={fieldClass} /></label>}
            {operation === "Bridge" && <label className="text-[10px] text-muted">From<select aria-label="Treasury bridge source network" disabled={!enabled} className={fieldClass} defaultValue=""><option value="">Supported network</option></select></label>}
            {operation === "Swap" && <label className="text-[10px] text-muted">You pay<select aria-label="Treasury swap source asset" disabled={!enabled} className={fieldClass} defaultValue="EURC"><option>EURC</option><option>USDC</option></select></label>}
            <label className="text-[10px] text-muted">Amount<input aria-label={`Treasury ${operation.toLowerCase()} amount`} value={amount} onChange={(event) => { setAmount(event.target.value); setReviewMessage(""); }} placeholder={enabled ? "USDC amount" : "Feature disabled"} disabled={!enabled} inputMode="decimal" className={fieldClass} /></label>
          </div>
        </div>
        <dl className="divide-y divide-border border-y border-border text-[10px]">
          <div className="flex justify-between gap-6 py-4"><dt className="text-muted">Network</dt><dd>{ARC_TESTNET.chainName}</dd></div>
          <div className="flex justify-between gap-6 py-4"><dt className="text-muted">Asset</dt><dd>{operation === "Swap" ? "Supported stablecoins" : "USDC"}</dd></div>
          <div className="flex justify-between gap-6 py-4"><dt className="text-muted">Provider</dt><dd>{enabled ? "Configured Arc provider" : "Unavailable"}</dd></div>
          <div className="flex justify-between gap-6 py-4"><dt className="text-muted">Review</dt><dd>{reviewMessage || (enabled ? (connected ? (onArc ? "Ready for details" : "Wrong network") : "Connect wallet to continue") : "Feature disabled")}</dd></div>
        </dl>
      </div>
      <div className="mt-7 flex justify-end"><Button variant="primary" onClick={prepareReview} disabled={!canReview}>Review {operation.toLowerCase()}</Button></div>
    </section>

    <section className="mt-20 border-t border-border pt-10" aria-labelledby="arc-capabilities-title">
      <h2 id="arc-capabilities-title" className="text-[20px] tracking-[-0.03em]">Arc capabilities</h2>
      <div className="mt-7 divide-y divide-border border-y border-border">
        {capabilities.map((capability) => <div key={capability.name} className="grid grid-cols-[170px_1fr_90px] items-center gap-8 py-5">
          <p className="text-[11px]">{capability.name}</p>
          <p className="text-[10px] leading-5 text-muted">{capability.description}</p>
          <div className="text-right"><CapabilityStatus enabled={capability.enabled} /></div>
        </div>)}
      </div>
    </section>

    <section className="mt-20 border-t border-border pt-10" aria-labelledby="treasury-flow-title">
      <p className="text-[9px] uppercase tracking-[0.14em] text-faint">How liquidity moves</p>
      <h2 id="treasury-flow-title" className="mt-3 text-[20px] tracking-[-0.03em]">From funding to settlement</h2>
      <div className="mt-8 grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr] items-center gap-3 text-center text-[10px]">
        {["External liquidity", "Bridge / Unified Balance", "Within Treasury", "Company spending rule", "Approval if required", "Arc settlement"].map((step, index) => <div key={step} className="contents"><div className="min-h-16 border-y border-border px-3 py-4 leading-4">{step}</div>{index < 5 && <span aria-hidden="true" className="text-faint">→</span>}</div>)}
      </div>
      <p className="mt-5 text-[9px] leading-4 text-faint">This view explains the existing product flow. It does not change rule evaluation, approvals or settlement execution.</p>
    </section>
  </div>;
}
