const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isBlankOrValidEmail(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length === 0 || EMAIL_REGEX.test(trimmed);
}

export function isWalkInCustomerValid({
  name,
  phone,
  email,
}: {
  name: string;
  phone: string;
  email: string;
}): boolean {
  return (
    name.trim().length > 0 &&
    phone.trim().length > 0 &&
    isBlankOrValidEmail(email)
  );
}
