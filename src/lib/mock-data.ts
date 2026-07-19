import type { Payment, TeamMember } from "./types";

export const teamMembers: TeamMember[] = [
  { id: "mert", name: "Mert Kara", role: "Design & Development Engineer", initials: "MK", spent: 420, available: 30, activeRules: 4, status: "active" },
  { id: "sarah", name: "Sarah Miles", role: "Product Designer", initials: "SM", spent: 318, available: 54, activeRules: 3, status: "active" },
  { id: "daniel", name: "Daniel Reed", role: "Software Engineer", initials: "DR", spent: 276, available: 65, activeRules: 5, status: "active" },
  { id: "alex", name: "Alex Morgan", role: "Operations Lead", initials: "AM", spent: 612, available: 18, activeRules: 6, status: "active" },
];

export const initialPayments: Payment[] = [
  { id: "p-1", merchant: "Arc Café", employee: "Mert Kara", category: "Meals", amount: 18, time: "09:42", status: "settled" },
  { id: "p-2", merchant: "City Ride", employee: "Sarah Miles", category: "Transport", amount: 22, time: "09:18", status: "settled" },
  { id: "p-3", merchant: "Linear", employee: "Daniel Reed", category: "Software", amount: 15, time: "Yesterday", status: "settled" },
  { id: "p-4", merchant: "Arc Hotel", employee: "Mert Kara", category: "Accommodation", amount: 185, time: "Yesterday", status: "pending" },
];
