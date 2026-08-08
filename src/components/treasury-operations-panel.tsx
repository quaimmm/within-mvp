"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { appKitErrorMessage } from "@/lib/arc/app-kit-payment-provider";
import {
  ARC_APP_KIT_ENABLED,
  ARC_BRIDGE_ENABLED,
  ARC_PUBLIC_ADDRESSES,
  ARC_SEND_ENABLED,
  ARC_SWAP_ENABLED,
  ARC_UNIFIED_BALANCE_ENABLED,
} from "@/lib/arc/feature-flags";
import { ARC_TESTNET, isArcTestnet, shortenAddress } from "@/lib/arc/network";
import type { AppKitPaymentResult, PaymentEstimate } from "@/lib/arc/types";
import type { TreasuryAsset, TreasurySwapQuote } from "@/lib/arc/treasury-swap";
import {
  getTreasuryCapabilityStates,
  TreasuryAppKitGateway,
  type TreasuryBridgeReview,
  type TreasuryCapabilityState,
  type TreasuryUnifiedBalance,
  type TreasuryWalletContext,
} from "@/lib/treasury/treasury-app-kit-gateway";

type Operation = "Send" | "Bridge" | "Swap";
type SendReview = { estimate: PaymentEstimate; recipient: string; amount: string; reference: string };
type AsyncState = "idle" | "loading" | "success" | "error";

const fieldClass = "mt-3 h-11 w-full border-b border-border bg-transparent text-[12px] text-ink outline-none transition-colors placeholder:text-faint focus:border-accent disabled:cursor-not-allowed disabled:text-faint";

const capabilityStates = getTreasuryCapabilityStates({
  appKit: ARC_APP_KIT_ENABLED,
  send: ARC_SEND_ENABLED,
  bridge: ARC_BRIDGE_ENABLED,
  swap: ARC_SWAP_ENABLED,
  unifiedBalance: ARC_UNIFIED_BALANCE_ENABLED,
});

function CapabilityBadge({ capability }: { capability: TreasuryCapabilityState }) {
  return (
    <span className={`text-[9px] uppercase tracking-[0.12em] ${capability.enabled ? "text-accent" : "text-faint"}`}>
      {capability.mode}{capability.enabled ? "" : " · unavailable"}
    </span>
  );
}

function walletRequirement(wallet: TreasuryWalletContext, requireArc = true) {
  if (!wallet.address || !wallet.provider) return "Connect wallet in the header to continue.";
  if (requireArc && !isArcTestnet(wallet.chainId)) return `Switch to ${ARC_TESTNET.chainName} to continue.`;
  return null;
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "The Arc request could not be completed.";
}

