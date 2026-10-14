export type CoverageRow = {
  status: string;
  minorsCount?: number | null;
  minors?: ArrayLike<unknown> | null;
  checkedInAt?: string | null;
};

export type WaiverCoverage = {
  participants: number;
  forms: number;
  notSigned: number;
  minors: number;
  participantsCheckedIn: number;
};

const minorsOn = (row: CoverageRow): number =>
  row.minorsCount ?? row.minors?.length ?? 0;

export const peopleOnForm = (row: CoverageRow): number =>
  row.status === "completed" ? 1 + minorsOn(row) : 0;

export function waiverCoverage(rows: CoverageRow[]): WaiverCoverage {
  const totals: WaiverCoverage = {
    participants: 0,
    forms: 0,
    notSigned: 0,
    minors: 0,
    participantsCheckedIn: 0,
  };
  for (const row of rows) {
    if (row.status === "completed") {
      const people = peopleOnForm(row);
      totals.forms += 1;
      totals.participants += people;
      totals.minors += people - 1;
      if (row.checkedInAt) totals.participantsCheckedIn += people;
    } else if (row.status === "pending") {
      totals.notSigned += 1;
    }
  }
  return totals;
}

/** A record's Waivers box: the server's totals where it sent them, else counted from its forms. */
export function entityCoverage(entity: {
  waivers: CoverageRow[];
  summary: {
    completed: number | null;
    pending: number | null;
    peopleCovered: number | null;
    peopleCheckedIn: number | null;
  };
}): Pick<
  WaiverCoverage,
  "participants" | "forms" | "notSigned" | "participantsCheckedIn"
> {
  const counted = waiverCoverage(entity.waivers);
  const s = entity.summary;
  return {
    participants: s.peopleCovered ?? counted.participants,
    forms: s.completed ?? counted.forms,
    notSigned: s.pending ?? counted.notSigned,
    participantsCheckedIn: s.peopleCheckedIn ?? counted.participantsCheckedIn,
  };
}

export const countLabel = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

export const participantsCoveredLabel = (count: number): string =>
  `${countLabel(count, "participant", "participants")} covered`;

export const formsSignedLabel = (count: number): string =>
  `${countLabel(count, "waiver form", "waiver forms")} signed`;
