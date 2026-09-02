export const EMAIL_DOMAINS: string[] = [
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "aol.com",
  "comcast.net",
  "sbcglobal.net",
  "att.net",
  "live.com",
  "msn.com",
  "me.com",
  "mac.com",
  "ymail.com",
  "rocketmail.com",
  "yahoo.co.uk",
  "googlemail.com",
  "outlook.co.uk",
  "hotmail.co.uk",
  "protonmail.com",
  "proton.me",
  "gmx.com",
  "gmx.net",
  "mail.com",
  "zoho.com",
  "yandex.com",
  "fastmail.com",
  "ameritech.net",
  "wowway.com",
  "charter.net",
  "chartermi.net",
  "cox.net",
  "verizon.net",
  "bellsouth.net",
  "earthlink.net",
  "frontier.com",
  "juno.com",
  "netzero.net",
  "roadrunner.com",
  "twc.com",
  "optonline.net",
  "windstream.net",
  "centurylink.net",
  "peoplepc.com",
  "sympatico.ca",
  "shaw.ca",
  "rogers.com",
  "zone-entertainment.com",
  "zap-zone.com",
];

/** Offered as soon as the "@" is typed, before any domain characters. */
const POPULAR_DOMAINS: string[] = [
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "comcast.net",
];

export type EmailSuggestionKind = "completion" | "correction";

export type EmailSuggestion = {
  domain: string;
  email: string;
  kind: EmailSuggestionKind;
};

type SuggestOptions = {
  /** Venue-specific domains to consider alongside the built-in list. */
  extraDomains?: string[];
  limit?: number;
};

const MAX_CORRECTION_DISTANCE = 2;
const DEFAULT_LIMIT = 6;

const editDistance = (a: string, b: string, cap: number): number => {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;

  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    let rowBest = curr[0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, (prev[j - 2] ?? Infinity) + 1);
      }
      curr[j] = value;
      if (value < rowBest) rowBest = value;
    }
    if (rowBest > cap) return cap + 1;
    const swap = prev;
    prev = curr;
    curr = swap;
  }

  return prev[b.length];
};

const distanceBudget = (typed: string): number => {
  if (typed.length <= 3) return 0;
  if (typed.length <= 5) return 1;
  return MAX_CORRECTION_DISTANCE;
};

const buildDomainList = (extraDomains?: string[]): string[] => {
  if (!extraDomains || extraDomains.length === 0) return EMAIL_DOMAINS;
  const seen = new Set(EMAIL_DOMAINS);
  const merged = [...EMAIL_DOMAINS];
  for (const domain of extraDomains) {
    const normalized = domain.trim().toLowerCase();
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      merged.push(normalized);
    }
  }
  return merged;
};

type ParsedEmail = { local: string; domain: string };

/** The two halves of a typed address, or null before there is an "@" to split on. */
export const parseEmail = (value: string): ParsedEmail | null => {
  const trimmed = value.trim();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return null;
  const local = trimmed.slice(0, at);
  if (!local) return null;
  return { local, domain: trimmed.slice(at + 1).toLowerCase() };
};

export const suggestEmails = (
  value: string,
  options: SuggestOptions = {},
): EmailSuggestion[] => {
  const parsed = parseEmail(value);
  if (!parsed) return [];

  const { local, domain } = parsed;
  const limit = options.limit ?? DEFAULT_LIMIT;
  const domains = buildDomainList(options.extraDomains);

  if (!domain) {
    return POPULAR_DOMAINS.slice(0, limit).map((d) => ({
      domain: d,
      email: `${local}@${d}`,
      kind: "completion" as const,
    }));
  }

  if (domains.includes(domain)) return [];

  const prefixed = domains.filter((d) => d.startsWith(domain));
  if (prefixed.length > 0) {
    return prefixed.slice(0, limit).map((d) => ({
      domain: d,
      email: `${local}@${d}`,
      kind: "completion" as const,
    }));
  }

  const budget = distanceBudget(domain);
  if (budget === 0) return [];

  const scored: { domain: string; score: number }[] = [];
  for (const candidate of domains) {
    const score = editDistance(domain, candidate, budget);
    if (score <= budget) scored.push({ domain: candidate, score });
  }
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      domains.indexOf(a.domain) - domains.indexOf(b.domain),
  );

  return scored.slice(0, limit).map((entry) => ({
    domain: entry.domain,
    email: `${local}@${entry.domain}`,
    kind: "correction" as const,
  }));
};