export function TreasuryOperationsPanel({ wallet }: { wallet: TreasuryWalletContext }) {
  const [operation, setOperation] = useState<Operation>("Send");
  const [recipient, setRecipient] = useState(ARC_PUBLIC_ADDRESSES.merchant);
  const [sendAmount, setSendAmount] = useState("0.01");
  const [sendState, setSendState] = useState<AsyncState | "reviewed" | "pending">("idle");
  const [sendMessage, setSendMessage] = useState("");
  const [sendReview, setSendReview] = useState<SendReview | null>(null);
  const [sendResult, setSendResult] = useState<AppKitPaymentResult | null>(null);
  const sendLock = useRef(false);

  const [bridgeAmount, setBridgeAmount] = useState("0.01");
  const [bridgeDestination, setBridgeDestination] = useState(ARC_PUBLIC_ADDRESSES.treasury || wallet.address || "");
  const [bridgeState, setBridgeState] = useState<AsyncState>("idle");
  const [bridgeMessage, setBridgeMessage] = useState("");
  const [bridgeReview, setBridgeReview] = useState<TreasuryBridgeReview | null>(null);

  const [swapFrom, setSwapFrom] = useState<TreasuryAsset>("EURC");
  const [swapTo, setSwapTo] = useState<TreasuryAsset>("USDC");
  const [swapAmount, setSwapAmount] = useState("0.01");
  const [swapState, setSwapState] = useState<AsyncState>("idle");
  const [swapMessage, setSwapMessage] = useState("");
  const [swapQuote, setSwapQuote] = useState<TreasurySwapQuote | null>(null);

  const [unifiedState, setUnifiedState] = useState<AsyncState>("idle");
  const [unifiedMessage, setUnifiedMessage] = useState("");
  const [unifiedBalance, setUnifiedBalance] = useState<TreasuryUnifiedBalance | null>(null);

  const gateway = useMemo(() => new TreasuryAppKitGateway(wallet), [wallet]);
  const connectedWalletLabel = wallet.address && ARC_PUBLIC_ADDRESSES.treasury && wallet.address.toLowerCase() === ARC_PUBLIC_ADDRESSES.treasury.toLowerCase()
    ? "Company treasury wallet"
    : "Connected finance wallet";

  function updateSendRecipient(value: string) {
    setRecipient(value);
    setSendReview(null);
    setSendResult(null);
    setSendState("idle");
    setSendMessage("");
  }

  function updateSendAmount(value: string) {
    setSendAmount(value);
    setSendReview(null);
    setSendResult(null);
    setSendState("idle");
    setSendMessage("");
  }

  async function reviewSend() {
    if (!capabilityStates.send.enabled) return;
    setSendState("loading");
    setSendMessage("");
    setSendResult(null);
    try {
      const reference = `TREASURY-SEND-${Date.now()}`;
      const estimate = await gateway.reviewSend({ recipient, amount: sendAmount, reference });
      setSendReview({ estimate, recipient, amount: sendAmount, reference });
      setSendState("reviewed");
    } catch (error) {
      setSendReview(null);
      setSendState("error");
      setSendMessage(appKitErrorMessage(error));
    }
  }

  async function confirmSend() {
    if (!sendReview || sendLock.current || sendResult) return;
    sendLock.current = true;
    setSendState("pending");
    setSendMessage("Waiting for wallet and Arc confirmation…");
    try {
      const result = await gateway.confirmSend({
        recipient: sendReview.recipient,
        amount: sendReview.amount,
        reference: sendReview.reference,
      });
      setSendResult(result);
      setSendState("success");
      setSendMessage("Send completed on Arc Testnet.");
    } catch (error) {
      setSendState("error");
      setSendMessage(appKitErrorMessage(error));
    } finally {
      sendLock.current = false;
    }
  }

  async function reviewBridgeEstimate() {
    if (!capabilityStates.bridge.enabled) return;
    setBridgeState("loading");
    setBridgeMessage("");
    setBridgeReview(null);
    try {
      setBridgeReview(await gateway.reviewBridge(bridgeDestination, bridgeAmount));
      setBridgeState("success");
    } catch {
      setBridgeState("error");
      setBridgeMessage("Live estimate unavailable.");
    }
  }

  async function reviewSwapEstimate() {
    if (!capabilityStates.swap.enabled) return;
    setSwapState("loading");
    setSwapMessage("");
    setSwapQuote(null);
    try {
      setSwapQuote(await gateway.reviewSwap({ fromAsset: swapFrom, toAsset: swapTo, amount: swapAmount }));
      setSwapState("success");
    } catch {
      setSwapState("error");
      setSwapMessage("Live quote unavailable.");
    }
  }

  async function refreshUnifiedBalance() {
    if (!capabilityStates.unifiedBalance.enabled) return;
    setUnifiedState("loading");
    setUnifiedMessage("");
    try {
      setUnifiedBalance(await gateway.readUnifiedBalance());
      setUnifiedState("success");
    } catch (error) {
      setUnifiedBalance(null);
      setUnifiedState("error");
      setUnifiedMessage(errorText(error).includes("Connect") ? errorText(error) : "Unified Balance unavailable.");
    }
  }

  const activeCapability = operation === "Send" ? capabilityStates.send : operation === "Bridge" ? capabilityStates.bridge : capabilityStates.swap;
  const activeRequirement = walletRequirement(wallet, operation !== "Bridge");
  const sendArcscanUrl = sendResult?.transactionHash ? `${ARC_TESTNET.explorerUrl}/tx/${sendResult.transactionHash}` : null;

  return <>
    <section className="mt-20" aria-labelledby="move-money-title">
      <div className="flex items-end justify-between gap-10">
        <div><h2 id="move-money-title" className="text-[24px] tracking-[-0.035em]">Move money</h2><p className="mt-3 text-[11px] leading-5 text-muted">Review live Arc treasury operations before any wallet request.</p></div>
        <div className="flex border-b border-border" role="tablist" aria-label="Treasury operations">
          {(["Send", "Bridge", "Swap"] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={operation === item} onClick={() => setOperation(item)} className={`min-w-20 px-4 pb-3 text-[11px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${operation === item ? "border-b border-ink text-ink" : "text-muted hover:text-ink"}`}>{item}</button>)}
        </div>
      </div>

      <div className="mt-10 border-t border-border pt-9">
        <div className="flex items-start justify-between gap-8">
          <div><h3 className="text-[18px] tracking-[-0.025em]">{operation}</h3><p className="mt-3 text-[10px] leading-5 text-muted">{operation === "Send" ? "Transfer USDC on Arc." : operation === "Bridge" ? "Preview moving USDC from Ethereum Sepolia into Arc." : "Preview a supported stablecoin exchange on Arc."}</p></div>
          <CapabilityBadge capability={activeCapability} />
        </div>
        {!activeCapability.enabled && <p className="mt-5 text-[10px] text-muted">This capability is not configured in the current environment.</p>}
        {activeCapability.enabled && activeRequirement && <p className="mt-5 text-[10px] text-muted">{activeRequirement}</p>}

        {operation === "Send" && <div className="mt-8">
          <div className="grid grid-cols-2 gap-7">
            <label className="text-[10px] text-muted">Recipient<input aria-label="Treasury send recipient" value={recipient} onChange={(event) => updateSendRecipient(event.target.value)} placeholder="0x…" disabled={!capabilityStates.send.enabled || sendState === "pending"} className={fieldClass} /></label>
            <label className="text-[10px] text-muted">Amount<input aria-label="Treasury send amount" value={sendAmount} onChange={(event) => updateSendAmount(event.target.value)} inputMode="decimal" disabled={!capabilityStates.send.enabled || sendState === "pending"} className={fieldClass} /></label>
          </div>
          <dl className="mt-8 divide-y divide-border border-y border-border text-[10px]">
            <div className="flex justify-between gap-6 py-4"><dt className="text-muted">Wallet</dt><dd>{wallet.address ? `${connectedWalletLabel} · ${shortenAddress(wallet.address)}` : "Not connected"}</dd></div>
            <div className="flex justify-between gap-6 py-4"><dt className="text-muted">Network</dt><dd>{isArcTestnet(wallet.chainId) ? "Arc Testnet" : wallet.address ? "Wrong network" : "—"}</dd></div>
            <div className="flex justify-between gap-6 py-4"><dt className="text-muted">Asset</dt><dd>USDC</dd></div>
            <div className="flex justify-between gap-6 py-4"><dt className="text-muted">Estimated network fee</dt><dd>{sendReview ? `${sendReview.estimate.fee} wei` : "Review required"}</dd></div>
            <div className="flex justify-between gap-6 py-4"><dt className="text-muted">Status</dt><dd>{sendState === "reviewed" ? "Reviewed · not submitted" : sendState === "pending" ? "Awaiting wallet and Arc confirmation" : sendState === "success" ? "Confirmed" : sendState === "loading" ? "Preparing review…" : "Not submitted"}</dd></div>
          </dl>
          {sendMessage && <p role="status" className={`mt-5 text-[10px] ${sendState === "success" ? "text-success" : "text-muted"}`}>{sendMessage}</p>}
          {sendResult && <div className="mt-5 flex items-center justify-between gap-6 text-[10px]"><span className="break-all text-muted">{sendResult.transactionHash}</span>{sendArcscanUrl && <a href={sendArcscanUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-accent hover:underline">View on ArcScan</a>}</div>}
          <div className="mt-7 flex justify-end gap-3">
            {!sendReview && !sendResult && <Button variant="primary" onClick={() => void reviewSend()} disabled={!capabilityStates.send.enabled || Boolean(activeRequirement) || sendState === "loading"}>Review send</Button>}
            {sendReview && !sendResult && <><Button onClick={() => { setSendReview(null); setSendState("idle"); setSendMessage(""); }} disabled={sendState === "pending"}>Edit</Button><Button variant="primary" onClick={() => void confirmSend()} disabled={sendState === "pending"}>Confirm Send</Button></>}
          </div>
        </div>}

        {operation === "Bridge" && <div className="mt-8">
          <div className="grid grid-cols-2 gap-7">
            <label className="text-[10px] text-muted">Source network<select aria-label="Treasury bridge source" value="Ethereum Sepolia" disabled className={fieldClass}><option>Ethereum Sepolia</option></select></label>
            <label className="text-[10px] text-muted">Destination network<select aria-label="Treasury bridge destination network" value="Arc Testnet" disabled className={fieldClass}><option>Arc Testnet</option></select></label>
            <label className="text-[10px] text-muted">Destination<input aria-label="Treasury bridge destination" value={bridgeDestination} onChange={(event) => { setBridgeDestination(event.target.value); setBridgeReview(null); setBridgeState("idle"); }} placeholder="0x…" disabled={!capabilityStates.bridge.enabled} className={fieldClass} /></label>
            <label className="text-[10px] text-muted">USDC amount<input aria-label="Treasury bridge amount" value={bridgeAmount} onChange={(event) => { setBridgeAmount(event.target.value); setBridgeReview(null); setBridgeState("idle"); }} inputMode="decimal" disabled={!capabilityStates.bridge.enabled} className={fieldClass} /></label>
          </div>
          <dl className="mt-8 divide-y divide-border border-y border-border text-[10px]">
            <div className="flex justify-between gap-6 py-4"><dt className="text-muted">Route</dt><dd>Ethereum Sepolia → Arc Testnet</dd></div>
            <div className="flex justify-between gap-6 py-4"><dt className="text-muted">Estimate</dt><dd>{bridgeState === "loading" ? "Requesting…" : bridgeReview ? (bridgeReview.fees.join(" · ") || "No fee returned") : "Review required"}</dd></div>
            <div className="flex justify-between gap-6 py-4"><dt className="text-muted">Execution</dt><dd>Disabled for this release</dd></div>
          </dl>
          {bridgeMessage && <p role="status" className="mt-5 text-[10px] text-muted">{bridgeMessage}</p>}
          {bridgeReview && <p role="status" className="mt-5 text-[10px] text-success">Estimate ready. No wallet request was made.</p>}
          <div className="mt-7 flex justify-end"><Button variant="primary" onClick={() => void reviewBridgeEstimate()} disabled={!capabilityStates.bridge.enabled || Boolean(activeRequirement) || bridgeState === "loading"}>{bridgeReview ? "Refresh estimate" : "Review bridge"}</Button></div>
        </div>}

        {operation === "Swap" && <div className="mt-8">
          <div className="grid grid-cols-3 gap-7">
            <label className="text-[10px] text-muted">You pay<select aria-label="Treasury swap source asset" value={swapFrom} onChange={(event) => { const next = event.target.value as TreasuryAsset; setSwapFrom(next); if (next === swapTo) setSwapTo(next === "USDC" ? "EURC" : "USDC"); setSwapQuote(null); setSwapState("idle"); }} disabled={!capabilityStates.swap.enabled} className={fieldClass}><option>EURC</option><option>USDC</option></select></label>
            <label className="text-[10px] text-muted">You receive<select aria-label="Treasury swap destination asset" value={swapTo} onChange={(event) => { const next = event.target.value as TreasuryAsset; setSwapTo(next); if (next === swapFrom) setSwapFrom(next === "USDC" ? "EURC" : "USDC"); setSwapQuote(null); setSwapState("idle"); }} disabled={!capabilityStates.swap.enabled} className={fieldClass}><option>USDC</option><option>EURC</option></select></label>
            <label className="text-[10px] text-muted">Amount<input aria-label="Treasury swap amount" value={swapAmount} onChange={(event) => { setSwapAmount(event.target.value); setSwapQuote(null); setSwapState("idle"); }} inputMode="decimal" disabled={!capabilityStates.swap.enabled} className={fieldClass} /></label>
          </div>
          <dl className="mt-8 divide-y divide-border border-y border-border text-[10px]">
            <div className="flex justify-between gap-6 py-4"><dt className="text-muted">Estimated receipt</dt><dd>{swapQuote ? `${swapQuote.estimatedOutput} ${swapQuote.outputAsset}` : swapState === "loading" ? "Requesting…" : "Review required"}</dd></div>
            <div className="flex justify-between gap-6 py-4"><dt className="text-muted">Network fee</dt><dd>{swapQuote?.networkFee ?? "Review required"}</dd></div>
            <div className="flex justify-between gap-6 py-4"><dt className="text-muted">Route</dt><dd>{swapQuote?.route ?? "Review required"}</dd></div>
            <div className="flex justify-between gap-6 py-4"><dt className="text-muted">Execution</dt><dd>Disabled for this release</dd></div>
          </dl>
          {swapMessage && <p role="status" className="mt-5 text-[10px] text-muted">{swapMessage}</p>}
          {swapQuote && <p role="status" className="mt-5 text-[10px] text-success">Live quote ready. No wallet request was made.</p>}
          <div className="mt-7 flex justify-end"><Button variant="primary" onClick={() => void reviewSwapEstimate()} disabled={!capabilityStates.swap.enabled || Boolean(activeRequirement) || swapState === "loading"}>{swapQuote ? "Refresh quote" : "Review swap"}</Button></div>
        </div>}
      </div>
    </section>

    <section className="mt-20 border-t border-border pt-10" aria-labelledby="arc-liquidity-title">
      <div className="flex items-start justify-between gap-8"><div><h2 id="arc-liquidity-title" className="text-[20px] tracking-[-0.03em]">Arc liquidity</h2><p className="mt-2 text-[10px] text-muted">Additional Circle liquidity visibility. Company Treasury remains the balance shown above.</p></div><CapabilityBadge capability={capabilityStates.unifiedBalance} /></div>
      <div className="mt-7 divide-y divide-border border-y border-border text-[10px]">
        <div className="grid grid-cols-[170px_1fr_140px] items-center gap-8 py-5"><p className="text-[11px]">Unified Balance</p><p className="leading-5 text-muted">View spendable USDC across supported test networks.</p><p className="text-right">{unifiedState === "loading" ? "Reading…" : unifiedBalance ? "Available" : "Not queried"}</p></div>
        <div className="grid grid-cols-3 gap-8 py-5"><div><p className="text-muted">Confirmed</p><p className="mt-2 text-[12px]">{unifiedBalance ? `${unifiedBalance.confirmed} USDC` : "—"}</p></div><div><p className="text-muted">Pending</p><p className="mt-2 text-[12px]">{unifiedBalance ? `${unifiedBalance.pending} USDC` : "—"}</p></div><div><p className="text-muted">Available</p><p className="mt-2 text-[12px]">{unifiedBalance ? `${unifiedBalance.available} USDC` : "—"}</p></div></div>
      </div>
      {unifiedMessage && <p role="status" className="mt-5 text-[10px] text-muted">{unifiedMessage}</p>}
      <div className="mt-6 flex items-center justify-between"><p className="text-[9px] text-faint">Read only. Deposit and spend are not available in this release.</p><Button onClick={() => void refreshUnifiedBalance()} disabled={!capabilityStates.unifiedBalance.enabled || Boolean(walletRequirement(wallet, false)) || unifiedState === "loading"}>Refresh Unified Balance</Button></div>
    </section>
  </>;
}
