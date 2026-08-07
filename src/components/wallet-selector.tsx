"use client";

import { useMemo } from "react";
import type { ArcWalletProviderDetail } from "@/lib/arc/types";
import { buildWalletCatalog, type WalletBrand, type WalletCatalogOption } from "@/lib/arc/wallet-catalog";

function safeWalletIcon(icon?: string): string | null {
  return icon && /^data:image\/(?:png|webp|gif|svg\+xml);base64,/i.test(icon) ? icon : null;
}

function WalletBrandMark({ brand }: { brand: WalletBrand }) {
  if (brand === "okx") return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 text-ink"><path fill="currentColor" d="M3 3h6v6H3V3Zm12 0h6v6h-6V3ZM9 9h6v6H9V9ZM3 15h6v6H3v-6Zm12 0h6v6h-6v-6Z"/></svg>;
  if (brand === "walletconnect") return <svg aria-hidden="true" viewBox="0 0 28 20" className="h-5 w-7 text-[#3b82f6]"><path d="M3 7.2c6.1-5.4 15.9-5.4 22 0l.7.6-2.4 2.2-.7-.6c-4.8-4.2-12.4-4.2-17.2 0l-.7.6-2.4-2.2.7-.6Zm4 3.5c3.9-3.5 10.1-3.5 14 0l.8.7-2.4 2.2-.8-.7c-2.6-2.2-6.6-2.2-9.2 0l-.8.7-2.4-2.2.8-.7Zm4 3.6a4.8 4.8 0 0 1 6 0l1 .8-4 3.5-4-3.5 1-.8Z" fill="currentColor"/></svg>;
  if (brand === "backpack") return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5"><rect width="24" height="24" rx="6" fill="#e14b42"/><path d="M8 9V7.8A3.2 3.2 0 0 1 11.2 4.6h1.6A3.2 3.2 0 0 1 16 7.8V9h1.1A1.9 1.9 0 0 1 19 10.9v6.6A1.9 1.9 0 0 1 17.1 19H6.9A1.9 1.9 0 0 1 5 17.1v-6.2A1.9 1.9 0 0 1 6.9 9H8Zm2 0h4V7.8c0-.7-.5-1.2-1.2-1.2h-1.6c-.7 0-1.2.5-1.2 1.2V9Zm-2 4v2h8v-2H8Z" fill="white"/></svg>;
  const letters: Record<Exclude<WalletBrand, "okx" | "walletconnect" | "backpack">, string> = { metamask: "M", rabby: "R", coinbase: "C", brave: "B", phantom: "P", browser: "W" };
  return <span aria-hidden="true" className="text-[11px] font-medium text-ink">{letters[brand]}</span>;
}

function WalletIcon({ option }: { option: WalletCatalogOption }) {
  const icon = safeWalletIcon(option.detail?.info.icon);
  return (
    <span
      aria-hidden="true"
      className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-border bg-canvas bg-cover bg-center text-[11px] font-medium text-ink"
      style={icon ? { backgroundImage: `url(${JSON.stringify(icon)})` } : undefined}
    >
      {!icon && <WalletBrandMark brand={option.brand}/>}
    </span>
  );
}

function optionStatus(option: WalletCatalogOption, connected: boolean, busy: boolean): string {
  if (busy) return "Connecting…";
  if (connected) return "Connected";
  if (option.status === "detected") return "Connect";
  if (option.status === "configuration-required") return "Configuration required";
  if (option.status === "provider-unavailable") return "Unavailable";
  return "Not detected";
}

export function WalletSelector({
  wallets,
  connectedWalletId,
  busyWalletId,
  scanning,
  onSelect,
  onRescan,
}: {
  wallets: ArcWalletProviderDetail[];
  connectedWalletId: string | null;
  busyWalletId: string | null;
  scanning: boolean;
  onSelect: (wallet: ArcWalletProviderDetail) => void;
  onRescan: () => void;
}) {
  const options = useMemo(
    () => buildWalletCatalog(wallets, process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID),
    [wallets],
  );
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[10px] text-muted">Available wallets</p>
        <button type="button" onClick={onRescan} disabled={scanning || Boolean(busyWalletId)} className="text-[9px] text-muted transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40">{scanning ? "Scanning…" : "Rescan"}</button>
      </div>
      <div className="mt-3 grid grid-cols-2 border-l border-t border-border">
          {options.map((option) => {
            const connected = option.detail?.info.uuid === connectedWalletId;
            const busy = option.detail?.info.uuid === busyWalletId;
            const available = option.status === "detected" && Boolean(option.detail);
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => { if (option.detail) onSelect(option.detail); }}
                disabled={Boolean(busyWalletId) || !available}
                aria-label={available ? `${connected ? "Reconnect" : "Connect"} ${option.name}` : `${option.name}: ${optionStatus(option, false, false)}`}
                className="group flex min-h-[68px] w-full items-center gap-3 border-b border-r border-border px-3 py-3 text-left outline-none transition-colors hover:bg-canvas/60 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/20 disabled:cursor-default"
              >
                <WalletIcon option={option}/>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-medium text-ink">{option.name}</span>
                  <span className="mt-1 block truncate text-[9px] text-faint">{option.description}</span>
                </span>
                <span className={`max-w-[78px] text-right text-[8px] leading-3 ${connected ? "text-success" : available ? "text-muted group-hover:text-ink" : "text-faint"}`}>{optionStatus(option, connected, busy)}</span>
              </button>
            );
          })}
      </div>
      {!scanning && wallets.length === 0 && <p className="mt-3 text-[9px] leading-4 text-muted">No browser wallet extension was detected. WalletConnect requires a configured project ID and provider integration.</p>}
    </div>
  );
}
