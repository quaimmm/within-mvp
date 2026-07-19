import { z } from "zod";

const trimmedText = z.string().trim().min(1).max(500);

export const GeneratedPolicyContentSchema = z.object({
  name: trimmedText.max(100),
  description: trimmedText.max(400),
  department: trimmedText.max(100),
  category: trimmedText.max(100),
  limitType: z.enum(["monthly", "per_transaction"]),
  limitAmount: z.number().positive().max(1_000_000),
  currency: z.literal("GBP"),
  approvalRequired: z.boolean(),
  approvalThreshold: z.number().positive().max(1_000_000).nullable(),
  recurringAllowed: z.boolean(),
  merchantRestrictions: trimmedText.max(300),
  timeRestrictions: trimmedText.max(200).nullable(),
  riskLevel: z.enum(["Low", "Medium", "High"]),
  explanation: trimmedText.max(400),
  confidence: z.enum(["High", "Medium", "Low"]),
  assumptions: z.array(trimmedText.max(200)).max(5),
}).strict();

export type GeneratedPolicyContent = z.infer<typeof GeneratedPolicyContentSchema>;

export function normaliseGeneratedPolicyContent(value: unknown): GeneratedPolicyContent {
  const parsed = GeneratedPolicyContentSchema.parse(value);
  return GeneratedPolicyContentSchema.parse({
    ...parsed,
    name: parsed.name.trim(),
    description: parsed.description.trim(),
    department: parsed.department.trim(),
    category: parsed.category.trim(),
    approvalThreshold: parsed.approvalRequired ? (parsed.approvalThreshold ?? parsed.limitAmount) : null,
    merchantRestrictions: parsed.merchantRestrictions.trim(),
    timeRestrictions: parsed.timeRestrictions?.trim() || null,
    explanation: parsed.explanation.trim(),
    assumptions: parsed.assumptions.slice(0, 5).map((assumption) => assumption.trim()).filter(Boolean),
  });
}
