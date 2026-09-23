export type PackageClosureDayOff = {
  /** YYYY-MM-DD (venue-local). */
  date: string;
  timeStart: string | null;
  timeEnd: string | null;
  isRecurring: boolean;
  packageIds: number[];
  roomIds: number[];
};

const sameCalendarDate = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const toMinutes = (clock: string): number | null => {
  const [h, m] = clock.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

export function isPackageTimeSlotRestricted(
  dayOffs: PackageClosureDayOff[],
  packageId: number,
  dateKey: string,
  startMinutes: number,
  endMinutes: number,
  today: Date,
): boolean {
  const target = new Date(`${dateKey.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(target.getTime())) return false;

  const closure = dayOffs.find((off) => {
    if (!off.timeStart && !off.timeEnd) return false;
    if (off.packageIds.length > 0) {
      if (!off.packageIds.includes(packageId)) return false;
    } else if (off.roomIds.length > 0) {
      return false;
    }

    const offDate = new Date(`${off.date.slice(0, 10)}T00:00:00`);
    if (Number.isNaN(offDate.getTime())) return false;

    if (off.isRecurring) {
      const thisYear = new Date(
        today.getFullYear(),
        offDate.getMonth(),
        offDate.getDate(),
      );
      const nextYear = new Date(
        today.getFullYear() + 1,
        offDate.getMonth(),
        offDate.getDate(),
      );
      return (
        (thisYear >= today && sameCalendarDate(thisYear, target)) ||
        sameCalendarDate(nextYear, target)
      );
    }
    return offDate >= today && sameCalendarDate(offDate, target);
  });
  if (!closure) return false;

  if (closure.timeStart) {
    const closesAt = toMinutes(closure.timeStart);
    if (closesAt != null && (startMinutes >= closesAt || endMinutes > closesAt))
      return true;
  }
  if (closure.timeEnd) {
    const opensAt = toMinutes(closure.timeEnd);
    if (opensAt != null && startMinutes < opensAt) return true;
  }
  return false;
}

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
