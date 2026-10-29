/**
 * Email template rules shared by the template, campaign, photo-settings and
 * registration screens. Mirrors the web's `utils/emailTemplateOptions.ts`, so
 * both say the same thing about which locations a template covers and who may
 * change it.
 */

export const EVENT_PHOTOS_CATEGORY = "event_photos";

export const EVENT_PHOTO_SMS_LIMIT = 600;

export const TEMPLATE_SUBJECT_LIMIT = 255;

/** Filled in when an empty template is switched to Event photos (the web's starter). */
export const EVENT_PHOTO_STARTER = {
  name: "Event registration photos",
  subject: "Your photos from {{ event_name }} at {{ location_name }}",
  body: '<p>Hi {{ first_name }},</p><p>Thanks for joining us for {{ event_name }} at {{ location_name }}. Your photos are ready to view and download.</p><p><a href="{{ photo_link }}">View your photos</a></p><p>This link works until {{ expires_on }}.</p><p>{{ links }}</p><p>{{ business_name }}<br>{{ location_phone }}</p>',
};

export const EMAIL_TEMPLATE_CATEGORIES: { value: string; label: string }[] = [
  { value: "onboarding", label: "Onboarding" },
  { value: "marketing", label: "Marketing" },
  { value: "transactional", label: "Transactional" },
  { value: "newsletter", label: "Newsletter" },
  { value: "reminder", label: "Reminder" },
  { value: "notification", label: "Notification" },
  { value: EVENT_PHOTOS_CATEGORY, label: "Event photos" },
  { value: "other", label: "Other" },
];

/** "event_photos" → "Event photos"; an unknown category shows as saved, none as "General". */
export const emailTemplateCategoryLabel = (category: string | null | undefined): string =>
  EMAIL_TEMPLATE_CATEGORIES.find((option) => option.value === category)?.label ||
  category?.trim() ||
  "General";

const COMPANY_LEVEL_ROLES = ["company_admin", "admin", "owner"];

const EVENT_PHOTO_ROLES = [...COMPANY_LEVEL_ROLES, "location_manager"];

/** Company-level staff pick a template's locations; everyone else only makes templates for their own location. */
export const isCompanyLevelRole = (role: string | null | undefined): boolean =>
  COMPANY_LEVEL_ROLES.includes(role ?? "");

/** Who may make event photo emails and email event registrants (the backend's EVENT_PHOTO_ROLES). */
export const canManageEventPhotoEmails = (role: string | null | undefined): boolean =>
  EVENT_PHOTO_ROLES.includes(role ?? "");

/** Where a template applies, as the server reports it. */
export type TemplateTargeting = {
  categoryValue: string | null;
  /** True for every location, including ones added later. */
  allLocations: boolean;
  locationIds: number[];
  /** Names of the locations it covers, in the server's order; empty for every location. */
  locationNames: string[];
  /** Each covered location; `name` is null for one that was deleted. */
  targetLocations: { id: number; name: string | null; active: boolean }[];
};

export const isEventPhotoTemplate = (template: Pick<TemplateTargeting, "categoryValue">): boolean =>
  template.categoryValue === EVENT_PHOTOS_CATEGORY;

/** An event photo email that several locations share — a manager's copy of it could never be switched on. */
export const isSharedEventPhotoTemplate = (
  template: Pick<TemplateTargeting, "categoryValue" | "allLocations" | "locationIds">,
): boolean =>
  isEventPhotoTemplate(template) && !template.allLocations && template.locationIds.length > 1;

/** "Every location", "Brighton, Novi" or "Brighton + 2 more". */
export const templateLocationSummary = (
  template: Pick<TemplateTargeting, "allLocations" | "locationNames" | "locationIds">,
): string => {
  if (template.allLocations) return "Every location";
  const names = template.locationNames;
  if (names.length === 0) {
    const count = template.locationIds.length;
    return count === 1 ? "1 location" : `${count} locations`;
  }
  return names.length <= 2 ? names.join(", ") : `${names[0]} + ${names.length - 1} more`;
};

/** The editor's location choice: every location, or the ticked ones. */
export type TemplateLocationsValue = { allLocations: boolean; selectedIds: number[] };

/** The saved targeting as an editor value, leaving out locations that were deleted. */
export const templateLocationsFrom = (
  template: Pick<TemplateTargeting, "allLocations" | "locationIds" | "targetLocations">,
): TemplateLocationsValue => {
  const deleted = new Set(
    template.targetLocations.filter((target) => target.name === null).map((target) => target.id),
  );
  return {
    allLocations: template.allLocations,
    selectedIds: template.locationIds.filter((id) => !deleted.has(id)),
  };
};

/** What to send as `location_ids`: an empty list means every location. */
export const templateLocationIds = (value: TemplateLocationsValue): number[] =>
  value.allLocations ? [] : value.selectedIds;

/** The location whose links and phone fill the preview: the first ticked one this user can see. */
export const templatePreviewLocationId = (
  value: TemplateLocationsValue,
  locations: { id: number }[],
): number | undefined => {
  const ids = templateLocationIds(value);
  return ids.find((id) => locations.some((location) => location.id === id)) ?? ids[0];
};

