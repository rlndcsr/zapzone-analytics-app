import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useColorScheme } from "nativewind";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DatePickerSheet } from "../../components/ui/DatePickerSheet";
import {
  CheckboxRow,
  FieldLabel,
  RadioRow,
  SelectField,
  TextField,
} from "../../components/ui/FormControls";
import { mediaUrl } from "../../lib/api";
import { toKey } from "../../lib/date/calendar";
import { venueDateKey } from "../../lib/date/venueTime";
import { useLocationOptions } from "../../lib/hooks/useLocationOptions";
import { getActiveLocationId } from "../../lib/location/activeLocationStore";
import { pickHeaderImage } from "../../lib/registrationForms/pickHeaderImage";
import {
  applySourceFill,
  candidatesByLocation,
  decodeEventLinks,
  decodeIds,
  describeFailure,
  encodeEventLinks,
  eventLastDay,
  existingGroupFor,
  fieldErrorsFrom,
  foldLocationErrors,
  formatEventDates,
  groupAddInput,
  groupDeleteWarning,
  groupEditInput,
  groupOpenState,
  groupSuggestion,
  locationDisplayName,
  markRegistrationFormsStale,
  matchingEventAt,
  moveSourceLine,
  nextEventPrefill,
  previousGroupChoices,
  sourceChoices,
  validateRegistrationEvent,
  venuesForSource,
  type RegistrationEventMode,
  type RegistrationEventPrefill,
  type SourceFill,
} from "../../lib/registrationForms/registrationForms";
import { getCurrentUser, getToken } from "../../lib/session";
import { formatDateLong } from "../../lib/waivers/returningCustomers";
import {
  createRegistrationEventGroup,
  deleteRegistrationEventGroup,
  fetchEventOptions,
  fetchRegistrationEventGroup,
  fetchRegistrationEventGroups,
  updateRegistrationEventGroup,
  updateRegistrationForm,
  type RegistrationEventGroupDetail,
  type RegistrationEventGroupInput,
  type RegistrationEventGroupSummary,
  type RegistrationEventOption,
  type RegistrationFormImage,
  type RegistrationMergeCandidate,
} from "../../services/registrationFormsService";

const PRIMARY = "#0644C7";

/** Events can be dated in the past (e.g. recording an earlier year). */
const EARLIEST_DATE = "2000-01-01";

const ErrorText = ({ message }: { message?: string }) =>
  message ? <Text className="mt-1 text-sm text-red-600">{message}</Text> : null;

const openForm = (id: number) =>
  router.replace({
    pathname: "/events/registration-form-details",
    params: { id: String(id) },
  } as never);

const confirmAsync = (title: string, message: string, action: string) =>
  new Promise<boolean>((resolve) =>
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: action, style: "destructive", onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) }),
  );

const isRemovalConfirmation = (err: unknown): string | null => {
  const e = err as { status?: number; body?: { code?: unknown; message?: unknown } };
  return e?.status === 409 && e.body?.code === "REMOVAL_NEEDS_CONFIRMATION"
    ? typeof e.body.message === "string"
      ? e.body.message
      : "Some of these locations have registrations."
    : null;
};

type EditorProps = {
  mode: RegistrationEventMode;
  group: RegistrationEventGroupDetail | null;
  prefill: RegistrationEventPrefill | null;
  fromEvent: number | null;
  prefillLocations: number[];
  prefillLinks: Record<number, number>;
  headerIcon: string;
};

