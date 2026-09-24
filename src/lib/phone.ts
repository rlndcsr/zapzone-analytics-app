export function phoneDialUrl(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/[^0-9+]/g, "");
  return digits ? `tel:${digits}` : null;
}
