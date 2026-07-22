"use client";

import { isAddress } from "viem";
import type { ArcWalletProviderDetail, ArcWalletState } from "./types";
import type { BrowserEthereumProvider } from "./network";

export const SELECTED_WALLET_SESSION_KEY = "within:selected-wallet";
export type WalletSnapshot = { address: string | null; chainId: string | null };

declare global {
  interface Window {
    ethereum?: BrowserEthereumProvider;
  }
}

function getSelectedWalletId(): string | null {
  return typeof window === "undefined" ? null : sessionStorage.getItem(SELECTED_WALLET_SESSION_KEY);
}

function rememberSelectedWallet(id: string): void {
  if (typeof window !== "undefined") sessionStorage.setItem(SELECTED_WALLET_SESSION_KEY, id);
}

export function clearSelectedWallet(): void {
  if (typeof window !== "undefined") sessionStorage.removeItem(SELECTED_WALLET_SESSION_KEY);
}

export async function discoverBrowserWallets(timeoutMs = 250): Promise<ArcWalletProviderDetail[]> {
  if (typeof window === "undefined") return [];
  const discovered = new Map<string, ArcWalletProviderDetail>();
  const announce = (event: Event) => {
    const detail = (event as CustomEvent<ArcWalletProviderDetail>).detail;
    if (detail?.provider && detail.info?.uuid) discovered.set(detail.info.uuid, detail);
  };
  window.addEventListener("eip6963:announceProvider", announce as EventListener);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  await new Promise((resolve) => window.setTimeout(resolve, timeoutMs));
  window.removeEventListener("eip6963:announceProvider", announce as EventListener);

  if (discovered.size === 0 && window.ethereum && (!window.ethereum.providers || window.ethereum.providers.length <= 1)) {
    discovered.set("window.ethereum", { info: { uuid: "window.ethereum", name: "Browser wallet" }, provider: window.ethereum });
  }
  return [...discovered.values()];
}

export async function connectBrowserWallet(detail?: ArcWalletProviderDetail): Promise<ArcWalletState> {
  const wallets = detail ? [detail] : await discoverBrowserWallets();
  if (wallets.length > 1 && !detail) throw new Error("Multiple wallets were detected. Choose the wallet you want to connect.");
  const selected = detail ?? wallets[0];
  if (!selected) throw new Error("No compatible browser wallet was detected.");
  const accounts = await selected.provider.request({ method: "eth_requestAccounts" }) as string[];
  const chainId = await selected.provider.request({ method: "eth_chainId" }) as string;
  const address = accounts[0];
  if (!address || !isAddress(address)) throw new Error("The wallet did not return a valid account.");
  rememberSelectedWallet(selected.info.uuid);
  return { address, chainId, provider: selected.provider, walletName: selected.info.name, walletId: selected.info.uuid };
}

export async function restoreBrowserWallet(): Promise<ArcWalletState | null> {
  if (typeof window === "undefined") return null;
  const selectedId = getSelectedWalletId();
  if (!selectedId) return null;
  const selected = (await discoverBrowserWallets()).find((wallet) => wallet.info.uuid === selectedId);
  if (!selected) {
    clearSelectedWallet();
    return null;
  }
  const accounts = await selected.provider.request({ method: "eth_accounts" }) as string[];
  const chainId = await selected.provider.request({ method: "eth_chainId" }) as string;
  const address = accounts[0];
  if (!address || !isAddress(address)) {
    clearSelectedWallet();
    return null;
  }
  return { address, chainId, provider: selected.provider, walletName: selected.info.name, walletId: selected.info.uuid };
}

export function subscribeWallet(
  provider: BrowserEthereumProvider,
  initial: WalletSnapshot,
  onChange: (state: WalletSnapshot) => void,
  onDisconnect?: () => void,
): () => void {
  let address = initial.address;
  let chainId = initial.chainId;
  const emit = () => onChange({ address, chainId });
  const accountsChanged = (value: unknown) => {
    const accounts = Array.isArray(value) ? value as string[] : [];
    address = accounts[0] && isAddress(accounts[0]) ? accounts[0] as `0x${string}` : null;
    if (!address) clearSelectedWallet();
    emit();
  };
  const chainChanged = (value: unknown) => {
    chainId = typeof value === "string" ? value : null;
    emit();
  };
  const disconnected = () => {
    address = null;
    chainId = null;
    clearSelectedWallet();
    emit();
    onDisconnect?.();
  };
  provider.on?.("accountsChanged", accountsChanged);
  provider.on?.("chainChanged", chainChanged);
  provider.on?.("disconnect", disconnected);
  return () => {
    provider.removeListener?.("accountsChanged", accountsChanged);
    provider.removeListener?.("chainChanged", chainChanged);
    provider.removeListener?.("disconnect", disconnected);
  };
}
