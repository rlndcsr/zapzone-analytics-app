/**
 * Don't Send To — the addresses an email notification never goes to (web
 * parity: `utils/emailDomains.ts` cleanEmailAddress / isValidEmailAddress and
 * the Create / Edit Email Notification pages). The check accepts only what the
 * server's `email` rule accepts, so a refused save never comes back as
 * "excluded_emails.0".
 *
 * Written without `\p{…}` classes, TextEncoder or URL's IDNA, none of which
 * Hermes can be counted on for: the same rules, spelled out by hand.
 */

/**
 * Invisible characters a paste can carry — every Unicode control (Cc) and
 * format (Cf) character, the web's `[\p{Cc}\p{Cf}]` (and the server's scrub).
 */
const INVISIBLE = new RegExp(
  "[" +
    "\\u0000-\\u001F\\u007F-\\u009F" + // Cc
    "\\u00AD\\u0600-\\u0605\\u061C\\u06DD\\u070F\\u0890\\u0891\\u08E2\\u180E" +
    "\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u206F\\uFEFF\\uFFF9-\\uFFFB" +
    "]" +
    // Astral Cf characters, as surrogate pairs.
    "|\\uD804[\\uDCBD\\uDCCD]" + // U+110BD, U+110CD
    "|\\uD80D[\\uDC30-\\uDC3F]" + // U+13430–U+1343F
    "|\\uD82F[\\uDCA0-\\uDCA3]" + // U+1BCA0–U+1BCA3
    "|\\uD834[\\uDD73-\\uDD7A]" + // U+1D173–U+1D17A
    "|\\uDB40[\\uDC01\\uDC20-\\uDC7F]", // U+E0001, U+E0020–U+E007F
  "g",
);

const LATIN = "A-Za-z0-9\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u024F\\u1E00-\\u1EFF";
const LOCAL_ATOM = `[${LATIN}!#$%&'*+/=?^_\`{|}~-]+`;
const LOCAL_PART = new RegExp(`^${LOCAL_ATOM}(?:\\.${LOCAL_ATOM})*$`);
const DOMAIN_LABEL = new RegExp(`^[${LATIN}](?:[${LATIN}-]*[${LATIN}])?$`);
const ASCII_LABEL = /^[A-Za-z0-9-]+$/;
const MAX_DOMAIN_BYTES = 253;

/** Joins a letter with its combining accent ("e" + "´" → "é") where the engine can. */
const composed = (value: string): string => {
  try {
    return typeof value.normalize === "function" ? value.normalize("NFC") : value;
  } catch {
    return value;
  }
};

