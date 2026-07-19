import { ArcPolicyPublisher } from "./arc-policy-publisher";
import { MockPolicyPublisher } from "./mock-policy-publisher";
import type { PolicyPublisher } from "./policy-publisher";

export function createPolicyPublisher(name = process.env.POLICY_PUBLISHER || "mock"): PolicyPublisher {
  if (name === "mock") return new MockPolicyPublisher();
  if (name === "arc") return new ArcPolicyPublisher();
  throw new Error("Unsupported policy publisher");
}
