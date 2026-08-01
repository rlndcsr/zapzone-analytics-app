import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useColorScheme } from "nativewind";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "../../components/ui/BottomSheet";
import { InputField } from "../../components/ui/InputField";
import { LaunchKioskSheet } from "../../components/ui/LaunchKioskSheet";
import { markTemplatesStale } from "../../lib/hooks/useWaiverTemplates";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  fetchLocations,
  type LocationOption,
} from "../../services/locationsService";
import {
  createTemplate,
  fetchAvailableActivities,
  fetchContentTokens,
  fetchTemplateDetail,
  updateTemplate,
  type ActivityType,
  type AvailableActivity,
  type DuplicateRule,
  type TemplatePayload,
  type TemplateStatus,
  type WaiverTemplate,
} from "../../services/waiversService";

const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const STATUS_OPTIONS: { label: string; value: TemplateStatus }[] = [
  { label: "Draft", value: "draft" },
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
  { label: "Archived", value: "archived" },
];

// Same order the web's <select> uses, so the two read identically.
const DUPLICATE_OPTIONS: { label: string; value: DuplicateRule }[] = [
  { label: "Block duplicates", value: "none" },
  { label: "Manager-assigned only", value: "manager_only" },
  { label: "Allow duplicates", value: "allow" },
];

// Labels + hints copied from the web WaiverBuilder's `clauseFields`.
const CLAUSES: { key: keyof ClauseState; label: string; hint?: string }[] = [
  {
    key: "minorSectionEnabled",
    label: "Minor section",
    hint: "Allow adding children to this waiver",
  },
  { key: "dobRequired", label: "Require minor date of birth" },
  { key: "relationshipRequired", label: "Require minor relationship" },
  { key: "photoVideoReleaseEnabled", label: "Photo / video release clause" },
  { key: "medicalAckEnabled", label: "Medical acknowledgment clause" },
  { key: "propertyDamageEnabled", label: "Property damage clause" },
  { key: "groupLeaderClauseEnabled", label: "Group leader clause" },
  {
    key: "electronicConsentEnabled",
    label: "Electronic signature consent",
    hint: "Require explicit e-signature consent",
  },
];

// Merge-tag groupings, mirroring the web builder's TOKEN_GROUPS.
const TOKEN_GROUPS: { name: string; keys: string[] }[] = [
  {
    name: "Company",
    keys: [
      "business_legal_name",
      "company_name",
      "company_email",
      "company_phone",
    ],
  },
  { name: "Location", keys: ["location_name", "location_address"] },
  { name: "Activity & date", keys: ["activity_name", "booking_date", "visit_date"] },
  {
    name: "Guardian / signer",
    keys: [
      "full_name",
      "adult_first_name",
      "adult_last_name",
      "adult_email",
      "adult_phone",
      "relationship",
    ],
  },
  { name: "General", keys: ["current_date", "current_year"] },
];

const PHOTO_RELEASE_PLACEHOLDER =
  "I grant {{company_name}} permission to photograph and record me and any minors listed on this waiver during our visit, and to use those images and recordings for promotional purposes.";

type ClauseState = {
  minorSectionEnabled: boolean;
  dobRequired: boolean;
  relationshipRequired: boolean;
  photoVideoReleaseEnabled: boolean;
  medicalAckEnabled: boolean;
  propertyDamageEnabled: boolean;
  groupLeaderClauseEnabled: boolean;
  electronicConsentEnabled: boolean;
};

const Card = ({ children }: { children: React.ReactNode }) => (
  <View
    className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mb-4"
    style={CARD_SHADOW}
  >
    {children}
  </View>
);

/** Bold card heading, matching the web's `text-sm font-bold` section titles. */
const CardTitle = ({
  title,
  hint,
  right,
}: {
  title: string;
  hint?: string;
  right?: React.ReactNode;
}) => (
  <View className="flex-row items-start justify-between gap-3 mb-4">
    <View className="flex-1">
      <Text className="text-sm font-bold text-gray-900 dark:text-white">
        {title}
      </Text>
      {!!hint && (
        <Text className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
          {hint}
        </Text>
      )}
    </View>
    {right}
  </View>
);

