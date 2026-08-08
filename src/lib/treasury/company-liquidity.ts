import { formatUnits, getAddress, isAddress, type Address } from "viem";
import { ARC_PUBLIC_ADDRESSES } from "../arc/feature-flags.ts";
import { ARC_TESTNET } from "../arc/network.ts";
import { arcPublicClient } from "../contracts/arc-contract-clients.ts";
import { usdcAbi } from "../contracts/usdc-abi.ts";

export const COMPANY_LIQUIDITY_TIMEOUT_MS = 5_000;

export type CompanyLiquiditySnapshot = {
  totalTreasury: bigint;
  availableToSpend: bigint;
  pendingReserved: bigint | null;
  networks: Array<{ network: "Arc"; balance: bigint }>;
  blockNumber: bigint | null;
  treasuryAddress: Address;
};

export type CompanyLiquidityReader = {
  readContract: (request: object) => Promise<unknown>;
  getBlockNumber: () => Promise<bigint>;
};

function timed<T>(request: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Arc treasury read timed out.")), timeoutMs);
    request.then(resolve, reject).finally(() => clearTimeout(timeout));
  });
}

export async function readCompanyLiquidity(
  reader: CompanyLiquidityReader = arcPublicClient as CompanyLiquidityReader,
  address = ARC_PUBLIC_ADDRESSES.treasury,
  timeoutMs = COMPANY_LIQUIDITY_TIMEOUT_MS,
): Promise<CompanyLiquiditySnapshot> {
  if (!isAddress(address)) throw new Error("Company treasury address is not configured.");
  const treasuryAddress = getAddress(address);
  const totalTreasury = await timed(
    reader.readContract({
      address: ARC_TESTNET.usdcAddress,
      abi: usdcAbi,
      functionName: "balanceOf",
      args: [treasuryAddress],
    }) as Promise<bigint>,
    timeoutMs,
  );
  let blockNumber: bigint | null = null;
  try {
    blockNumber = await timed(reader.getBlockNumber(), timeoutMs);
  } catch {
    blockNumber = null;
  }

  return {
    totalTreasury,
    availableToSpend: totalTreasury,
    pendingReserved: null,
    networks: [{ network: "Arc", balance: totalTreasury }],
    blockNumber,
    treasuryAddress,
  };
}

export function formatCompanyUsdc(value: bigint) {
  const formatted = formatUnits(value, 6);
  const [whole, fraction] = formatted.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction ? `${grouped}.${fraction}` : grouped;
}
