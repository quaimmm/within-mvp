const INITIALS_FALLBACK = "CO";

export function companyInitials(companyName: string): string {
  const words = companyName
    .trim()
    .split(/\s+/)
    .map((word) => word.match(/[\p{L}\p{N}]/gu)?.join("") ?? "")
    .filter(Boolean);

  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return INITIALS_FALLBACK;
}
