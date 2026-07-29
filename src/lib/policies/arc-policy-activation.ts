import { encodeFunctionData, formatEther, getAddress, isAddress, keccak256, parseEther, stringToHex, type Address, type Hash } from "viem";
import { isArcTestnet, type BrowserEthereumProvider } from "../arc/network.ts";
import { arcPublicClient } from "../contracts/arc-contract-clients.ts";
import { withinPolicyExecutorAbi } from "../contracts/within-policy-executor-abi.ts";

export const ARC_POLICY_CONTRACT = "0x0C2cde1a2438d6A0fED4b58Bd1461F60EAbD32BB" as Address;
export const ARC_POLICY_ACTIVATION_STORAGE_KEY = "within:arc-policy-activation:v1";

export type PreparedPolicyActivation = {
  sender: Address;
  policyKey: Hash;
  data: Hash;
  gas: bigint;
  gasPrice: bigint;
  maximum: bigint;
  periodLimit: bigint;
  estimatedCost: string;
};

export async function preparePolicyActivation(provider: BrowserEthereumProvider, policyId: string): Promise<PreparedPolicyActivation> {
  const chainId = await provider.request({ method: "eth_chainId" });
  if (typeof chainId !== "string" || !isArcTestnet(chainId)) throw new Error("Switch to Arc Testnet.");
  const accounts = await provider.request({ method: "eth_accounts" }) as string[];
  if (!accounts[0] || !isAddress(accounts[0])) throw new Error("Connect a wallet first.");
  const sender = getAddress(accounts[0]);
  const owner = await arcPublicClient.readContract({ address: ARC_POLICY_CONTRACT, abi: withinPolicyExecutorAbi, functionName: "owner" });
  if (owner.toLowerCase() !== sender.toLowerCase()) throw new Error("Connected wallet is not the policy owner.");
  const policyKey = keccak256(stringToHex(policyId));
  const maximum = parseEther("0.05");
  const periodLimit = parseEther("1.00");
  const data = encodeFunctionData({ abi: withinPolicyExecutorAbi, functionName: "setPolicy", args: [policyKey, maximum, periodLimit, true] });
  const transaction = { from: sender, to: ARC_POLICY_CONTRACT, data, value: "0x0" };
  await provider.request({ method: "eth_call", params: [transaction, "latest"] });
  const gasValue = await provider.request({ method: "eth_estimateGas", params: [transaction] });
  const gasPriceValue = await provider.request({ method: "eth_gasPrice" });
  if (typeof gasValue !== "string" || typeof gasPriceValue !== "string") throw new Error("Gas estimation is unavailable.");
  const gas = BigInt(gasValue);
  const gasPrice = BigInt(gasPriceValue);
  return { sender, policyKey, data, gas, gasPrice, maximum, periodLimit, estimatedCost: `${formatEther(gas * gasPrice)} native USDC` };
}

export async function submitPolicyActivation(provider: BrowserEthereumProvider, prepared: PreparedPolicyActivation): Promise<Hash> {
  const accounts = await provider.request({ method: "eth_accounts" }) as string[];
  const chainId = await provider.request({ method: "eth_chainId" });
  if (!accounts[0] || getAddress(accounts[0]).toLowerCase() !== prepared.sender.toLowerCase() || typeof chainId !== "string" || !isArcTestnet(chainId)) throw new Error("Wallet changed. Prepare activation again.");
  const hash = await provider.request({ method: "eth_sendTransaction", params: [{ from: prepared.sender, to: ARC_POLICY_CONTRACT, data: prepared.data, value: "0x0", gas: `0x${prepared.gas.toString(16)}` }] });
  if (typeof hash !== "string" || !/^0x[0-9a-f]{64}$/i.test(hash)) throw new Error("Wallet did not return a transaction hash.");
  return hash as Hash;
}

export async function confirmPolicyState(prepared: PreparedPolicyActivation) {
  const policy = await arcPublicClient.readContract({ address: ARC_POLICY_CONTRACT, abi: withinPolicyExecutorAbi, functionName: "policies", args: [prepared.policyKey] });
  return policy[0] && policy[1] && policy[2] === prepared.maximum && policy[3] === prepared.periodLimit;
}

export async function confirmPolicyStateForId(policyId: string) {
  const policyKey = keccak256(stringToHex(policyId));
  const policy = await arcPublicClient.readContract({ address: ARC_POLICY_CONTRACT, abi: withinPolicyExecutorAbi, functionName: "policies", args: [policyKey] });
  return policy[0] && policy[1] && policy[2] === parseEther("0.05") && policy[3] === parseEther("1.00");
}
