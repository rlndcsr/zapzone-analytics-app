export type SchedulePackageCandidate = {
  packageId: number;
  roomIds: number[];
  openMinutes: number;
  closeMinutes: number;
  closedRanges?: { startMinutes: number; endMinutes: number }[];
};

export function packageServesRoom(
  pkg: { rooms?: { id: number }[] } | null | undefined,
  roomId: number,
): boolean {
  const rooms = pkg?.rooms ?? [];
  return rooms.length === 0 || rooms.some((r) => r.id === roomId);
}

export function packagesValidForSlot(
  candidates: SchedulePackageCandidate[],
  roomId: number,
  minute: number,
): number[] {
  return candidates
    .filter(
      (c) =>
        c.roomIds.includes(roomId) &&
        minute >= c.openMinutes &&
        minute < c.closeMinutes &&
        !(c.closedRanges ?? []).some(
          (r) => minute >= r.startMinutes && minute < r.endMinutes,
        ),
    )
    .map((c) => c.packageId);
}
