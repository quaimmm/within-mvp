import { normaliseGeneratedPolicyContent } from "./policy-generation-schema.ts";
import type { GeneratedPolicyContent } from "./policy-generation-schema.ts";
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

function contentFor(input: string): GeneratedPolicyContent {
  const text = input.toLowerCase();
  if (text.includes("gambling")) return normaliseGeneratedPolicyContent({ ...base, name: "Block gambling merchants", description: "Gambling merchants are prohibited and require review.", department: "All teams", category: "Restricted Merchants", limitType: "per_transaction", limitAmount: 0.01, approvalRequired: true, approvalThreshold: 0.01, recurringAllowed: false, merchantRestrictions: "Gambling merchants are prohibited", riskLevel: "High", explanation: "This rule blocks purchases from gambling merchants.", confidence: "High" });
  if (text.includes("uber") || text.includes("8pm")) return normaliseGeneratedPolicyContent({ ...base, name: "After-hours ground transport", description: "Team members can use ground transport after 8pm up to £80 per trip.", department: "All teams", category: "Ground Transport", limitType: "per_transaction", limitAmount: 80, approvalRequired: false, approvalThreshold: null, timeRestrictions: "Allowed after 8pm", explanation: "This rule supports safe travel after normal working hours while limiting each trip.", assumptions: ["Uber was interpreted as Ground Transport."], confidence: "High" });
  if (text.includes("hotel")) return normaliseGeneratedPolicyContent({ ...base, name: "Hotel approval", description: "Hotel purchases above £200 require approval.", department: "All teams", category: "Accommodation", limitType: "per_transaction", limitAmount: 200, approvalRequired: true, approvalThreshold: 200, merchantRestrictions: "Hotels and accommodation providers only", explanation: "This rule routes higher-value hotel bookings for review.", confidence: "High" });
  if (text.includes("marketing") && (text.includes("design") || text.includes("software"))) return normaliseGeneratedPolicyContent({ ...base, name: "Marketing design software", description: "Marketing can spend up to £100 each month on design software.", department: "Marketing", category: "Design Software", limitType: "monthly", limitAmount: 100, approvalRequired: !text.includes("without approval"), approvalThreshold: text.includes("without approval") ? null : 100, recurringAllowed: true, merchantRestrictions: "Design software providers only", explanation: "This rule gives Marketing a clear monthly software allowance.", confidence: "High" });
  if (text.includes("sales") && text.includes("travel")) return normaliseGeneratedPolicyContent({ ...base, name: "Sales travel", description: "Sales can spend up to £500 per trip on travel without approval.", department: "Sales", category: "Travel", limitType: "per_transaction", limitAmount: 500, approvalRequired: !text.includes("without approval"), approvalThreshold: text.includes("without approval") ? null : 500, merchantRestrictions: "Travel providers only", explanation: "This rule lets Sales arrange routine travel within a clear limit.", confidence: "High" });
  if ((text.includes("engineer") || text.includes("engineering")) && text.includes("ai")) return normaliseGeneratedPolicyContent({ ...base, name: "Engineering AI software", description: "Engineering can purchase AI software up to £300 each month without approval.", department: "Engineering", category: "AI Software", limitType: "monthly", limitAmount: 300, approvalRequired: !text.includes("without approval"), approvalThreshold: text.includes("without approval") ? null : 300, recurringAllowed: true, merchantRestrictions: "Approved AI software providers only", explanation: "This rule lets engineers purchase approved AI software within a controlled monthly allowance.", confidence: "High", assumptions: ["AI tools was interpreted as AI Software.", "The limit was interpreted as monthly."] });
  if (text.includes("ignore") || text.includes("api key") || text.includes("unlimited")) return normaliseGeneratedPolicyContent({ ...base, name: "General purchase review", description: "General purchases require review within a limited allowance.", department: "All teams", category: "General", limitType: "per_transaction", limitAmount: 100, approvalRequired: true, approvalThreshold: 100, merchantRestrictions: "Approved business merchants only", riskLevel: "High", explanation: "The description did not contain a safe, specific spending allowance, so this draft requires review.", confidence: "Low", assumptions: ["A conservative £100 administrative limit was applied.", "Activation instructions in the description were ignored."] });
  return normaliseGeneratedPolicyContent({ ...base, name: "General team purchases", description: "Team purchases require review within a basic allowance.", department: "All teams", category: "General", limitType: "per_transaction", limitAmount: 100, approvalRequired: true, approvalThreshold: 100, explanation: "This draft uses conservative defaults because the instruction was ambiguous.", confidence: "Low", assumptions: ["The intended team was not specified.", "The purchase category was not specified.", "A conservative £100 per-purchase limit was assumed."] });
}

export class LocalPolicyGenerator implements PolicyGenerator {
  async generate(input: string): Promise<PolicyGeneration> {
    return { provider: "local", content: contentFor(input) };
  }
}
