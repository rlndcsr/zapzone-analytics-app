/**
 * Semantic version comparison — the one place the app decides whether a version
 * string is older/newer than another. String comparison is wrong here ("1.0.10"
 * sorts BEFORE "1.0.9" lexically), so every part is compared numerically.
 *
 * Accepts the shapes a release pipeline actually produces:
 *   "1.2.3", "v1.2.3", "1.2", "1", "1.2.3.4" (4-part Windows-style builds),
 *   "1.2.3-beta.1" (pre-release), "1.2.3+20250801" (build metadata, ignored).
 *
 * Anything else is *unparseable*, not "older": callers get `null` from
 * {@link compareVersions} and `false` from {@link isVersionOlderThan}, so a
 * malformed value from the backend can never force an update on a user.
 */

export type ParsedVersion = {
  /** Numeric release parts (major, minor, patch, …) with no padding. */
  core: number[];
  /** Dot-separated pre-release identifiers ("beta", "1"); empty for a release. */
  prerelease: string[];
};

/** Guard against absurd input (a base64 blob is not a version). */
const MAX_CORE_PARTS = 4;

/**
 * Parse a version string into its numeric core + pre-release identifiers.
 * Returns `null` when the value is missing or not a recognizable version.
 */
export function parseVersion(
  value: string | null | undefined,
): ParsedVersion | null {
  if (typeof value !== "string") return null;

  // Drop a leading "v" (tag-style versions) and build metadata after "+", which
  // semver defines as having no bearing on precedence.
  const normalized = value.trim().replace(/^v/i, "").split("+")[0];
  if (!normalized) return null;

  const dashAt = normalized.indexOf("-");
  const coreText = dashAt === -1 ? normalized : normalized.slice(0, dashAt);
  const prereleaseText = dashAt === -1 ? "" : normalized.slice(dashAt + 1);

  const coreParts = coreText.split(".");
  if (coreParts.length > MAX_CORE_PARTS) return null;

  const core: number[] = [];
  for (const part of coreParts) {
    // Digits only: "1.2.3rc" is not something we can order reliably.
    if (!/^\d+$/.test(part)) return null;
    const parsed = Number(part);
    if (!Number.isSafeInteger(parsed)) return null;
    core.push(parsed);
  }

  const prerelease = prereleaseText
    ? prereleaseText.split(".").filter((id) => id.length > 0)
    : [];

  return { core, prerelease };
}

/**
 * Compare pre-release identifiers per semver precedence rules:
 * a release outranks any pre-release of the same core, numeric identifiers rank
 * below alphanumeric ones, and a shorter identifier list ranks lower when all
 * preceding identifiers are equal.
 */
function comparePrerelease(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  // "1.0.0" > "1.0.0-beta": the absence of a pre-release wins.
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;

  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const left = a[i];
    const right = b[i];
    if (left === undefined) return -1;
    if (right === undefined) return 1;

    const leftIsNumeric = /^\d+$/.test(left);
    const rightIsNumeric = /^\d+$/.test(right);

    if (leftIsNumeric && rightIsNumeric) {
      const diff = Number(left) - Number(right);
      if (diff !== 0) return diff < 0 ? -1 : 1;
      continue;
    }
    if (leftIsNumeric !== rightIsNumeric) return leftIsNumeric ? -1 : 1;
    if (left !== right) return left < right ? -1 : 1;
  }

  return 0;
}

/**
 * Order two versions: `-1` when `a < b`, `0` when equal, `1` when `a > b`.
 * Returns `null` when either side cannot be parsed — the caller decides what an
 * unknown comparison means rather than getting a misleading `0`.
 *
 * Missing core parts count as zero, so "1.2" and "1.2.0" are equal.
 */
export function compareVersions(
  a: string | null | undefined,
  b: string | null | undefined,
): number | null {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return null;

  const length = Math.max(left.core.length, right.core.length);
  for (let i = 0; i < length; i++) {
    const diff = (left.core[i] ?? 0) - (right.core[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }

  return comparePrerelease(left.prerelease, right.prerelease);
}

/**
 * True only when `version` is definitively older than `other`. An unknown
 * comparison (either side malformed/missing) is `false` — "we can't tell" must
 * never read as "you are out of date".
 */
export function isVersionOlderThan(
  version: string | null | undefined,
  other: string | null | undefined,
): boolean {
  const result = compareVersions(version, other);
  return result !== null && result < 0;
}