/** Web RegistrationEventGroupModal (d5a759e) in its three modes; seeded once from the loaded event. */
const EventEditorForm = ({
  mode,
  group,
  prefill,
  fromEvent,
  prefillLocations,
  prefillLinks: linksParam,
  headerIcon,
}: EditorProps) => {
  const insets = useSafeAreaInsets();
  const user = getCurrentUser();
  const isCompanyAdmin = user?.role === "company_admin";
  const ownLocationId = user?.location_id ?? null;
  const { locations } = useLocationOptions();
  const creating = mode === "create";
  const editing = mode === "edit";
  const adding = mode === "add";
  const nextEditionMode = creating && prefill !== null;
  const existingLocations = useMemo(() => group?.forms.map((f) => f.locationId) ?? [], [group]);
  const openState = group ? groupOpenState(group) : { allOpen: false, mixedOpen: false };
  const mixedOpen = editing && openState.mixedOpen;
  const candidates = useMemo(
    () =>
      creating || !group
        ? new Map<number, RegistrationMergeCandidate>()
        : candidatesByLocation(group.mergeCandidates),
    [creating, group],
  );
  const prefillLinks = adding ? linksParam : {};

  const [today] = useState(() => venueDateKey(new Date().toISOString()) ?? "");
  const [name, setName] = useState(creating ? (prefill?.name ?? "") : (group?.name ?? ""));
  const [eventDate, setEventDate] = useState(
    creating ? (prefill?.eventDate ?? "") : (group?.eventDate ?? ""),
  );
  const [description, setDescription] = useState(
    creating ? (prefill?.description ?? "") : (group?.description ?? ""),
  );
  const [confirmationMessage, setConfirmationMessage] = useState(
    creating ? (prefill?.confirmationMessage ?? "") : (group?.confirmationMessage ?? ""),
  );
  const [locationIds, setLocationIds] = useState<number[]>(() => {
    if (!creating) return [...existingLocations, ...prefillLocations.filter((id) => !existingLocations.includes(id))];
    if (prefill?.locationIds.length) return prefill.locationIds;
    if (!isCompanyAdmin) return ownLocationId ? [ownLocationId] : [];
    const active = getActiveLocationId();
    return active ? [active] : [];
  });
  const [previousGroupId, setPreviousGroupId] = useState<number | null>(
    creating ? (prefill?.previousGroupId ?? null) : (group?.previousGroup?.id ?? null),
  );
  const [sourceEventId, setSourceEventId] = useState<number | null>(null);
  const [useEventImage, setUseEventImage] = useState(false);
  const [copyHeaderFromGroup, setCopyHeaderFromGroup] = useState<number | null>(
    creating ? (prefill?.copyHeaderFromGroup ?? null) : null,
  );
  const [isOpen, setIsOpen] = useState(editing ? openState.allOpen : true);
  const [openTouched, setOpenTouched] = useState(false);
  const [moveChoice, setMoveChoice] = useState<Record<number, boolean>>({});
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<{ locationId: number; message: string } | null>(null);
  const [image, setImage] = useState<RegistrationFormImage | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [eventOptions, setEventOptions] = useState<RegistrationEventOption[]>([]);
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  const [previousOptions, setPreviousOptions] = useState<RegistrationEventGroupSummary[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDate, setShowDate] = useState(false);
  const autoFilled = useRef<Partial<SourceFill>>(nextEditionMode ? { date: prefill?.eventDate } : {});
  const prefillApplied = useRef(false);
  const busy = saving || deleting || linking;

  const year = Number((eventDate || today).slice(0, 4));

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const controller = new AbortController();
    const wanted = creating ? (fromEvent ? [fromEvent] : []) : Object.values(prefillLinks);
    fetchEventOptions(token, undefined, controller.signal)
      .then(async (options) => {
        // An event that has already finished isn't in the default list.
        const missing = wanted.filter((id) => !options.some((o) => o.id === id));
        const extra = (
          await Promise.all(
            missing.map((id) => fetchEventOptions(token, id, controller.signal).catch(() => [])),
          )
        ).flat();
        setEventOptions([...options, ...extra]);
        setOptionsLoaded(true);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setEventOptions([]);
        setOptionsLoaded(true);
      });
    return () => controller.abort();
    // Loaded once for the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const token = getToken();
    if (adding || !token || !Number.isFinite(year)) return;
    const controller = new AbortController();
    Promise.all([
      fetchRegistrationEventGroups(token, { year: year - 1 }, controller.signal),
      fetchRegistrationEventGroups(token, { year }, controller.signal),
    ])
      .then(([earlier, current]) => setPreviousOptions([...earlier.groups, ...current.groups]))
      .catch(() => {
        if (!controller.signal.aborted) setPreviousOptions([]);
      });
    return () => controller.abort();
  }, [adding, year]);

  // A company admin with one location starts on it, as the web does.
  useEffect(() => {
    if (creating && !nextEditionMode && isCompanyAdmin && locationIds.length === 0 && getActiveLocationId() == null && locations.length === 1) {
      setLocationIds([locations[0].id]);
    }
    // Only when the location list arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations]);

  const listedIds = useMemo(() => locations.map((l) => l.id), [locations]);
  const activeId = getActiveLocationId() ?? null;
  const sidebarLocation = isCompanyAdmin && creating && !nextEditionMode ? activeId : null;
  const sourceVenues = useMemo<Set<number> | null>(() => {
    if (!isCompanyAdmin || nextEditionMode) return new Set(locationIds);
    if (sidebarLocation !== null) return new Set([sidebarLocation, ...locationIds]);
    return null;
  }, [isCompanyAdmin, nextEditionMode, sidebarLocation, locationIds]);
  const sourceEvent = useMemo(
    () => eventOptions.find((o) => o.id === sourceEventId) ?? null,
    [eventOptions, sourceEventId],
  );
  const groupSource = useMemo(() => {
    if (creating || !group) return null;
    const linked = group.forms.find((form) => form.event)?.event;
    return linked ? (eventOptions.find((o) => o.id === linked.id) ?? null) : null;
  }, [creating, group, eventOptions]);
  const matchSource = creating ? sourceEvent : groupSource;
  const choices = useMemo(() => {
    const listed = new Set(listedIds);
    const allowed = isCompanyAdmin
      ? new Set([...(sourceVenues ?? listed)].filter((id) => listed.has(id)))
      : (sourceVenues ?? new Set<number>());
    return sourceChoices(eventOptions, allowed, sourceEventId, today);
  }, [eventOptions, listedIds, isCompanyAdmin, sourceVenues, sourceEventId, today]);
  const previousChoices = useMemo(
    () => previousGroupChoices(previousOptions, group?.id ?? null, eventDate, previousGroupId),
    [previousOptions, group, eventDate, previousGroupId],
  );

  const isNewLocation = (id: number) => !existingLocations.includes(id);
  const willMove = (id: number) =>
    candidates.has(id) && isNewLocation(id) && locationIds.includes(id) && (moveChoice[id] ?? true);

  const linkFor = (locationId: number): RegistrationEventOption | null => {
    if (!creating && !isNewLocation(locationId)) return null;
    const chosen = prefillLinks[locationId];
    if (chosen) return eventOptions.find((o) => o.id === chosen) ?? null;
    if (!matchSource) return null;
    return matchingEventAt(matchSource, locationId, eventOptions, today);
  };
  const formDateFor = (locationId: number): string => {
    const link = linkFor(locationId);
    return link && link.id !== matchSource?.id ? eventLastDay(link) : eventDate;
  };
  const linksFor = (ids: number[]): Record<number, number> => {
    const links: Record<number, number> = {};
    ids.forEach((id) => {
      const link = prefillLinks[id] ?? linkFor(id)?.id;
      if (link) links[id] = link;
    });
    return links;
  };

  const chooseSource = (id: number | null, all: RegistrationEventOption[] = eventOptions) => {
    setSourceEventId(id);
    setLinkError(null);
    setErrors((current) => ({ ...current, event_id: "", event_links: "" }));
    const source = id === null ? null : (all.find((o) => o.id === id) ?? null);
    if (!source) {
      setUseEventImage(false);
      return;
    }
    const fill = applySourceFill({ name, description, date: eventDate }, autoFilled.current, source);
    setName(fill.values.name);
    setDescription(fill.values.description);
    setEventDate(fill.values.date);
    autoFilled.current = fill.filled;
    setUseEventImage(source.hasImage && !image && !copyHeaderFromGroup);
    if (isCompanyAdmin && !nextEditionMode) {
      // With a workspace location picked, other locations aren't ticked for staff.
      const venues =
        sidebarLocation === null
          ? venuesForSource(source, listedIds, all, today)
          : Array.from(new Set([...locationIds, ...(listedIds.includes(source.locationId) ? [source.locationId] : [])]));
      setLocationIds(venues);
      setErrors((current) => ({ ...current, location_ids: "", location_id: "" }));
    }
  };

  // Manage Events' Registration form button: start from that event once its options load.
  useEffect(() => {
    if (prefillApplied.current || !creating || fromEvent === null || eventOptions.length === 0) return;
    if (isCompanyAdmin && locations.length === 0) return;
    prefillApplied.current = true;
    const wanted = eventOptions.find((o) => o.id === fromEvent);
    if (wanted && (!isCompanyAdmin || listedIds.includes(wanted.locationId))) chooseSource(wanted.id, eventOptions);
    // chooseSource reads the current form; it runs once, when the data is in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventOptions, locations]);

  const venueName = (id: number | null): string | null => {
    if (id === null) return null;
    const known =
      locations.find((l) => l.id === id)?.name ??
      group?.forms.find((form) => form.locationId === id)?.locationName ??
      (id === ownLocationId ? (user?.location?.name ?? null) : null);
    return known ? locationDisplayName(known) : null;
  };

  const copiedImage =
    copyHeaderFromGroup && prefill?.headerImagePath ? mediaUrl(prefill.headerImagePath) : null;
  const eventImage =
    creating && useEventImage && sourceEvent?.image ? mediaUrl(sourceEvent.image) : null;
  const existingImage =
    editing && group?.headerImagePath && !removeImage ? mediaUrl(group.headerImagePath) : null;
  const shownImage = image?.uri ?? existingImage ?? copiedImage ?? eventImage;

  const toggleLocation = (id: number) => {
    if (adding && !isNewLocation(id)) return;
    setLinkError((current) => (current?.locationId === id ? null : current));
    setLocationIds((current) =>
      current.includes(id) ? current.filter((v) => v !== id) : [...current, id],
    );
    setErrors((current) => ({ ...current, location_ids: "", location_id: "" }));
  };

  const chooseImage = async () => {
    const result = await pickHeaderImage();
    if (!result) return;
    if ("problem" in result) {
      setErrors((current) => ({ ...current, header_image: result.problem }));
      return;
    }
    setErrors((current) => ({ ...current, header_image: "" }));
    setImage(result.image);
    setRemoveImage(false);
    setCopyHeaderFromGroup(null);
    setUseEventImage(false);
  };

  const clearImage = () => {
    if (image) setImage(null);
    else if (copiedImage) setCopyHeaderFromGroup(null);
    else if (eventImage) setUseEventImage(false);
    else setRemoveImage(true);
  };

  const addedLocations = locationIds.filter((id) => isNewLocation(id));
  const removedLocations = existingLocations.filter((id) => !locationIds.includes(id));
  // New locations' links come from the event's own Manage Events link, so wait for it.
  const waitingForEvents =
    !creating && !optionsLoaded && addedLocations.length > 0 && Boolean(group?.forms.some((form) => form.event));
  const movingLocations = addedLocations.filter((id) => willMove(id));
  const newFormLocations = addedLocations.filter((id) => !willMove(id));
  const moveFormIds = movingLocations.flatMap((id) => {
    const candidate = candidates.get(id);
    return candidate ? [candidate.id] : [];
  });
  const movable = addedLocations.flatMap((id) => {
    const candidate = candidates.get(id);
    return candidate ? [candidate] : [];
  });

  const existingGroup =
    creating && sourceEvent && !nextEditionMode
      ? existingGroupFor(sourceEvent, listedIds, eventOptions, today, locationIds)
      : null;
  const suggestion = existingGroup
    ? groupSuggestion(existingGroup, locationIds, linkFor)
    : { joinVenues: [], unlinked: [], already: [] };

  const linkExistingForm = async (item: { locationId: number; formId: number; eventId: number }) => {
    const token = getToken();
    if (!token) return;
    setLinking(true);
    setLinkError(null);
    try {
      await updateRegistrationForm(token, item.formId, { eventId: item.eventId });
      markRegistrationFormsStale();
      openForm(item.formId);
    } catch (err) {
      setLinkError({
        locationId: item.locationId,
        message: describeFailure(err, "That form couldn't be linked. Please try again.").message,
      });
      setLinking(false);
    }
  };

  const joinExistingGroup = () => {
    if (!existingGroup) return;
    router.replace({
      pathname: "/events/registration-event",
      params: {
        id: String(existingGroup.id),
        addLocations: suggestion.joinVenues.join(","),
        eventLinks: encodeEventLinks(linksFor(suggestion.joinVenues)),
      },
    } as never);
  };

  const updateWithConfirmation = async (
    token: string,
    input: RegistrationEventGroupInput,
  ): Promise<RegistrationEventGroupDetail | null> => {
    if (!group) return null;
    try {
      return await updateRegistrationEventGroup(token, group.id, input);
    } catch (err) {
      const message = isRemovalConfirmation(err);
      if (!message) throw err;
      if (!(await confirmAsync("Remove locations", `${message} Remove them anyway?`, "Remove"))) return null;
      return updateRegistrationEventGroup(token, group.id, { ...input, confirmRemove: true });
    }
  };

  const save = async () => {
    const found = validateRegistrationEvent({
      mode,
      name,
      locationIds,
      addedCount: addedLocations.length,
      eventDate,
    });
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    const token = getToken();
    if (!token) return;

    setSaving(true);
    setErrors({});
    setFormError(null);
    try {
      if (creating) {
        const created = await createRegistrationEventGroup(token, {
          name: name.trim(),
          eventDate,
          description,
          confirmationMessage,
          locationIds,
          eventId: sourceEvent?.id ?? null,
          eventLinks: linksFor(locationIds),
          useEventImage: !image && !copiedImage && useEventImage,
          copyHeaderImageFromGroup: !image && copiedImage ? copyHeaderFromGroup : null,
          previousGroupId,
          isOpen,
          headerImage: image,
        });
        markRegistrationFormsStale();
        router.replace({
          pathname: "/events/registration-event",
          params: { id: String(created.id) },
        } as never);
        return;
      }
      if (!group) return;
      const change = { locationIds, eventLinks: linksFor(addedLocations), moveFormIds };
      const input = adding
        ? groupAddInput(group, change)
        : groupEditInput(group, {
            ...change,
            name,
            eventDate,
            description,
            confirmationMessage,
            previousGroupId,
            isOpen,
            openTouched,
          });
      if (editing && image) input.headerImage = image;
      else if (editing && removeImage) input.removeHeaderImage = true;
      const updated = await updateWithConfirmation(token, input);
      if (updated) {
        markRegistrationFormsStale(adding ? "Location forms added" : "Event saved");
        router.back();
      }
    } catch (err) {
      const fields = foldLocationErrors(fieldErrorsFrom(err));
      if (Object.keys(fields).length > 0) setErrors(fields);
      else setFormError(describeFailure(err, "The event could not be saved. Please try again.").message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const token = getToken();
    if (!group || !token) return;
    if (!(await confirmAsync("Delete event", groupDeleteWarning(group), "Delete"))) return;
    setDeleting(true);
    setFormError(null);
    try {
      await deleteRegistrationEventGroup(token, group.id, existingLocations);
      markRegistrationFormsStale(`Deleted "${group.name}"`);
      router.dismissTo("/events/registration-forms" as never);
    } catch (err) {
      setFormError(describeFailure(err, "The event could not be deleted.").message);
      setDeleting(false);
    }
  };

  const fixedVenue = venueName(locationIds[0] ?? null);
  const fixedLink = locationIds[0] !== undefined ? linkFor(locationIds[0]) : null;
  const allSelected = locations.length > 0 && locations.every((l) => locationIds.includes(l.id));
  const existingForms =
    creating && sourceEvent
      ? (sourceVenues === null ? listedIds : locationIds).flatMap((id) => {
          const link = linkFor(id);
          return link && link.registrationFormIds.length > 0
            ? [{ locationId: id, formId: link.registrationFormIds[link.registrationFormIds.length - 1] }]
            : [];
        })
      : [];
  const otherDates =
    matchSource || Object.keys(prefillLinks).length > 0
      ? (creating ? locationIds : newFormLocations)
          .filter((id) => formDateFor(id) !== eventDate)
          .map((id) => `${venueName(id) ?? "Another location"} ${formatDateLong(formDateFor(id))}`)
      : [];

  const title = creating
    ? nextEditionMode
      ? "Next Year's Event"
      : "New Event"
    : editing
      ? "Edit Event"
      : "Add Location Forms";
  const subtitle = creating
    ? "Each location you pick gets its own form, QR code and registration list."
    : editing
      ? "Changes here apply to every location form in this event."
      : `New forms copy "${group?.name ?? "this event"}": its name, date, picture and messages.`;
  const saveLabel = creating
    ? locationIds.length > 1
      ? `Create event · ${locationIds.length} locations`
      : "Create event"
    : adding
      ? addedLocations.length > 1
        ? `Add ${addedLocations.length} location forms`
        : "Add location form"
      : "Save changes";

  const venueLine = (id: number, checked: boolean): string | null => {
    if (!creating && !isNewLocation(id)) {
      if (adding) return "Already in this event";
      return checked ? "In this event" : "Will be removed";
    }
    if (!creating && candidates.has(id)) {
      if (!checked) return "Has its own form · tick to move it in";
      if (willMove(id)) return "Moves its existing form in";
    }
    if (!creating && !checked) return null;
    const link = linkFor(id);
    if (!matchSource) return creating ? null : "New form";
    const prefix = creating ? "Its event" : "New form · its event";
    return link
      ? `${prefix}: ${formatEventDates(link)}${link.registrationFormIds.length > 0 ? " · has a form" : ""}`
      : creating
        ? "No matching event"
        : "New form · no matching event";
  };

  const venueHelp = creating
    ? locationIds.length > 1
      ? `${locationIds.length} location forms will be created, each with its own QR code and registration list.`
      : "Pick every location running this event. Each one gets its own form."
    : adding
      ? movingLocations.length > 0
        ? "New locations get their own form, QR code and registration list. A moved form keeps its QR code and registrations."
        : "Each location you tick gets its own form, QR code and registration list."
      : removedLocations.length > 0
        ? "Unticked locations' forms, QR codes and lists will be removed when you save."
        : "Tick a location to add its form, or untick one to remove it.";

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <View className="bg-white dark:bg-neutral-900 pt-12 pb-5 px-5 w-full border-b border-gray-100 dark:border-neutral-800">
        <View className="flex-row items-center justify-between">
          <Pressable
            onPress={() => !busy && router.back()}
            className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Feather name="chevron-left" size={20} color={headerIcon} />
          </Pressable>
          <Text className="text-gray-900 dark:text-white text-lg font-bold">{title}</Text>
          <View style={{ width: 36 }} />
        </View>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        >
          <View className="px-5 pt-5 gap-5">
            <Text className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</Text>

            {creating && (
              <View className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-900/20 p-4 gap-2">
                <SelectField
                  label="Start from an event (optional)"
                  value={sourceEventId ?? 0}
                  options={[
                    { label: "No linked event", value: 0 },
                    ...choices.map((o) => ({
                      label: `${o.name.trim()} — ${formatEventDates(o)}${
                        isCompanyAdmin &&
                        (sourceVenues === null ? locations.length > 1 : sourceVenues.size > 1) &&
                        o.locationName
                          ? ` · ${locationDisplayName(o.locationName)}`
                          : ""
                      }${o.registrationFormIds.length > 0 ? " · has a form" : ""}`,
                      value: o.id,
                    })),
                  ]}
                  onSelect={(value) => chooseSource(Number(value) || null)}
                  disabled={busy}
                />
                <Text className="text-xs text-gray-600 dark:text-gray-400">
                  {sourceVenues === null
                    ? "Fills in the name, date, description and picture from Manage Events, ticks the other locations running the same event, and links each location's form to its own event."
                    : sidebarLocation !== null
                      ? "Fills in the name, date, description and picture, and links the form to that event. Other locations running it show their date under Locations: tick them to add their own forms."
                      : "Fills in the name, date, description and picture, and links the form to that event."}
                </Text>
                {existingForms.length > 0 && (
                  <View className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 gap-1">
                    {existingForms.map(({ locationId, formId }) => (
                      <Text key={locationId} className="text-xs text-amber-900 dark:text-amber-200">
                        {venueName(locationId) ?? "This location"} already has a form for this event.{" "}
                        <Text onPress={() => openForm(formId)} className="font-semibold underline">
                          Open it
                        </Text>
                      </Text>
                    ))}
                  </View>
                )}
                {existingGroup &&
                  (suggestion.joinVenues.length > 0 ||
                    suggestion.unlinked.length > 0 ||
                    suggestion.already.length > 0) && (
                    <View className="rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 gap-2">
                      <Text className="text-xs text-gray-700 dark:text-gray-300">
                        <Text className="font-semibold text-gray-900 dark:text-white">
                          “{existingGroup.name}”
                        </Text>{" "}
                        already has registration forms for this event.
                        {suggestion.joinVenues.length > 0 &&
                          (existingGroup.canManage
                            ? ` Add ${suggestion.joinVenues.map((id) => venueName(id) ?? "this location").join(", ")} to it so its numbers stay together.`
                            : ` Only a company admin can add ${suggestion.joinVenues.map((id) => venueName(id) ?? "this location").join(", ")} to it. Creating here makes a separate event.`)}
                      </Text>
                      {existingGroup.canManage && suggestion.joinVenues.length > 0 && (
                        <Pressable
                          onPress={joinExistingGroup}
                          disabled={busy}
                          accessibilityRole="button"
                          className="self-start px-3 py-2 rounded-lg bg-[#0644C7] active:opacity-90"
                        >
                          <Text className="text-xs font-semibold text-white">
                            Add to “{existingGroup.name}”
                          </Text>
                        </Pressable>
                      )}
                      {suggestion.unlinked.map((item) => (
                        <View key={item.locationId} className="gap-1">
                          <Text className="text-xs text-gray-700 dark:text-gray-300">
                            {venueName(item.locationId) ?? "This location"} is already in it with a
                            form for {formatDateLong(item.formDate)}, but its form isn&apos;t linked
                            to this event.
                          </Text>
                          <Pressable
                            onPress={() => void linkExistingForm(item)}
                            disabled={busy}
                            accessibilityRole="button"
                            className="self-start flex-row items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-neutral-700 active:opacity-70"
                          >
                            {linking && <ActivityIndicator size="small" color={PRIMARY} />}
                            <Text className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                              Link its form
                            </Text>
                          </Pressable>
                          <ErrorText
                            message={linkError?.locationId === item.locationId ? linkError.message : undefined}
                          />
                        </View>
                      ))}
                      {suggestion.already.map((item) => (
                        <Text key={item.locationId} className="text-xs text-gray-700 dark:text-gray-300">
                          {venueName(item.locationId) ?? "This location"} is already in it.{" "}
                          <Text
                            onPress={() => openForm(item.formId)}
                            className="font-semibold text-[#0644C7] dark:text-blue-400"
                          >
                            Open its form
                          </Text>
                        </Text>
                      ))}
                    </View>
                  )}
                <ErrorText message={errors.event_id} />
              </View>
            )}

            {!adding && (
              <View>
                <TextField
                  label="Event name"
                  required
                  value={name}
                  onChangeText={setName}
                  maxLength={120}
                  placeholder="e.g. Trunk or Treat 2026"
                />
                <ErrorText message={errors.name} />
              </View>
            )}

            <View>
              <FieldLabel>{isCompanyAdmin ? "Locations" : "Location"}</FieldLabel>
              {isCompanyAdmin ? (
                <View className="gap-2">
                  {locations.map((location) => {
                    const checked = locationIds.includes(location.id);
                    const locked = adding && !isNewLocation(location.id);
                    const line = venueLine(location.id, checked);
                    const leaving = editing && !checked && !isNewLocation(location.id);
                    return (
                      <View
                        key={location.id}
                        className={`rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3.5 py-3 ${locked ? "opacity-60" : ""}`}
                      >
                        <CheckboxRow
                          alignTop
                          checked={checked}
                          onToggle={() => toggleLocation(location.id)}
                          label={
                            <View>
                              <Text className="text-sm font-medium text-gray-800 dark:text-gray-100">
                                {locationDisplayName(location.name)}
                              </Text>
                              {line && (
                                <Text className={`text-xs ${leaving ? "text-red-600" : "text-gray-500 dark:text-gray-400"}`}>
                                  {line}
                                </Text>
                              )}
                            </View>
                          }
                        />
                      </View>
                    );
                  })}
                  {movable.length > 0 && (
                    <View className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 gap-3">
                      {movable.map((candidate) => {
                        const move = moveChoice[candidate.locationId] ?? true;
                        const place = venueName(candidate.locationId) ?? "This location";
                        const together =
                          candidate.groupId === null
                            ? 0
                            : movable.filter(
                                (item) =>
                                  item.groupId === candidate.groupId &&
                                  (moveChoice[item.locationId] ?? true),
                              ).length;
                        const sourceLine = moveSourceLine(candidate, move, together, place);
                        return (
                          <View key={candidate.locationId} className="gap-1">
                            <Text className="text-xs text-amber-900 dark:text-amber-200">
                              <Text className="font-semibold">{place}</Text> already has its own form
                              for this event ({formatDateLong(candidate.eventDate)},{" "}
                              {candidate.totalEntries} registration{candidate.totalEntries === 1 ? "" : "s"}).
                            </Text>
                            <RadioRow
                              label="Move it into this event (keeps its QR code and registrations)"
                              selected={move}
                              onPress={() => setMoveChoice((c) => ({ ...c, [candidate.locationId]: true }))}
                            />
                            <RadioRow
                              label="Make a new form"
                              selected={!move}
                              onPress={() => setMoveChoice((c) => ({ ...c, [candidate.locationId]: false }))}
                            />
                            {sourceLine && (
                              <Text className="text-xs text-amber-800 dark:text-amber-300">{sourceLine}</Text>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}
                  <ErrorText message={errors.move_form_ids} />
                  {creating && locations.length > 1 && (
                    <Pressable
                      onPress={() => {
                        setLocationIds(allSelected ? [] : listedIds);
                        setErrors((current) => ({ ...current, location_ids: "", location_id: "" }));
                      }}
                      accessibilityRole="button"
                      className="self-start py-1"
                    >
                      <Text className="text-sm font-medium text-[#0644C7] dark:text-blue-400">
                        {allSelected ? "Clear all" : "Select all locations"}
                      </Text>
                    </Pressable>
                  )}
                  <Text className="text-xs text-gray-400 dark:text-gray-500">{venueHelp}</Text>
                </View>
              ) : (
                <View className="flex-row items-start gap-2 rounded-xl border border-gray-200 dark:border-neutral-800 bg-gray-100 dark:bg-neutral-800 px-3.5 py-3">
                  <Feather name="map-pin" size={15} color="#6B7280" />
                  <View className="flex-1">
                    <Text className="text-sm text-gray-700 dark:text-gray-300">
                      {creating ? "Creating at " : "At "}
                      <Text className="font-semibold text-gray-900 dark:text-white">
                        {fixedVenue ?? "no location assigned"}
                      </Text>
                    </Text>
                    {creating && sourceEvent && (
                      <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {fixedLink
                          ? `Linked to its event: ${formatEventDates(fixedLink)}`
                          : "No matching event at this location, so the form won't be linked."}
                      </Text>
                    )}
                  </View>
                </View>
              )}
              <ErrorText message={errors.location_ids} />
              <ErrorText message={errors.location_id} />
              <ErrorText message={errors.event_links} />
            </View>

            {!adding && (
              <View>
                <FieldLabel required>Event date</FieldLabel>
                <Pressable
                  onPress={() => setShowDate(true)}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel="Choose the event date"
                  className="flex-row items-center justify-between rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900"
                >
                  <Text className={`text-sm ${eventDate ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-500"}`}>
                    {eventDate ? formatDateLong(eventDate) : "Choose a date"}
                  </Text>
                  <Feather name="calendar" size={16} color="#9CA3AF" />
                </Pressable>
                <Text className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                  {editing
                    ? "Applies to every location form. Registration closes automatically after this date."
                    : "Registration closes automatically after this date."}
                </Text>
                {otherDates.length > 0 && (
                  <Text className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    Locations linked to their own event close after that event instead:{" "}
                    {otherDates.join(" · ")}.
                  </Text>
                )}
                <ErrorText message={errors.event_date} />
              </View>
            )}

            {adding && otherDates.length > 0 && (
              <Text className="text-xs text-gray-600 dark:text-gray-400">
                New forms linked to their own event close after that event: {otherDates.join(" · ")}.
              </Text>
            )}

            {!adding && (
              <View>
                <FieldLabel>Header image</FieldLabel>
                {shownImage ? (
                  <View className="overflow-hidden rounded-xl border border-gray-200 dark:border-neutral-800 bg-gray-900">
                    <Image source={{ uri: shownImage }} style={{ width: "100%", height: 180 }} resizeMode="contain" />
                    <Pressable
                      onPress={clearImage}
                      accessibilityRole="button"
                      accessibilityLabel="Remove header image"
                      className="absolute top-2 right-2 flex-row items-center gap-1 rounded-lg bg-white/90 px-2 py-1"
                    >
                      <Feather name="trash-2" size={13} color="#1F2937" />
                      <Text className="text-xs font-medium text-gray-800">Remove</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => void chooseImage()}
                    accessibilityRole="button"
                    className="items-center justify-center gap-1 rounded-xl border-2 border-dashed border-gray-300 dark:border-neutral-700 px-4 py-6"
                  >
                    <Feather name="image" size={22} color="#9CA3AF" />
                    <Text className="text-sm text-gray-600 dark:text-gray-400">Choose an image</Text>
                  </Pressable>
                )}
                {shownImage && (
                  <Pressable onPress={() => void chooseImage()} accessibilityRole="button" className="mt-2 self-start">
                    <Text className="text-sm font-medium text-[#0644C7]">Replace image</Text>
                  </Pressable>
                )}
                {creating && sourceEvent?.hasImage && !image && !copiedImage && (
                  <View className="mt-2">
                    <CheckboxRow
                      label={"Use the event's picture"}
                      checked={useEventImage}
                      onToggle={() => setUseEventImage((v) => !v)}
                    />
                  </View>
                )}
                <Text className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                  PNG, JPEG or WebP up to 8 MB. Wide images work best, e.g. 1600 × 800. Put anything
                  written on the image (date, time, ages) in the description too.
                </Text>
                <ErrorText message={errors.header_image} />
              </View>
            )}

            {!adding && (
              <View>
                <TextField
                  label="Description (optional)"
                  value={description}
                  onChangeText={setDescription}
                  maxLength={2000}
                  multiline
                  numberOfLines={3}
                  style={{ minHeight: 84, textAlignVertical: "top" }}
                  placeholder="Shown under the event name on every location's form"
                />
                <ErrorText message={errors.description} />
              </View>
            )}

            {!adding && (
              <View>
                <TextField
                  label="Confirmation message (optional)"
                  value={confirmationMessage}
                  onChangeText={setConfirmationMessage}
                  maxLength={500}
                  multiline
                  numberOfLines={2}
                  style={{ minHeight: 64, textAlignVertical: "top" }}
                  placeholder="Shown after someone registers, e.g. See you at 6 pm!"
                />
                <ErrorText message={errors.confirmation_message} />
              </View>
            )}

            {!adding && (
              <View>
                <SelectField
                  label={"Last year's event (optional)"}
                  value={previousGroupId ?? 0}
                  options={[
                    { label: "None", value: 0 },
                    ...previousChoices.map((option) => ({
                      label: `${option.name} — ${formatDateLong(option.eventDate)}`,
                      value: option.id,
                    })),
                    ...(previousGroupId && !previousChoices.some((o) => o.id === previousGroupId)
                      ? [{
                          label: prefill?.previousGroupName ?? group?.previousGroup?.name ?? "Last year's event",
                          value: previousGroupId,
                        }]
                      : []),
                  ]}
                  onSelect={(value) => setPreviousGroupId(Number(value) || null)}
                  disabled={busy}
                />
                <Text className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                  {"Each location's form links to the same location's form in last year's event, so you can see who came back."}
                </Text>
                <ErrorText message={errors.previous_group_id} />
              </View>
            )}

            {(creating || editing) && (
              <CheckboxRow
                alignTop
                checked={isOpen}
                onToggle={() => {
                  setIsOpen((v) => !v);
                  setOpenTouched(true);
                }}
                label={
                  <View>
                    <Text className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                      Accepting registrations
                    </Text>
                    <Text className="text-xs text-gray-500 dark:text-gray-400">
                      {creating
                        ? "Turn off to stop new sign-ups. Each form also closes automatically after its date."
                        : mixedOpen && !openTouched
                          ? "Open at some locations and closed at others. Tick to open every location form, or untick to close them all."
                          : "Applies to every location form. Each form also closes automatically after its date."}
                    </Text>
                  </View>
                }
              />
            )}

            {formError && <Text className="text-sm text-red-600">{formError}</Text>}

            {/* Side by side (web b72a992); a label too long to share the row wraps rather than truncates. */}
            <View className="flex-row flex-wrap gap-2">
              <Pressable
                onPress={() => !busy && router.back()}
                disabled={busy}
                style={{ flexGrow: 1 }}
                className="items-center justify-center px-4 py-3.5 rounded-xl border border-gray-200 dark:border-neutral-700 active:opacity-70"
                accessibilityRole="button"
              >
                <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void save()}
                disabled={busy || waitingForEvents}
                style={{ flexGrow: 1 }}
                className={`flex-row items-center justify-center gap-2 bg-[#0644C7] px-4 py-3.5 rounded-xl active:opacity-90 ${busy || waitingForEvents ? "opacity-70" : ""}`}
                accessibilityRole="button"
                accessibilityLabel={saveLabel}
              >
                {saving || waitingForEvents ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text numberOfLines={1} className="shrink-0 text-sm font-semibold text-white">
                    {saveLabel}
                  </Text>
                )}
              </Pressable>
            </View>
            {editing && group?.canManage && (
              <Pressable
                onPress={() => void remove()}
                disabled={busy}
                className="flex-row items-center justify-center gap-2 py-3.5 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/30 active:opacity-70"
                accessibilityRole="button"
              >
                {deleting ? (
                  <ActivityIndicator size="small" color="#EF4444" />
                ) : (
                  <Feather name="trash-2" size={15} color="#EF4444" />
                )}
                <Text className="text-sm font-semibold text-red-600">Delete event</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <DatePickerSheet
        visible={showDate}
        // Opens on today until a date is picked, rather than on EARLIEST_DATE.
        value={eventDate || toKey(new Date())}
        minDate={EARLIEST_DATE}
        title="Event date"
        onClose={() => setShowDate(false)}
        onSelect={(date) => {
          setEventDate(date);
          setShowDate(false);
        }}
      />
    </View>
  );
};

/** Loads what the editor starts from: the event being changed, or last year's for a next-year copy. */
const RegistrationEventEditor = () => {
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  const params = useLocalSearchParams<{
    id?: string;
    mode?: string;
    fromEvent?: string;
    nextFrom?: string;
    locations?: string;
    eventLinks?: string;
  }>();
  const groupId = params.id ? Number(params.id) : null;
  const nextFrom = groupId === null && params.nextFrom ? Number(params.nextFrom) : null;
  const mode: RegistrationEventMode = groupId === null ? "create" : params.mode === "add" ? "add" : "edit";
  const sourceId = groupId ?? nextFrom;

  const [group, setGroup] = useState<RegistrationEventGroupDetail | null>(null);
  const [loading, setLoading] = useState(sourceId !== null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (sourceId === null || !token) return;
    const controller = new AbortController();
    fetchRegistrationEventGroup(token, sourceId, controller.signal)
      .then((loaded) => {
        if (groupId !== null && !loaded.canManage) {
          setLoadError("Only a company admin can change this event.");
        } else {
          setGroup(loaded);
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(describeFailure(err, "This event could not be loaded.").message);
        setLoading(false);
      });
    return () => controller.abort();
  }, [sourceId, groupId]);

  if (loading || loadError) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-black">
        <View className="bg-white dark:bg-neutral-900 pt-12 pb-5 px-5 w-full border-b border-gray-100 dark:border-neutral-800">
          <View className="flex-row items-center justify-between">
            <Pressable
              onPress={() => router.back()}
              className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Feather name="chevron-left" size={20} color={headerIcon} />
            </Pressable>
            <Text className="text-gray-900 dark:text-white text-lg font-bold">Registration Event</Text>
            <View style={{ width: 36 }} />
          </View>
        </View>
        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={PRIMARY} />
          </View>
        ) : (
          <View className="p-6">
            <Text className="text-sm text-red-600">{loadError}</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <EventEditorForm
      mode={mode}
      group={mode === "create" ? null : group}
      prefill={nextFrom !== null && group ? nextEventPrefill(group) : null}
      fromEvent={mode === "create" && params.fromEvent ? Number(params.fromEvent) : null}
      prefillLocations={decodeIds(params.locations)}
      prefillLinks={decodeEventLinks(params.eventLinks)}
      headerIcon={headerIcon}
    />
  );
};

export default RegistrationEventEditor;
