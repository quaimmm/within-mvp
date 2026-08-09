import { normaliseGeneratedPolicyContent } from "./policy-generation-schema.ts";
import type { GeneratedPolicyContent } from "./policy-generation-schema.ts";
import { PolicyGenerationError } from "./policy-generator.ts";
import type { PolicyGeneration, PolicyGenerator } from "./policy-generator.ts";

const base = {
  currency: "GBP" as const,
  recurringAllowed: false,
  merchantRestrictions: "Merchants matching the stated category only",
  timeRestrictions: null,
  riskLevel: "Low" as const,
  confidence: "High" as const,
  assumptions: [] as string[],
};

const knownDepartments: Array<[RegExp, string]> = [
  [/\b(?:engineering|engineers?)\b/i, "Engineering"],
  [/\bsales\b/i, "Sales"],
  [/\bfinance\b/i, "Finance"],
  [/\bmarketing\b/i, "Marketing"],
  [/\boperations?\b/i, "Operations"],
  [/\bproduct\b/i, "Product"],
  [/\bhuman resources\b|\bhr\b/i, "HR"],
  [/\bpeople\b/i, "People"],
];

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (character) => character.toUpperCase());
}

function parseDepartment(input: string): string | null {
  const known = knownDepartments.find(([pattern]) => pattern.test(input));
  if (known) return known[1];
  const leadingTeam = input.match(/^([a-z][a-z &-]{1,40}?)\s+(?:team\s+)?(?:can|may|are allowed to)\b/i)?.[1]?.trim();
  if (!leadingTeam || /^(?:employees?|team|everyone|company)$/i.test(leadingTeam)) return null;
  return titleCase(leadingTeam);
}

function parseCategory(input: string): { category: string; merchantRestrictions: string; assumption?: string } | null {
  if (/\bgambl(?:ing|e)|\bcasino|\bbetting\b/i.test(input)) return { category: "Restricted Merchants", merchantRestrictions: "Gambling merchants are prohibited" };
  if (/\bhotels?\b|\baccommodation\b/i.test(input)) return { category: "Accommodation", merchantRestrictions: "Hotels and accommodation providers only" };
  if (/\btravel\b|\bflights?\b/i.test(input)) return { category: "Travel", merchantRestrictions: "Travel providers only" };
  if (/\buber\b|\bground transport\b|\btaxis?\b/i.test(input)) return { category: "Ground Transport", merchantRestrictions: "Ground transport providers only", assumption: "Named transport services were interpreted as Ground Transport." };
  if (/\bai\s+(?:tools?|software)\b/i.test(input)) return { category: "AI Tools", merchantRestrictions: "Approved AI and software providers only" };
  if (/\bdesign software\b/i.test(input)) return { category: "Design Software", merchantRestrictions: "Design software providers only" };
  if (/\bsaas\b|\bsoftware\b|\btools?\b/i.test(input)) return { category: "Software", merchantRestrictions: "Approved software providers only" };
  return null;
}

function parseAmount(input: string): number | null {
  const match = input.match(/(?:£|\$)\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i)
    ?? input.match(/\b([0-9][0-9,]*(?:\.\d{1,2})?)\s*(?:GBP|USD|USDC)\b/i);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function parseCadence(input: string): GeneratedPolicyContent["limitType"] {
  if (/\bper\s+month\b|\/\s*month\b|\/month\b|\bmonthly\b/i.test(input)) return "monthly";
  if (/\bper\s+week\b|\/\s*week\b|\bweekly\b/i.test(input)) return "weekly";
  if (/\bper\s+year\b|\/\s*year\b|\/year\b|\bannually\b|\bannual\b/i.test(input)) return "annual";
  return "per_transaction";
}

function failClosed(): never {
  throw new PolicyGenerationError("invalid_output", 422, "We couldn't confidently interpret this rule. Please adjust the wording.");
}

function contentFor(input: string): GeneratedPolicyContent {
  const prompt = input.trim();
  if (/\bignore\b|\bapi key\b|\bunlimited\b/i.test(prompt)) failClosed();

  const categoryResult = parseCategory(prompt);
  if (!categoryResult) failClosed();

  const prohibited = categoryResult.category === "Restricted Merchants";
  const amount = parseAmount(prompt);
  if (!prohibited && amount === null) failClosed();

  const approvalRequired = prohibited || /\brequire(?:s|d)?\s+approval\b|\bapproval\s+required\b/i.test(prompt)
    ? true
    : !/\bwithout\s+approval\b|\bno\s+approval\b|\bapproval\s+not\s+required\b/i.test(prompt);
  const department = parseDepartment(prompt) ?? (/^\s*allow\b|\brequire(?:s|d)?\s+approval\b|\bblock\b/i.test(prompt) ? "All teams" : null);
  if (!department) failClosed();

  const limitAmount = prohibited ? 0.01 : amount!;
  const limitType = parseCadence(prompt);
  const timeMatch = prompt.match(/\bafter\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i);
  const cadenceLabel = limitType === "monthly" ? "monthly" : limitType === "weekly" ? "weekly" : limitType === "annual" ? "annual" : "per-purchase";
  const action = prohibited ? "Block" : approvalRequired ? "Review" : "Allow";
  const assumptions = categoryResult.assumption ? [categoryResult.assumption] : [];

  return normaliseGeneratedPolicyContent({
    ...base,
    name: prohibited ? "Block gambling merchants" : `${department} ${categoryResult.category}`,
    description: prompt,
    department,
    category: categoryResult.category,
    limitType,
    limitAmount,
    approvalRequired,
    approvalThreshold: approvalRequired ? limitAmount : null,
    recurringAllowed: limitType !== "per_transaction",
    merchantRestrictions: categoryResult.merchantRestrictions,
    timeRestrictions: timeMatch ? `Allowed after ${timeMatch[1]}` : null,
    riskLevel: prohibited ? "High" : "Low",
    explanation: prohibited
      ? "This rule blocks purchases from gambling merchants."
      : `${action} ${categoryResult.category.toLowerCase()} spending for ${department} up to £${limitAmount} on a ${cadenceLabel} basis.`,
    confidence: "High",
    assumptions,
  });
}

export class LocalPolicyGenerator implements PolicyGenerator {
  async generate(input: string): Promise<PolicyGeneration> {
    return { provider: "local", content: contentFor(input) };
  }
}
