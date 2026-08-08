"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  connectBrowserWallet,
  discardLegacyWalletPersistence,
  disconnectBrowserWallet,
  readWalletChainId,
  refreshBrowserWallet,
  subscribeWallet,
  subscribeWalletRecovery,
  switchMetaMaskAccount,
} from "@/lib/arc/browser-wallet";
import { switchToArcTestnet, type BrowserEthereumProvider } from "@/lib/arc/network";
import type { ArcWalletProviderDetail } from "@/lib/arc/types";

export type SharedWallet = {
  address: string | null;
  chainId: string | null;
  provider: BrowserEthereumProvider | null;
  walletName: string | null;
  walletId: string | null;
  walletIcon: string | null;
  walletRdns: string | null;
};

type WalletContextValue = {
  wallet: SharedWallet;
  ready: boolean;
  connectedThisSession: boolean;
  busy: boolean;
  sessionVersion: number;
  connect: (detail?: ArcWalletProviderDetail) => Promise<SharedWallet>;
  switchAccount: () => Promise<SharedWallet>;
  switchNetwork: () => Promise<string>;
  refreshNetwork: () => Promise<string | null>;
  disconnect: () => Promise<void>;
};

const disconnectedWallet: SharedWallet = {
  address: null,
  chainId: null,
  provider: null,
  walletName: null,
  walletId: null,
  walletIcon: null,
  walletRdns: null,
};

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [wallet, setWallet] = useState<SharedWallet>(disconnectedWallet);
  const [ready, setReady] = useState(false);
  const [connectedThisSession, setConnectedThisSession] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sessionVersion, setSessionVersion] = useState(0);
  const selectedDetailRef = useRef<ArcWalletProviderDetail | null>(null);
  const walletRef = useRef(wallet);

  useEffect(() => {
    let active = true;
    discardLegacyWalletPersistence();
    queueMicrotask(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    walletRef.current = wallet;
  }, [wallet]);

  useEffect(() => {
    if (!wallet.provider) return;
    return subscribeWallet(
      wallet.provider,
      { address: walletRef.current.address, chainId: walletRef.current.chainId },
      (next) => setWallet((current) => ({
        ...current,
        address: next.address,
        chainId: next.chainId,
        provider: next.address ? current.provider : null,
      })),
      () => {
        selectedDetailRef.current = null;
        setWallet(disconnectedWallet);
        setConnectedThisSession(false);
        setSessionVersion((version) => version + 1);
      },
      () => setSessionVersion((version) => version + 1),
    );
  }, [wallet.provider]);

  const refreshLiveWallet = useCallback(async () => {
    const detail = selectedDetailRef.current;
    if (!detail || !walletRef.current.provider) return;
    const refreshed = await refreshBrowserWallet(detail);
    setWallet({
      address: refreshed.address,
      chainId: refreshed.chainId,
      provider: refreshed.provider,
      walletName: refreshed.walletName,
      walletId: refreshed.walletId,
      walletIcon: refreshed.walletIcon,
      walletRdns: refreshed.walletRdns,
    });
  }, []);

  useEffect(() => {
    if (!wallet.provider) return;
    return subscribeWalletRecovery(() => void refreshLiveWallet());
  }, [refreshLiveWallet, wallet.provider]);

  const connect = useCallback(async (detail?: ArcWalletProviderDetail) => {
    setBusy(true);
    try {
      const connected = await connectBrowserWallet(detail);
      selectedDetailRef.current = {
        info: {
          uuid: connected.walletId ?? "active-metamask",
          name: connected.walletName ?? "MetaMask",
          icon: connected.walletIcon ?? undefined,
          rdns: connected.walletRdns ?? undefined,
        },
        provider: connected.provider!,
      };
      const next = {
        address: connected.address,
        chainId: connected.chainId,
        provider: connected.provider,
        walletName: connected.walletName,
        walletId: connected.walletId,
        walletIcon: connected.walletIcon,
        walletRdns: connected.walletRdns,
      };
      setWallet(next);
      setConnectedThisSession(true);
      return next;
    } finally {
      setBusy(false);
    }
  }, []);

  const switchAccount = useCallback(async () => {
    setBusy(true);
    try {
      const connected = await switchMetaMaskAccount(selectedDetailRef.current ?? undefined);
      selectedDetailRef.current = {
        info: {
          uuid: connected.walletId ?? "active-metamask",
          name: connected.walletName ?? "MetaMask",
          icon: connected.walletIcon ?? undefined,
          rdns: connected.walletRdns ?? undefined,
        },
        provider: connected.provider!,
      };
      const next = {
        address: connected.address,
        chainId: connected.chainId,
        provider: connected.provider,
        walletName: connected.walletName,
        walletId: connected.walletId,
        walletIcon: connected.walletIcon,
        walletRdns: connected.walletRdns,
      };
      setWallet(next);
      setConnectedThisSession(true);
      setSessionVersion((version) => version + 1);
      return next;
    } finally {
      setBusy(false);
    }
  }, []);

  const switchNetwork = useCallback(async () => {
    if (!walletRef.current.provider) throw new Error("Connect a wallet before switching networks.");
    setBusy(true);
    try {
      const chainId = await switchToArcTestnet(walletRef.current.provider);
      setWallet((current) => ({ ...current, chainId }));
      setSessionVersion((version) => version + 1);
      return chainId;
    } finally {
      setBusy(false);
    }
  }, []);

  const refreshNetwork = useCallback(async () => {
    const provider = walletRef.current.provider;
    if (!provider) return null;
    setBusy(true);
    try {
      const chainId = await readWalletChainId(provider);
      if (walletRef.current.provider !== provider) return null;
      setWallet((current) => current.provider === provider ? { ...current, chainId } : current);
      return chainId;
    } finally {
      setBusy(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setBusy(true);
    try {
      await disconnectBrowserWallet(selectedDetailRef.current);
      selectedDetailRef.current = null;
      setWallet(disconnectedWallet);
      setConnectedThisSession(false);
      setSessionVersion((version) => version + 1);
    } finally {
      setBusy(false);
    }
  }, []);

  const value = useMemo(() => ({
    wallet,
    ready,
    connectedThisSession,
    busy,
    sessionVersion,
    connect,
    switchAccount,
    switchNetwork,
    refreshNetwork,
    disconnect,
  }), [busy, connect, connectedThisSession, disconnect, ready, refreshNetwork, sessionVersion, switchAccount, switchNetwork, wallet]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used inside WalletProvider.");
  return context;
}
