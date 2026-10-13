import type {
  BlockScope,
  DayOffChange,
  DayOffPayload,
} from "../../services/dayOffsService";
import { operatingWindowError } from "../dayOffClosure.ts";

export type WindowChoice = "full_day" | "operating_window";
export type ResourceKind = "packages" | "rooms" | "attractions" | "events";

export const SCOPE_FIELD: Record<
  ResourceKind,
  "package_ids" | "room_ids" | "attraction_ids" | "event_ids"
> = {
  packages: "package_ids",
  rooms: "room_ids",
  attractions: "attraction_ids",
  events: "event_ids",
};

export const SCOPE_LABELS: Record<BlockScope, string> = {
  location: "Entire location",
  packages: "Birthday packages",
  rooms: "Rooms",
  attractions: "Attractions",
  events: "Events",
};

export type BlockFormInput = {
  locationId: number | null;
  windowChoice: WindowChoice | null;
  /** HH:mm or "" (an operating window may leave one side open). */
  opensAt: string;
  closesAt: string;
  scope: BlockScope | null;
  selected: Record<ResourceKind, number[]>;
  groupName: string;
  reason: string;
  isRecurring: boolean;
};

/** The first thing stopping the block from saving, in the web form's order; null when it can save. */
export function blockFormError(
  input: BlockFormInput,
  dates: string[],
): string | null {
  if (input.locationId == null) return "Choose a location.";
  if (dates.length === 0) return "Choose a date.";
  if (!input.windowChoice)
    return "Choose a full-day closure or the hours it stays open.";
  if (input.windowChoice === "operating_window") {
    const problem = operatingWindowError(input.opensAt, input.closesAt);
    if (problem) return problem;
  }
  if (!input.scope) return "Choose what to block.";
  if (input.scope !== "location" && input.selected[input.scope].length === 0) {
    return `Choose at least one of the ${SCOPE_LABELS[input.scope].toLowerCase()}.`;
  }
  if (!input.groupName.trim())
    return "Enter the group or event this block is for.";
  if (!input.reason.trim()) return "Enter the reason for this block.";
  return null;
}

/** The request for one date; call only once {@link blockFormError} is null. */
export function blockPayload(
  input: BlockFormInput,
  date: string,
): DayOffPayload {
  const operating = input.windowChoice === "operating_window";
  const payload: DayOffPayload = {
    location_id: input.locationId as number,
    date,
    block_type: input.windowChoice as WindowChoice,
    opens_at: operating && input.opensAt ? input.opensAt : null,
    closes_at: operating && input.closesAt ? input.closesAt : null,
    scope: input.scope as BlockScope,
    reason: input.reason.trim(),
    group_name: input.groupName.trim(),
    is_recurring: input.isRecurring,
  };
  if (input.scope && input.scope !== "location") {
    payload[SCOPE_FIELD[input.scope]] = input.selected[input.scope];
  }
  return payload;
}

/* --------------------------------------------- change history (web AvailabilityChangeLog) -- */

export const CHANGE_ACTION_LABELS: Record<DayOffChange["action"], string> = {
  created: "Blocked",
  updated: "Changed",
  deleted: "Removed",
  booked_inside_block: "Booked inside block",
  booking_removed: "Booking removed",
};

const FIELD_LABELS: Record<string, string> = {
  location_id: "Location",
  date: "Date",
  is_recurring: "Repeats every year",
  block_type: "Kind",
  opens_at: "Opens at",
  closes_at: "Closes at",
  time_start: "Closed from (older format)",
  time_end: "Closed until (older format)",
  reason: "Reason",
  group_name: "Group or event",
  package_ids: "Packages",
  room_ids: "Rooms",
  attraction_ids: "Attractions",
  event_ids: "Events",
};

const KIND_LABELS: Record<string, string> = {
  full_day: "Closed all day",
  operating_window: "Open for set hours",
  legacy_closure: "Closed hours (older format)",
};

const formatClock = (value: string): string => {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours)) return value;
  const period = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${String(minutes || 0).padStart(2, "0")} ${period}`;
};

const formatDay = (value: string): string => {
  const [year, month, day] = value.split("T")[0].split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

/** One saved value in the web's words; empty shows as "—". */
export function formatChangeValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "is_recurring") return value ? "Yes" : "No";
  if (field === "block_type")
    return KIND_LABELS[String(value)] ?? String(value);
  if (field === "date") return formatDay(String(value));
  if (["opens_at", "closes_at", "time_start", "time_end"].includes(field))
    return formatClock(String(value));
  if (Array.isArray(value))
    return `${value.length} chosen (#${value.join(", #")})`;
  return String(value);
}

/** The before → after lines of a "Changed" entry. */
export function changedFieldRows(
  change: DayOffChange,
): { label: string; before: string; after: string }[] {
  if (change.action !== "updated") return [];
  return change.changedFields
    .filter((field) => field in FIELD_LABELS)
    .map((field) => ({
      label: FIELD_LABELS[field],
      before:
        field === "location_id" && change.previousLocationName
          ? change.previousLocationName
          : formatChangeValue(field, change.before?.[field]),
      after:
        field === "location_id" && change.locationName
          ? change.locationName
          : formatChangeValue(field, change.after?.[field]),
    }));
}
