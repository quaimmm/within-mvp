import { createPublicClient, http } from "viem";
import { arcTestnet } from "viem/chains";

export const ARC_TESTNET = {
  chainId: arcTestnet.id,
  chainIdHex: "0x4CEF52",
  chainName: arcTestnet.name,
  rpcUrl: arcTestnet.rpcUrls.default.http[0],
  explorerUrl: arcTestnet.blockExplorers.default.url,
  usdcAddress: "0x3600000000000000000000000000000000000000",
  eurcAddress: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
  nativeCurrency: arcTestnet.nativeCurrency,
} as const;

export const ARC_ADD_CHAIN_PARAMETERS = {
  chainId: ARC_TESTNET.chainIdHex,
  chainName: ARC_TESTNET.chainName,
  nativeCurrency: ARC_TESTNET.nativeCurrency,
  rpcUrls: [ARC_TESTNET.rpcUrl],
  blockExplorerUrls: [ARC_TESTNET.explorerUrl],
} as const;

export type BrowserEthereumProvider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: "accountsChanged" | "chainChanged" | "disconnect", listener: (value: unknown) => void): void;
  removeListener?(event: "accountsChanged" | "chainChanged" | "disconnect", listener: (value: unknown) => void): void;
  providers?: BrowserEthereumProvider[];
};

type ProviderError = { code?: number; message?: string };

export class WalletNetworkError extends Error {
  code?: number;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "WalletNetworkError";
    const providerError = cause as ProviderError | undefined;
    this.code = providerError?.code;
    if (cause !== undefined) this.cause = cause;
  }
}

export function providerErrorDetails(error: unknown): string {
  const providerError = error as ProviderError | undefined;
  const code = providerError?.code === undefined ? "unknown" : String(providerError.code);
  const message = providerError?.message || (error instanceof Error ? error.message : "Unknown provider error");
  return `Code ${code}: ${message}`;
}

export function walletErrorMessage(error: unknown, operation: "connect" | "switch" = "switch"): string {
  const providerError = error as ProviderError | undefined;
  const message = (providerError?.message || "").toLowerCase();
  if (providerError?.code === 4001) return operation === "connect" ? "You declined the wallet connection." : "You declined the network switch.";
  if (providerError?.code === 4900 || providerError?.code === 4901) return "The wallet disconnected. Connect it again to continue.";
  if (providerError?.code === -32602 || message.includes("invalid chain")) return "Arc Testnet could not be added to this wallet.";
  if (message.includes("rpc") || message.includes("network error") || message.includes("failed to fetch")) return "Arc RPC is currently unavailable. Please retry.";
  if (message.includes("provider mismatch")) return "The selected wallet provider changed. Reconnect the wallet and retry.";
  if (message.includes("unsupported") || message.includes("not supported")) return "This wallet does not support Arc Testnet switching.";
  if (operation === "connect") return error instanceof Error ? error.message : "Wallet connection was not completed.";
  return error instanceof WalletNetworkError ? error.message : "The connected wallet did not switch networks.";
}

export function shortenAddress(address?: string | null): string {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Not configured";
}

export function walletConnectionLabel(
  address: string | null,
  chainId: string | null,
  operation: "connecting" | "switching" | null = null,
): string {
  if (operation === "connecting") return "Connecting…";
  if (operation === "switching") return "Switching network…";
  if (!address) return "Connect wallet";
  return isArcTestnet(chainId) ? `Connected · ${shortenAddress(address)}` : "Connected · Wrong network";
}

export function walletConnectionDecision(address: string | null, chainId: string | null) {
  const connected = Boolean(address);
  const onArcTestnet = connected && isArcTestnet(chainId);
  return {
    connected,
    onArcTestnet,
    showConnectWallet: !connected,
    showContinueWithoutWallet: !connected,
    primaryAction: !connected ? "connect" as const : onArcTestnet ? "continue" as const : "switch" as const,
  };
}

export function isArcTestnet(chainId?: string | null): boolean {
  return chainId?.toLowerCase() === ARC_TESTNET.chainIdHex.toLowerCase();
}

function isUnknownChain(error: unknown): boolean {
  const providerError = error as ProviderError | undefined;
  const message = (providerError?.message || "").toLowerCase();
  return providerError?.code === 4902 || message.includes("unknown chain") || message.includes("unrecognized chain") || message.includes("not added");
}

export async function switchToArcTestnet(provider: BrowserEthereumProvider): Promise<string> {
  const before = await provider.request({ method: "eth_chainId" });
  if (typeof before === "string" && isArcTestnet(before)) return before;

  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ARC_TESTNET.chainIdHex }] });
  } catch (error) {
    if (!isUnknownChain(error)) throw new WalletNetworkError(walletErrorMessage(error), error);
    try {
      await provider.request({ method: "wallet_addEthereumChain", params: [ARC_ADD_CHAIN_PARAMETERS] });
    } catch (addError) {
      throw new WalletNetworkError("Arc Testnet could not be added to this wallet.", addError);
    }
    const afterAdd = await provider.request({ method: "eth_chainId" });
    if (!(typeof afterAdd === "string" && isArcTestnet(afterAdd))) {
      try {
        await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ARC_TESTNET.chainIdHex }] });
      } catch (switchError) {
        throw new WalletNetworkError(walletErrorMessage(switchError), switchError);
      }
    }
  }

  const actual = await provider.request({ method: "eth_chainId" });
  if (typeof actual !== "string" || !isArcTestnet(actual)) {
    throw new WalletNetworkError("The connected wallet did not switch networks.");
  }
  return actual;
}

export async function validateArcRpc(): Promise<boolean> {
  const client = createPublicClient({ chain: arcTestnet, transport: http(ARC_TESTNET.rpcUrl, { timeout: 8_000, retryCount: 0 }) });
  return (await client.getChainId()) === ARC_TESTNET.chainId;
}
