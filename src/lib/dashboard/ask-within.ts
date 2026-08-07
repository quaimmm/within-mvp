import type { DemoState } from "../../data/demo-state.ts";

export function answerWorkspaceQuestion(state: DemoState, question: string): string {
  const normalized = question.toLowerCase();
  const openApprovals = state.approvals.filter((item) => item.status === "Pending" || item.status === "Flagged");
  const exceptions = openApprovals.filter((item) => item.status === "Flagged" || item.risk === "High");
  const activeRules = state.rules.seededRules.filter((rule) => rule.active).length + (state.rules.generatedRule?.active ? 1 : 0);
  const totalBudget = state.dashboard.companySpend + state.dashboard.budgetRemaining;
  const budgetUsed = totalBudget > 0 ? Math.round((state.dashboard.companySpend / totalBudget) * 100) : 0;

  if (/attention|exception|risk|review|pending/.test(normalized)) {
    if (openApprovals.length === 0) return "There are no purchases waiting for review. The approval workspace is clear.";
    const exceptionSummary = exceptions.length === 1 ? "One is a policy exception that needs attention." : `${exceptions.length} are policy exceptions that need attention.`;
    return `${openApprovals.length} purchases are waiting for review. ${exceptionSummary}`;
  }
  if (/rule|policy|covered|coverage/.test(normalized)) {
    return `${activeRules} spending rules are active. Open Rules to review who they cover, their limits and approval requirements.`;
  }
  if (/spend|budget|tracking|month/.test(normalized)) {
    return `Northstar Labs has used ${budgetUsed}% of its current company budget, with £${state.dashboard.budgetRemaining.toLocaleString("en-GB")} remaining.`;
  }
  if (/card|capacity|limit/.test(normalized)) {
    const spend = state.cards.reduce((total, card) => total + card.spent, 0);
    const limit = state.cards.reduce((total, card) => total + card.monthlyLimit, 0);
    const used = limit > 0 ? Math.round((spend / limit) * 100) : 0;
    return `Company cards have used ${used}% of their combined monthly capacity. Open Cards for individual limits and activity.`;
  }
  return "I can summarise current spend, active rules, card capacity and purchases that need attention. This view is read-only and uses the workspace data already shown in Within.";
}