/** UTF-8 length of a string. */
export function utf8Length(value: string): number {
  let bytes = 0;
  for (const ch of value) {
    const cp = ch.codePointAt(0) ?? 0;
    bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/**
 * Length of a label once written for DNS ("xn--" + Punycode, RFC 3492) — what
 * the web reads off `new URL(...).hostname`. ASCII labels are themselves.
 */
export function encodedLabelLength(label: string): number {
  const cps = Array.from(label, (ch) => ch.codePointAt(0) ?? 0);
  if (cps.every((cp) => cp < 0x80)) return cps.length;

  const base = 36, tMin = 1, tMax = 26, skew = 38, damp = 700;
  const adapt = (delta: number, points: number, first: boolean): number => {
    delta = first ? Math.floor(delta / damp) : delta >> 1;
    delta += Math.floor(delta / points);
    let k = 0;
    while (delta > ((base - tMin) * tMax) >> 1) {
      delta = Math.floor(delta / (base - tMin));
      k += base;
    }
    return k + Math.floor(((base - tMin + 1) * delta) / (delta + skew));
  };

  const basic = cps.filter((cp) => cp < 0x80).length;
  let length = basic > 0 ? basic + 1 : 0; // basic code points, then "-"
  let n = 0x80, delta = 0, bias = 72, handled = basic;
  while (handled < cps.length) {
    const m = Math.min(...cps.filter((cp) => cp >= n));
    delta += (m - n) * (handled + 1);
    n = m;
    for (const cp of cps) {
      if (cp < n) delta++;
      if (cp !== n) continue;
      let q = delta;
      for (let k = base; ; k += base) {
        const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
        if (q < t) break;
        length++;
        q = Math.floor((q - t) / (base - t));
      }
      length++;
      bias = adapt(delta, handled + 1, handled === basic);
      delta = 0;
      handled++;
    }
    delta++;
    n++;
  }
  return 4 + length; // "xn--"
}

/**
 * The letters in the accepted Latin range that IDNA rewrites as more than a
 * lowercase before encoding (UTS 46; generated from Node's domainToASCII, which
 * the web's `new URL` follows). Every other letter there encodes as itself.
 */
const IDNA_REWRITES: Record<string, string> = {
  "Ĳ": "ij", "ĳ": "ij",
  "Ŀ": "l·", "ŀ": "l·",
  "ŉ": "ʼn",
  "ſ": "s",
  "Ǆ": "dž", "ǅ": "dž", "ǆ": "dž",
  "Ǉ": "lj", "ǈ": "lj", "ǉ": "lj",
  "Ǌ": "nj", "ǋ": "nj", "ǌ": "nj",
  "Ǳ": "dz", "ǲ": "dz", "ǳ": "dz",
  "ẚ": "aʾ",
  "ẛ": "ṡ",
};

/** A label as IDNA writes it before encoding: lowercased, then the rewrites above. */
const idnaLabel = (label: string): string =>
  Array.from(label.toLowerCase(), (ch) => IDNA_REWRITES[ch] ?? ch).join("");

const labelFits = (label: string, index: number): boolean =>
  ASCII_LABEL.test(label)
    ? label.length <= (index === 0 ? 63 : 62)
    : utf8Length(label) <= 63 && encodedLabelLength(idnaLabel(label)) <= 63;

/**
 * A typed or pasted address made ready to check and save: invisible characters
 * dropped, lowercased, accents joined, and trailing whitespace / "." / "," / ";"
 * trimmed (the web's cleanEmailAddress).
 */
export const cleanEmailAddress = (value: string): string =>
  composed(value.replace(INVISIBLE, "").toLowerCase())
    .trim()
    .replace(/[\s.,;]+$/, "");

/** True only for an address the server's `email` rule takes (the web's isValidEmailAddress). */
export function isValidEmailAddress(value: string): boolean {
  const at = value.lastIndexOf("@");
  if (at <= 0) return false;
  const domain = value.slice(at + 1);
  const labels = domain.split(".");
  return (
    LOCAL_PART.test(value.slice(0, at)) &&
    labels.length >= 2 &&
    utf8Length(domain) <= MAX_DOMAIN_BYTES &&
    labels.every((label, index) => DOMAIN_LABEL.test(label) && labelFits(label, index))
  );
}

export type AddExcludedResult =
  | { ok: true; list: string[] }
  | { ok: false; title: string; message: string };

/** The web's addExcludedEmail: clean, check, refuse a repeat, append. */
export function addExcludedEmail(list: string[], draft: string): AddExcludedResult | null {
  const email = cleanEmailAddress(draft);
  if (!email) return null;
  if (!isValidEmailAddress(email)) {
    return { ok: false, title: "Invalid email", message: "Please enter a valid email address" };
  }
  if (list.includes(email)) {
    return { ok: false, title: "Already excluded", message: "Email already excluded" };
  }
  return { ok: true, list: [...list, email] };
}

/**
 * The list a save sends: a visit follow-up always sends none; otherwise the
 * added addresses plus one still typed in the box (an address typed but not
 * added is saved too). `error` when that typed address isn't usable.
 */
export function excludedEmailsToSave(
  list: string[],
  draft: string,
  isVisitEmail: boolean,
): { emails: string[]; error: null } | { emails: null; error: string } {
  if (isVisitEmail) return { emails: [], error: null };
  const pending = cleanEmailAddress(draft);
  if (pending && !isValidEmailAddress(pending)) {
    return { emails: null, error: "Enter a valid email in Don't Send To, or clear the box" };
  }
  return { emails: Array.from(new Set([...list, ...(pending ? [pending] : [])])), error: null };
}

/**
 * When the server still refuses one of the addresses, name it — the field
 * errors arrive as "excluded_emails.<index>". Null when none is refused.
 */
export function refusedExcludedEmailMessage(
  fieldErrors: Record<string, unknown> | undefined,
  sent: string[],
): string | null {
  const index = Object.keys(fieldErrors ?? {})
    .map((key) => /^excluded_emails\.(\d+)$/.exec(key)?.[1])
    .find(Boolean);
  const refused = index !== undefined ? sent[Number(index)] : undefined;
  return refused
    ? `Don't Send To can't use "${refused}". Remove it, type it again and save.`
    : null;
}