/**
 * Why a template the server marks `can_manage: false` is read-only here, worded
 * as the web's banner. Empty when it isn't read-only.
 */
export const templateReadOnlyReason = (
  template: Pick<TemplateTargeting, "categoryValue" | "allLocations" | "locationIds"> & {
    canManage: boolean;
  },
  canEventPhotos: boolean,
): string => {
  if (template.canManage) return "";
  if (isEventPhotoTemplate(template) && !canEventPhotos)
    return "Only managers and admins can change event photo emails.";
  if (isSharedEventPhotoTemplate(template))
    return "This event photo email is shared by several locations, so only a company admin can change it. Ask a company admin to change it, or to take your location off it if you need your own.";
  if (template.allLocations)
    return "This template is used at every location, so only a company admin can change it. Duplicate it to make a version for your location.";
  return "This template is used at other locations, so only a company admin can change it. Duplicate it to make a version for your location.";
};

/**
 * Whether "Duplicate" is offered, as on the web list: event photo emails only to
 * managers and admins, and never a shared event photo email for a manager (the
 * server refuses that copy).
 */
export const canDuplicateTemplate = (
  template: Pick<TemplateTargeting, "categoryValue" | "allLocations" | "locationIds">,
  role: string | null | undefined,
): boolean =>
  (!isEventPhotoTemplate(template) || canManageEventPhotoEmails(role)) &&
  (isCompanyLevelRole(role) || !isSharedEventPhotoTemplate(template));

type Variable = { name: string; description: string };

export type TemplateVariableGroup = { title: string; note?: string; vars: Variable[] };

/**
 * The variable panel's groups, as the web orders them: an event photo email
 * leads with the event photo fields and keeps only the default ones besides;
 * any other template shows the general groups with the event fields last.
 * Empty groups are left out.
 */
export const templateVariableGroups = (
  data: { default: Variable[]; customer: Variable[]; user: Variable[]; event: Variable[] },
  eventPhotos: boolean,
): TemplateVariableGroup[] => {
  const event: TemplateVariableGroup = {
    title: "Event Photo Variables",
    note: eventPhotos
      ? "Filled in for each person when their photos are sent. A link name gives that link's address for the photo's location."
      : "Only filled in when this template is emailed to event registrants from a campaign.",
    vars: data.event,
  };
  const general: TemplateVariableGroup[] = [
    { title: "Default Variables", vars: data.default },
    { title: "Customer Variables", vars: data.customer },
    { title: "User Variables", vars: data.user },
  ];
  return (eventPhotos ? [event, general[0]] : [...general, event]).filter(
    (group) => group.vars.length > 0,
  );
};

const PHOTO_LINK_PATTERN = /\{\{\s*photo_link\s*\}\}/;

/** Whether an email uses {{ photo_link }} — then "only people whose photos are ready" starts ticked. */
export const usesPhotoLink = (subject: string, body: string): boolean =>
  PHOTO_LINK_PATTERN.test(`${subject} ${body}`);

/** Why nobody from the picked events would get a campaign, as the web words it. */
export const registrantGapMessage = (onlyWithPhotos: boolean): string =>
  onlyWithPhotos
    ? "Nobody from these events has photos ready yet. If people did register, untick “Only people whose photos are ready” to email them anyway."
    : "Nobody who registered for these events can get this email: no one gave an email address, or they unsubscribed. Pick other events.";

/** The preview's registrant line. The server counts emails, one per person or one per photo session. */
export const registrantSummary = (emails: number, withPhotos: number): string =>
  `${emails} ${emails === 1 ? "email goes" : "emails go"} to people from these events. ${withPhotos} of them ${withPhotos === 1 ? "carries" : "carry"} a photo link.`;

export type LogStatusStyle = {
  icon: "check-circle" | "x-circle" | "slash" | "send" | "clock";
  color: string;
};

/** A delivery-log row's status icon and color; anything unrecognised reads as waiting. */
export const logStatusStyle = (status: string): LogStatusStyle => {
  switch (status) {
    case "sent":
      return { icon: "check-circle", color: "#16A34A" };
    case "failed":
      return { icon: "x-circle", color: "#DC2626" };
    case "cancelled":
      return { icon: "slash", color: "#6B7280" };
    case "sending":
      return { icon: "send", color: "#2563EB" };
    default:
      return { icon: "clock", color: "#9CA3AF" };
  }
};

/** Campaign recipient groups, as the web names them. */
export const RECIPIENT_TYPE_LABELS: Record<string, string> = {
  customers: "Customers",
  attendants: "Attendants",
  company_admin: "Company Admins",
  location_managers: "Location Managers",
  custom: "Custom Emails",
  event_registrants: "Event Registrants",
};

/** A delivery-log row's recipient type, as the web names it. */
export const LOG_RECIPIENT_TYPE_LABELS: Record<string, string> = {
  customer: "Customer",
  attendant: "Attendant",
  company_admin: "Company Admin",
  location_manager: "Location Manager",
  custom: "Custom",
  event_registrant: "Event Registrant",
};
