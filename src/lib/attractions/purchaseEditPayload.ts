export function purchaseTextFields(form: {
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  notes: string;
}): {
  guest_name?: string;
  guest_email?: string;
  guest_phone: string | null;
  notes: string | null;
} {
  return {
    guest_name: form.guestName || undefined,
    guest_email: form.guestEmail || undefined,
    guest_phone: form.guestPhone || null,
    notes: form.notes || null,
  };
}
