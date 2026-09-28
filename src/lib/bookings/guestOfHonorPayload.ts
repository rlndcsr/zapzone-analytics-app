export function guestOfHonorPayload(
  hasGuestOfHonor: boolean,
  form: { name: string; age: string; gender: string | null },
): {
  guestOfHonorName?: string | null;
  guestOfHonorAge?: number | null;
  guestOfHonorGender?: string | null;
} {
  if (!hasGuestOfHonor) return {};
  const age = parseInt(form.age.trim(), 10);
  return {
    guestOfHonorName: form.name.trim() || null,
    guestOfHonorAge: Number.isNaN(age) ? null : age,
    guestOfHonorGender: form.gender || null,
  };
}
