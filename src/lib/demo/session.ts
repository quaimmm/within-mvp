export const DEMO_ADMIN = { name: "Amanda Morgan", email: "amanda@northstar.io", role: "Administrator" } as const;

export function isNorthstarEmail(value: string): boolean {
  return /^[^@\s]+@northstar\.io$/i.test(value.trim());
}
