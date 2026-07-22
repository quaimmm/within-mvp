"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { NetworkStatus } from "@/components/network-status";
import { Button } from "@/components/ui/button";
import {
  isArcTestnet,
  providerErrorDetails,
  switchToArcTestnet,
  validateArcRpc,
  walletConnectionDecision,
  walletConnectionLabel,
  walletErrorMessage,
  type BrowserEthereumProvider,
} from "@/lib/arc/network";
import { DEMO_STORAGE_KEY, restoreDemoState } from "@/data/demo-state";
import { DEMO_ADMIN, isNorthstarEmail } from "@/lib/demo/session";
import { WITHIN_ENTRY_SOURCE_KEY } from "@/components/app-entry-reveal";
import {
  clearSelectedWallet,
  connectBrowserWallet,
  discoverBrowserWallets,
  restoreBrowserWallet,
  subscribeWallet,
} from "@/lib/arc/browser-wallet";
import type { ArcWalletProviderDetail } from "@/lib/arc/types";

type WalletOperation = "connecting" | "switching" | null;

export default function ConnectPage() {
  const router = useRouter();
  const [email, setEmail] = useState("amanda@northstar.io");
  const [error, setError] = useState("");
  const [wallet, setWallet] = useState<{ address: string | null; chainId: string | null }>(() =>
    typeof window === "undefined" ? { address: null, chainId: null } : restoreDemoState(sessionStorage.getItem(DEMO_STORAGE_KEY)).wallet,
  );
  const [walletProvider, setWalletProvider] = useState<BrowserEthereumProvider | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [walletOptions, setWalletOptions] = useState<ArcWalletProviderDetail[]>([]);
  const [walletMessage, setWalletMessage] = useState("");
  const [walletDetails, setWalletDetails] = useState("");
  const [walletMenu, setWalletMenu] = useState(false);
  const [operation, setOperation] = useState<WalletOperation>(null);
  const [rpcReady, setRpcReady] = useState<boolean | null>(null);

  useEffect(() => { router.prefetch("/app"); }, [router]);
  useEffect(() => {
    let active = true;
    discoverBrowserWallets().then((wallets) => { if (active) setWalletOptions(wallets); }).catch(() => undefined);
    restoreBrowserWallet().then((restored) => {
      if (!active) return;
      if (!restored) { setWallet({ address: null, chainId: null }); return; }
      setWalletProvider(restored.provider);
      setWalletName(restored.walletName);
      setWallet({ address: restored.address, chainId: restored.chainId });
      setWalletMessage(isArcTestnet(restored.chainId) ? "Arc Testnet connected." : "Wallet restored on a different network.");
    }).catch((restoreError) => {
      if (active) setWalletDetails(providerErrorDetails(restoreError));
    });
    validateArcRpc().then((ready) => { if (active) setRpcReady(ready); }).catch(() => { if (active) setRpcReady(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => walletProvider ? subscribeWallet(
    walletProvider,
    wallet,
    (next) => setWallet(next),
    () => { setWalletProvider(null); setWalletName(null); setWalletMenu(false); setWalletMessage("Wallet disconnected."); },
  ) : undefined, [walletProvider, wallet]);
  useEffect(() => {
    const state = restoreDemoState(sessionStorage.getItem(DEMO_STORAGE_KEY));
    state.wallet = wallet;
    sessionStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
  }, [wallet]);

  const enter = (demo = false, withoutWallet = false) => {
    const value = demo ? DEMO_ADMIN.email : email;
    if (!isNorthstarEmail(value)) { setError("Use a Northstar work email."); return; }
    try {
      const state = restoreDemoState(sessionStorage.getItem(DEMO_STORAGE_KEY));
      state.signedIn = true;
      state.signedInUser = { ...DEMO_ADMIN };
      state.wallet = withoutWallet ? { address: null, chainId: null } : wallet;
      sessionStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
      sessionStorage.setItem(WITHIN_ENTRY_SOURCE_KEY, "connect");
      router.push("/app");
    } catch { setError("Workspace could not be prepared. Please try again."); }
  };

  async function connect(detail?: ArcWalletProviderDetail) {
    setOperation("connecting"); setWalletMessage(""); setWalletDetails("");
    try {
      const connected = await connectBrowserWallet(detail);
      setWalletProvider(connected.provider);
      setWalletName(connected.walletName);
      setWallet({ address: connected.address, chainId: connected.chainId });
      setWalletMessage(isArcTestnet(connected.chainId) ? "Arc Testnet connected." : "Connected. Switch to Arc Testnet to participate in treasury approvals.");
    } catch (connectError) {
      setWalletMessage(walletErrorMessage(connectError, "connect"));
      setWalletDetails(providerErrorDetails(connectError));
    } finally { setOperation(null); }
  }

  async function switchNetwork() {
    if (!walletProvider) { setWalletMessage("Reconnect the selected wallet before switching networks."); return; }
    setOperation("switching"); setWalletMessage(""); setWalletDetails("");
    try {
      const actualChainId = await switchToArcTestnet(walletProvider);
      setWallet((current) => ({ ...current, chainId: actualChainId }));
      setWalletMessage("Arc Testnet connected.");
    } catch (switchError) {
      setWalletMessage(walletErrorMessage(switchError, "switch"));
      setWalletDetails(providerErrorDetails(switchError));
    } finally { setOperation(null); }
  }

  function disconnect() {
    clearSelectedWallet();
    setWalletProvider(null); setWalletName(null); setWallet({ address: null, chainId: null }); setWalletMenu(false);
    setWalletMessage("Wallet session disconnected. Your demo workspace is unchanged.");
  }

  async function copyAddress() {
    if (!wallet.address) return;
    await navigator.clipboard.writeText(wallet.address);
    setWalletMessage("Wallet address copied.");
  }

  const walletButtonLabel = walletConnectionLabel(wallet.address, wallet.chainId, operation);
  const walletDecision = walletConnectionDecision(wallet.address, wallet.chainId);

  return <main className="min-h-screen bg-canvas px-6 py-10 text-ink"><div className="mx-auto max-w-[1040px]"><BrandLogo variant="header"/><div className="mt-16 grid gap-16 lg:grid-cols-[.9fr_1.1fr]"><section><h1 className="font-[family-name:var(--font-brand)] text-[54px] leading-[.98] tracking-[-.065em]">Freedom without friction.<br/><span className="control-accent text-accent">Control <span className="relative inline-block">within<svg className="within-flourish" viewBox="0 0 220 12" preserveAspectRatio="none" aria-hidden="true"><path d="M4 8.2C52 4.9 107 3.2 157 4.4c25 .6 43 1.6 59 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></span>.</span></h1><p className="mt-8 max-w-md text-[11px] leading-6 text-muted">Connect your company workspace and optionally an Arc Testnet wallet. A wallet is never required to explore the demonstration.</p></section><div className="space-y-5"><section className="rounded-[18px] border border-border bg-white p-7"><p className="text-[9px] uppercase tracking-[.12em] text-faint">Company access</p><h2 className="mt-4 text-[24px] tracking-[-.04em]">Continue to Northstar Labs</h2><label className="mt-7 block text-[10px] text-muted">Work email<input aria-label="Work email" value={email} onChange={(event)=>setEmail(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-border px-3 text-[11px] outline-none focus:border-accent"/></label>{error&&<p role="alert" className="mt-3 text-[10px] text-[#9a4d45]">{error}</p>}<Button variant="primary" onClick={()=>enter()} className="mt-6 h-11 w-full">Continue to workspace</Button><Button onClick={()=>enter(true)} className="mt-3 h-11 w-full">Continue as demo administrator</Button><p className="mt-4 text-[9px] text-faint">No password is required for this hackathon prototype.</p></section><section className="rounded-[18px] border border-border bg-white p-7"><div className="flex items-start justify-between gap-4"><div><p className="text-[9px] uppercase tracking-[.12em] text-faint">Wallet connection</p><h2 className="mt-4 text-[20px] tracking-[-.035em]">Connect a wallet</h2></div><NetworkStatus address={wallet.address} chainId={wallet.chainId}/></div><p className="mt-4 text-[10px] leading-5 text-muted">Connect an Arc Testnet wallet to view network status and participate in treasury approvals.</p><div className="relative mt-6 flex flex-wrap gap-3">{walletDecision.connected?<><Button onClick={()=>setWalletMenu((open)=>!open)} disabled={operation!==null}><span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[#55a06f]"/>{walletButtonLabel}</Button>{walletDecision.onArcTestnet?<Button variant="primary" onClick={()=>enter()} disabled={operation!==null}>Continue to workspace</Button>:<><Button variant="primary" onClick={switchNetwork} disabled={operation!==null}>{operation==="switching"?"Switching network…":"Switch to Arc Testnet"}</Button><Button onClick={()=>enter()} disabled={operation!==null}>Continue to workspace</Button></>}<Button onClick={disconnect} disabled={operation!==null}>Disconnect wallet</Button></>:<>{walletDecision.showConnectWallet&&<Button variant="primary" onClick={()=>walletOptions.length===1?connect(walletOptions[0]):setWalletMenu((open)=>!open)} disabled={operation!==null}><span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-white/45"/>{walletButtonLabel}</Button>}{walletDecision.showContinueWithoutWallet&&<Button onClick={()=>enter(false,true)}>Continue without wallet</Button>}</>}{walletMenu&&<div className="absolute left-0 top-12 z-20 w-72 rounded-xl border border-border bg-white p-4 shadow-[0_18px_45px_rgba(23,24,21,.1)]">{wallet.address?<><p className="text-[11px]">{walletName||"Browser wallet"}</p><p className="mt-2 break-all text-[9px] text-muted">{wallet.address}</p><p className="mt-4 text-[10px]">{isArcTestnet(wallet.chainId)?"Arc Testnet":"Wrong network"}</p><div className="mt-4"><Button onClick={copyAddress}>Copy address</Button></div></>:<><p className="text-[10px] text-muted">Choose a wallet</p><div className="mt-2 space-y-1">{walletOptions.length?walletOptions.map((option)=><button key={option.info.uuid} onClick={()=>{setWalletMenu(false);connect(option);}} className="block w-full rounded-lg px-2 py-2 text-left text-[11px] hover:bg-canvas">{option.info.name}</button>):<p className="py-2 text-[10px] text-muted">No compatible browser wallet detected.</p>}</div></>}</div>}</div><p className="mt-4 text-[9px] text-faint">Arc RPC: {rpcReady===null?"Checking…":rpcReady?"Available":"Temporarily unavailable"}</p>{walletMessage&&<p role="status" className="mt-3 text-[10px] leading-5 text-muted">{walletMessage}</p>}{walletDetails&&process.env.NODE_ENV==="development"&&<details className="mt-3 text-[9px] text-faint"><summary>Developer details</summary><p className="mt-2 break-words">{walletDetails}</p></details>}</section></div></div></div></main>;
}
