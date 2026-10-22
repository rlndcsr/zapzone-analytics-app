import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useColorScheme } from "nativewind";
import { useEffect, useState } from "react";
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
import { pickHeaderImage } from "../../lib/registrationForms/pickHeaderImage";
import {
  describeFailure,
  fieldErrorsFrom,
  formRemoval,
  formatEventDates,
  locationDisplayName,
  markRegistrationFormsStale,
  validateRegistrationForm,
} from "../../lib/registrationForms/registrationForms";
import { changedFormFields } from "../../lib/registrationForms/registrationPayload";
import { getToken } from "../../lib/session";
import { formatDateLong } from "../../lib/waivers/returningCustomers";
import {
  deleteRegistrationForm,
  fetchEventOptions,
  fetchRegistrationForm,
  updateRegistrationForm,
  type RegistrationEventOption,
  type RegistrationFormDetail,
  type RegistrationFormImage,
} from "../../services/registrationFormsService";

const PRIMARY = "#0644C7";

/** Forms can be dated in the past (e.g. recording an earlier edition). */
const EARLIEST_DATE = "2000-01-01";

const ErrorText = ({ message }: { message?: string }) =>
  message ? <Text className="mt-1 text-sm text-red-600">{message}</Text> : null;

/** Edit one location's form (web RegistrationEventFormModal, d5a759e); the event's own fields live on the event. */
const RegistrationFormEditor = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  const params = useLocalSearchParams<{ id?: string }>();
  const formId = Number(params.id);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detail, setDetail] = useState<RegistrationFormDetail | null>(null);
  const [name, setName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [description, setDescription] = useState("");
  const [confirmationMessage, setConfirmationMessage] = useState("");
  const [linkedEventId, setLinkedEventId] = useState<number | null>(null);
  const [isOpen, setIsOpen] = useState(true);
  const [image, setImage] = useState<RegistrationFormImage | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [eventOptions, setEventOptions] = useState<RegistrationEventOption[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [showDate, setShowDate] = useState(false);
  const busy = saving || removing;

  useEffect(() => {
    const token = getToken();
    if (!token || !Number.isFinite(formId)) {
      setLoadError("This form could not be loaded.");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    fetchRegistrationForm(token, formId, controller.signal)
      .then((form) => {
        setDetail(form);
        setName(form.name);
        setEventDate(form.eventDate);
        setDescription(form.description ?? "");
        setConfirmationMessage(form.confirmationMessage ?? "");
        setLinkedEventId(form.event?.id ?? null);
        setIsOpen(form.isOpen);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(describeFailure(err, "This form could not be loaded.").message);
        setLoading(false);
      });
    fetchEventOptions(token, undefined, controller.signal)
      .then(setEventOptions)
      .catch(() => setEventOptions([]));
    return () => controller.abort();
  }, [formId]);

  const grouped = Boolean(detail?.group);
  const venue = detail?.locationName ? locationDisplayName(detail.locationName) : null;
  const existingImage =
    detail?.headerImagePath && !removeImage ? mediaUrl(detail.headerImagePath) : null;
  const shownImage = image?.uri ?? existingImage;
  const linkableEvents = eventOptions
    .filter((o) => detail !== null && o.locationId === detail.locationId)
    .sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""));

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
  };

  const clearImage = () => {
    if (image) setImage(null);
    else setRemoveImage(true);
  };

  const save = async () => {
    if (!detail) return;
    const found = validateRegistrationForm({ name, eventDate, grouped });
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
      // Only what changed, so a stale screen can't undo someone else's edit.
      const patch = changedFormFields(detail, {
        name,
        eventDate,
        description,
        confirmationMessage,
        eventId: linkedEventId,
        isOpen,
      });
      if (image) patch.headerImage = image;
      else if (removeImage) patch.removeHeaderImage = true;
      await updateRegistrationForm(token, detail.id, patch);
      markRegistrationFormsStale();
      router.back();
    } catch (err) {
      const fields = fieldErrorsFrom(err);
      if (Object.keys(fields).length > 0) setErrors(fields);
      else setFormError(describeFailure(err, "The form could not be saved. Please try again.").message);
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (!detail) return;
    const removal = formRemoval(detail);
    Alert.alert(removal.label, removal.message, [
      { text: "Cancel", style: "cancel" },
      {
        text: removal.leavesEvent ? "Remove" : "Delete",
        style: "destructive",
        onPress: async () => {
          const token = getToken();
          if (!token) return;
          setRemoving(true);
          setFormError(null);
          try {
            const result = await deleteRegistrationForm(token, detail.id);
            if (removal.leavesEvent && !result.groupDeleted && result.groupId !== null) {
              markRegistrationFormsStale(`Removed ${venue ?? "this location"} from this event`);
              router.dismissTo({
                pathname: "/events/registration-event",
                params: { id: String(result.groupId) },
              } as never);
              return;
            }
            markRegistrationFormsStale(`Deleted "${detail.group?.name ?? detail.name}"`);
            router.dismissTo("/events/registration-forms" as never);
          } catch (err) {
            setFormError(describeFailure(err, removal.failure).message);
            setRemoving(false);
          }
        },
      },
    ]);
  };

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
          <Text className="text-gray-900 dark:text-white text-lg font-bold">
            Edit Form
          </Text>
          <View style={{ width: 36 }} />
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={PRIMARY} />
        </View>
      ) : loadError || !detail ? (
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
                {grouped
                  ? `Changes apply to ${venue ?? "this location"}'s form only.`
                  : "Changes apply to the form guests see right away."}
              </Text>

              <View className="flex-row items-start gap-2 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-900/20 px-3.5 py-3">
                <Feather name="map-pin" size={15} color={PRIMARY} />
                <View className="flex-1 gap-0.5">
                  <Text className="text-sm text-gray-700 dark:text-gray-300">
                    {grouped ? "" : "At "}
                    <Text className="font-semibold text-gray-900 dark:text-white">
                      {venue ?? "This location"}
                    </Text>
                    {grouped ? ` · ${detail.group?.name}` : ""}
                  </Text>
                  {grouped && detail.group && (
                    <Text className="text-xs text-gray-600 dark:text-gray-400">
                      {"The event's name and locations are changed on the event. "}
                      {detail.canManageEvent ? (
                        <Text
                          onPress={() =>
                            router.replace({
                              pathname: "/events/registration-event-editor",
                              params: { id: String(detail.group!.id), mode: "edit" },
                            } as never)
                          }
                          className="font-semibold text-[#0644C7] dark:text-blue-400"
                        >
                          Edit event
                        </Text>
                      ) : (
                        "Ask a company admin to change them."
                      )}
                    </Text>
                  )}
                </View>
              </View>

              {!grouped && (
                <View>
                  <TextField
                    label="Event name"
                    required
                    value={name}
                    onChangeText={setName}
                    maxLength={120}
                  />
                  <ErrorText message={errors.name} />
                </View>
              )}

              <View>
                <FieldLabel required>Event date at this location</FieldLabel>
                <Pressable
                  onPress={() => setShowDate(true)}
                  disabled={busy}
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
                <ErrorText message={errors.event_date} />
              </View>

              <View>
                <SelectField
                  label="Linked event (optional)"
                  value={linkedEventId ?? 0}
                  options={linkOptions}
                  onSelect={(value) => setLinkedEventId(Number(value) || null)}
                  disabled={busy}
                />
                <Text className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                  The event in Manage Events at this location that this form is
                  for.
                </Text>
                <ErrorText message={errors.event_id} />
              </View>

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
                    onPress={() => void chooseImage()}
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
                    onPress={() => void chooseImage()}
                    accessibilityRole="button"
                    className="mt-2 self-start"
                  >
                    <Text className="text-sm font-medium text-[#0644C7]">
                      Replace image
                    </Text>
                  </Pressable>
                )}
                <Text className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                  PNG, JPEG or WebP up to 8 MB. Wide images work best, e.g. 1600
                  × 800.
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
                      Turn off to stop new sign-ups at this location. It also
                      closes automatically after the event date.
                    </Text>
                  </View>
                }
              />

              {formError && (
                <Text className="text-sm text-red-600">{formError}</Text>
              )}

              {/* Cancel and Save side by side (web b72a992). */}
              <View className="flex-row gap-2">
                <Pressable
                  onPress={() => !busy && router.back()}
                  disabled={busy}
                  className="flex-1 items-center justify-center py-3.5 rounded-xl border border-gray-200 dark:border-neutral-700 active:opacity-70"
                  accessibilityRole="button"
                >
                  <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => void save()}
                  disabled={busy}
                  className="flex-1 flex-row items-center justify-center gap-2 bg-[#0644C7] py-3.5 rounded-xl active:opacity-90"
                  accessibilityRole="button"
                  accessibilityLabel="Save changes"
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text
                      numberOfLines={1}
                      className="shrink-0 text-sm font-semibold text-white"
                    >
                      Save changes
                    </Text>
                  )}
                </Pressable>
              </View>
              {detail.canManageEvent && (
                <Pressable
                  onPress={remove}
                  disabled={busy}
                  className="flex-row items-center justify-center gap-2 py-3.5 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/30 active:opacity-70"
                  accessibilityRole="button"
                >
                  {removing ? (
                    <ActivityIndicator size="small" color="#EF4444" />
                  ) : (
                    <Feather name="trash-2" size={15} color="#EF4444" />
                  )}
                  <Text className="text-sm font-semibold text-red-600">
                    {formRemoval(detail).label}
                  </Text>
                </Pressable>
              )}
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
