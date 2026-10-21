import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useColorScheme } from "nativewind";
import { useEffect, useMemo, useState } from "react";
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
import { useLocationOptions } from "../../lib/hooks/useLocationOptions";
import { getActiveLocationId } from "../../lib/location/activeLocationStore";
import {
  describeFailure,
  editionOptions,
  fieldErrorsFrom,
  headerImageProblem,
  locationDisplayName,
  markRegistrationFormsStale,
  validateRegistrationForm,
} from "../../lib/registrationForms/registrationForms";
import { getCurrentUser, getToken } from "../../lib/session";
import { formatDateLong } from "../../lib/waivers/returningCustomers";
import {
  fetchRegistrationForm,
  fetchRegistrationForms,
  saveRegistrationForm,
  type RegistrationFormDetail,
  type RegistrationFormImage,
  type RegistrationFormRow,
} from "../../services/registrationFormsService";

const PRIMARY = "#0644C7";

/** Forms can be dated in the past (e.g. recording an earlier edition). */
const EARLIEST_DATE = "2000-01-01";

const ErrorText = ({ message }: { message?: string }) =>
  message ? <Text className="mt-1 text-sm text-red-600">{message}</Text> : null;

const RegistrationFormEditor = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  const params = useLocalSearchParams<{ id?: string }>();
  const formId = params.id ? Number(params.id) : null;
  const editing = formId !== null;

  const user = getCurrentUser();
  const isCompanyAdmin = user?.role === "company_admin";
  const { locations } = useLocationOptions();

  const [loading, setLoading] = useState(editing);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detail, setDetail] = useState<RegistrationFormDetail | null>(null);
  const [name, setName] = useState("");
  const [locationId, setLocationId] = useState<number | null>(() => {
    if (editing) return null;
    if (!isCompanyAdmin) return user?.location_id ?? null;
    return getActiveLocationId() ?? null;
  });
  const [eventDate, setEventDate] = useState("");
  const [description, setDescription] = useState("");
  const [confirmationMessage, setConfirmationMessage] = useState("");
  const [previousEditionId, setPreviousEditionId] = useState<number | null>(
    null,
  );
  const [isOpen, setIsOpen] = useState(true);
  const [image, setImage] = useState<RegistrationFormImage | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [editions, setEditions] = useState<RegistrationFormRow[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showDate, setShowDate] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (formId === null || !token) return;
    const controller = new AbortController();
    fetchRegistrationForm(token, formId, controller.signal)
      .then((form) => {
        setDetail(form);
        setName(form.name);
        setLocationId(form.locationId);
        setEventDate(form.eventDate);
        setDescription(form.description ?? "");
        setConfirmationMessage(form.confirmationMessage ?? "");
        setPreviousEditionId(form.previousEdition?.id ?? null);
        setIsOpen(form.isOpen);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setLoadError(
          describeFailure(err, "This form could not be loaded.").message,
        );
        setLoading(false);
      });
    return () => controller.abort();
  }, [formId]);

  // A company admin on "All Locations" starts on the first venue, as the web does.
  useEffect(() => {
    if (
      !editing &&
      isCompanyAdmin &&
      locationId === null &&
      locations.length > 0
    ) {
      setLocationId(locations[0].id);
    }
  }, [editing, isCompanyAdmin, locationId, locations]);

  useEffect(() => {
    const token = getToken();
    if (locationId === null || !token) {
      setEditions([]);
      return;
    }
    const controller = new AbortController();
    fetchRegistrationForms(token, locationId, controller.signal)
      .then(setEditions)
      .catch(() => setEditions([]));
    return () => controller.abort();
  }, [locationId]);

  const options = useMemo(
    () => editionOptions(editions, formId, eventDate, previousEditionId),
    [editions, formId, eventDate, previousEditionId],
  );

  const locationLocked = Boolean(detail?.locationLocked);
  const existingImage =
    detail?.headerImagePath && !removeImage
      ? mediaUrl(detail.headerImagePath)
      : null;
  const shownImage = image?.uri ?? existingImage;
  const locationName = isCompanyAdmin
    ? (locations.find((l) => l.id === locationId)?.name ??
      detail?.locationName ??
      null)
    : (detail?.locationName ?? user?.location?.name ?? null);

  const changeLocation = (next: number) => {
    if (next === locationId) return;
    setLocationId(next);
    setPreviousEditionId(null);
    setErrors((current) => ({
      ...current,
      location_id: "",
      previous_edition_id: "",
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
  };

  const clearImage = () => {
    if (image) {
      setImage(null);
      return;
    }
    setRemoveImage(true);
  };

  const save = async () => {
    const found = validateRegistrationForm({ name, locationId, eventDate });
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    const token = getToken();
    if (!token || locationId === null) return;

    setSaving(true);
    setErrors({});
    setFormError(null);
    try {
      const saved = await saveRegistrationForm(token, formId, {
        name: name.trim(),
        locationId,
        eventDate,
        description,
        confirmationMessage,
        previousEditionId,
        isOpen,
        headerImage: image,
        removeHeaderImage: !image && removeImage,
      });
      markRegistrationFormsStale();
      if (editing) {
        router.back();
      } else {
        // Straight to the new form's QR code, as the web does.
        router.replace({
          pathname: "/events/registration-form-details",
          params: { id: String(saved.id) },
        } as never);
      }
    } catch (err) {
      const fields = fieldErrorsFrom(err);
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
            {editing ? "Edit registration form" : "New registration form"}
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
                <FieldLabel>Location</FieldLabel>
                {isCompanyAdmin && !locationLocked ? (
                  <SelectField
                    value={locationId}
                    placeholder="Choose a location"
                    options={locations.map((l) => ({
                      label: locationDisplayName(l.name),
                      value: l.id,
                    }))}
                    onSelect={(value) => changeLocation(Number(value))}
                    disabled={saving}
                  />
                ) : (
                  <View className="flex-row items-start gap-2 rounded-xl border border-gray-200 dark:border-neutral-800 bg-gray-100 dark:bg-neutral-800 px-3.5 py-3">
                    <Feather name="map-pin" size={15} color="#6B7280" />
                    <Text className="flex-1 text-sm text-gray-700 dark:text-gray-300">
                      {editing ? "At " : "Creating at "}
                      <Text className="font-semibold text-gray-900 dark:text-white">
                        {locationName
                          ? locationDisplayName(locationName)
                          : "no location assigned"}
                      </Text>
                    </Text>
                  </View>
                )}
                {locationLocked && isCompanyAdmin && (
                  <Text className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                    The location is fixed once people have registered or another
                    form links to this one.
                  </Text>
                )}
                <ErrorText message={errors.location_id} />
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
                <ErrorText message={errors.event_date} />
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
                  onSelect={(value) =>
                    setPreviousEditionId(Number(value) || null)
                  }
                  disabled={locationId === null || saving}
                />
                <Text className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                  Pick the same event from last year at this location to see who
                  registered for it then.
                </Text>
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
                accessibilityLabel={editing ? "Save changes" : "Create form"}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text
                    numberOfLines={1}
                    className="shrink-0 text-sm font-semibold text-white"
                  >
                    {editing ? "Save changes" : "Create form"}
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
