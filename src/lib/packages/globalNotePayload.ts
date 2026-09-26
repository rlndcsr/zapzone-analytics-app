/**
 * The body a Global Notes save sends. Emptied fields go as null, never left out: the API only
 * applies a rule to keys that arrive, and only a NULL `package_ids` makes a note global —
 * an empty list matches no package at all.
 */
export function globalNotePayload(form: {
  title: string;
  content: string;
  isActive: boolean;
  global: boolean;
  packageIds: number[];
}): {
  title: string | null;
  content: string;
  is_active: boolean;
  package_ids: number[] | null;
} {
  return {
    title: form.title.trim() || null,
    content: form.content.trim(),
    is_active: form.isActive,
    package_ids: form.global ? null : form.packageIds,
  };
}
