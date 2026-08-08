"use client";

import { isAddress } from "viem";
import type { ArcWalletProviderDetail, ArcWalletState } from "./types";
import { normalizeChainId, type BrowserEthereumProvider } from "./network.ts";

export const METAMASK_RDNS = "io.metamask";
export type WalletSnapshot = { address: string | null; chainId: string | null };

let currentWalletSession: ArcWalletState | null = null;

export function discardLegacyWalletPersistence(): void {
  if (typeof window !== "undefined") sessionStorage.removeItem("within:selected-wallet");
}

export function clearSelectedWallet(): void {
  currentWalletSession = null;
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

  return [...discovered.values()];
}

export async function discoverMetaMask(timeoutMs = 250): Promise<ArcWalletProviderDetail | null> {
  return (await discoverBrowserWallets(timeoutMs)).find((wallet) => wallet.info.rdns === METAMASK_RDNS) ?? null;
}

async function readProviderState(detail: ArcWalletProviderDetail): Promise<ArcWalletState> {
  const accounts = await detail.provider.request({ method: "eth_accounts" }) as string[];
  const chainId = normalizeChainId(await detail.provider.request({ method: "eth_chainId" }));
  const address = accounts[0];
  return {
    address: address && isAddress(address) ? address : null,
    chainId,
    provider: detail.provider,
    walletName: detail.info.name,
    walletId: detail.info.uuid,
    walletIcon: detail.info.icon ?? null,
    walletRdns: detail.info.rdns ?? null,
  };
}

export async function connectBrowserWallet(detail?: ArcWalletProviderDetail): Promise<ArcWalletState> {
  const selected = detail ?? await discoverMetaMask();
  if (!selected) throw new Error("No compatible browser wallet was detected.");
  if (selected.info.rdns === METAMASK_RDNS) {
    await selected.provider.request({ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] });
  }
  await selected.provider.request({ method: "eth_requestAccounts" });
  const connected = await readProviderState(selected);
  if (!connected.address) throw new Error(`${selected.info.name} did not return a connected account.`);
  currentWalletSession = connected;
  return connected;
}

export async function switchMetaMaskAccount(detail?: ArcWalletProviderDetail): Promise<ArcWalletState> {
  const selected = detail ?? await discoverMetaMask();
  if (!selected) throw new Error("No compatible browser wallet was detected.");
  if (selected.info.rdns === METAMASK_RDNS) {
    await selected.provider.request({ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] });
  }
  await selected.provider.request({ method: "eth_requestAccounts" });
  const connected = await readProviderState(selected);
  if (!connected.address) throw new Error(`${selected.info.name} did not return a connected account.`);
  currentWalletSession = connected;
  return connected;
}

export async function restoreBrowserWallet(): Promise<ArcWalletState | null> {
  return currentWalletSession;
}

export async function refreshBrowserWallet(detail: ArcWalletProviderDetail): Promise<ArcWalletState> {
  const refreshed = await readProviderState(detail);
  currentWalletSession = refreshed.address ? refreshed : null;
  return refreshed;
}

export async function disconnectBrowserWallet(detail: ArcWalletProviderDetail | null): Promise<boolean> {
  void detail;
  clearSelectedWallet();
  return false;
}

export function subscribeWallet(
  provider: BrowserEthereumProvider,
  initial: WalletSnapshot,
  onChange: (state: WalletSnapshot) => void,
  onDisconnect?: () => void,
  onAccountChanged?: () => void,
): () => void {
  let address = initial.address;
  let chainId = initial.chainId;
  let revision = 0;
  let active = true;
  const emit = () => onChange({ address, chainId });
  const accountsChanged = (value: unknown) => {
    const accounts = Array.isArray(value) ? value as string[] : [];
    const nextAddress: `0x${string}` | null = accounts[0] && isAddress(accounts[0]) ? accounts[0] as `0x${string}` : null;
    const currentRevision = ++revision;
    if (nextAddress?.toLowerCase() !== address?.toLowerCase()) onAccountChanged?.();
    if (!nextAddress) {
      address = null;
      clearSelectedWallet();
      emit();
      onDisconnect?.();
      return;
    }
    address = nextAddress;
    void provider.request({ method: "eth_chainId" }).then((value) => {
      if (!active || currentRevision !== revision) return;
      address = nextAddress;
      chainId = normalizeChainId(value);
      if (currentWalletSession?.provider === provider) currentWalletSession = { ...currentWalletSession, address: nextAddress, chainId };
      emit();
    }).catch(() => {
      if (!active || currentRevision !== revision) return;
      address = nextAddress;
      chainId = null;
      if (currentWalletSession?.provider === provider) currentWalletSession = { ...currentWalletSession, address: nextAddress, chainId };
      emit();
    });
  };
  const chainChanged = (value: unknown) => {
    revision += 1;
    chainId = typeof value === "string" || typeof value === "number" ? normalizeChainId(value) : null;
    onAccountChanged?.();
    if (currentWalletSession?.provider === provider) currentWalletSession = { ...currentWalletSession, chainId };
    emit();
  };
  const disconnected = () => {
    revision += 1;
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
    active = false;
    revision += 1;
    provider.removeListener?.("accountsChanged", accountsChanged);
    provider.removeListener?.("chainChanged", chainChanged);
    provider.removeListener?.("disconnect", disconnected);
  };
}

export function subscribeWalletRecovery(refresh: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onFocus = () => refresh();
  const onVisibility = () => {
    if (document.visibilityState === "visible") refresh();
  };
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
