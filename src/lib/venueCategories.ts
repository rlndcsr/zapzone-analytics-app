export const ESCAPE_ROOM_CATEGORY = "Escape Room";

const CANONICAL_BY_ALIAS: Record<string, string> = {
  "escape room": ESCAPE_ROOM_CATEGORY,
  "escape rooms": ESCAPE_ROOM_CATEGORY,
  escaperoom: ESCAPE_ROOM_CATEGORY,
  escaperooms: ESCAPE_ROOM_CATEGORY,
  "escape-room": ESCAPE_ROOM_CATEGORY,
  beginner: ESCAPE_ROOM_CATEGORY,
  beginners: ESCAPE_ROOM_CATEGORY,
  novice: ESCAPE_ROOM_CATEGORY,
  easy: ESCAPE_ROOM_CATEGORY,
  starter: ESCAPE_ROOM_CATEGORY,
  intermediate: ESCAPE_ROOM_CATEGORY,
  medium: ESCAPE_ROOM_CATEGORY,
  moderate: ESCAPE_ROOM_CATEGORY,
  advanced: ESCAPE_ROOM_CATEGORY,
  hard: ESCAPE_ROOM_CATEGORY,
  difficult: ESCAPE_ROOM_CATEGORY,
  expert: ESCAPE_ROOM_CATEGORY,
  master: ESCAPE_ROOM_CATEGORY,
  extreme: ESCAPE_ROOM_CATEGORY,
  impossible: ESCAPE_ROOM_CATEGORY,
};

export function normalizeCategory(value?: string | null): string {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") return "";

  return (
    CANONICAL_BY_ALIAS[trimmed.toLowerCase().replace(/\s+/g, " ")] ?? trimmed
  );
}

export function isEscapeRoomCategory(value?: string | null): boolean {
  return normalizeCategory(value) === ESCAPE_ROOM_CATEGORY;
}
