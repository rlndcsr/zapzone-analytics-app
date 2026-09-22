export function validateOverridePin(
  pin: string,
  confirmPin: string,
): string | null {
  if (!/^\d{4,6}$/.test(pin)) return "The PIN must be 4 to 6 digits.";
  if (pin !== confirmPin) return "The two PINs do not match.";
  return null;
}
