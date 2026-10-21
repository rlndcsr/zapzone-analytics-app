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
  SelectField,
  TextField,
} from "../../components/ui/FormControls";
import { mediaUrl } from "../../lib/api";
import { toKey } from "../../lib/date/calendar";
import { venueDateKey } from "../../lib/date/venueTime";
import { useLocationOptions } from "../../lib/hooks/useLocationOptions";
import { getActiveLocationId } from "../../lib/location/activeLocationStore";
import {
  applySourceFill,
  describeFailure,
  editionOptions,
  eventLastDay,
  fieldErrorsFrom,
  foldLocationErrors,
  formatEventDates,
  headerImageProblem,
  locationDisplayName,
  markRegistrationFormsStale,
  matchingEventAt,
  nextEditionPrefill,
  sourceChoices,
  validateRegistrationForm,
  venuesForSource,
  type RegistrationFormPrefill,
  type SourceFill,
} from "../../lib/registrationForms/registrationForms";
import { changedFormFields } from "../../lib/registrationForms/registrationPayload";
import { getCurrentUser, getToken } from "../../lib/session";
import { formatDateLong } from "../../lib/waivers/returningCustomers";
import {
  createRegistrationForms,
  fetchEventOptions,
  fetchRegistrationForm,
  fetchRegistrationForms,
  updateRegistrationForm,
  type RegistrationEventOption,
  type RegistrationFormDetail,
  type RegistrationFormImage,
  type RegistrationFormRow,
  type RegistrationFormUpdate,
} from "../../services/registrationFormsService";

const PRIMARY = "#0644C7";

/** Forms can be dated in the past (e.g. recording an earlier edition). */
const EARLIEST_DATE = "2000-01-01";

const ErrorText = ({ message }: { message?: string }) =>
  message ? <Text className="mt-1 text-sm text-red-600">{message}</Text> : null;

const openForm = (id: number) =>
  router.push({
    pathname: "/events/registration-form-details",
    params: { id: String(id) },
  } as never);

/**
 * New / edit registration form (web RegistrationEventFormModal, 64a9eee). A new
 * form can start from a Manage Events event (`fromEvent`), be created at several
 * locations at once, or copy a form a year forward (`nextFrom`); an edit sends
 * only the fields that changed.
 */
