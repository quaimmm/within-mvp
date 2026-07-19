import type { GeneratedPolicyContent } from "./policy-generation-schema.ts";

export type PolicyGeneratorProvider = "local" | "openai";

export type PolicyGeneration = {
  provider: PolicyGeneratorProvider;
  content: GeneratedPolicyContent;
  fallbackOccurred?: boolean;
};

export interface PolicyGenerator {
  generate(input: string): Promise<PolicyGeneration>;
}

export type PolicyGenerationErrorCode = "invalid_output" | "refusal" | "rate_limited" | "timeout" | "unavailable" | "configuration";

export class PolicyGenerationError extends Error {
  constructor(
    public readonly code: PolicyGenerationErrorCode,
    public readonly status: 422 | 429 | 500 | 503,
    public readonly safeMessage: string,
  ) {
    super(safeMessage);
    this.name = "PolicyGenerationError";
  }
}
