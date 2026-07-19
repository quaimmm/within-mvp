export type FundingMethod = "testnet-faucet" | "manual-usdc" | "apple-pay" | "bank-transfer";

export type FundingProvider = {
  id: FundingMethod;
  label: string;
  enabled: boolean;
  description: string;
};

export const fundingProviders: FundingProvider[] = [
  { id: "testnet-faucet", label: "Get testnet USDC", enabled: true, description: "Use during the Arc Testnet demo." },
  { id: "manual-usdc", label: "Transfer USDC", enabled: true, description: "Fund the treasury from another test wallet." },
  { id: "apple-pay", label: "Apple Pay", enabled: false, description: "Reserved for a future card funding integration." },
  { id: "bank-transfer", label: "Bank transfer", enabled: false, description: "Reserved for future fiat funding." },
];