const FieldLabel = ({
  label,
  note,
}: {
  label: string;
  note?: string;
}) => (
  <Text className="mb-1.5 text-sm font-medium text-gray-700 dark:text-gray-200">
    {label}
    {!!note && (
      <Text className="font-normal text-gray-400 dark:text-gray-500">
        {" "}
        {note}
      </Text>
    )}
  </Text>
);

/** Checkbox row — the web uses checkboxes here, not switches. */
const CheckRow = ({
  label,
  hint,
  value,
  onToggle,
  bold,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onToggle: () => void;
  bold?: boolean;
}) => (
  <Pressable
    onPress={onToggle}
    accessibilityRole="checkbox"
    accessibilityState={{ checked: value }}
    className="flex-row items-start gap-2.5 py-2"
  >
    <View
      className={`w-5 h-5 mt-0.5 rounded items-center justify-center border ${
        value
          ? "bg-[#0644C7] border-[#0644C7]"
          : "border-gray-300 dark:border-neutral-600"
      }`}
    >
      {value && <Feather name="check" size={13} color="#FFFFFF" />}
    </View>
    <View className="flex-1">
      <Text
        className={`text-sm ${
          bold
            ? "font-bold text-gray-900 dark:text-white"
            : "text-gray-700 dark:text-gray-200"
        }`}
      >
        {label}
      </Text>
      {!!hint && (
        <Text className="text-[11px] text-gray-400 dark:text-gray-500">
          {hint}
        </Text>
      )}
    </View>
  </Pressable>
);

