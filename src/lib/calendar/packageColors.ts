// Package color palette + stable hash — shared by the Bookings Calendar and
// Space Schedule so a given package always maps to the same swatch on both
// screens (and matches the web admin's 12-color set + getPackageNameHash).

export type PackageColor = { bg: string; text: string };

export const PACKAGE_COLORS: PackageColor[] = [
  { bg: "#DBEAFE", text: "#1E40AF" }, // blue
  { bg: "#DCFCE7", text: "#166534" }, // green
  { bg: "#F3E8FF", text: "#6B21A8" }, // purple
  { bg: "#FFEDD5", text: "#9A3412" }, // orange
  { bg: "#FCE7F3", text: "#9D174D" }, // pink
  { bg: "#CCFBF1", text: "#115E59" }, // teal
  { bg: "#E0E7FF", text: "#3730A3" }, // indigo
  { bg: "#FEF3C7", text: "#92400E" }, // amber
  { bg: "#CFFAFE", text: "#155E75" }, // cyan
  { bg: "#FFE4E6", text: "#9F1239" }, // rose
  { bg: "#ECFCCB", text: "#3F6212" }, // lime
  { bg: "#FAE8FF", text: "#86198F" }, // fuchsia
];

/** Stable 32-bit string hash — identical to the web's getPackageNameHash. */
export function packageNameHash(name: string): number {
  if (!name) return 0;
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/** Deterministic color for a package name. */
export function packageColor(name: string): PackageColor {
  return PACKAGE_COLORS[packageNameHash(name) % PACKAGE_COLORS.length];
}
