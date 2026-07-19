import { keccak256, toBytes } from "viem";
import type { PolicyPublisher, PolicyPublishRequest, PolicyPublishResult } from "./policy-publisher";

const wait = () => new Promise((resolve) => setTimeout(resolve, 650));

export class MockPolicyPublisher implements PolicyPublisher {
  async publishPolicy(request: PolicyPublishRequest): Promise<PolicyPublishResult> {
    await wait();
    return this.result(request.policyId, request.active);
  }

  async setPolicyStatus(policyId: string, active: boolean, idempotencyKey: string): Promise<PolicyPublishResult> {
    void idempotencyKey;
    await wait();
    return this.result(policyId, active);
  }

  private result(policyId: string, active: boolean): PolicyPublishResult {
    return {
      success: true,
      provider: "mock",
      network: "demo",
      policyId,
      policyKey: keccak256(toBytes(policyId)),
      active,
      timestamp: "2026-07-19T15:30:00.000Z",
    };
  }
}
