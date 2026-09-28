export function phoneDialUrl(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/[^0-9+]/g, "");
  return digits ? `tel:${digits}` : null;
}

/** The number's digits, less a leading US "1" on an 11-digit number (web: utils/bookingSearch). */
export function localPhoneDigits(value?: string | null): string {
  const digits = String(value ?? "").replace(/\D+/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

/** Ten local digits, or a number written in international form (+…) with at least eight digits. */
export function isCompletePhone(value?: string | null): boolean {
  const raw = String(value ?? "").trim();
  if (localPhoneDigits(raw).length === 10) return true;
  return raw.startsWith("+") && raw.replace(/\D+/g, "").length >= 8;
}

/** "(810) 588-9748" for a complete number; anything else is returned exactly as given. */
export function formatPhoneForDisplay(value?: string | null): string {
  if (!value) return "";
  const local = localPhoneDigits(value);
  if (local.length !== 10) return value;
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}
