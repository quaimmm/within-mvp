import { LocalPolicyGenerator } from "./local-policy-generator.ts";
import { OpenAIPolicyGenerator } from "./openai-policy-generator.ts";
import type { PolicyGeneration, PolicyGenerator } from "./policy-generator.ts";

class FallbackPolicyGenerator implements PolicyGenerator {
  constructor(private readonly primary: PolicyGenerator, private readonly fallback: PolicyGenerator) {}

  async generate(input: string): Promise<PolicyGeneration> {
    try {
      return await this.primary.generate(input);
    } catch {
      console.warn("[policies/generate] provider=openai outcome=fallback category=provider_failure");
      const result = await this.fallback.generate(input);
      return { ...result, fallbackOccurred: true };
    }
  }
}

export function createPolicyGenerator(name = process.env.POLICY_GENERATOR || "local"): PolicyGenerator {
  if (name === "local") return new LocalPolicyGenerator();
  if (name === "openai") {
    const fallbackAllowed = process.env.ALLOW_LOCAL_AI_FALLBACK === "true";
    if (!fallbackAllowed) return new OpenAIPolicyGenerator();
    try {
      return new FallbackPolicyGenerator(new OpenAIPolicyGenerator(), new LocalPolicyGenerator());
    } catch {
      console.warn("[policies/generate] provider=openai outcome=fallback category=configuration");
      return new FallbackPolicyGenerator({ generate: async () => { throw new Error("Unavailable"); } }, new LocalPolicyGenerator());
    }
  }
  throw new Error("Unsupported policy generator");
}
