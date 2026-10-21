import type {
  RegistrationFormCreateInput,
  RegistrationFormDetail,
  RegistrationFormUpdate,
} from "../../services/registrationFormsService.ts";

/** Create: every field, one form per location in `location_ids`. */
export function registrationCreateBody(
  input: RegistrationFormCreateInput,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: input.name,
    location_ids: input.locationIds,
    event_date: input.eventDate,
    description: input.description,
    confirmation_message: input.confirmationMessage,
    previous_edition_id: input.previousEditionId,
    event_id: input.eventId,
    event_links: input.eventLinks,
    is_open: input.isOpen,
  };
  if (input.useEventImage) body.use_event_image = true;
  if (input.copyHeaderImageFrom)
    body.copy_header_image_from = input.copyHeaderImageFrom;
  return body;
}

/** Update: only the keys present — the backend leaves every omitted field as it is. */
export function registrationUpdateBody(
  patch: RegistrationFormUpdate,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.locationId !== undefined) body.location_id = patch.locationId;
  if (patch.eventDate !== undefined) body.event_date = patch.eventDate;
  if (patch.description !== undefined) body.description = patch.description;
  if (patch.confirmationMessage !== undefined)
    body.confirmation_message = patch.confirmationMessage;
  if (patch.previousEditionId !== undefined)
    body.previous_edition_id = patch.previousEditionId;
  if (patch.eventId !== undefined) body.event_id = patch.eventId;
  if (patch.isOpen !== undefined) body.is_open = patch.isOpen;
  if (!patch.headerImage && patch.removeHeaderImage)
    body.remove_header_image = true;
  return body;
}

/** A JSON body as multipart fields: `key[]` for lists, `key[k]` for maps, "" for null. */
export function multipartEntries(
  body: Record<string, unknown>,
): [string, string][] {
  const scalar = (value: unknown): string =>
    value === null || value === undefined
      ? ""
      : typeof value === "boolean"
        ? value
          ? "1"
          : "0"
        : String(value);
  const entries: [string, string][] = [];
  Object.entries(body).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => entries.push([`${key}[]`, scalar(item)]));
    } else if (value && typeof value === "object") {
      Object.entries(value).forEach(([k, item]) =>
        entries.push([`${key}[${k}]`, scalar(item)]),
      );
    } else {
      entries.push([key, scalar(value)]);
    }
  });
  return entries;
}

export type RegistrationFormDraft = {
  name: string;
  locationId: number | null;
  eventDate: string;
  description: string;
  confirmationMessage: string;
  previousEditionId: number | null;
  eventId: number | null;
  isOpen: boolean;
};

export function changedFormFields(
  original: RegistrationFormDetail,
  draft: RegistrationFormDraft,
): RegistrationFormUpdate {
  const patch: RegistrationFormUpdate = {};
  const name = draft.name.trim();
  if (name !== original.name) patch.name = name;
  if (draft.locationId !== null && draft.locationId !== original.locationId)
    patch.locationId = draft.locationId;
  if (draft.eventDate !== original.eventDate) patch.eventDate = draft.eventDate;
  if (draft.description !== (original.description ?? ""))
    patch.description = draft.description;
  if (draft.confirmationMessage !== (original.confirmationMessage ?? ""))
    patch.confirmationMessage = draft.confirmationMessage;
  if (draft.previousEditionId !== (original.previousEdition?.id ?? null))
    patch.previousEditionId = draft.previousEditionId;
  if (draft.eventId !== (original.event?.id ?? null))
    patch.eventId = draft.eventId;
  if (draft.isOpen !== original.isOpen) patch.isOpen = draft.isOpen;
  return patch;
}