const RegistrationFormEditor = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  const params = useLocalSearchParams<{
    id?: string;
    fromEvent?: string;
    nextFrom?: string;
  }>();
  const formId = params.id ? Number(params.id) : null;
  const editing = formId !== null;
  const fromEvent = !editing && params.fromEvent ? Number(params.fromEvent) : null;
  const nextFrom = !editing && params.nextFrom ? Number(params.nextFrom) : null;

  const user = getCurrentUser();
  const isCompanyAdmin = user?.role === "company_admin";
  const ownLocationId = user?.location_id ?? null;
  const { locations } = useLocationOptions();
  const [today] = useState(() => venueDateKey(new Date().toISOString()) ?? "");

  const [loading, setLoading] = useState(editing || nextFrom !== null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detail, setDetail] = useState<RegistrationFormDetail | null>(null);
  const [prefill, setPrefill] = useState<RegistrationFormPrefill | null>(null);
  const [name, setName] = useState("");
  const [locationIds, setLocationIds] = useState<number[]>(() => {
    if (editing || nextFrom !== null) return [];
    if (!isCompanyAdmin) return ownLocationId ? [ownLocationId] : [];
    const active = getActiveLocationId();
    return active ? [active] : [];
  });
  const [eventDate, setEventDate] = useState("");
  const [description, setDescription] = useState("");
  const [confirmationMessage, setConfirmationMessage] = useState("");
  const [previousEditionId, setPreviousEditionId] = useState<number | null>(null);
  const [linkedEventId, setLinkedEventId] = useState<number | null>(null);
  const [sourceEventId, setSourceEventId] = useState<number | null>(null);
  const [useEventImage, setUseEventImage] = useState(false);
  const [copyHeaderFrom, setCopyHeaderFrom] = useState<number | null>(null);
  const [isOpen, setIsOpen] = useState(true);
  const [image, setImage] = useState<RegistrationFormImage | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [editions, setEditions] = useState<RegistrationFormRow[]>([]);
  const [eventOptions, setEventOptions] = useState<RegistrationEventOption[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showDate, setShowDate] = useState(false);
  // What the last "Start from an event" pick filled in, so the next pick only replaces that.
  const autoFilled = useRef<Partial<SourceFill>>({});
  const prefillApplied = useRef(false);

  // Next year's edition keeps its location and last year's link.
  const locationsLocked = prefill !== null;
  const singleLocation = locationIds.length === 1 ? locationIds[0] : null;

  useEffect(() => {
    const token = getToken();
    const sourceId = formId ?? nextFrom;
    if (sourceId === null || !token) return;
    const controller = new AbortController();
    fetchRegistrationForm(token, sourceId, controller.signal)
      .then((form) => {
        if (formId !== null) {
          setDetail(form);
          setName(form.name);
          setLocationIds([form.locationId]);
          setEventDate(form.eventDate);
          setDescription(form.description ?? "");
          setConfirmationMessage(form.confirmationMessage ?? "");
          setPreviousEditionId(form.previousEdition?.id ?? null);
          setLinkedEventId(form.event?.id ?? null);
          setIsOpen(form.isOpen);
        } else {
          const next = nextEditionPrefill(form);
          setPrefill(next);
          setName(next.name);
          setLocationIds(next.locationIds);
          setEventDate(next.eventDate);
          setDescription(next.description);
          setConfirmationMessage(next.confirmationMessage);
          setPreviousEditionId(next.previousEditionId);
          setCopyHeaderFrom(next.copyHeaderImageFrom);
          autoFilled.current = { date: next.eventDate };
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        setLoadError(describeFailure(err, "This form could not be loaded.").message);
        setLoading(false);
      });
    return () => controller.abort();
  }, [formId, nextFrom]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const controller = new AbortController();
    fetchEventOptions(token, undefined, controller.signal)
      .then(async (options) => {
        // An event that has already finished isn't in the default list.
        const missing = fromEvent !== null && !options.some((o) => o.id === fromEvent);
        const extra = missing
          ? await fetchEventOptions(token, fromEvent, controller.signal).catch(() => [])
          : [];
        setEventOptions([...options, ...extra]);
      })
      .catch(() => setEventOptions([]));
    return () => controller.abort();
  }, [fromEvent]);

  // A company admin with one location starts on it, as the web does.
  useEffect(() => {
    if (
      !editing &&
      nextFrom === null &&
      isCompanyAdmin &&
      locationIds.length === 0 &&
      getActiveLocationId() == null &&
      locations.length === 1
    ) {
      setLocationIds([locations[0].id]);
    }
    // Only when the location list arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations]);

  useEffect(() => {
    const token = getToken();
    setEditions([]);
    if (singleLocation === null || !token) return;
    const controller = new AbortController();
    fetchRegistrationForms(token, singleLocation, controller.signal)
      .then(setEditions)
      .catch(() => setEditions([]));
    return () => controller.abort();
  }, [singleLocation]);

  const listedIds = useMemo(() => locations.map((l) => l.id), [locations]);
  const sourceEvent = useMemo(
    () => eventOptions.find((o) => o.id === sourceEventId) ?? null,
    [eventOptions, sourceEventId],
  );
  const choosingVenues = isCompanyAdmin && !editing && !locationsLocked;
  const choices = useMemo(
    () =>
      sourceChoices(
        eventOptions,
        new Set(choosingVenues ? listedIds : locationIds),
        sourceEventId,
        today,
      ),
    [eventOptions, choosingVenues, listedIds, locationIds, sourceEventId, today],
  );
  const linkFor = (locationId: number): RegistrationEventOption | null =>
    sourceEvent ? matchingEventAt(sourceEvent, locationId, eventOptions, today) : null;
  const formDateFor = (locationId: number): string => {
    const link = linkFor(locationId);
    return link && link.id !== sourceEvent?.id ? eventLastDay(link) : eventDate;
  };
  const linkableEvents = eventOptions.filter(
    (o) => singleLocation !== null && o.locationId === singleLocation,
  );
  const options = useMemo(
    () => editionOptions(editions, formId, eventDate, previousEditionId),
    [editions, formId, eventDate, previousEditionId],
  );

  const chooseSource = (
    id: number | null,
    all: RegistrationEventOption[] = eventOptions,
  ) => {
    setSourceEventId(id);
    setErrors((current) => ({ ...current, event_id: "", event_links: "" }));
    const source = id === null ? null : (all.find((o) => o.id === id) ?? null);
    if (!source) {
      setUseEventImage(false);
      return;
    }
    const fill = applySourceFill(
      { name, description, date: eventDate },
      autoFilled.current,
      source,
    );
    setName(fill.values.name);
    setDescription(fill.values.description);
    setEventDate(fill.values.date);
    autoFilled.current = fill.filled;
    setUseEventImage(source.hasImage && !image && !copyHeaderFrom);
    if (choosingVenues) {
      const next = venuesForSource(source, listedIds, all, today);
      if (!(locationIds.length === 1 && next.length === 1 && next[0] === locationIds[0]))
        setPreviousEditionId(null);
      setLocationIds(next);
      setErrors((current) => ({
        ...current,
        location_ids: "",
        location_id: "",
        previous_edition_id: "",
      }));
    }
  };

  // Manage Events' Registration form button: start from that event once its options load.
  useEffect(() => {
    if (prefillApplied.current || fromEvent === null || eventOptions.length === 0) return;
    if (isCompanyAdmin && locations.length === 0) return;
    prefillApplied.current = true;
    const wanted = eventOptions.find((o) => o.id === fromEvent);
    if (wanted && (!isCompanyAdmin || listedIds.includes(wanted.locationId)))
      chooseSource(wanted.id, eventOptions);
    // chooseSource reads the current form; it runs once, when the data is in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventOptions, locations]);

  const locationLocked = Boolean(detail?.locationLocked);
  const copiedImage =
    copyHeaderFrom && prefill?.headerImagePath ? mediaUrl(prefill.headerImagePath) : null;
  const eventImage =
    !editing && useEventImage && sourceEvent?.image ? mediaUrl(sourceEvent.image) : null;
  const existingImage =
    detail?.headerImagePath && !removeImage ? mediaUrl(detail.headerImagePath) : null;
  const shownImage = image?.uri ?? existingImage ?? copiedImage ?? eventImage;

  const venueName = (id: number | null): string | null => {
    if (id === null) return null;
    const known =
      locations.find((l) => l.id === id)?.name ??
      (detail?.locationId === id ? detail.locationName : null) ??
      (id === ownLocationId ? (user?.location?.name ?? null) : null);
    return known ? locationDisplayName(known) : null;
  };

  const toggleLocation = (id: number) => {
    setLocationIds((current) =>
      current.includes(id) ? current.filter((v) => v !== id) : [...current, id],
    );
    setPreviousEditionId(null);
    setErrors((current) => ({
      ...current,
      location_ids: "",
      location_id: "",
      previous_edition_id: "",
    }));
  };

  const changeEditLocation = (next: number) => {
    if (locationIds[0] === next) return;
    setLocationIds([next]);
    setPreviousEditionId(null);
    setLinkedEventId(null);
    setErrors((current) => ({
      ...current,
      location_id: "",
      previous_edition_id: "",
      event_id: "",
    }));
  };

  const pickImage = async () => {
    const ImagePicker = await import("expo-image-picker");
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Permission needed",
        "Allow photo library access to choose a header image.",
      );
      return;
    }
    // Re-encoded at the app's usual upload quality, which also keeps an iPhone
    // HEIC out of the backend's png/jpg/webp allow-list.
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      quality: 0.7,
    });
    const asset = picked.canceled ? null : picked.assets[0];
    if (!asset?.uri) return;
    const type = asset.mimeType ?? "image/jpeg";
    const problem = headerImageProblem(type, asset.fileSize);
    if (problem) {
      setErrors((current) => ({ ...current, header_image: problem }));
      return;
    }
    setErrors((current) => ({ ...current, header_image: "" }));
    setImage({ uri: asset.uri, name: asset.fileName ?? "header.jpg", type });
    setRemoveImage(false);
    setCopyHeaderFrom(null);
    setUseEventImage(false);
  };

  const clearImage = () => {
    if (image) setImage(null);
    else if (copiedImage) setCopyHeaderFrom(null);
    else if (eventImage) setUseEventImage(false);
    else setRemoveImage(true);
  };

  const save = async () => {
    const found = validateRegistrationForm({ name, locationIds, eventDate, editing });
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
      if (formId === null) {
        const eventLinks: Record<number, number> = {};
        locationIds.forEach((id) => {
          const link = linkFor(id);
          if (link) eventLinks[id] = link.id;
        });
        const { form, createdCount } = await createRegistrationForms(token, {
          name: name.trim(),
          locationIds,
          eventDate,
          description,
          confirmationMessage,
          previousEditionId: singleLocation !== null ? previousEditionId : null,
          eventId: sourceEvent?.id ?? null,
          eventLinks,
          useEventImage: !image && !copiedImage && useEventImage,
          copyHeaderImageFrom: !image && copiedImage ? copyHeaderFrom : null,
          isOpen,
          headerImage: image,
        });
        if (createdCount > 1) {
          markRegistrationFormsStale(
            `Created ${createdCount} registration forms, one per location`,
          );
          router.dismissTo("/events/registration-forms" as never);
        } else {
          markRegistrationFormsStale();
          // Straight to the new form's QR code, as the web does.
          router.replace({
            pathname: "/events/registration-form-details",
            params: { id: String(form.id) },
          } as never);
        }
      } else {
        // Only what changed, so a stale screen can't undo someone else's edit.
        const patch: RegistrationFormUpdate = detail
          ? changedFormFields(detail, {
              name,
              locationId: locationIds[0] ?? null,
              eventDate,
              description,
              confirmationMessage,
              previousEditionId,
              eventId: linkedEventId,
              isOpen,
            })
          : {};
        if (image) patch.headerImage = image;
        else if (removeImage) patch.removeHeaderImage = true;
        await updateRegistrationForm(token, formId, patch);
        markRegistrationFormsStale();
        router.back();
      }
    } catch (err) {
      const fields = foldLocationErrors(fieldErrorsFrom(err));
      if (Object.keys(fields).length > 0) setErrors(fields);
      else
        setFormError(
          describeFailure(err, "The form could not be saved. Please try again.")
            .message,
        );
    } finally {
      setSaving(false);
    }
  };

  const allSelected =
    locations.length > 0 && locations.every((l) => locationIds.includes(l.id));
  const fixedVenue = venueName(locationIds[0] ?? null);
  const fixedLink = locationIds[0] !== undefined ? linkFor(locationIds[0]) : null;
  const existingForms = sourceEvent
    ? (choosingVenues ? listedIds : locationIds).flatMap((id) => {
        const link = linkFor(id);
        return link && link.registrationFormIds.length > 0
          ? [{ locationId: id, formId: link.registrationFormIds[link.registrationFormIds.length - 1] }]
          : [];
      })
    : [];
  const otherDates =
    !editing && sourceEvent
      ? locationIds
          .filter((id) => formDateFor(id) !== eventDate)
          .map((id) => `${venueName(id) ?? "Another location"} ${formatDateLong(formDateFor(id))}`)
      : [];
  const linkOptions = [
    { label: "No linked event", value: 0 },
    ...linkableEvents.map((o) => ({
      label: `${o.name.trim()} — ${formatEventDates(o)}`,
      value: o.id,
    })),
    ...(detail?.event && !linkableEvents.some((o) => o.id === detail.event?.id)
      ? [{ label: detail.event.name, value: detail.event.id }]
      : []),
  ];
  const saveLabel = editing
    ? "Save changes"
    : locationIds.length > 1
      ? `Create ${locationIds.length} forms`
      : "Create form";

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <View className="bg-white dark:bg-neutral-900 pt-12 pb-5 px-5 w-full border-b border-gray-100 dark:border-neutral-800">
        <View className="flex-row items-center justify-between">
          <Pressable
            onPress={() => !saving && router.back()}
            className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Feather name="chevron-left" size={20} color={headerIcon} />
          </Pressable>
          <Text className="text-gray-900 dark:text-white text-lg font-bold">
            {editing ? "Edit Registration Form" : "New Registration Form"}
          </Text>
          <View style={{ width: 36 }} />
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={PRIMARY} />
        </View>
      ) : loadError ? (
        <View className="p-6">
          <Text className="text-sm text-red-600">{loadError}</Text>
        </View>
      ) : (
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
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                {editing
                  ? "Changes apply to the form guests see right away."
                  : "Guests sign up by scanning the QR code for this form."}
              </Text>

              {!editing && (
                <View className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-900/20 p-4 gap-2">
                  <SelectField
                    label="Start from an event (optional)"
                    value={sourceEventId ?? 0}
                    options={[
                      { label: "No linked event", value: 0 },
                      ...choices.map((o) => ({
                        label: `${o.name.trim()} — ${formatEventDates(o)}${
                          choosingVenues && locations.length > 1 && o.locationName
                            ? ` · ${locationDisplayName(o.locationName)}`
                            : ""
                        }${o.registrationFormIds.length > 0 ? " · has a form" : ""}`,
                        value: o.id,
                      })),
                    ]}
                    onSelect={(value) => chooseSource(Number(value) || null)}
                    disabled={saving}
                  />
                  <Text className="text-xs text-gray-600 dark:text-gray-400">
                    {choosingVenues
                      ? "Fills in the name, date, description and picture, ticks the other locations running the same event, and links each form to its own location's event."
                      : "Fills in the name, date, description and picture, and links the form to that event."}
                  </Text>
                  {existingForms.length > 0 && (
                    <View className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 gap-1">
                      {existingForms.map(({ locationId, formId: existingId }) => (
                        <Text
                          key={locationId}
                          className="text-xs text-amber-900 dark:text-amber-200"
                        >
                          {venueName(locationId) ?? "This location"} already has a
                          form for this event.{" "}
                          <Text
                            onPress={() => openForm(existingId)}
                            className="font-semibold underline"
                          >
                            Open it
                          </Text>
                        </Text>
                      ))}
                    </View>
                  )}
                  <ErrorText message={errors.event_id} />
                </View>
              )}

              <View>
                <TextField
                  label="Event name"
                  required
                  value={name}
                  onChangeText={setName}
                  maxLength={120}
                  placeholder="e.g. Halloween Bash 2026"
                />
                <ErrorText message={errors.name} />
              </View>

              <View>
                <FieldLabel>{choosingVenues ? "Locations" : "Location"}</FieldLabel>
                {choosingVenues ? (
                  <View className="gap-2">
                    {locations.map((location) => {
                      const link = linkFor(location.id);
                      return (
                        <View
                          key={location.id}
                          className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3.5 py-3"
                        >
                          <CheckboxRow
                            alignTop
                            checked={locationIds.includes(location.id)}
                            onToggle={() => toggleLocation(location.id)}
                            label={
                              <View>
                                <Text className="text-sm font-medium text-gray-800 dark:text-gray-100">
                                  {locationDisplayName(location.name)}
                                </Text>
                                {sourceEvent && (
                                  <Text className="text-xs text-gray-500 dark:text-gray-400">
                                    {link
                                      ? `Its event: ${formatEventDates(link)}${
                                          link.registrationFormIds.length > 0
                                            ? " · has a form"
                                            : ""
                                        }`
                                      : "No matching event"}
                                  </Text>
                                )}
                              </View>
                            }
                          />
                        </View>
                      );
                    })}
                    {locations.length > 1 && (
                      <Pressable
                        onPress={() => {
                          setLocationIds(allSelected ? [] : listedIds);
                          setPreviousEditionId(null);
                          setErrors((current) => ({
                            ...current,
                            location_ids: "",
                            location_id: "",
                            previous_edition_id: "",
                          }));
                        }}
                        accessibilityRole="button"
                        className="self-start py-1"
                      >
                        <Text className="text-sm font-medium text-[#0644C7] dark:text-blue-400">
                          {allSelected ? "Clear all" : "Select all locations"}
                        </Text>
                      </Pressable>
                    )}
                    <Text className="text-xs text-gray-400 dark:text-gray-500">
                      {locationIds.length > 1
                        ? `${locationIds.length} separate forms will be created — one per location, each with its own QR code and list.`
                        : "Pick several locations to create a separate form for each one in one go."}
                    </Text>
                  </View>
                ) : isCompanyAdmin && editing && !locationLocked ? (
                  <SelectField
                    value={locationIds[0] ?? null}
                    placeholder="Choose a location"
                    options={locations.map((l) => ({
                      label: locationDisplayName(l.name),
                      value: l.id,
                    }))}
                    onSelect={(value) => changeEditLocation(Number(value))}
                    disabled={saving}
                  />
                ) : (
                  <View className="flex-row items-start gap-2 rounded-xl border border-gray-200 dark:border-neutral-800 bg-gray-100 dark:bg-neutral-800 px-3.5 py-3">
                    <Feather name="map-pin" size={15} color="#6B7280" />
                    <View className="flex-1">
                      <Text className="text-sm text-gray-700 dark:text-gray-300">
                        {editing ? "At " : "Creating at "}
                        <Text className="font-semibold text-gray-900 dark:text-white">
                          {fixedVenue ?? "no location assigned"}
                        </Text>
                      </Text>
                      {!editing && sourceEvent && (
                        <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {fixedLink
                            ? `Linked to its event: ${formatEventDates(fixedLink)}`
                            : "No matching event at this location, so the form won't be linked."}
                        </Text>
                      )}
                    </View>
                  </View>
                )}
                {locationLocked && isCompanyAdmin && (
                  <Text className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                    The location is fixed once people have registered or another
                    form links to this one.
                  </Text>
                )}
                <ErrorText message={errors.location_ids} />
                <ErrorText message={errors.location_id} />
                <ErrorText message={errors.event_links} />
              </View>

              <View>
                <FieldLabel required>Event date</FieldLabel>
                <Pressable
                  onPress={() => setShowDate(true)}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel="Choose the event date"
                  className="flex-row items-center justify-between rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900"
                >
                  <Text
                    className={`text-sm ${
                      eventDate
                        ? "text-gray-900 dark:text-white"
                        : "text-gray-400 dark:text-gray-500"
                    }`}
                  >
                    {eventDate ? formatDateLong(eventDate) : "Choose a date"}
                  </Text>
                  <Feather name="calendar" size={16} color="#9CA3AF" />
                </Pressable>
                <Text className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                  Registration closes automatically after this date.
                </Text>
                {otherDates.length > 0 && (
                  <Text className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    Locations linked to their own event close after that event
                    instead: {otherDates.join(" · ")}.
                  </Text>
                )}
                <ErrorText message={errors.event_date} />
              </View>

              {editing && (
                <View>
                  <SelectField
                    label="Linked event (optional)"
                    value={linkedEventId ?? 0}
                    options={linkOptions}
                    onSelect={(value) => setLinkedEventId(Number(value) || null)}
                    disabled={saving}
                  />
                  <Text className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                    The event in Manage Events at this location that this form is
                    for.
                  </Text>
                  <ErrorText message={errors.event_id} />
                </View>
              )}

              <View>
                <FieldLabel>Header image</FieldLabel>
                {shownImage ? (
                  <View className="overflow-hidden rounded-xl border border-gray-200 dark:border-neutral-800 bg-gray-900">
                    <Image
                      source={{ uri: shownImage }}
                      style={{ width: "100%", height: 180 }}
                      resizeMode="contain"
                    />
                    <Pressable
                      onPress={clearImage}
                      accessibilityRole="button"
                      accessibilityLabel="Remove header image"
                      className="absolute top-2 right-2 flex-row items-center gap-1 rounded-lg bg-white/90 px-2 py-1"
                    >
                      <Feather name="trash-2" size={13} color="#1F2937" />
                      <Text className="text-xs font-medium text-gray-800">
                        Remove
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => void pickImage()}
                    accessibilityRole="button"
                    className="items-center justify-center gap-1 rounded-xl border-2 border-dashed border-gray-300 dark:border-neutral-700 px-4 py-6"
                  >
                    <Feather name="image" size={22} color="#9CA3AF" />
                    <Text className="text-sm text-gray-600 dark:text-gray-400">
                      Choose an image
                    </Text>
                  </Pressable>
                )}
                {shownImage && (
                  <Pressable
                    onPress={() => void pickImage()}
                    accessibilityRole="button"
                    className="mt-2 self-start"
                  >
                    <Text className="text-sm font-medium text-[#0644C7]">
                      Replace image
                    </Text>
                  </Pressable>
                )}
                {!editing && sourceEvent?.hasImage && !image && !copiedImage && (
                  <View className="mt-2">
                    <CheckboxRow
                      label={"Use the event's picture"}
                      checked={useEventImage}
                      onToggle={() => setUseEventImage((v) => !v)}
                    />
                  </View>
                )}
                <Text className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                  PNG, JPEG or WebP up to 8 MB. Wide images work best, e.g. 1600
                  × 800. Put anything written on the image (date, time, ages) in
                  the description too.
                </Text>
                <ErrorText message={errors.header_image} />
              </View>

              <View>
                <TextField
                  label="Description (optional)"
                  value={description}
                  onChangeText={setDescription}
                  maxLength={2000}
                  multiline
                  numberOfLines={3}
                  style={{ minHeight: 84, textAlignVertical: "top" }}
                  placeholder="Shown under the event name on the form"
                />
                <ErrorText message={errors.description} />
              </View>

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

              <View>
                {singleLocation !== null ? (
                  <>
                    <SelectField
                      label={"Last year's edition (optional)"}
                      value={previousEditionId ?? 0}
                      options={[
                        { label: "None", value: 0 },
                        ...options.map((option) => ({
                          label: `${option.name} — ${formatDateLong(option.eventDate)}`,
                          value: option.id,
                        })),
                      ]}
                      onSelect={(value) => setPreviousEditionId(Number(value) || null)}
                      disabled={saving}
                    />
                    <Text className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                      Pick the same event from last year at this location to see
                      who registered for it then.
                    </Text>
                  </>
                ) : (
                  <>
                    <FieldLabel>{"Last year's edition (optional)"}</FieldLabel>
                    <Text className="text-sm text-gray-500 dark:text-gray-400">
                      {locationIds.length > 1
                        ? "Create the forms first, then open each one to link last year's edition at that location."
                        : "Choose a location first."}
                    </Text>
                  </>
                )}
                <ErrorText message={errors.previous_edition_id} />
              </View>

              <CheckboxRow
                alignTop
                checked={isOpen}
                onToggle={() => setIsOpen((v) => !v)}
                label={
                  <View>
                    <Text className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                      Accepting registrations
                    </Text>
                    <Text className="text-xs text-gray-500 dark:text-gray-400">
                      Turn off to stop new sign-ups. It also closes
                      automatically after the event date.
                    </Text>
                  </View>
                }
              />

              {formError && (
                <Text className="text-sm text-red-600">{formError}</Text>
              )}

              <Pressable
                onPress={() => void save()}
                disabled={saving}
                className="flex-row items-center justify-center gap-2 bg-[#0644C7] py-3.5 rounded-xl active:opacity-90"
                accessibilityRole="button"
                accessibilityLabel={saveLabel}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text
                    numberOfLines={1}
                    className="shrink-0 text-sm font-semibold text-white"
                  >
                    {saveLabel}
                  </Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => !saving && router.back()}
                disabled={saving}
                className="items-center justify-center py-3.5 rounded-xl border border-gray-200 dark:border-neutral-700 active:opacity-70"
                accessibilityRole="button"
              >
                <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  Cancel
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

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

export default RegistrationFormEditor;
