import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createPolicyGenerator } from "@/lib/policies/create-policy-generator";
import { PolicyGenerationError } from "@/lib/policies/policy-generator";
import type { PolicyGeneratorProvider } from "@/lib/policies/policy-generator";
import type { SpendingPolicy } from "@/lib/policies/policy-publisher";

export const runtime = "nodejs";

type PolicyGenerationRequest = { input: string };
type PolicyGenerationResult = {
  success: boolean;
  provider: PolicyGeneratorProvider;
  policy?: SpendingPolicy;
  explanation?: string;
  confidence?: "High" | "Medium" | "Low";
  assumptions?: string[];
  fallbackOccurred?: boolean;
  errorCode?: string;
  message?: string;
};

const controlCharacters = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

function validateInput(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const input = value.trim();
  if (input.length < 8 || input.length > 1000 || controlCharacters.test(input)) return null;
  return input;
}

function readableSegment(value: string): string {
  const words = value.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return "GEN";
  if (words[0] === "AI") return "AI";
  return words.length === 1 ? words[0].slice(0, 3) : words.map((word) => word[0]).join("").slice(0, 3);
}

function createPolicyId(department: string, category: string): string {
  return `POL-${readableSegment(department)}-${readableSegment(category)}-${randomBytes(2).toString("hex").toUpperCase()}`;
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const selectedProvider = process.env.POLICY_GENERATOR || "local";
  let body: PolicyGenerationRequest;
  try {
    body = await request.json() as PolicyGenerationRequest;
  } catch {
    return NextResponse.json<PolicyGenerationResult>({ success: false, provider: selectedProvider === "openai" ? "openai" : "local", errorCode: "invalid_input", message: "Enter a clear spending-rule description." }, { status: 400 });
  }
  const input = validateInput(body.input);
  if (!input) return NextResponse.json<PolicyGenerationResult>({ success: false, provider: selectedProvider === "openai" ? "openai" : "local", errorCode: "invalid_input", message: "Enter a description between 8 and 1,000 characters." }, { status: 400 });

  try {
    const generator = createPolicyGenerator(selectedProvider);
    const generation = await generator.generate(input);
    const now = new Date().toISOString();
    const policyId = createPolicyId(generation.content.department, generation.content.category);
    const policy: SpendingPolicy = {
      id: policyId,
      policyId,
      ...generation.content,
      businessLimit: generation.content.limitAmount,
      businessCurrency: "GBP",
      status: "Draft",
      active: false,
      createdAt: now,
      updatedAt: now,
    };
    console.info(`[policies/generate] provider=${generation.provider} outcome=success duration_ms=${Date.now() - startedAt}`);
    return NextResponse.json<PolicyGenerationResult>({ success: true, provider: generation.provider, policy, explanation: policy.explanation, confidence: policy.confidence, assumptions: policy.assumptions, fallbackOccurred: generation.fallbackOccurred, message: generation.fallbackOccurred ? "Rule created locally." : undefined });
  } catch (error) {
    const failure = error instanceof PolicyGenerationError ? error : new PolicyGenerationError("unavailable", 500, "Rule could not be created.\nYour description has been preserved.");
    console.warn(`[policies/generate] provider=${selectedProvider} outcome=failed duration_ms=${Date.now() - startedAt} category=${failure.code}`);
    return NextResponse.json<PolicyGenerationResult>({ success: false, provider: selectedProvider === "openai" ? "openai" : "local", errorCode: failure.code, message: failure.safeMessage }, { status: failure.status });
  }
}
