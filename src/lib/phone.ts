export function phoneDialUrl(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/[^0-9+]/g, "");
  return digits ? `tel:${digits}` : null;
}

/** The number's digits, less a leading US "1" on an 11-digit number (web: utils/bookingSearch). */
export function localPhoneDigits(value?: string | null): string {
  const digits = String(value ?? "").replace(/\D+/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

/** Exactly ten local digits, whatever punctuation surrounds them. */
export const isCompletePhone = (value?: string | null): boolean =>
  localPhoneDigits(value).length === 10;

/** "(810) 588-9748" for a complete number; anything else is returned exactly as given. */
export function formatPhoneForDisplay(value?: string | null): string {
  if (!value) return "";
  const local = localPhoneDigits(value);
  if (local.length !== 10) return value;
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}
