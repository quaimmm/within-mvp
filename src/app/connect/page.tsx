"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { NetworkStatus } from "@/components/network-status";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/components/wallet-provider";
import { WalletSelector } from "@/components/wallet-selector";
import { discoverBrowserWallets } from "@/lib/arc/browser-wallet";
import type { ArcWalletProviderDetail } from "@/lib/arc/types";
import {
  isArcTestnet,
  providerErrorDetails,
  validateArcRpc,
  walletConnectionDecision,
  walletErrorMessage,
} from "@/lib/arc/network";
import { DEMO_STORAGE_KEY, restoreDemoState } from "@/data/demo-state";

type WalletOperation = "connecting" | null;

export default function ConnectPage() {
  const router = useRouter();
  const walletSession = useWallet();
  const wallet = walletSession.wallet;
  const [walletMessage, setWalletMessage] = useState("");
  const [walletDetails, setWalletDetails] = useState("");
  const [operation, setOperation] = useState<WalletOperation>(null);
  const [rpcReady, setRpcReady] = useState<boolean | null>(null);
  const [walletOptions, setWalletOptions] = useState<ArcWalletProviderDetail[]>([]);
  const [scanningWallets, setScanningWallets] = useState(true);
  const [busyWalletId, setBusyWalletId] = useState<string | null>(null);

  useEffect(() => { router.prefetch("/app"); }, [router]);
  useEffect(() => {
    let active = true;
    const demoState = restoreDemoState(sessionStorage.getItem(DEMO_STORAGE_KEY));
    demoState.wallet = { address: null, chainId: null };
    sessionStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(demoState));
    validateArcRpc().then((ready) => { if (active) setRpcReady(ready); }).catch(() => { if (active) setRpcReady(false); });
    return () => { active = false; };
  }, []);

  async function scanWallets() {
    setScanningWallets(true);
    try {
      setWalletOptions(await discoverBrowserWallets());
    } finally {
      setScanningWallets(false);
    }
  }

  useEffect(() => {
    let active = true;
    discoverBrowserWallets()
      .then((options) => { if (active) setWalletOptions(options); })
      .finally(() => { if (active) setScanningWallets(false); });
    return () => { active = false; };
  }, []);

  const continueToWorkspace = () => router.push("/app");

  async function connect(detail?: ArcWalletProviderDetail) {
    setOperation("connecting"); setWalletMessage(""); setWalletDetails("");
    setBusyWalletId(detail?.info.uuid ?? null);
    try {
      const connected = await walletSession.connect(detail);
      setWalletMessage(isArcTestnet(connected.chainId) ? "Arc Testnet connected." : "Connected. Switch to Arc Testnet to participate in treasury approvals.");
    } catch (connectError) {
      setWalletMessage((connectError as { code?: number })?.code === 4001 ? "Wallet connection was cancelled." : walletErrorMessage(connectError, "connect"));
      setWalletDetails(providerErrorDetails(connectError));
    } finally { setOperation(null); setBusyWalletId(null); }
  }

  async function disconnect() {
    await walletSession.disconnect();
    setWalletMessage("Wallet disconnected from Within for this browser session.");
  }

  const walletDecision = walletConnectionDecision(wallet.address, wallet.chainId);

  return <main className="min-h-screen bg-canvas px-6 py-10 text-ink">
    <div className="mx-auto max-w-[1040px]">
      <BrandLogo variant="header"/>
      <div className="mt-16 grid gap-16 lg:grid-cols-[.9fr_1.1fr]">
        <section>
          <h1 className="font-[family-name:var(--font-brand)] text-[54px] leading-[.98] tracking-[-.065em]">Freedom without friction.<br/><span className="control-accent text-accent">Control <span className="relative inline-block">within<svg className="within-flourish" viewBox="0 0 220 12" preserveAspectRatio="none" aria-hidden="true"><path d="M4 8.2C52 4.9 107 3.2 157 4.4c25 .6 43 1.6 59 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></span>.</span></h1>
          <p className="mt-8 max-w-md text-[11px] leading-6 text-muted">Connect your wallet to enter the workspace.</p>
        </section>
        <div>
          <section className="rounded-[18px] border border-border bg-white p-7">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-[9px] uppercase tracking-[.12em] text-faint">Wallet connection</p><h2 className="mt-4 text-[24px] tracking-[-.04em]">Choose your wallet</h2></div>
              <NetworkStatus address={wallet.address} chainId={wallet.chainId}/>
            </div>
            <dl className="mt-6 divide-y divide-border border-y border-border text-[10px]">
              <div className="flex justify-between gap-8 py-4"><dt className="text-muted">Wallet</dt><dd>{wallet.walletName || "Not selected"}</dd></div>
              <div className="flex justify-between gap-8 py-4"><dt className="text-muted">Connected account</dt><dd className="max-w-[280px] break-all text-right">{wallet.address || "Disconnected"}</dd></div>
              <div className="flex justify-between gap-8 py-4"><dt className="text-muted">Network</dt><dd>{wallet.address ? isArcTestnet(wallet.chainId) ? "Arc Testnet" : "Wrong network" : "Not connected"}</dd></div>
            </dl>
            <WalletSelector wallets={walletOptions} connectedWalletId={wallet.walletId} busyWalletId={busyWalletId} scanning={scanningWallets} onSelect={(detail) => void connect(detail)} onRescan={() => void scanWallets()}/>
            {walletDecision.connected ? (
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <Button variant="primary" onClick={continueToWorkspace} className="h-11 w-full">Continue to workspace</Button>
                <Button onClick={()=>void disconnect()} disabled={operation!==null} className="h-11 w-full">Disconnect from Within</Button>
              </div>
            ) : (
              <div className="mt-6 flex flex-wrap gap-3">
                {walletOptions.length === 0 && !scanningWallets && <Button variant="primary" onClick={() => void scanWallets()} disabled={operation!==null}>Rescan wallets</Button>}
              </div>
            )}
            <p className="mt-4 text-[9px] text-faint">Arc RPC: {rpcReady===null?"Checking…":rpcReady?"Available":"Temporarily unavailable"}</p>
            {walletMessage&&<p role="status" className="mt-3 text-[10px] leading-5 text-muted">{walletMessage}</p>}
            {walletDetails&&process.env.NODE_ENV==="development"&&<details className="mt-3 text-[9px] text-faint"><summary>Developer details</summary><p className="mt-2 break-words">{walletDetails}</p></details>}
          </section>
        </div>
      </div>
    </div>
  </main>;
}
