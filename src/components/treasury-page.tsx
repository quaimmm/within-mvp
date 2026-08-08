"use client";

import { useEffect, useState } from "react";
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
import { formatCompanyUsdc, readCompanyLiquidity, type CompanyLiquiditySnapshot } from "@/lib/treasury/company-liquidity";

type TreasuryCapability = "Send" | "Bridge" | "Swap";
type TreasuryWallet = { address: string | null; chainId: string | null };

const operationFlags: Record<TreasuryCapability, boolean> = {
  Send: ARC_SEND_ENABLED,
  Bridge: ARC_BRIDGE_ENABLED,
  Swap: ARC_SWAP_ENABLED,
};

const fieldClass = "mt-3 h-11 w-full border-b border-border bg-transparent text-[12px] text-ink outline-none transition-colors placeholder:text-faint focus:border-accent disabled:cursor-not-allowed disabled:text-faint";

function CapabilityStatus({ enabled }: { enabled: boolean }) {
  return <span className={`text-[9px] ${enabled ? "text-success" : "text-muted"}`}>{enabled ? "Enabled" : "Disabled"}</span>;
}

export function TreasuryPage({ state, wallet }: { state: DemoState; wallet: TreasuryWallet }) {
  const [operation, setOperation] = useState<TreasuryCapability>("Send");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  const [liquidity, setLiquidity] = useState<CompanyLiquiditySnapshot | null>(null);
  const [liquidityStatus, setLiquidityStatus] = useState<"loading" | "success" | "error">("loading");
  const [liquidityError, setLiquidityError] = useState("");
  const connected = Boolean(wallet.address);
  const onArc = isArcTestnet(wallet.chainId);
  const enabled = operationFlags[operation];
  const canReview = enabled && connected && onArc && amount.trim().length > 0 && (operation !== "Send" || recipient.trim().length > 0);
  const totalTreasury = liquidityStatus === "success" && liquidity ? `${formatCompanyUsdc(liquidity.totalTreasury)} USDC` : liquidityStatus === "loading" ? "Reading…" : "Unavailable";
  const availableBalance = liquidityStatus === "success" && liquidity ? `${formatCompanyUsdc(liquidity.availableToSpend)} USDC` : liquidityStatus === "loading" ? "Reading…" : "Unavailable";

  async function refreshLiquidity() {
    setLiquidityStatus("loading");
    setLiquidityError("");
    try {
      setLiquidity(await readCompanyLiquidity());
      setLiquidityStatus("success");
    } catch (error) {
      setLiquidity(null);
      setLiquidityStatus("error");
      setLiquidityError(error instanceof Error ? error.message : "Arc treasury state is temporarily unavailable.");
    }
  }

  useEffect(() => {
    let current = true;
    readCompanyLiquidity().then((snapshot) => {
      if (!current) return;
      setLiquidity(snapshot);
      setLiquidityStatus("success");
    }).catch((error: unknown) => {
      if (!current) return;
      setLiquidity(null);
      setLiquidityStatus("error");
      setLiquidityError(error instanceof Error ? error.message : "Arc treasury state is temporarily unavailable.");
    });
    return () => { current = false; };
  }, []);

  function prepareReview() {
    if (!canReview) return;
    setReviewMessage(`${operation} review prepared. No transaction has been submitted.`);
  }

  return <div className="mx-auto max-w-[1120px]">
    <div className="flex items-start justify-between gap-10">
      <SectionTitle title="Treasury" description="Company liquidity." />
      <div className="pt-1 text-right">
        <p className="text-[9px] uppercase tracking-[0.14em] text-faint">Treasury source</p>
        <p className="mt-2 text-[11px] text-ink"><span className={`mr-2 inline-block size-1.5 rounded-full ${liquidityStatus === "success" ? "bg-success" : "bg-faint"}`} />{liquidityStatus === "success" ? "Arc Testnet · Live" : liquidityStatus === "loading" ? "Reading Arc Testnet" : "Temporarily unavailable"}</p>
        <Button onClick={() => void refreshLiquidity()} disabled={liquidityStatus === "loading"} className="mt-3">Refresh</Button>
      </div>
    </div>

    <section className="mt-14 border-y border-border py-10" aria-labelledby="treasury-overview-title">
      <p className="text-[9px] uppercase tracking-[0.14em] text-faint">Company liquidity</p>
      <div className="mt-7 grid grid-cols-[1.45fr_1fr_1fr] items-end divide-x divide-border">
        <div className="pr-10">
          <p id="treasury-overview-title" className="text-[48px] tracking-[-0.055em]">{totalTreasury}</p>
          <p className="mt-3 text-[10px] text-muted">Total treasury</p>
        </div>
        <div className="px-10">
          <p className="text-[24px] tracking-[-0.04em]">{availableBalance}</p>
          <p className="mt-3 text-[10px] text-muted">Available to spend</p>
        </div>
        <div className="pl-10">
          <p className="text-[24px] tracking-[-0.04em]">Not recorded</p>
          <p className="mt-3 text-[10px] text-muted">Pending / reserved</p>
        </div>
      </div>
      <p className="mt-8 text-[9px] leading-4 text-faint">Live USDC held by {state.company.companyName}&apos; configured Arc treasury. Credit capacity and employee credit are excluded. No cross-network reservation ledger is available in this release.</p>
      {liquidityStatus === "error" && <p role="status" className="mt-4 text-[10px] text-muted">{liquidityError}</p>}
    </section>

    <section className="mt-16" aria-labelledby="network-distribution-title">
      <div className="flex items-end justify-between">
        <div><h2 id="network-distribution-title" className="text-[20px] tracking-[-0.03em]">Across networks</h2><p className="mt-2 text-[10px] text-muted">Where recorded company liquidity is currently held.</p></div>
        {liquidity?.blockNumber !== null && liquidity?.blockNumber !== undefined && <p className="text-[9px] text-faint">Block {liquidity.blockNumber.toLocaleString("en-GB")}</p>}
      </div>
      <div className="mt-7 divide-y divide-border border-y border-border">
        {liquidityStatus === "success" && liquidity ? liquidity.networks.map((network) => <div key={network.network} className="grid grid-cols-[1fr_1fr_120px] items-center gap-8 py-5 text-[11px]"><p>{network.network}</p><p className="text-right">{formatCompanyUsdc(network.balance)} USDC</p><p className="text-right text-[9px] text-success">Live</p></div>) : <div className="py-5 text-[10px] text-muted">{liquidityStatus === "loading" ? "Reading Arc liquidity…" : "Network balances are temporarily unavailable."}</div>}
      </div>
      {liquidity && <div className="mt-4 flex items-center justify-between gap-8 text-[9px] text-faint"><span>Only networks with verified balance data are shown.</span><span>{shortenAddress(liquidity.treasuryAddress)}</span></div>}
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
            {operation === "Send" && <label className="text-[10px] text-muted">Recipient<input aria-label="Treasury recipient" value={recipient} onChange={(event) => { setRecipient(event.target.value); setReviewMessage(""); }} placeholder={enabled ? "0x…" : "Unavailable"} disabled={!enabled} className={fieldClass} /></label>}
            {operation === "Bridge" && <label className="text-[10px] text-muted">From<select aria-label="Treasury bridge source network" disabled={!enabled} className={fieldClass} defaultValue=""><option value="">Supported network</option></select></label>}
            {operation === "Swap" && <label className="text-[10px] text-muted">You pay<select aria-label="Treasury swap source asset" disabled={!enabled} className={fieldClass} defaultValue="EURC"><option>EURC</option><option>USDC</option></select></label>}
            <label className="text-[10px] text-muted">Amount<input aria-label={`Treasury ${operation.toLowerCase()} amount`} value={amount} onChange={(event) => { setAmount(event.target.value); setReviewMessage(""); }} placeholder={enabled ? "USDC amount" : "Unavailable"} disabled={!enabled} inputMode="decimal" className={fieldClass} /></label>
          </div>
        </div>
        <dl className="divide-y divide-border border-y border-border text-[10px]">
          <div className="flex justify-between gap-6 py-4"><dt className="text-muted">Network</dt><dd>{ARC_TESTNET.chainName}</dd></div>
          <div className="flex justify-between gap-6 py-4"><dt className="text-muted">Asset</dt><dd>{operation === "Swap" ? "Supported stablecoins" : "USDC"}</dd></div>
          <div className="flex justify-between gap-6 py-4"><dt className="text-muted">Provider</dt><dd>{enabled ? "Configured Arc provider" : "Unavailable"}</dd></div>
          <div className="flex justify-between gap-6 py-4"><dt className="text-muted">Review</dt><dd>{reviewMessage || (enabled ? (connected ? (onArc ? "Ready for details" : "Wrong network") : "Connect wallet to continue") : "Disabled")}</dd></div>
        </dl>
      </div>
      <div className="mt-7 flex justify-end"><Button variant="primary" onClick={prepareReview} disabled={!canReview}>Review {operation.toLowerCase()}</Button></div>
    </section>

    <section className="mt-20 border-t border-border pt-10" aria-labelledby="arc-liquidity-title">
      <h2 id="arc-liquidity-title" className="text-[20px] tracking-[-0.03em]">Arc liquidity</h2>
      <p className="mt-2 text-[10px] text-muted">Optional Arc capabilities that help Finance make company USDC available for settlement.</p>
      <div className="mt-7 divide-y divide-border border-y border-border">
        <div className="grid grid-cols-[170px_1fr_110px] items-center gap-8 py-5">
          <p className="text-[11px]">Arc App Kit</p>
          <p className="text-[10px] leading-5 text-muted">Provider access for enabled treasury operations.</p>
          <div className="text-right"><CapabilityStatus enabled={ARC_APP_KIT_ENABLED} /></div>
        </div>
        <div className="grid grid-cols-[170px_1fr_110px] items-center gap-8 py-5">
          <p className="text-[11px]">Unified Balance</p>
          <p className="text-[10px] leading-5 text-muted">Use supported USDC balances as one spendable balance.</p>
          <div className="text-right"><CapabilityStatus enabled={ARC_UNIFIED_BALANCE_ENABLED} /></div>
        </div>
        <div className="grid grid-cols-[170px_1fr_110px] items-center gap-8 py-5">
          <p className="text-[11px]">USDC-native gas</p>
          <p className="text-[10px] leading-5 text-muted">Arc transactions do not require a separate ETH gas balance.</p>
          <p className="text-right text-[9px] text-success">Arc Testnet</p>
        </div>
        <div className="grid grid-cols-[170px_1fr_110px] items-center gap-8 py-5">
          <p className="text-[11px]">Treasury read</p>
          <p className="text-[10px] leading-5 text-muted">Company USDC is read directly from the configured Arc treasury address.</p>
          <p className={`text-right text-[9px] ${liquidityStatus === "success" ? "text-success" : "text-muted"}`}>{liquidityStatus === "success" ? "Live" : liquidityStatus === "loading" ? "Reading" : "Unavailable"}</p>
        </div>
      </div>
    </section>

    <section className="mt-20 border-t border-border pt-10" aria-labelledby="treasury-flow-title">
      <p className="text-[9px] uppercase tracking-[0.14em] text-faint">How liquidity moves</p>
      <h2 id="treasury-flow-title" className="mt-3 text-[20px] tracking-[-0.03em]">From funding to settlement</h2>
      <div className="mt-8 grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr] items-center gap-3 text-center text-[10px]">
        {["Company assets", "Treasury", "Send / Bridge / Swap / Unified Balance", "Liquidity on Arc", "Rules and approvals", "Arc settlement"].map((step, index) => <div key={step} className="contents"><div className="min-h-16 border-y border-border px-3 py-4 leading-4">{step}</div>{index < 5 && <span aria-hidden="true" className="text-faint">→</span>}</div>)}
      </div>
      <p className="mt-5 text-[9px] leading-4 text-faint">This view explains the existing product flow. It does not change rule evaluation, approvals or settlement execution.</p>
    </section>
  </div>;
}
