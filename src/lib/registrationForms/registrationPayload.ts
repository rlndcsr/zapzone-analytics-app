import type {
  RegistrationEventGroupInput,
  RegistrationFormDetail,
  RegistrationFormUpdate,
} from "../../services/registrationFormsService.ts";

/** An event create or update: only the keys present, as the web's groupFormData sends them. */
export function registrationGroupBody(
  input: RegistrationEventGroupInput,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body.name = input.name;
  if (input.eventDate !== undefined) body.event_date = input.eventDate;
  if (input.description !== undefined) body.description = input.description;
  if (input.confirmationMessage !== undefined)
    body.confirmation_message = input.confirmationMessage;
  if (input.locationIds !== undefined) body.location_ids = input.locationIds;
  if (input.eventId !== undefined) body.event_id = input.eventId;
  if (input.eventLinks) body.event_links = input.eventLinks;
  if (input.useEventImage) body.use_event_image = true;
  if (input.copyHeaderImageFromGroup)
    body.copy_header_image_from_group = input.copyHeaderImageFromGroup;
  if (input.previousGroupId !== undefined)
    body.previous_group_id = input.previousGroupId;
  if (input.isOpen !== undefined) body.is_open = input.isOpen;
  if (!input.headerImage && input.removeHeaderImage)
    body.remove_header_image = true;
  if (input.confirmRemove) body.confirm_remove = true;
  if (input.moveFormIds?.length) body.move_form_ids = input.moveFormIds;
  if (input.expectedLocationIds)
    body.expected_location_ids = input.expectedLocationIds;
  return body;
}

/** Update: only the keys present — the backend leaves every omitted field as it is. */
export function registrationUpdateBody(
  patch: RegistrationFormUpdate,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.eventDate !== undefined) body.event_date = patch.eventDate;
  if (patch.description !== undefined) body.description = patch.description;
  if (patch.confirmationMessage !== undefined)
    body.confirmation_message = patch.confirmationMessage;
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
  eventDate: string;
  description: string;
  confirmationMessage: string;
  eventId: number | null;
  isOpen: boolean;
};

/** One location form's edit; a form in an event takes its name from the event, so it's never sent. */
export function changedFormFields(
  original: RegistrationFormDetail,
  draft: RegistrationFormDraft,
): RegistrationFormUpdate {
  const patch: RegistrationFormUpdate = {};
  const name = draft.name.trim();
  if (original.group === null && name !== original.name) patch.name = name;
  if (draft.eventDate !== original.eventDate) patch.eventDate = draft.eventDate;
  if (draft.description !== (original.description ?? ""))
    patch.description = draft.description;
  if (draft.confirmationMessage !== (original.confirmationMessage ?? ""))
    patch.confirmationMessage = draft.confirmationMessage;
  if (draft.eventId !== (original.event?.id ?? null))
    patch.eventId = draft.eventId;
  if (draft.isOpen !== original.isOpen) patch.isOpen = draft.isOpen;
  return patch;
}
