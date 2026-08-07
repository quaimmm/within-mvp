import type { DemoState, TransactionStatus } from "../../data/demo-state.ts";

export type CompanyIntelligenceContext = ReturnType<typeof createCompanyContext>;

function parseAmount(value: string): number | null {
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function ruleLimit(description: string): number | null {
  const match = description.match(/£\s?([\d,]+(?:\.\d+)?)/);
  if (!match) return null;
  const value = Number(match[1].replaceAll(",", ""));
  return Number.isFinite(value) ? value : null;
}

function isPurchaseActivity(category: string) {
  return !/signer|multisig|settlement|credit|approval recorded|request created/i.test(category);
}

export function createCompanyContext(state: DemoState) {
  const departmentAllowances = new Map<string, { spend: number; limit: number; people: number }>();
  for (const member of state.members) {
    const current = departmentAllowances.get(member.department) ?? { spend: 0, limit: 0, people: 0 };
    departmentAllowances.set(member.department, {
      spend: current.spend + member.monthlySpend,
      limit: current.limit + member.monthlyLimit,
      people: current.people + 1,
    });
  }

  const generatedRule = state.rules.generatedRule;
  const rules = [
    ...state.rules.seededRules.map((rule) => ({
      id: rule.policyId,
      name: rule.name,
      description: rule.description,
      active: rule.active,
      limit: ruleLimit(rule.description),
    })),
    ...(generatedRule ? [{
      id: generatedRule.policyId,
      name: generatedRule.name,
      description: generatedRule.description,
      active: generatedRule.active,
      limit: generatedRule.businessLimit,
    }] : []),
  ];

  const purchaseActivity = state.dashboard.activity
    .filter((item) => item.amount.trim().startsWith("£") && isPurchaseActivity(item.category))
    .map((item) => ({
      id: item.id,
      employee: item.employee,
      department: item.role,
      merchant: item.merchant,
      category: item.category,
      amount: parseAmount(item.amount) ?? 0,
      status: item.status as TransactionStatus,
    }));

  const outstandingCredit = state.credit.loans
    .filter((loan) => loan.status === "Active")
    .reduce((total, loan) => total + loan.outstandingPrincipal, 0);
  const treasuryBalance = state.treasury.balance ? parseAmount(state.treasury.balance) : null;

  return {
    company: { ...state.company },
    spend: {
      currentMonth: state.dashboard.companySpend,
      budgetRemaining: state.dashboard.budgetRemaining,
      totalBudget: state.dashboard.companySpend + state.dashboard.budgetRemaining,
      monthlyTrend: state.analytics.monthly.map((item) => ({ ...item })),
      categories: state.analytics.categories.map((item) => ({ ...item })),
      departments: state.analytics.departments.map((item) => ({ ...item })),
      merchants: state.analytics.merchants.map((item) => ({ ...item })),
    },
    departments: Array.from(departmentAllowances, ([name, values]) => ({
      name,
      memberSpend: values.spend,
      memberLimit: values.limit,
      remainingAllowance: Math.max(0, values.limit - values.spend),
      people: values.people,
      analyticsSpend: state.analytics.departments.find((item) => item.label === name)?.value ?? null,
    })),
    employees: state.members.map((member) => ({
      id: member.id,
      name: member.name,
      department: member.department,
      spend: member.monthlySpend,
      limit: member.monthlyLimit,
      remaining: Math.max(0, member.monthlyLimit - member.monthlySpend),
      utilisation: member.monthlyLimit > 0 ? member.monthlySpend / member.monthlyLimit : 0,
    })),
    activity: purchaseActivity,
    approvals: state.approvals.map((approval) => ({
      id: approval.id,
      employee: approval.employeeName,
      department: approval.department,
      merchant: approval.merchant,
      category: approval.category,
      amount: approval.amount,
      status: approval.status,
      risk: approval.risk,
      policyId: approval.policyId,
      ruleName: approval.ruleName,
      approvalType: approval.approvalType,
      approvalNote: approval.approvalNote,
      reviewReason: approval.reviewReason,
      requestStatus: approval.requestStatus ?? null,
    })),
    rules,
    cards: state.cards.map((card) => ({
      id: card.id,
      employee: card.employeeName,
      department: card.department,
      spent: card.spent,
      limit: card.monthlyLimit,
      status: card.status,
    })),
    treasury: {
      balance: treasuryBalance,
      balanceLabel: state.treasury.balance,
      threshold: state.treasury.threshold,
      activeSigners: state.treasury.signers.filter((signer) => signer.active).length,
      openRequests: state.treasury.requests.filter((request) => request.status !== "Settlement confirmed" && request.status !== "Declined").length,
    },
    credit: {
      enabled: state.credit.enabled,
      mode: state.credit.mode,
      limit: state.credit.creditLimit,
      available: Math.max(0, state.credit.creditLimit - outstandingCredit),
      outstanding: outstandingCredit,
      liquidity: state.credit.facilityLiquidity,
      activeLoans: state.credit.loans.filter((loan) => loan.status === "Active").length,
      nextRepayment: state.credit.loans.find((loan) => loan.status === "Active")?.nextRepayment ?? null,
    },
  };
}
