const USER_INITIALS_FALLBACK = "U";

export function userInitials(firstName: string, lastName: string): string {
  const first = firstName.trim();
  const last = lastName.trim();

  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase() || USER_INITIALS_FALLBACK;
}

export function userDisplayName(firstName: string, lastName: string): string {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ") || "Workspace user";
}
