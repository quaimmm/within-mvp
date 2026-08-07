"use client";

import type { ArcWalletProviderDetail } from "@/lib/arc/types";

function safeWalletIcon(icon?: string): string | null {
  return icon && /^data:image\/(?:png|webp|gif|svg\+xml);base64,/i.test(icon) ? icon : null;
}

function WalletIcon({ wallet }: { wallet: ArcWalletProviderDetail }) {
  const icon = safeWalletIcon(wallet.info.icon);
  return (
    <span
      aria-hidden="true"
      className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-border bg-canvas bg-cover bg-center text-[11px] font-medium text-ink"
      style={icon ? { backgroundImage: `url(${JSON.stringify(icon)})` } : undefined}
    >
      {!icon && wallet.info.name.slice(0, 1).toUpperCase()}
    </span>
  );
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
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[10px] text-muted">Available wallets</p>
        <button type="button" onClick={onRescan} disabled={scanning || Boolean(busyWalletId)} className="text-[9px] text-muted transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40">{scanning ? "Scanning…" : "Rescan"}</button>
      </div>
      {wallets.length > 0 ? (
        <div className="mt-3 divide-y divide-border border-y border-border">
          {wallets.map((wallet) => {
            const connected = wallet.info.uuid === connectedWalletId;
            const busy = wallet.info.uuid === busyWalletId;
            return (
              <button
                key={wallet.info.uuid}
                type="button"
                onClick={() => onSelect(wallet)}
                disabled={Boolean(busyWalletId)}
                aria-label={`${connected ? "Reconnect" : "Connect"} ${wallet.info.name}`}
                className="group flex w-full items-center gap-3 py-3.5 text-left outline-none transition-opacity hover:opacity-70 focus-visible:ring-2 focus-visible:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <WalletIcon wallet={wallet}/>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-medium text-ink">{wallet.info.name}</span>
                  <span className="mt-1 block truncate text-[9px] text-faint">{wallet.info.rdns || "Browser wallet"}</span>
                </span>
                <span className={`text-[9px] ${connected ? "text-success" : "text-muted group-hover:text-ink"}`}>{busy ? "Connecting…" : connected ? "Connected" : "Connect"}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-3 border-y border-border py-6">
          <p className="text-[11px] text-ink">{scanning ? "Looking for browser wallets…" : "No compatible wallet detected."}</p>
          {!scanning && <p className="mt-2 text-[9px] leading-4 text-muted">Enable a wallet extension, then rescan this page.</p>}
        </div>
      )}
    </div>
  );
}
