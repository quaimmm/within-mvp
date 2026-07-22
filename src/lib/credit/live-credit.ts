import { formatUnits, isAddress } from "viem";
import { isArcTestnet } from "../arc/network.ts";

export type LiveCreditConfiguration = {
  walletAddress: string | null;
  chainId: string | null;
  facilityAddress: string | null;
  multisigAddress: string | null;
  facilityLiquidity: number;
  requestedAmount: number;
};

export function validateLiveCreditConfiguration(configuration: LiveCreditConfiguration): void {
  if (!configuration.walletAddress || !isAddress(configuration.walletAddress)) throw new Error("Connect a treasury wallet.");
  if (!isArcTestnet(configuration.chainId)) throw new Error("Switch to Arc Testnet.");
  if (!configuration.facilityAddress || !isAddress(configuration.facilityAddress)) throw new Error("Credit facility contract is not configured.");
  if (!configuration.multisigAddress || !isAddress(configuration.multisigAddress)) throw new Error("Treasury multisig contract is not configured.");
  if (configuration.requestedAmount > configuration.facilityLiquidity) throw new Error("The credit facility has insufficient testnet USDC liquidity.");
}

export function mapCreditContractState(value: {
  creditLimit: bigint;
  availableCredit: bigint;
  facilityBalance: bigint;
  principal: bigint;
  totalDue: bigint;
  amountRepaid: bigint;
  outstandingPrincipal: bigint;
  maturity: bigint;
  status: number;
}) {
  const usdc = (amount: bigint) => Number(formatUnits(amount, 6));
  return {
    creditLimit: usdc(value.creditLimit),
    availableCredit: usdc(value.availableCredit),
    facilityBalance: usdc(value.facilityBalance),
    principal: usdc(value.principal),
    totalDue: usdc(value.totalDue),
    amountRepaid: usdc(value.amountRepaid),
    outstandingPrincipal: usdc(value.outstandingPrincipal),
    maturity: new Date(Number(value.maturity) * 1000).toISOString(),
    status: ["None", "Active", "Repaid", "Cancelled", "Defaulted"][value.status] ?? "Unknown",
  };
}
