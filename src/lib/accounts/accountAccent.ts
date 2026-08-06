export const ACTIVE_ACCOUNT_BLUE = "#0644C7";

export const ACTIVE_ACCOUNT_TINT = "rgba(6, 68, 199, 0.06)";

export function initialsFor(
  name?: string | null,
  email?: string | null,
): string {
  const source = (name ?? "").trim() || (email ?? "").split("@")[0] || "";
  const parts = source.split(/[\s._-]+/).filter(Boolean);

  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
