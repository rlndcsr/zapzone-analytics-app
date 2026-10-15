/**
 * Returning Customers — the saved customer + dependent records behind the
 * kiosk phone lookup (web parity: `pages/admin/waivers/WaiverProfiles.tsx`,
 * API `WaiverProfileController`). Pure mapping and form rules, kept apart from
 * the service so they can be tested without `lib/api`.
 */

/* ---------------------------------------------------------------- raw API -- */

export type RawProfileRow = {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  phone_digits?: string | null;
  date_of_birth?: string | null;
  needs_staff_review?: boolean | number | null;
  submissions_count?: number | null;
  last_waiver_at?: string | null;
  dependents_count?: number | null;
  last_location_id?: number | null;
  last_location_name?: string | null;
};

export type RawProfileDependent = {
  id: number;
  waiver_profile_id?: number | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  date_of_birth?: string | null;
  relationship?: string | null;
  is_active?: boolean | number | null;
};

export type RawProfileDetail = RawProfileRow & {
  phone_e164?: string | null;
  created_at?: string | null;
  dependents?: RawProfileDependent[] | null;
};

export type RawHistoryEntry = {
  id: number;
  submitted_at?: string | null;
  created_at?: string | null;
  status?: string | null;
  source?: string | null;
  template_title?: string | null;
  version?: number | null;
  location_name?: string | null;
  typed_legal_name?: string | null;
  has_signature?: boolean | number | null;
  checked_in_at?: string | null;
  dependents?: {
    id: number;
    waiver_profile_dependent_id?: number | null;
    name?: string | null;
    date_of_birth?: string | null;
    relationship?: string | null;
    was_new_this_visit?: boolean | number | null;
  }[] | null;
  new_dependents_count?: number | null;
};

export type RawSharedPhoneProfile = {
  id: number;
  name?: string | null;
  email?: string | null;
  submissions_count?: number | null;
  last_waiver_at?: string | null;
};

export type RawProfileView = {
  profile: RawProfileDetail;
  history?: RawHistoryEntry[] | null;
  shared_phone_profiles?: RawSharedPhoneProfile[] | null;
};

/* ----------------------------------------------------------------- domain -- */

export type ReturningCustomerRow = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  needsStaffReview: boolean;
  submissionsCount: number;
  lastWaiverAt: string | null;
  /** Active dependents only (the API counts `activeDependents`). */
  dependentsCount: number;
  lastLocationName: string | null;
};

export type ReturningCustomerDependent = {
  id: number;
  firstName: string;
  lastName: string;
  fullName: string;
  dateOfBirth: string | null;
  relationship: string | null;
  isActive: boolean;
};

export type ReturningCustomerDetail = ReturningCustomerRow & {
  createdAt: string | null;
  dependents: ReturningCustomerDependent[];
};

export type ReturningCustomerHistoryDependent = {
  id: number;
  name: string;
  wasNewThisVisit: boolean;
};

export type ReturningCustomerHistoryEntry = {
  id: number;
  submittedAt: string | null;
  status: string;
  source: string | null;
  templateTitle: string | null;
  version: number | null;
  locationName: string | null;
  typedLegalName: string | null;
  hasSignature: boolean;
  checkedInAt: string | null;
  dependents: ReturningCustomerHistoryDependent[];
  newDependentsCount: number;
};

export type SharedPhoneProfile = {
  id: number;
  name: string;
  email: string | null;
  submissionsCount: number;
  lastWaiverAt: string | null;
};

export type ReturningCustomerView = {
  profile: ReturningCustomerDetail;
  history: ReturningCustomerHistoryEntry[];
  sharedPhoneProfiles: SharedPhoneProfile[];
};

/* ---------------------------------------------------------------- mapping -- */

const text = (v: string | null | undefined): string | null =>
  typeof v === "string" && v !== "" ? v : null;

const flag = (v: boolean | number | null | undefined): boolean =>
  v === true || v === 1;

const count = (v: number | null | undefined): number =>
  typeof v === "number" && Number.isFinite(v) ? v : 0;

