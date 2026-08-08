"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/components/ui/section-title";
import { TreasuryOperationsPanel } from "@/components/treasury-operations-panel";
import type { DemoState } from "@/data/demo-state";
import { shortenAddress, type BrowserEthereumProvider } from "@/lib/arc/network";
import { formatCompanyUsdc, readCompanyLiquidity, type CompanyLiquiditySnapshot } from "@/lib/treasury/company-liquidity";

type TreasuryWallet = { address: string | null; chainId: string | null; provider: BrowserEthereumProvider | null; walletId?: string | null };

export function TreasuryPage({ state, wallet }: { state: DemoState; wallet: TreasuryWallet }) {
  const [liquidity, setLiquidity] = useState<CompanyLiquiditySnapshot | null>(null);
  const [liquidityStatus, setLiquidityStatus] = useState<"loading" | "success" | "error">("loading");
  const [liquidityError, setLiquidityError] = useState("");
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

    <TreasuryOperationsPanel key={`${wallet.walletId ?? "no-wallet"}-${wallet.address ?? "disconnected"}-${wallet.chainId ?? "no-chain"}`} wallet={wallet} />

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
