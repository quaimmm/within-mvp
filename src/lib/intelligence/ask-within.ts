import type { CompanyIntelligenceContext } from "./company-context.ts";

export const ASK_WITHIN_HISTORY_KEY = "within:ask-history:v1";

export type IntelligenceSection = { label: "Insight" | "Why" | "Attention" | "Opportunity"; text: string };
export type IntelligenceAnswer = { intent: string; sections: IntelligenceSection[] };

const noData = (subject = "that"): IntelligenceAnswer => ({
  intent: "unavailable",
  sections: [{ label: "Insight", text: `I don't have enough data in this workspace to answer ${subject} yet.` }],
});
const gbp = (value: number) => `£${value.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;
const usdc = (value: number) => `${value.toLocaleString("en-GB", { maximumFractionDigits: 2 })} USDC`;
const percent = (value: number) => `${Math.round(value * 100)}%`;

function departmentInQuestion(context: CompanyIntelligenceContext, question: string) {
  return context.departments.find((department) => question.includes(department.name.toLowerCase()));
}

function approvalCounts(context: CompanyIntelligenceContext) {
  const open = context.approvals.filter((item) => item.status === "Pending" || item.status === "Flagged");
  return {
    open,
    manager: context.approvals.filter((item) => /manager approval/i.test(item.approvalNote)),
    treasury: context.approvals.filter((item) => item.approvalType === "Treasury multisig"),
    automatic: context.approvals.filter((item) => item.approvalType === "Auto-approved" || item.requestStatus === "Auto-approved"),
  };
}

export function askWithinQuestion(
  context: CompanyIntelligenceContext,
  rawQuestion: string,
  previousIntent?: string,
): IntelligenceAnswer {
  const question = rawQuestion.trim().toLowerCase();
  if (!question) return noData("an empty question");
  const department = departmentInQuestion(context, question);
  const counts = approvalCounts(context);

  if (/what about|how about|and (engineering|sales|marketing|finance|operations|design)/.test(question) && department && previousIntent?.startsWith("department")) {
    const spend = department.analyticsSpend;
    return spend === null ? noData(`${department.name}'s spending`) : {
      intent: "department-spend",
      sections: [{ label: "Insight", text: `${department.name} spent ${gbp(spend)} this month.` }],
    };
  }

  if (/summary|summarise|summarize/.test(question) && /spend|month|company/.test(question)) {
    const topDepartment = [...context.spend.departments].sort((a, b) => b.value - a.value)[0];
    const flagged = context.approvals.filter((item) => item.status === "Flagged").length;
    return {
      intent: "spend-summary",
      sections: [
        { label: "Insight", text: `${context.company.companyName} spent ${gbp(context.spend.currentMonth)} this month, with ${gbp(context.spend.budgetRemaining)} remaining.` },
        ...(topDepartment ? [{ label: "Why" as const, text: `${topDepartment.label} is the largest spending department at ${gbp(topDepartment.value)}.` }] : []),
        ...(counts.open.length ? [{ label: "Attention" as const, text: `${counts.open.length} purchases are waiting for review${flagged ? `, including ${flagged} flagged exception` : ""}.` }] : []),
      ],
    };
  }

  if (/how much.*spend|spent.*month|company spend|spend tracking|budget remaining/.test(question) && !department) {
    const used = context.spend.totalBudget > 0 ? context.spend.currentMonth / context.spend.totalBudget : 0;
    return {
      intent: "company-spend",
      sections: [
        { label: "Insight", text: `${context.company.companyName} has spent ${gbp(context.spend.currentMonth)} this month.` },
        { label: "Why", text: `${percent(used)} of the current budget is used, leaving ${gbp(context.spend.budgetRemaining)}.` },
      ],
    };
  }

  if (/department.*(most|highest|largest)|highest.spending department|which team spends/.test(question)) {
    const top = [...context.spend.departments].sort((a, b) => b.value - a.value)[0];
    if (!top) return noData("department spending");
    const share = context.spend.currentMonth > 0 ? top.value / context.spend.currentMonth : 0;
    return {
      intent: "department-spend-ranking",
      sections: [
        { label: "Insight", text: `${top.label} is the highest-spending department this month at ${gbp(top.value)}.` },
        { label: "Why", text: `That represents ${percent(share)} of company spend.` },
      ],
    };
  }

  if (/remaining budget|unused allowance|most allowance/.test(question) && /department|team/.test(question)) {
    const top = [...context.departments].sort((a, b) => b.remainingAllowance - a.remainingAllowance)[0];
    if (!top) return noData("department allowances");
    return {
      intent: "department-allowance",
      sections: [
        { label: "Insight", text: `${top.name} has the most unused allowance among listed team members: ${gbp(top.remainingAllowance)}.` },
        { label: "Why", text: `Its listed members have used ${gbp(top.memberSpend)} of ${gbp(top.memberLimit)} in combined monthly limits.` },
      ],
    };
  }

  if (department && /spend|spent/.test(question)) {
    if (/travel|software|accommodation|category/.test(question)) {
      const categoryPattern = /travel/.test(question) ? /travel/i : /software/.test(question) ? /software/i : /accommodation|hotel/i;
      const matching = context.approvals.filter((item) => item.department === department.name && categoryPattern.test(item.category));
      if (!matching.length) return noData(`${department.name}'s requested spend in that category`);
      const total = matching.reduce((sum, item) => sum + item.amount, 0);
      return {
        intent: "department-category-spend",
        sections: [
          { label: "Insight", text: `Current approval records show ${gbp(total)} of ${department.name} spend in that category.` },
          { label: "Why", text: `This is based on ${matching.length} recorded purchase ${matching.length === 1 ? "request" : "requests"}, not a complete category ledger.` },
        ],
      };
    }
    if (department.analyticsSpend === null) return noData(`${department.name}'s spending`);
    return { intent: "department-spend", sections: [{ label: "Insight", text: `${department.name} spent ${gbp(department.analyticsSpend)} this month.` }] };
  }

  if (/treasury.*(balance|available|liquidity)|available treasury/.test(question)) {
    if (context.treasury.balance === null) return noData("the available treasury balance");
    return { intent: "treasury-balance", sections: [{ label: "Insight", text: `The recorded treasury balance is ${context.treasury.balanceLabel ?? usdc(context.treasury.balance)}.` }] };
  }

  if (/pool liquidity|facility liquidity|how much.*liquidity|liquidity.*available/.test(question)) {
    return { intent: "credit-liquidity", sections: [{ label: "Insight", text: `The workspace credit facility records ${usdc(context.credit.liquidity)} in liquidity.` }] };
  }

  if (/credit.*available|available.*credit/.test(question)) {
    return {
      intent: "credit-available",
      sections: [
        { label: "Insight", text: `${usdc(context.credit.available)} of company credit is available in the workspace record.` },
        { label: "Why", text: `${usdc(context.credit.outstanding)} is outstanding against a ${usdc(context.credit.limit)} limit.` },
      ],
    };
  }

  if (/credit.*outstanding|outstanding.*credit|employee credit/.test(question)) {
    return { intent: "credit-outstanding", sections: [{ label: "Insight", text: `Outstanding employee credit is ${usdc(context.credit.outstanding)} across ${context.credit.activeLoans} active ${context.credit.activeLoans === 1 ? "loan" : "loans"}.` }] };
  }

  if (/pending approval|approvals.*pending|waiting for review/.test(question)) {
    if (!counts.open.length) return { intent: "approval-count", sections: [{ label: "Insight", text: "There are no purchases waiting for review." }] };
    const names = counts.open.map((item) => `${item.employee} · ${item.merchant}`).join(", ");
    return {
      intent: "approval-count",
      sections: [
        { label: "Insight", text: `${counts.open.length} purchases are waiting for review.` },
        { label: "Attention", text: names },
      ],
    };
  }

  if (/largest (transaction|expense|purchase)/.test(question)) {
    const largest = [...context.activity].sort((a, b) => b.amount - a.amount)[0];
    if (!largest) return noData("the largest transaction");
    return {
      intent: "largest-transaction",
      sections: [
        { label: "Insight", text: `${largest.merchant} is the largest purchase in current activity at ${gbp(largest.amount)}.` },
        { label: "Attention", text: `It is assigned to ${largest.employee} and is currently ${largest.status.toLowerCase()}.` },
      ],
    };
  }

  if (/merchant.*(most|highest|top)|top merchant/.test(question)) {
    const top = [...context.spend.merchants].sort((a, b) => b.value - a.value)[0];
    if (!top) return noData("merchant spending");
    return { intent: "merchant-ranking", sections: [{ label: "Insight", text: `${top.label} receives the most recorded spend at ${gbp(top.value)} this month.` }] };
  }

  if (/(which|what) (rules|policies) (are )?active|active (rules|policies)/.test(question)) {
    const active = context.rules.filter((rule) => rule.active);
    return {
      intent: "active-rules",
      sections: [
        { label: "Insight", text: `${active.length} spending rules are active: ${active.map((rule) => rule.name).join(", ") || "none"}.` },
      ],
    };
  }

  if (/(rule|policy).*(highest|largest).*limit|highest limit/.test(question)) {
    const highest = context.rules.filter((rule) => rule.limit !== null).sort((a, b) => (b.limit ?? 0) - (a.limit ?? 0))[0];
    if (!highest || highest.limit === null) return noData("rule limits");
    return { intent: "rule-limit", sections: [{ label: "Insight", text: `${highest.name} has the highest recorded rule limit at ${gbp(highest.limit)}.` }] };
  }

  if (/(rule|policy).*(most approvals|trigger)/.test(question)) {
    const totals = new Map<string, number>();
    for (const approval of context.approvals) totals.set(approval.ruleName, (totals.get(approval.ruleName) ?? 0) + 1);
    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    if (!ranked.length) return noData("rule approval volume");
    const maximum = ranked[0][1];
    const leaders = ranked.filter(([, count]) => count === maximum).map(([name]) => name);
    return { intent: "rule-approvals", sections: [{ label: "Insight", text: `${leaders.join(", ")} ${leaders.length === 1 ? "has" : "are tied for"} the most recorded approval activity at ${maximum} ${maximum === 1 ? "request" : "requests"} each.` }] };
  }

  if (/card.*(capacity|limit|used)|how much.*card/.test(question)) {
    const totalLimit = context.cards.reduce((sum, card) => sum + card.limit, 0);
    const totalSpent = context.cards.reduce((sum, card) => sum + card.spent, 0);
    if (totalLimit <= 0) return noData("card capacity");
    return {
      intent: "card-capacity",
      sections: [
        { label: "Insight", text: `${percent(totalSpent / totalLimit)} of recorded monthly card capacity is used.` },
        { label: "Why", text: `${gbp(totalSpent)} has been spent against ${gbp(totalLimit)} of combined monthly limits.` },
        { label: "Attention", text: `${context.cards.filter((card) => card.status === "Frozen").length} card is currently frozen.` },
      ],
    };
  }

  if (/auto.?approved|automatic approval/.test(question)) {
    return { intent: "auto-approval-count", sections: [{ label: "Insight", text: `${counts.automatic.length} purchases in the current approval records were classified as auto-approved.` }] };
  }

  if (/manager approval/.test(question)) {
    return { intent: "manager-approval-count", sections: [{ label: "Insight", text: `${counts.manager.length} purchases in the current records required manager approval.` }] };
  }

  if (/treasury.*approval|multisig/.test(question)) {
    return { intent: "treasury-approval-count", sections: [{ label: "Insight", text: `${counts.treasury.length} purchases in the current records require treasury multisig approval.` }] };
  }

  if (/compliant|compliance percentage|percentage of spend/.test(question)) {
    const total = context.activity.reduce((sum, item) => sum + item.amount, 0);
    const approved = context.activity.filter((item) => item.status === "Approved").reduce((sum, item) => sum + item.amount, 0);
    if (total === 0) return noData("spend compliance");
    return {
      intent: "spend-compliance",
      sections: [
        { label: "Insight", text: `${percent(approved / total)} of the purchase value in current activity is marked approved.` },
        { label: "Why", text: `That is ${gbp(approved)} approved out of ${gbp(total)} represented in the activity feed.` },
      ],
    };
  }

  if (/british airways|why.*purchase.*approval/.test(question)) {
    const purchase = context.approvals.find((item) => item.merchant.toLowerCase().includes("british airways"));
    if (!purchase) return noData("that purchase");
    return {
      intent: "approval-explanation",
      sections: [
        { label: "Insight", text: `${purchase.merchant} required ${purchase.approvalType.toLowerCase()} because ${purchase.reviewReason.charAt(0).toLowerCase()}${purchase.reviewReason.slice(1)}.` },
        { label: "Why", text: `It was evaluated against ${purchase.ruleName} (${purchase.policyId}).` },
      ],
    };
  }

  if (/overspend|close to.*limit|near.*limit/.test(question)) {
    const over = context.employees.filter((employee) => employee.spend > employee.limit);
    const close = [...context.employees].filter((employee) => employee.limit > 0).sort((a, b) => b.utilisation - a.utilisation).slice(0, 3);
    return {
      intent: "employee-limits",
      sections: [
        { label: "Insight", text: over.length ? `${over.map((employee) => employee.name).join(", ")} ${over.length === 1 ? "is" : "are"} above the listed monthly limit.` : "No listed employee is above their monthly limit." },
        ...(close.length ? [{ label: "Attention" as const, text: `${close[0].name} is closest at ${percent(close[0].utilisation)} utilisation; the next highest are ${close.slice(1).map((employee) => `${employee.name} at ${percent(employee.utilisation)}`).join(" and ")}.` }] : []),
      ],
    };
  }

  if (/automate more|reduce.*manual|unnecessary manual/.test(question)) {
    const candidate = counts.open.find((item) => item.risk === "Low" && /first purchase/i.test(item.reviewReason));
    if (!candidate) return noData("safe approval automation opportunities");
    return {
      intent: "automation-opportunity",
      sections: [
        { label: "Insight", text: `${candidate.employee}'s ${gbp(candidate.amount)} ${candidate.merchant} purchase is the clearest automation candidate.` },
        { label: "Why", text: `It is low risk, matches ${candidate.ruleName}, and entered review only because it is the first purchase from this merchant.` },
        { label: "Opportunity", text: `After the merchant is established, Finance could consider auto-approving similar purchases within the existing rule limit.` },
      ],
    };
  }

  if (/finance.*attention|what should finance|what needs attention|unusual|exception|risk/.test(question)) {
    const flagged = context.approvals.filter((item) => item.status === "Flagged" || item.risk === "High");
    return {
      intent: "finance-attention",
      sections: [
        { label: "Insight", text: `${counts.open.length} purchases need review and ${context.treasury.openRequests} treasury request is still open.` },
        ...(flagged.length ? [{ label: "Attention" as const, text: `${flagged[0].employee}'s ${gbp(flagged[0].amount)} ${flagged[0].merchant} purchase is the clearest exception: ${flagged[0].reviewReason}` }] : []),
      ],
    };
  }

  if (/recurring|growing fastest|growth|overdue invoice|forecast/.test(question)) return noData("that trend");
  return noData();
}

export function answerWorkspaceQuestion(
  context: CompanyIntelligenceContext,
  question: string,
  previousIntent?: string,
) {
  return askWithinQuestion(context, question, previousIntent).sections.map((section) => section.text).join(" ");
}
