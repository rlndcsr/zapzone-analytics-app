import { apiRequest } from "../lib/api";

/**
 * Global Notes — customer-facing notes shown during booking. A note with no
 * `package_ids` is GLOBAL (applies to every package); with `package_ids` set it
 * applies only to those packages. Mirrors the web admin's Global Notes page
 * (GlobalNoteService): apiResource /api/global-notes + toggle-status.
 */

export type GlobalNote = {
  id: number;
  title: string;
  content: string;
  packageIds: number[];
  packageNames: string[];
  isActive: boolean;
  displayOrder: number;
  createdAt: string | null;
};

type RawGlobalNote = {
  id: number;
  title?: string | null;
  content?: string | null;
  package_ids?: number[] | null;
  packages?: { id: number; name?: string | null }[] | null;
  is_active?: boolean | number | null;
  display_order?: number | string | null;
  created_at?: string | null;
};

/** Pull the notes array out of the common `{data:{global_notes:[]}}` / `{data:[]}`
 *  / bare-array response shapes. */
function extractNotes(res: unknown): RawGlobalNote[] {
  const r = res as {
    data?: { global_notes?: RawGlobalNote[] } | RawGlobalNote[];
    global_notes?: RawGlobalNote[];
  } | null;
  const d = r?.data ?? r;
  if (Array.isArray(d)) return d as RawGlobalNote[];
  if (Array.isArray((d as { global_notes?: RawGlobalNote[] })?.global_notes))
    return (d as { global_notes: RawGlobalNote[] }).global_notes;
  return [];
}

function mapNote(raw: RawGlobalNote): GlobalNote {
  const packages = raw.packages ?? [];
  return {
    id: raw.id,
    title: raw.title?.trim() || "",
    content: raw.content?.trim() || "",
    packageIds:
      raw.package_ids ?? packages.map((p) => p.id).filter((n): n is number => n != null),
    packageNames: packages
      .map((p) => p.name?.trim() || "")
      .filter((n) => n.length > 0),
    isActive: raw.is_active === true || raw.is_active === 1,
    displayOrder: Number(raw.display_order ?? 0) || 0,
    createdAt: raw.created_at ?? null,
  };
}

/** GET /api/global-notes — all notes for the company (newest / display order). */
export async function fetchGlobalNotes(
  token: string,
  signal?: AbortSignal,
): Promise<GlobalNote[]> {
  const res = await apiRequest<unknown>("/api/global-notes", { token, signal });
  return extractNotes(res)
    .map(mapNote)
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

export type GlobalNoteInput = {
  title?: string;
  content: string;
  package_ids?: number[];
  is_active?: boolean;
  display_order?: number;
};

/** POST /api/global-notes — create a note. */
export async function createGlobalNote(
  token: string,
  input: GlobalNoteInput,
): Promise<void> {
  await apiRequest("/api/global-notes", { method: "POST", token, body: input });
}

/** PUT /api/global-notes/{id} — update a note. */
export async function updateGlobalNote(
  token: string,
  id: number,
  input: GlobalNoteInput,
): Promise<void> {
  await apiRequest(`/api/global-notes/${id}`, {
    method: "PUT",
    token,
    body: input,
  });
}

/** DELETE /api/global-notes/{id} — remove a note. */
export async function deleteGlobalNote(
  token: string,
  id: number,
): Promise<void> {
  await apiRequest(`/api/global-notes/${id}`, { method: "DELETE", token });
}

/** PATCH /api/global-notes/{id}/toggle-status — flip active/inactive. */
export async function toggleGlobalNoteStatus(
  token: string,
  id: number,
): Promise<void> {
  await apiRequest(`/api/global-notes/${id}/toggle-status`, {
    method: "PATCH",
    token,
  });
}
