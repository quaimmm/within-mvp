import { isArcTestnet } from "@/lib/arc/network";

export function NetworkStatus({ address, chainId, mock = false, confirmed = false, onClick }: { address?: string | null; chainId?: string | null; mock?: boolean; confirmed?: boolean; onClick?: () => void }) {
  const label = mock ? "Arc Testnet · Beta" : confirmed ? "Arc Testnet · Settlement confirmed" : !address ? "Arc Testnet · Wallet not connected" : isArcTestnet(chainId) ? "Arc Testnet · Connected" : "Arc Testnet · Wrong network";
  const content = <><span aria-hidden="true" className="relative size-3 rotate-45 border border-current"><span className="absolute inset-[3px] bg-current"/></span><span>{label}</span></>;
  return onClick ? <button type="button" onClick={onClick} className="flex items-center gap-2 text-[9px] text-muted transition-colors hover:text-ink">{content}</button> : <span className="flex items-center gap-2 text-[9px] text-muted">{content}</span>;
}
