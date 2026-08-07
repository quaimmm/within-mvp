import type { ArcWalletProviderDetail } from "./types.ts";

export type WalletBrand = "metamask" | "rabby" | "coinbase" | "brave" | "phantom" | "backpack" | "okx" | "walletconnect" | "browser";

export type WalletCatalogOption = {
  id: string;
  name: string;
  brand: WalletBrand;
  detail: ArcWalletProviderDetail | null;
  status: "detected" | "not-detected" | "configuration-required" | "provider-unavailable";
  description: string;
};

type KnownWallet = {
  id: Exclude<WalletBrand, "walletconnect" | "browser">;
  name: string;
  rdns: string[];
  nameMatches: string[];
};

const knownWallets: KnownWallet[] = [
  { id: "metamask", name: "MetaMask", rdns: ["io.metamask"], nameMatches: ["metamask"] },
  { id: "rabby", name: "Rabby", rdns: ["io.rabby"], nameMatches: ["rabby"] },
  { id: "coinbase", name: "Coinbase Wallet", rdns: ["com.coinbase.wallet"], nameMatches: ["coinbase"] },
  { id: "brave", name: "Brave Wallet", rdns: ["com.brave.wallet"], nameMatches: ["brave"] },
  { id: "phantom", name: "Phantom", rdns: ["app.phantom"], nameMatches: ["phantom"] },
  { id: "backpack", name: "Backpack", rdns: ["app.backpack", "com.backpack.wallet"], nameMatches: ["backpack"] },
  { id: "okx", name: "OKX Wallet", rdns: ["com.okex.wallet", "com.okx.wallet"], nameMatches: ["okx", "okex"] },
];

function isKnownWallet(detail: ArcWalletProviderDetail, wallet: KnownWallet): boolean {
  const rdns = detail.info.rdns?.toLowerCase();
  const name = detail.info.name.toLowerCase();
  return Boolean(rdns && wallet.rdns.includes(rdns)) || wallet.nameMatches.some((match) => name.includes(match));
}

export function buildWalletCatalog(discovered: ArcWalletProviderDetail[], walletConnectProjectId?: string): WalletCatalogOption[] {
  const used = new Set<string>();
  const known = knownWallets.map((wallet): WalletCatalogOption => {
    const detail = discovered.find((candidate) => !used.has(candidate.info.uuid) && isKnownWallet(candidate, wallet)) ?? null;
    if (detail) used.add(detail.info.uuid);
    return {
      id: detail?.info.uuid ?? `catalog-${wallet.id}`,
      name: detail?.info.name ?? wallet.name,
      brand: wallet.id,
      detail,
      status: detail ? "detected" : "not-detected",
      description: detail?.info.rdns || (detail ? "Browser wallet" : "Extension not detected"),
    };
  });

  const additional = discovered
    .filter((detail) => !used.has(detail.info.uuid))
    .map((detail): WalletCatalogOption => ({
      id: detail.info.uuid,
      name: detail.info.name,
      brand: "browser",
      detail,
      status: "detected",
      description: detail.info.rdns || "EIP-6963 browser wallet",
    }));

  const walletConnectConfigured = Boolean(walletConnectProjectId?.trim());
  const walletConnect: WalletCatalogOption = {
    id: "catalog-walletconnect",
    name: "WalletConnect",
    brand: "walletconnect",
    detail: null,
    status: walletConnectConfigured ? "provider-unavailable" : "configuration-required",
    description: walletConnectConfigured ? "Provider integration unavailable" : "Project ID required",
  };

  return [...known, ...additional, walletConnect];
}