export function mapProfileRow(raw: RawProfileRow): ReturningCustomerRow {
  return {
    id: raw.id,
    firstName: text(raw.first_name),
    lastName: text(raw.last_name),
    fullName: raw.full_name ?? "",
    email: text(raw.email),
    phone: text(raw.phone),
    dateOfBirth: text(raw.date_of_birth),
    needsStaffReview: flag(raw.needs_staff_review),
    submissionsCount: count(raw.submissions_count),
    lastWaiverAt: text(raw.last_waiver_at),
    dependentsCount: count(raw.dependents_count),
    lastLocationName: text(raw.last_location_name),
  };
}

export function mapProfileDependent(
  raw: RawProfileDependent,
): ReturningCustomerDependent {
  return {
    id: raw.id,
    firstName: raw.first_name ?? "",
    lastName: raw.last_name ?? "",
    fullName: raw.full_name ?? "",
    dateOfBirth: text(raw.date_of_birth),
    relationship: text(raw.relationship),
    isActive: flag(raw.is_active),
  };
}

export function mapProfileView(raw: RawProfileView): ReturningCustomerView {
  return {
    profile: {
      ...mapProfileRow(raw.profile),
      createdAt: text(raw.profile.created_at),
      dependents: (raw.profile.dependents ?? []).map(mapProfileDependent),
    },
    history: (raw.history ?? []).map((h) => ({
      id: h.id,
      submittedAt: text(h.submitted_at),
      status: h.status ?? "pending",
      source: text(h.source),
      templateTitle: text(h.template_title),
      version: typeof h.version === "number" ? h.version : null,
      locationName: text(h.location_name),
      typedLegalName: text(h.typed_legal_name),
      hasSignature: flag(h.has_signature),
      checkedInAt: text(h.checked_in_at),
      dependents: (h.dependents ?? []).map((d) => ({
        id: d.id,
        name: d.name ?? "",
        wasNewThisVisit: flag(d.was_new_this_visit),
      })),
      newDependentsCount: count(h.new_dependents_count),
    })),
    sharedPhoneProfiles: (raw.shared_phone_profiles ?? []).map((p) => ({
      id: p.id,
      name: p.name ?? "",
      email: text(p.email),
      submissionsCount: count(p.submissions_count),
      lastWaiverAt: text(p.last_waiver_at),
    })),
  };
}

/* ------------------------------------------------------------------- copy -- */

/** Human labels for waiver sources (the web page's own `sourceLabels`). */
export const SOURCE_LABELS: Record<string, string> = {
  checkout: "Checkout",
  confirmation_email: "Email link",
  sms_link: "SMS link",
  kiosk: "Kiosk",
  staff_sent: "Staff sent",
  bulk_invite: "Group invite",
};

export const sourceLabel = (source: string | null): string | null =>
  source ? SOURCE_LABELS[source] || source : null;

/** The web's `full_name || "Record #id"`. */
export const recordName = (p: { id: number; fullName: string }): string =>
  p.fullName || `Record #${p.id}`;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * The web's `formatDateLong`: the calendar date written before any "T", read
 * as-is (no time zone shift) — "2015-03-04" → "March 4, 2015".
 */
