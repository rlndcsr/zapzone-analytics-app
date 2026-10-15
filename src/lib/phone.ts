export function phoneDialUrl(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/[^0-9+]/g, "");
  return digits ? `tel:${digits}` : null;
}

const digitsOnly = (value: string): string => value.replace(/\D+/g, "");

/**
 * Every Unicode format (Cf) character — the web's `\p{Cf}`, spelled out because
 * Hermes cannot be counted on for property escapes.
 */
const FORMAT_CHARS = new RegExp(
  "[" +
    "\\u00AD\\u0600-\\u0605\\u061C\\u06DD\\u070F\\u0890\\u0891\\u08E2\\u180E" +
    "\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u206F\\uFEFF\\uFFF9-\\uFFFB" +
    "]" +
    "|\\uD804[\\uDCBD\\uDCCD]" +
    "|\\uD80D[\\uDC30-\\uDC3F]" +
    "|\\uD82F[\\uDCA0-\\uDCA3]" +
    "|\\uD834[\\uDD73-\\uDD7A]" +
    "|\\uDB40[\\uDC01\\uDC20-\\uDC7F]",
  "g",
);

/** A pasted number made readable: invisible marks dropped, full-width digits and plus folded. */
const cleanPhoneInput = (value?: string | null): string =>
  String(value ?? "")
    .replace(FORMAT_CHARS, "")
    .replace(/[０-９]/g, (digit) =>
      String.fromCharCode(digit.charCodeAt(0) - 0xff10 + 48),
    )
    .replace(/＋/g, "+")
    .replace(/ /g, " ")
    .trim()
    .replace(/^[^\d+]*(?=\+)/, "");

const withoutExtension = (value?: string | null): string =>
  cleanPhoneInput(value).replace(
    /(\d)\s*(?:extension|ext\.?|x|#|,|;)\s*\d+\s*$/i,
    "$1",
  );

/**
 * The number's digits, less a leading US "1" on an 11-digit number, and less an
 * extension or an 011/00 dial-out before a US number (web: utils/bookingSearch).
 */
export function localPhoneDigits(value?: string | null): string {
  const raw = withoutExtension(value);
  let digits = digitsOnly(raw);
  const dialOut = raw.match(/^(011|00)/);
  const afterDialOut = dialOut ? digits.slice(dialOut[0].length) : "";
  if (afterDialOut.length === 11 && afterDialOut.startsWith("1")) digits = afterDialOut;
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

/** Written with +, 011 or 00 and a country code other than 1. */
const isDialledAbroad = (value?: string | null): boolean => {
  const raw = withoutExtension(value);
  const match = raw.match(/^(\+|011|00)/);
  if (!match) return false;
  return !digitsOnly(raw.slice(match[0].length)).startsWith("1");
};

/**
 * A foreign-looking number whose digits also read as a US one with the "1"
 * left off ("+810 588 9748"), and no space to show where a country code ends.
 */
export function needsCountryCode(value?: string | null): boolean {
  const raw = withoutExtension(value);
  if (!isDialledAbroad(raw)) return false;
  const afterPrefix = raw
    .replace(/^\s*(\+|011|00)\s*/, "")
    .replace(/^\(\s*0\s*\)/, "")
    .replace(/^[0\s]+/, "");
  const digits = digitsOnly(afterPrefix);
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return false;
  const group = afterPrefix.match(/^(\d{1,2})(?=\D)\D*\d/);
  return !(group && digits.startsWith(group[1]));
}

export const PHONE_NOT_RECOGNISED =
  "Please enter a 10-digit US or Canadian number, or start a number from another country with + and its country code.";

export const COUNTRY_CODE_NEEDED =
  "Please check the country code. Start a US or Canadian number with +1, or put a space after your country code, for example +47 912 34 567.";

/** What a form sends: a foreign number as written (country code kept), else its ten local digits. */
export function phoneForSubmit(value?: string | null): string {
  const raw = cleanPhoneInput(value);
  if (isDialledAbroad(raw)) return raw;
  return localPhoneDigits(raw) || raw;
}

/** A ten-digit US/Canadian number, or a number from another country with its country code. */
export function isCompletePhone(value?: string | null): boolean {
  const raw = withoutExtension(value);
  if (/^[2-9]\d{9}$/.test(localPhoneDigits(raw))) return true;
  const dialOut = raw.match(/^(\+|011|00)/);
  if (!dialOut) return false;
  const rest = digitsOnly(raw.slice(dialOut[0].length));
  return !rest.startsWith("1") && rest.length >= (dialOut[0] === "+" ? 8 : 9);
}

/**
 * "(810) 588-9748" for a complete US number; a foreign number, one with an
 * extension, or anything incomplete is returned exactly as given.
 */
export function formatPhoneForDisplay(value?: string | null): string {
  if (!value) return "";
  const cleaned = cleanPhoneInput(value);
  if (
    isDialledAbroad(value) ||
    withoutExtension(value) !== cleaned ||
    digitsOnly(cleaned).length > 11
  )
    return value;
  const local = localPhoneDigits(value);
  if (local.length !== 10) return value;
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}
