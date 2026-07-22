import { getAddress, isAddress, keccak256, stringToHex } from "viem";
import { ARC_TESTNET, isArcTestnet, type BrowserEthereumProvider } from "../arc/network.ts";
import { ArcMultisigContractClient } from "../contracts/arc-contract-clients.ts";
import { approveMultisig } from "./types.ts";
import type { MultisigProvider, MultisigRequest } from "./types.ts";

export class ArcMultisigProvider implements MultisigProvider {
  constructor(private readonly provider: BrowserEthereumProvider | undefined, private readonly contractAddress: string | undefined, private readonly signerAddresses: string[] = []) {}

  async approve(request: MultisigRequest, signerId: string): Promise<MultisigRequest> {
    const account = await this.connectedSigner();
    void account;
    const transactionReference = await this.submit("approve", request.id);
    return { ...approveMultisig(request, signerId, true), transactionReference };
  }

  async settle(request: MultisigRequest): Promise<MultisigRequest> {
    if (request.status !== "Ready to settle" || request.settlementId) throw new Error("This request is not ready to settle.");
    await this.connectedSigner();
    const transactionReference = await this.submit("execute", request.id);
    return { ...request, status: "Settlement submitted", settlementId: transactionReference, transactionReference };
  }

  private async connectedSigner(): Promise<string> {
    if (!this.provider || !this.contractAddress || !isAddress(this.contractAddress)) throw new Error("Arc multisig is not configured.");
    const chainId = await this.provider.request({ method: "eth_chainId" }) as string;
    if (!isArcTestnet(chainId)) throw new Error(`Switch to ${ARC_TESTNET.chainName}.`);
    const accounts = await this.provider.request({ method: "eth_accounts" }) as string[];
    const account = accounts[0];
    if (!account || !isAddress(account)) throw new Error("Connect a treasury signer wallet.");
    const configured = new Set(this.signerAddresses.map((address) => address.toLowerCase()));
    if (configured.size !== this.signerAddresses.length) throw new Error("Treasury signer addresses must be distinct.");
    if (configured.size > 0 && !configured.has(account.toLowerCase())) throw new Error("The connected wallet is not an active treasury signer.");
    return account;
  }

  private async submit(functionName: "approve" | "execute", requestId: string): Promise<string> {
    const client = new ArcMultisigContractClient(this.provider!, getAddress(this.contractAddress!));
    const transactionId = keccak256(stringToHex(requestId));
    const result = functionName === "approve" ? await client.approve(transactionId) : await client.execute(transactionId);
    return result.transactionHash;
  }
}