export function formatDateLong(value: string | null | undefined): string {
  if (!value) return "—";
  const [y, m, d] = value.split("T")[0].split("-").map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return "—";
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return "—";
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/** "expired" → "Expired", the history pill's word (the web capitalises it). */
export const statusWord = (status: string): string =>
  status ? status.charAt(0).toUpperCase() + status.slice(1) : status;

/** "7310 records · 25 on this page need review" — split for styling. */
export function listCountParts(
  total: number,
  reviewOnPage: number,
): { total: string; noun: string; review: string | null } {
  return {
    total: String(total),
    noun: total === 1 ? "record" : "records",
    review: reviewOnPage > 0 ? ` · ${reviewOnPage} on this page need review` : null,
  };
}

export const emptyListMessage = (filtered: boolean): string =>
  filtered
    ? "No returning customers match this search."
    : "No returning customers yet. A record is created the first time someone signs a waiver.";

/** "Customer record #12 · 3 waivers signed · on file since March 4, 2026". */
export function recordSubtitle(p: {
  id: number;
  submissionsCount: number;
  createdAt: string | null;
}): string {
  let line = `Customer record #${p.id}`;
  line += ` · ${p.submissionsCount} waiver${p.submissionsCount === 1 ? "" : "s"} signed`;
  if (p.createdAt) line += ` · on file since ${formatDateLong(p.createdAt)}`;
  return line;
}

export const REVIEW_NOTICE_TITLE =
  "This record needs a decision before the kiosk will use it.";

export const reviewNoticeBody = (sharedPhoneCount: number): string =>
  sharedPhoneCount > 0
    ? "More than one customer answers to this phone number, so the lookup cannot tell them apart. Give each person their own number, then clear the flag."
    : "A waiver arrived on this number under a different name. Confirm the details below are the right person, then clear the flag.";

/** One line per other record sharing the number, as the web lists them. */
export function sharedPhoneLine(p: SharedPhoneProfile): string {
  let line = p.email ? ` · ${p.email}` : "";
  line += ` · ${p.submissionsCount} signed`;
  if (p.lastWaiverAt) line += ` · last ${formatDateLong(p.lastWaiverAt)}`;
  return line;
}

/** Date of birth · relationship, or "—" when neither is known. */
export const dependentMeta = (d: {
  dateOfBirth: string | null;
  relationship: string | null;
}): string =>
  [d.dateOfBirth ? formatDateLong(d.dateOfBirth) : null, d.relationship]
    .filter(Boolean)
    .join(" · ") || "—";

export const activeDependentCount = (
  dependents: { isActive: boolean }[],
): number => dependents.filter((d) => d.isActive).length;

/* ------------------------------------------------------------------ forms -- */

export type ProfileForm = {
  firstName: string;
  lastName: string;
  email: string;
  dateOfBirth: string;
  phone: string;
};

export type DependentDraft = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  relationship: string;
};

export const EMPTY_DEPENDENT: DependentDraft = {
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  relationship: "",
};

export const profileFormOf = (p: ReturningCustomerDetail): ProfileForm => ({
  firstName: p.firstName ?? "",
  lastName: p.lastName ?? "",
  email: p.email ?? "",
  dateOfBirth: p.dateOfBirth ?? "",
  phone: p.phone ?? "",
});

export const dependentDraftOf = (
  d: ReturningCustomerDependent,
): DependentDraft => ({
  firstName: d.firstName,
  lastName: d.lastName,
  dateOfBirth: d.dateOfBirth ?? "",
  relationship: d.relationship ?? "",
});

/**
 * The web types dates into `<input type="date">`; the app takes YYYY-MM-DD as
 * text (as Edit Customer does), so a typo is caught here before the API's
 * `date` rule refuses it. Empty is fine — the date is optional.
 */
export function dateOfBirthError(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return "Use the format YYYY-MM-DD.";
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== mo - 1 ||
    date.getDate() !== d
  ) {
    return "That date does not exist.";
  }
  return null;
}

/** Same gate as the web's Save details button: names and phone are required. */
export const canSaveProfile = (f: ProfileForm): boolean =>
  f.firstName.trim() !== "" &&
  f.lastName.trim() !== "" &&
  f.phone.trim() !== "" &&
  dateOfBirthError(f.dateOfBirth) === null;

/** Same gate as the web's Add / Save dependent buttons. */
export const canSaveDependent = (d: DependentDraft): boolean =>
  d.firstName.trim() !== "" &&
  d.lastName.trim() !== "" &&
  dateOfBirthError(d.dateOfBirth) === null;

export type ProfilePayload = {
  first_name: string;
  last_name: string;
  email: string | null;
  date_of_birth: string | null;
  phone: string;
};

export type DependentPayload = {
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  relationship: string | null;
};

/** The body the web's `saveProfile` sends. */
export const profilePayload = (f: ProfileForm): ProfilePayload => ({
  first_name: f.firstName.trim(),
  last_name: f.lastName.trim(),
  email: f.email.trim() || null,
  date_of_birth: f.dateOfBirth.trim() || null,
  phone: f.phone.trim(),
});

/** The body the web's `addDependent` / `saveDependent` send. */
export const dependentPayload = (d: DependentDraft): DependentPayload => ({
  first_name: d.firstName.trim(),
  last_name: d.lastName.trim(),
  date_of_birth: d.dateOfBirth.trim() || null,
  relationship: d.relationship.trim() || null,
});