/** Select-style row that opens a picker sheet (stands in for the web's <select>). */
const SelectRow = ({
  value,
  onPress,
}: {
  value: string;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    className="h-12 flex-row items-center justify-between rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4"
  >
    <Text className="text-sm text-gray-900 dark:text-white" numberOfLines={1}>
      {value}
    </Text>
    <Feather name="chevron-down" size={18} color="#9CA3AF" />
  </Pressable>
);

/** Multi-line bordered text box (the web's <textarea>). */
const TextArea = ({
  value,
  onChangeText,
  placeholder,
  minHeight = 96,
  mono,
  error,
  onSelectionChange,
  inputRef,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  minHeight?: number;
  mono?: boolean;
  error?: boolean;
  onSelectionChange?: (e: {
    nativeEvent: { selection: { start: number; end: number } };
  }) => void;
  inputRef?: React.Ref<TextInput>;
}) => (
  <View
    className={`rounded-lg border bg-white dark:bg-neutral-900 px-4 py-3 ${
      error ? "border-red-400" : "border-gray-200 dark:border-neutral-700"
    }`}
  >
    <TextInput
      ref={inputRef}
      value={value}
      onChangeText={onChangeText}
      onSelectionChange={onSelectionChange}
      placeholder={placeholder}
      placeholderTextColor="#9CA3AF"
      multiline
      textAlignVertical="top"
      style={[
        { minHeight },
        mono
          ? { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }
          : null,
      ]}
      className="text-sm leading-5 text-gray-900 dark:text-white"
    />
  </View>
);

/**
 * One assignment group (Packages / Attractions / Events) with the web's
 * "Select all · N selected · Clear" header and a bounded, scrollable list.
 */
const AssignmentGroup = ({
  label,
  activities,
  selected,
  onToggle,
  onSelectAll,
  onClear,
}: {
  label: string;
  activities: AvailableActivity[];
  selected: number[];
  onToggle: (id: number) => void;
  onSelectAll: () => void;
  onClear: () => void;
}) => (
  <View className="mb-5">
    <View className="flex-row items-center justify-between mb-2">
      <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
        {label}
      </Text>
      <View className="flex-row items-center gap-2">
        {activities.length > 0 && selected.length < activities.length && (
          <Pressable onPress={onSelectAll} hitSlop={6}>
            <Text className="text-xs font-medium text-[#0644C7]">
              Select all
            </Text>
          </Pressable>
        )}
        {selected.length > 0 && (
          <>
            {activities.length > 0 && selected.length < activities.length && (
              <Text className="text-xs text-gray-300">·</Text>
            )}
            <Text className="text-xs font-medium text-[#0644C7]">
              {selected.length} selected
            </Text>
            <Pressable onPress={onClear} hitSlop={6}>
              <Text className="text-xs text-gray-400">Clear</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>

    {activities.length === 0 ? (
      <View className="items-center py-4 rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800">
        <Text className="text-xs text-gray-400 dark:text-gray-500">
          No available {label.toLowerCase()}.
        </Text>
      </View>
    ) : (
      <View className="rounded-lg border border-gray-200 dark:border-neutral-700 overflow-hidden">
        <ScrollView style={{ maxHeight: 176 }} nestedScrollEnabled>
          {activities.map((a, i) => {
            const checked = selected.includes(a.id);
            return (
              <Pressable
                key={a.id}
                onPress={() => onToggle(a.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                className={`flex-row items-center gap-3 px-4 py-2.5 ${
                  i > 0 ? "border-t border-gray-50 dark:border-neutral-800" : ""
                } ${checked ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}
              >
                <Feather
                  name={checked ? "check-square" : "square"}
                  size={16}
                  color={checked ? PRIMARY : "#9CA3AF"}
                />
                <View className="flex-1">
                  <Text
                    className="text-sm text-gray-900 dark:text-white"
                    numberOfLines={1}
                  >
                    {a.name}
                  </Text>
                  {!!a.locationName && (
                    <Text className="text-[11px] text-gray-400 dark:text-gray-500">
                      {a.locationName}
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    )}
  </View>
);

const CreateTemplate = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  const params = useLocalSearchParams<{ id?: string }>();
  const editId = params.id ? Number(params.id) : null;
  const isEdit = editId != null && !Number.isNaN(editId);

  const user = getCurrentUser();
  const isAdmin = user?.role === "company_admin";
  const isManager = user?.role === "location_manager";
  const managerLocationName = user?.location?.name ?? null;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [internalDescription, setInternalDescription] = useState("");
  const [status, setStatus] = useState<TemplateStatus>("draft");
  const [isDefault, setIsDefault] = useState(false);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [bodyText, setBodyText] = useState("");
  const [validityDays, setValidityDays] = useState("");
  const [maxMinors, setMaxMinors] = useState("10");
  const [duplicateRule, setDuplicateRule] =
    useState<DuplicateRule>("manager_only");
  const [reminderEligible, setReminderEligible] = useState(true);
  const [clauses, setClauses] = useState<ClauseState>({
    minorSectionEnabled: true,
    dobRequired: false,
    relationshipRequired: false,
    photoVideoReleaseEnabled: false,
    medicalAckEnabled: false,
    propertyDamageEnabled: false,
    groupLeaderClauseEnabled: false,
    electronicConsentEnabled: true,
  });
  const [photoVideoText, setPhotoVideoText] = useState("");
  const [marketingEnabled, setMarketingEnabled] = useState(false);
  const [marketingText, setMarketingText] = useState("");
  const [marketingHelper, setMarketingHelper] = useState("");

  const [packages, setPackages] = useState<AvailableActivity[]>([]);
  const [attractions, setAttractions] = useState<AvailableActivity[]>([]);
  const [events, setEvents] = useState<AvailableActivity[]>([]);
  const [selectedPackages, setSelectedPackages] = useState<number[]>([]);
  const [selectedAttractions, setSelectedAttractions] = useState<number[]>([]);
  const [selectedEvents, setSelectedEvents] = useState<number[]>([]);

  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState(false);
  const [loadedTemplate, setLoadedTemplate] = useState<WaiverTemplate | null>(
    null,
  );
  const [kioskOpen, setKioskOpen] = useState(false);

  const [sheet, setSheet] = useState<null | "status" | "duplicate" | "location">(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; body?: string }>({});
  const submitLock = useRef(false);

  // Caret position in the body field, so an inserted merge tag lands where the
  // user last tapped rather than always at the end.
  const bodyRef = useRef<TextInput>(null);
  const bodySelection = useRef({ start: 0, end: 0 });

  // Load merge tags, available activities, locations (+ the template on edit).
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const token = getToken();
    if (!token) {
      setLoadError("Not authenticated");
      setLoading(false);
      return;
    }
    const types: ActivityType[] = ["package", "attraction", "event"];
    Promise.all([
      isEdit ? fetchTemplateDetail(token, editId!, controller.signal) : null,
      ...types.map((t) =>
        fetchAvailableActivities(
          token,
          t,
          isEdit ? editId! : undefined,
          controller.signal,
        ).catch(() => [] as AvailableActivity[]),
      ),
      fetchContentTokens(token, controller.signal).catch(
        () => ({}) as Record<string, string>,
      ),
      isAdmin
        ? fetchLocations(token, controller.signal).catch(
            () => [] as LocationOption[],
          )
        : Promise.resolve([] as LocationOption[]),
    ])
      .then(([tpl, pkgs, attrs, evts, tokenMap, locs]) => {
        if (!active) return;
        setPackages(pkgs as AvailableActivity[]);
        setAttractions(attrs as AvailableActivity[]);
        setEvents(evts as AvailableActivity[]);
        setTokens(tokenMap as Record<string, string>);
        setLocations(locs as LocationOption[]);
        if (tpl) {
          setLoadedTemplate(tpl);
          setTitle(tpl.title);
          setInternalDescription(tpl.internalDescription ?? "");
          setStatus(tpl.status);
          setIsDefault(tpl.isDefault);
          setLocationId(tpl.locationId);
          setBodyText(tpl.bodyText);
          setValidityDays(
            tpl.validityDurationDays != null
              ? String(tpl.validityDurationDays)
              : "",
          );
          setMaxMinors(String(tpl.maxMinors));
          setDuplicateRule(tpl.duplicateRule);
          setReminderEligible(tpl.reminderEligible);
          setClauses({
            minorSectionEnabled: tpl.minorSectionEnabled,
            dobRequired: tpl.dobRequired,
            relationshipRequired: tpl.relationshipRequired,
            photoVideoReleaseEnabled: tpl.photoVideoReleaseEnabled,
            medicalAckEnabled: tpl.medicalAckEnabled,
            propertyDamageEnabled: tpl.propertyDamageEnabled,
            groupLeaderClauseEnabled: tpl.groupLeaderClauseEnabled,
            electronicConsentEnabled: tpl.electronicConsentEnabled,
          });
          setPhotoVideoText(tpl.photoVideoReleaseText ?? "");
          setMarketingEnabled(tpl.marketingConsentEnabled);
          setMarketingText(tpl.marketingConsentText ?? "");
          setMarketingHelper(tpl.marketingHelperText ?? "");
          setSelectedPackages(tpl.assignedPackageIds);
          setSelectedAttractions(tpl.assignedAttractionIds);
          setSelectedEvents(tpl.assignedEventIds);
        }
      })
      .catch((e) => {
        if (active)
          setLoadError(
            e instanceof Error ? e.message : "Failed to load template",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [editId, isEdit, isAdmin]);

  const toggleIn = (
    setter: React.Dispatch<React.SetStateAction<number[]>>,
    id: number,
  ) =>
    setter((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  /** Drop a merge tag in at the caret, the mobile take on the web's picker. */
  const insertToken = (key: string) => {
    const token = `{{${key}}}`;
    const { start, end } = bodySelection.current;
    const safeStart = Math.min(start, bodyText.length);
    const safeEnd = Math.min(Math.max(end, safeStart), bodyText.length);
    const next =
      bodyText.slice(0, safeStart) + token + bodyText.slice(safeEnd);
    setBodyText(next);
    const caret = safeStart + token.length;
    bodySelection.current = { start: caret, end: caret };
    if (errors.body) setErrors((e) => ({ ...e, body: undefined }));
    bodyRef.current?.focus();
  };

  /** Body with every {{tag}} swapped for its friendly [Label] (web parity). */
  const previewBody = useMemo(() => {
    let body = bodyText;
    Object.keys(tokens).forEach((key) => {
      const label = tokens[key] || key.replace(/_/g, " ");
      body = body.replace(
        new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g"),
        `[${label}]`,
      );
    });
    return body;
  }, [bodyText, tokens]);

  const statusLabel =
    STATUS_OPTIONS.find((o) => o.value === status)?.label ?? "Draft";
  const duplicateLabel =
    DUPLICATE_OPTIONS.find((o) => o.value === duplicateRule)?.label ?? "";
  const locationLabel =
    locationId == null
      ? "All locations (company-wide)"
      : (locations.find((l) => l.id === locationId)?.name ??
        `Location #${locationId}`);

  const submit = async () => {
    const nextErrors: typeof errors = {};
    if (!title.trim()) nextErrors.title = "Title is required.";
    if (!bodyText.trim()) nextErrors.body = "Waiver text is required.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    if (submitLock.current) return;
    submitLock.current = true;

    const token = getToken();
    if (!token) {
      Alert.alert("Not authenticated");
      submitLock.current = false;
      return;
    }

    const payload: TemplatePayload = {
      title: title.trim(),
      body_text: bodyText,
      internal_description: internalDescription.trim() || null,
      status,
      is_default: isDefault,
      location_id: locationId,
      validity_duration_days: validityDays.trim()
        ? Math.max(1, Number(validityDays))
        : null,
      max_minors: Math.max(0, Math.min(50, Number(maxMinors) || 0)),
      duplicate_rule: duplicateRule,
      reminder_eligible: reminderEligible,
      minor_section_enabled: clauses.minorSectionEnabled,
      dob_required: clauses.dobRequired,
      relationship_required: clauses.relationshipRequired,
      photo_video_release_enabled: clauses.photoVideoReleaseEnabled,
      photo_video_release_text: clauses.photoVideoReleaseEnabled
        ? photoVideoText.trim() || null
        : null,
      medical_ack_enabled: clauses.medicalAckEnabled,
      property_damage_enabled: clauses.propertyDamageEnabled,
      group_leader_clause_enabled: clauses.groupLeaderClauseEnabled,
      electronic_consent_enabled: clauses.electronicConsentEnabled,
      marketing_consent_enabled: marketingEnabled,
      marketing_consent_text: marketingEnabled
        ? marketingText.trim() || null
        : null,
      marketing_helper_text: marketingEnabled
        ? marketingHelper.trim() || null
        : null,
      assigned_package_ids: selectedPackages,
      assigned_attraction_ids: selectedAttractions,
      assigned_event_ids: selectedEvents,
    };

    setSubmitting(true);
    try {
      if (isEdit) await updateTemplate(token, editId!, payload);
      else await createTemplate(token, payload);
      markTemplatesStale();
      Alert.alert(isEdit ? "Template saved" : "Template created", undefined, [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert(
        isEdit ? "Could not update template" : "Could not create template",
        e instanceof Error ? e.message : "Please try again.",
      );
    } finally {
      setSubmitting(false);
      submitLock.current = false;
    }
  };

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header — title, the web's version note, and the kiosk launcher. */}
      <View className="bg-white dark:bg-neutral-900 pt-12 pb-4 px-5 w-full border-b border-gray-100 dark:border-neutral-800">
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Feather name="chevron-left" size={20} color={headerIcon} />
          </Pressable>
          <View className="flex-1">
            <Text className="text-gray-900 dark:text-white text-lg font-bold">
              {isEdit ? "Edit Waiver Template" : "New Waiver Template"}
            </Text>
            <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Editing the legal text creates a new version automatically.
            </Text>
          </View>
          {isEdit && loadedTemplate && (
            <Pressable
              onPress={() => setKioskOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Launch kiosk"
              className="flex-row items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-neutral-700 active:opacity-70"
            >
              <Feather name="tablet" size={14} color={PRIMARY} />
              <Text className="text-xs font-semibold text-[#0644C7]">
                {status === "active" ? "Launch Kiosk" : "Test Kiosk"}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={PRIMARY} />
        </View>
      ) : loadError ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-red-600 font-semibold text-center">
            {loadError}
          </Text>
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
            contentContainerStyle={{
              padding: 20,
              // Actions scroll with the form, so the safe area is cleared here.
              paddingBottom: insets.bottom + 32,
            }}
          >
            {/* Basics */}
            <Card>
              <InputField
                label="Title *"
                value={title}
                onChangeText={(t) => {
                  setTitle(t);
                  if (errors.title) setErrors((e) => ({ ...e, title: undefined }));
                }}
                placeholder="e.g. General Liability Waiver"
                error={errors.title}
                containerClassName="mb-4"
              />
              <InputField
                label="Internal description (staff only)"
                value={internalDescription}
                onChangeText={setInternalDescription}
                placeholder="Optional note for staff"
                containerClassName="mb-4"
              />

              <FieldLabel label="Status" />
              <SelectRow value={statusLabel} onPress={() => setSheet("status")} />

              <View className="mt-3">
                <CheckRow
                  label="Use as default (catch-all) waiver"
                  value={isDefault}
                  onToggle={() => setIsDefault((v) => !v)}
                />
              </View>

              {isAdmin && (
                <View className="mt-3">
                  <FieldLabel
                    label="Location"
                    note="(optional — leave blank for all locations)"
                  />
                  <SelectRow
                    value={locationLabel}
                    onPress={() => setSheet("location")}
                  />
                </View>
              )}

              {isManager && !!managerLocationName && (
                <View className="flex-row items-center gap-2 mt-3 rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800 px-3 py-2.5">
                  <Feather name="map-pin" size={14} color="#9CA3AF" />
                  <Text className="text-sm text-gray-500 dark:text-gray-400 flex-1">
                    This template will be assigned to{" "}
                    <Text className="font-medium text-gray-700 dark:text-gray-200">
                      {managerLocationName}
                    </Text>
                  </Text>
                </View>
              )}
            </Card>

            {/* Waiver text + merge-tag picker */}
            <Card>
              <CardTitle
                title="Waiver Text *"
                hint="Write the legal text, then tap a field below to drop it in — it fills in automatically when the waiver is signed."
                right={
                  <Pressable
                    onPress={() => setPreview((v) => !v)}
                    hitSlop={6}
                    accessibilityRole="button"
                    className="flex-row items-center gap-1"
                  >
                    <Feather name="eye" size={13} color="#6B7280" />
                    <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                      {preview ? "Edit" : "Preview"}
                    </Text>
                  </Pressable>
                }
              />

              {preview ? (
                <View
                  className="rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50/60 dark:bg-neutral-800 px-4 py-3"
                  style={{ minHeight: 240 }}
                >
                  <Text className="text-sm leading-5 text-gray-700 dark:text-gray-200">
                    {previewBody || (
                      <Text className="text-gray-400">
                        Nothing to preview yet.
                      </Text>
                    )}
                  </Text>
                </View>
              ) : (
                <TextArea
                  inputRef={bodyRef}
                  value={bodyText}
                  onChangeText={(t) => {
                    setBodyText(t);
                    if (errors.body) setErrors((e) => ({ ...e, body: undefined }));
                  }}
                  onSelectionChange={(e) => {
                    bodySelection.current = e.nativeEvent.selection;
                  }}
                  placeholder="Enter the full legal waiver text. Use the fields below to insert auto-filled details."
                  minHeight={240}
                  mono
                  error={!!errors.body}
                />
              )}
              {!!errors.body && (
                <Text className="mt-1.5 text-xs text-red-500">{errors.body}</Text>
              )}

              {/* Insert a field */}
              <View className="flex-row items-center gap-1.5 mt-4 mb-2">
                <Feather name="code" size={14} color={PRIMARY} />
                <Text className="text-xs font-bold text-gray-900 dark:text-white">
                  Insert a field
                </Text>
              </View>
              <View className="rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50/60 dark:bg-neutral-800 p-3">
                {Object.keys(tokens).length === 0 ? (
                  <Text className="text-xs text-gray-400 text-center py-4">
                    No fields available.
                  </Text>
                ) : (
                  <ScrollView style={{ maxHeight: 260 }} nestedScrollEnabled>
                    {TOKEN_GROUPS.map((group) => {
                      const items = group.keys.filter((k) => k in tokens);
                      if (items.length === 0) return null;
                      return (
                        <View key={group.name} className="mb-3">
                          <Text className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">
                            {group.name}
                          </Text>
                          {items.map((key) => (
                            <Pressable
                              key={key}
                              onPress={() => insertToken(key)}
                              disabled={preview}
                              accessibilityRole="button"
                              accessibilityLabel={`Insert ${tokens[key]}`}
                              className={`px-2 py-1.5 rounded-md ${
                                preview
                                  ? "opacity-40"
                                  : "active:bg-white dark:active:bg-neutral-900"
                              }`}
                            >
                              <Text className="text-sm text-gray-800 dark:text-gray-100">
                                {tokens[key]}
                              </Text>
                              <Text className="text-[11px] text-[#0644C7]">
                                {`{{${key}}}`}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
            </Card>

            {/* Rules */}
            <Card>
              <CardTitle title="Rules" />
              <InputField
                label="Validity (days)"
                value={validityDays}
                onChangeText={setValidityDays}
                placeholder="No expiry"
                keyboardType="number-pad"
                containerClassName="mb-4"
              />
              <InputField
                label="Max minors"
                value={maxMinors}
                onChangeText={setMaxMinors}
                placeholder="10"
                keyboardType="number-pad"
                containerClassName="mb-4"
              />
              <FieldLabel label="Duplicate rule" />
              <SelectRow
                value={duplicateLabel}
                onPress={() => setSheet("duplicate")}
              />
              <View className="mt-3">
                <CheckRow
                  label="Send a 24-hour reminder if incomplete"
                  value={reminderEligible}
                  onToggle={() => setReminderEligible((v) => !v)}
                />
              </View>
            </Card>

            {/* Clauses & Fields */}
            <Card>
              <CardTitle title="Clauses & Fields" />
              {CLAUSES.map((c) => (
                <CheckRow
                  key={c.key}
                  label={c.label}
                  hint={c.hint}
                  value={clauses[c.key]}
                  onToggle={() =>
                    setClauses((prev) => ({ ...prev, [c.key]: !prev[c.key] }))
                  }
                />
              ))}

              {clauses.photoVideoReleaseEnabled && (
                <View className="mt-4 pt-4 border-t border-gray-100 dark:border-neutral-800">
                  <FieldLabel label="Photo / video release text" />
                  <TextArea
                    value={photoVideoText}
                    onChangeText={setPhotoVideoText}
                    placeholder={PHOTO_RELEASE_PLACEHOLDER}
                    minHeight={90}
                  />
                  <Text className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                    Merge tags like {"{{company_name}}"}, {"{{location_name}}"},
                    and {"{{full_name}}"} autofill with the guest&apos;s real
                    data on the form. Leave blank to use the default text with
                    your company name filled in.
                  </Text>
                </View>
              )}
            </Card>

            {/* Marketing consent */}
            <Card>
              <CheckRow
                label="Marketing consent opt-in"
                value={marketingEnabled}
                onToggle={() => setMarketingEnabled((v) => !v)}
                bold
              />
              {marketingEnabled && (
                <View className="mt-3 pl-7">
                  <InputField
                    label="Consent text"
                    value={marketingText}
                    onChangeText={setMarketingText}
                    placeholder="Keep me updated on events, coupons, and offers."
                    containerClassName="mb-3"
                  />
                  <InputField
                    label="Helper text (fine print)"
                    value={marketingHelper}
                    onChangeText={setMarketingHelper}
                    placeholder="Optional supporting text"
                  />
                  <Text className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
                    The box is always unchecked by default — guests must opt in.
                  </Text>
                </View>
              )}
            </Card>

            {/* Assign to activities */}
            <Card>
              <CardTitle
                title="Assign to activities"
                hint="Activities already assigned to another template don't appear here — each can belong to only one waiver."
              />
              <AssignmentGroup
                label="Packages"
                activities={packages}
                selected={selectedPackages}
                onToggle={(id) => toggleIn(setSelectedPackages, id)}
                onSelectAll={() => setSelectedPackages(packages.map((p) => p.id))}
                onClear={() => setSelectedPackages([])}
              />
              <AssignmentGroup
                label="Attractions"
                activities={attractions}
                selected={selectedAttractions}
                onToggle={(id) => toggleIn(setSelectedAttractions, id)}
                onSelectAll={() =>
                  setSelectedAttractions(attractions.map((a) => a.id))
                }
                onClear={() => setSelectedAttractions([])}
              />
              <AssignmentGroup
                label="Events"
                activities={events}
                selected={selectedEvents}
                onToggle={(id) => toggleIn(setSelectedEvents, id)}
                onSelectAll={() => setSelectedEvents(events.map((e) => e.id))}
                onClear={() => setSelectedEvents([])}
              />
            </Card>

            {/* Actions — scrolling with the form, not pinned to the screen. */}
            <View className="flex-row justify-end gap-3">
              <Pressable
                onPress={() => router.back()}
                disabled={submitting}
                className="flex-1 items-center justify-center py-3.5 rounded-xl border border-gray-200 dark:border-neutral-700"
              >
                <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={submit}
                disabled={submitting}
                className="flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl bg-[#0644C7] active:opacity-90"
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Feather name="save" size={16} color="#FFFFFF" />
                    <Text className="text-sm font-semibold text-white">
                      Save Template
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* Status picker */}
      <BottomSheet
        visible={sheet === "status"}
        onClose={() => setSheet(null)}
        title="Template Status"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {STATUS_OPTIONS.map((option) => {
            const isSelected = status === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  setStatus(option.value);
                  setSheet(null);
                }}
                className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
                  isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                }`}
              >
                <Text
                  className={`text-base font-medium ${
                    isSelected
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  {option.label}
                </Text>
                {isSelected && (
                  <View className="w-6 h-6 rounded-full bg-blue-500 items-center justify-center">
                    <Feather name="check" size={14} color="#FFFFFF" />
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>

      {/* Duplicate rule picker */}
      <BottomSheet
        visible={sheet === "duplicate"}
        onClose={() => setSheet(null)}
        title="Duplicate Rule"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {DUPLICATE_OPTIONS.map((option) => {
            const isSelected = duplicateRule === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  setDuplicateRule(option.value);
                  setSheet(null);
                }}
                className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
                  isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                }`}
              >
                <Text
                  className={`text-base font-medium ${
                    isSelected
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  {option.label}
                </Text>
                {isSelected && (
                  <View className="w-6 h-6 rounded-full bg-blue-500 items-center justify-center">
                    <Feather name="check" size={14} color="#FFFFFF" />
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>

      {/* Location picker (company admins only, like the web) */}
      <BottomSheet
        visible={sheet === "location"}
        onClose={() => setSheet(null)}
        title="Template Location"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {[{ id: null as number | null, name: "All locations (company-wide)" }]
            .concat(locations.map((l) => ({ id: l.id as number | null, name: l.name })))
            .map((option) => {
              const isSelected = locationId === option.id;
              return (
                <Pressable
                  key={option.id ?? "all"}
                  onPress={() => {
                    setLocationId(option.id);
                    setSheet(null);
                  }}
                  className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
                    isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                  }`}
                >
                  <Text
                    className={`text-base font-medium flex-1 mr-3 ${
                      isSelected
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-gray-700 dark:text-gray-200"
                    }`}
                    numberOfLines={1}
                  >
                    {option.name}
                  </Text>
                  {isSelected && (
                    <View className="w-6 h-6 rounded-full bg-blue-500 items-center justify-center">
                      <Feather name="check" size={14} color="#FFFFFF" />
                    </View>
                  )}
                </Pressable>
              );
            })}
        </ScrollView>
      </BottomSheet>

      {/* Kiosk launcher (edit only) */}
      <LaunchKioskSheet
        template={loadedTemplate}
        visible={kioskOpen}
        onClose={() => setKioskOpen(false)}
      />
    </View>
  );
};

export default CreateTemplate;
