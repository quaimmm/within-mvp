import type { DemoState } from "../data/demo-state.ts";

export function cardSummary(state: DemoState) {
  return {
    activeCards: state.cards.filter((card) => card.status === "Active").length,
    frozenCards: state.cards.filter((card) => card.status === "Frozen").length,
    spentThisMonth: state.cards.reduce((total, card) => total + card.spent, 0),
    available: state.cards
      .filter((card) => card.status === "Active")
      .reduce((total, card) => total + Math.max(0, card.monthlyLimit - card.spent), 0),
  };
}

export function teamSummary(state: DemoState) {
  const currentMembers = state.members.filter((member) => member.accountStatus !== "Invited");
  return {
    teamMembers: currentMembers.length,
    departments: new Set(currentMembers.map((member) => member.department)).size,
    activeCards: state.cards.filter((card) => card.status === "Active").length,
    pendingInvitations: state.members.filter((member) => member.accountStatus === "Invited").length,
  };
}

export function analyticsSummary(state: DemoState) {
  const monthlyTrend = state.analytics.monthly.map((period, index, periods) =>
    index === periods.length - 1 ? { ...period, value: state.dashboard.companySpend } : period,
  );
  const previousPeriod = monthlyTrend.at(-2)?.value;
  const comparison = previousPeriod && previousPeriod > 0
    ? Math.round((state.dashboard.companySpend - previousPeriod) / previousPeriod * 100)
    : null;
  const purchasesChecked = state.approvals.length;
  const approvedAutomatically = state.approvals.filter((approval) =>
    approval.approvalType === "Auto-approved"
      || approval.requestStatus === "Auto-approved"
      || (approval.status === "Approved" && approval.approvalNote === "No approval required"),
  ).length;
  const sentForApproval = state.approvals.filter((approval) => approval.status === "Pending" || approval.status === "Flagged").length;
  const blocked = state.approvals.filter((approval) => approval.approvalType === "Blocked" || approval.requestStatus === "Blocked").length;

  return {
    companySpend: state.dashboard.companySpend,
    monthlyTrend,
    comparison,
    rulePerformance: {
      autoApprovalRate: purchasesChecked > 0 ? Math.round(approvedAutomatically / purchasesChecked * 100) : 0,
      purchasesChecked,
      approvedAutomatically,
      sentForApproval,
      blocked,
    },
  };
}
