import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { GeneratedPolicyContentSchema, normaliseGeneratedPolicyContent } from "./policy-generation-schema.ts";
import { PolicyGenerationError } from "./policy-generator.ts";
import type { PolicyGeneration, PolicyGenerator } from "./policy-generator.ts";

const SYSTEM_INSTRUCTION = `You convert plain-English company spending instructions into structured spending-rule drafts.

Your role is interpretation only.

Never activate, publish or execute a rule.

Use GBP for business limits.

Do not generate cryptocurrency amounts, settlement limits, wallet addresses or blockchain configuration.

Do not invent named employees, merchants or departments unless the user explicitly provides them.

When the instruction is ambiguous, make the smallest reasonable assumption and list it in assumptions.

Use concise professional language.

Approval logic must reflect the user's wording.

A rule that says 'without approval' must produce approvalRequired=false.

A rule that says 'approval above £X' must produce approvalRequired=true and approvalThreshold=X.

Risk level describes operational review risk, not financial advice.`;

type OpenAIClient = Pick<OpenAI, "responses">;

function containsRefusal(output: Awaited<ReturnType<OpenAI["responses"]["parse"]>>["output"]): boolean {
  return output.some((item) => item.type === "message" && item.content.some((content) => content.type === "refusal"));
}

export class OpenAIPolicyGenerator implements PolicyGenerator {
  private readonly client: OpenAIClient;
  private readonly model: string;

  constructor(client?: OpenAIClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    this.model = process.env.OPENAI_MODEL || "gpt-5.6";
    const timeout = Number(process.env.OPENAI_POLICY_TIMEOUT_MS || "12000");
    if (!apiKey && !client) throw new PolicyGenerationError("configuration", 500, "Rule could not be created.\nYour description has been preserved.");
    if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 120_000) throw new PolicyGenerationError("configuration", 500, "Rule could not be created.\nYour description has been preserved.");
    this.client = client || new OpenAI({ apiKey, timeout, maxRetries: 0 });
  }

  async generate(input: string): Promise<PolicyGeneration> {
    try {
      const response = await this.client.responses.parse({
        model: this.model,
        input: [
          { role: "system", content: SYSTEM_INSTRUCTION },
          { role: "user", content: input },
        ],
        text: { format: zodTextFormat(GeneratedPolicyContentSchema, "within_spending_policy") },
      });

      if (containsRefusal(response.output)) throw new PolicyGenerationError("refusal", 422, "Rule could not be created.\nYour description has been preserved.");
      if (!response.output_parsed) throw new PolicyGenerationError("invalid_output", 422, "Rule could not be created.\nYour description has been preserved.");
      return { provider: "openai", content: normaliseGeneratedPolicyContent(response.output_parsed) };
    } catch (error) {
      if (error instanceof PolicyGenerationError) throw error;
      if (error instanceof OpenAI.RateLimitError) throw new PolicyGenerationError("rate_limited", 429, "Rule creation is temporarily busy.\nYour description has been preserved.");
      if (error instanceof OpenAI.APIConnectionTimeoutError) throw new PolicyGenerationError("timeout", 503, "Rule creation is temporarily unavailable.\nYour description has been preserved.");
      if (error instanceof OpenAI.APIConnectionError || error instanceof OpenAI.InternalServerError) throw new PolicyGenerationError("unavailable", 503, "Rule creation is temporarily unavailable.\nYour description has been preserved.");
      throw new PolicyGenerationError("invalid_output", 422, "Rule could not be created.\nYour description has been preserved.");
    }
  }
}
