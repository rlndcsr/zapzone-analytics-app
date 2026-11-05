type TemplateLike = {
  kind: string | null;
  isDefault: boolean;
  assignmentCount: number;
};

export const isEscapeRoomTemplate = (t: { kind: string | null }): boolean =>
  t.kind === "escape_room";

export function templateDefaultLabel(t: TemplateLike): string | null {
  if (!t.isDefault) return null;
  return isEscapeRoomTemplate(t) ? "Escape-room default" : "Default";
}

export function templateAssignmentLabel(t: TemplateLike): string {
  const n = t.assignmentCount;
  if (isEscapeRoomTemplate(t)) {
    if (n > 0) return `${n} ${n === 1 ? "room" : "rooms"}`;
    return t.isDefault ? "All escape rooms" : "0 rooms";
  }
  return `${n} ${n === 1 ? "item" : "items"}`;
}

export function standardTemplatesOnly<T extends { kind: string | null }>(
  list: T[],
): T[] {
  return list.filter((t) => !isEscapeRoomTemplate(t));
}
