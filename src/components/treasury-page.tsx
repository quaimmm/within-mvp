"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/components/ui/section-title";
import { TreasuryCapabilitySummary, TreasuryOperationsPanel } from "@/components/treasury-operations-panel";
import type { DemoState } from "@/data/demo-state";
import { shortenAddress, type BrowserEthereumProvider } from "@/lib/arc/network";
import { formatCompanyUsdc, readCompanyLiquidity, type CompanyLiquiditySnapshot } from "@/lib/treasury/company-liquidity";

type TreasuryWallet = { address: string | null; chainId: string | null; provider: BrowserEthereumProvider | null; walletId?: string | null };

export function TreasuryPage({ state, wallet }: { state: DemoState; wallet: TreasuryWallet }) {
  const [liquidity, setLiquidity] = useState<CompanyLiquiditySnapshot | null>(null);
  const [liquidityStatus, setLiquidityStatus] = useState<"loading" | "success" | "error">("loading");
  const [liquidityError, setLiquidityError] = useState("");
  const [addressCopied, setAddressCopied] = useState(false);
  const totalTreasury = liquidityStatus === "success" && liquidity ? `${formatCompanyUsdc(liquidity.totalTreasury)} USDC` : liquidityStatus === "loading" ? "Reading…" : "Unavailable";

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
      <SectionTitle title="Treasury" description="Manage company USDC liquidity and settlement." />
      <Button onClick={() => void refreshLiquidity()} disabled={liquidityStatus === "loading"} className="mt-1">Refresh</Button>
    </div>

    <section className="mt-14 border-y border-border py-10" aria-labelledby="treasury-overview-title">
      <p className="text-[9px] uppercase tracking-[0.14em] text-faint">Available liquidity</p>
      <div className="mt-7 flex flex-wrap items-end justify-between gap-8">
        <div>
          <p id="treasury-overview-title" className="text-[48px] tracking-[-0.055em]">{totalTreasury}</p>
          <p className="mt-3 text-[10px] text-muted">USDC available to {state.company.companyName}</p>
        </div>
        <p className={`pb-1 text-[10px] ${liquidityStatus === "success" ? "text-success" : "text-muted"}`}><span className={`mr-2 inline-block size-1.5 rounded-full ${liquidityStatus === "success" ? "bg-success" : "bg-faint"}`} />{liquidityStatus === "success" ? "Arc Testnet · Live" : liquidityStatus === "loading" ? "Reading Arc Testnet" : "Arc Testnet · Unavailable"}</p>
      </div>
      {liquidityStatus === "error" && <p role="status" className="mt-4 text-[10px] text-muted">{liquidityError}</p>}
    </section>

    <TreasuryCapabilitySummary />

    <section className="mt-16" aria-labelledby="network-distribution-title">
      <div className="flex items-end justify-between">
        <div><h2 id="network-distribution-title" className="text-[20px] tracking-[-0.03em]">Across networks</h2><p className="mt-2 text-[10px] text-muted">Where recorded company liquidity is currently held.</p></div>
      </div>
      <div className="mt-7 divide-y divide-border border-y border-border">
        {liquidityStatus === "success" && liquidity ? liquidity.networks.map((network) => <div key={network.network} className="grid grid-cols-[1fr_1fr_120px] items-center gap-8 py-5 text-[11px]"><p>{network.network}</p><p className="text-right">{formatCompanyUsdc(network.balance)} USDC</p><p className="text-right text-[9px] text-success">Live</p></div>) : <div className="py-5 text-[10px] text-muted">{liquidityStatus === "loading" ? "Reading Arc liquidity…" : "Network balances are temporarily unavailable."}</div>}
      </div>
      {liquidity && <details className="group mt-5 border-b border-border text-[10px]"><summary className="flex cursor-pointer list-none items-center justify-between py-4 text-muted marker:hidden">Technical details<span className="text-faint transition-transform group-open:rotate-180">⌄</span></summary><dl className="space-y-4 pb-5"><div className="flex items-center justify-between gap-8"><dt className="text-faint">Network</dt><dd>Arc Testnet</dd></div><div className="flex min-w-0 items-center justify-between gap-8"><dt className="shrink-0 text-faint">Treasury address</dt><dd className="flex min-w-0 items-center gap-4"><span title={liquidity.treasuryAddress} className="truncate font-mono">{shortenAddress(liquidity.treasuryAddress)}</span><button type="button" onClick={() => void navigator.clipboard.writeText(liquidity.treasuryAddress).then(() => setAddressCopied(true))} className="shrink-0 text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">{addressCopied ? "Copied" : "Copy"}</button></dd></div>{liquidity.blockNumber !== null && <div className="flex items-center justify-between gap-8"><dt className="text-faint">Latest block</dt><dd>{liquidity.blockNumber.toLocaleString("en-GB")}</dd></div>}</dl></details>}
    </section>

    <TreasuryOperationsPanel
      key={`${wallet.walletId ?? "no-wallet"}-${wallet.address ?? "disconnected"}-${wallet.chainId ?? "no-chain"}`}
      wallet={wallet}
      onRefreshTreasury={refreshLiquidity}
    />

  </div>;
}
