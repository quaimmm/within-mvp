import { approveMultisig, settleMultisig, type MultisigProvider, type MultisigRequest } from "./types";
export class MockMultisigProvider implements MultisigProvider {
  async approve(request: MultisigRequest, signerId: string): Promise<MultisigRequest> { await new Promise((resolve) => setTimeout(resolve, 250)); return approveMultisig(request, signerId, true); }
  async settle(request: MultisigRequest): Promise<MultisigRequest> { await new Promise((resolve) => setTimeout(resolve, 350)); return settleMultisig(request); }
}
