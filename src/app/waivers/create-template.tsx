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
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "../../components/ui/BottomSheet";
import { InputField } from "../../components/ui/InputField";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import { markTemplatesStale } from "../../lib/hooks/useWaiverTemplates";
import { getToken } from "../../lib/session";
import {
  createTemplate,
  fetchAvailableActivities,
  fetchTemplateDetail,
  updateTemplate,
  type ActivityType,
  type AvailableActivity,
  type DuplicateRule,
  type TemplatePayload,
  type TemplateStatus,
} from "../../services/waiversService";

const PRIMARY = "#0644C7";

const STATUS_OPTIONS: { label: string; value: TemplateStatus }[] = [
  { label: "Draft", value: "draft" },
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
  { label: "Archived", value: "archived" },
];

const DUPLICATE_OPTIONS: { label: string; value: DuplicateRule }[] = [
  { label: "Manager-assigned only", value: "manager_only" },
  { label: "Block duplicates", value: "none" },
  { label: "Allow duplicates", value: "allow" },
];

// The eight clause toggles from the web WaiverBuilder "Clauses & Fields" section.
const CLAUSES: { key: keyof ClauseState; label: string }[] = [
  { key: "minorSectionEnabled", label: "Enable minor section" },
  { key: "dobRequired", label: "Require date of birth" },
  { key: "relationshipRequired", label: "Require relationship" },
  { key: "photoVideoReleaseEnabled", label: "Photo / video release" },
  { key: "medicalAckEnabled", label: "Medical acknowledgement" },
  { key: "propertyDamageEnabled", label: "Property damage clause" },
  { key: "groupLeaderClauseEnabled", label: "Group leader clause" },
  { key: "electronicConsentEnabled", label: "Electronic signature consent" },
];

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

const Section = ({
  icon,
  title,
  children,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  children: React.ReactNode;
}) => (
  <View className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mb-4 shadow-sm">
    <View className="flex-row items-center gap-2 mb-4">
      <Feather name={icon} size={16} color={PRIMARY} />
      <Text className="text-base font-bold text-gray-900 dark:text-white">
        {title}
      </Text>
    </View>
    {children}
  </View>
);

const ToggleRow = ({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) => (
  <View className="flex-row items-center justify-between py-2.5">
    <Text className="text-sm text-gray-700 dark:text-gray-200 flex-1 mr-3">
      {label}
    </Text>
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: "#D1D5DB", true: PRIMARY }}
      thumbColor="#FFFFFF"
      ios_backgroundColor="#D1D5DB"
    />
  </View>
);

const ActivityGroup = ({
  title,
  activities,
  selected,
  onToggle,
}: {
  title: string;
  activities: AvailableActivity[];
  selected: number[];
  onToggle: (id: number) => void;
}) => {
  if (activities.length === 0) return null;
  return (
    <View className="mb-3">
      <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">
        {title}
      </Text>
      {activities.map((a) => {
        const isSelected = selected.includes(a.id);
        return (
          <Pressable
            key={a.id}
            onPress={() => onToggle(a.id)}
            className="flex-row items-center gap-3 py-2.5"
          >
            <View
              className={`w-6 h-6 rounded-md items-center justify-center border ${
                isSelected
                  ? "bg-[#0644C7] border-[#0644C7]"
                  : "border-gray-300 dark:border-neutral-600"
              }`}
            >
              {isSelected && <Feather name="check" size={14} color="#FFFFFF" />}
            </View>
            <Text className="text-sm text-gray-700 dark:text-gray-200 flex-1" numberOfLines={1}>
              {a.name}
              {a.locationName ? ` · ${a.locationName}` : ""}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const CreateTemplate = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  const params = useLocalSearchParams<{ id?: string }>();
  const editId = params.id ? Number(params.id) : null;
  const isEdit = editId != null && !Number.isNaN(editId);

  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [internalDescription, setInternalDescription] = useState("");
  const [status, setStatus] = useState<TemplateStatus>("draft");
  const [isDefault, setIsDefault] = useState(false);
  const [bodyText, setBodyText] = useState("");
  const [validityDays, setValidityDays] = useState("");
  const [maxMinors, setMaxMinors] = useState("10");
  const [duplicateRule, setDuplicateRule] = useState<DuplicateRule>("manager_only");
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
  const [marketingEnabled, setMarketingEnabled] = useState(false);
  const [marketingText, setMarketingText] = useState("");
  const [marketingHelper, setMarketingHelper] = useState("");

  const [packages, setPackages] = useState<AvailableActivity[]>([]);
  const [attractions, setAttractions] = useState<AvailableActivity[]>([]);
  const [events, setEvents] = useState<AvailableActivity[]>([]);
  const [selectedPackages, setSelectedPackages] = useState<number[]>([]);
  const [selectedAttractions, setSelectedAttractions] = useState<number[]>([]);
  const [selectedEvents, setSelectedEvents] = useState<number[]>([]);

  const [sheet, setSheet] = useState<null | "status" | "duplicate">(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; body?: string }>({});
  const submitLock = useRef(false);

  // Load available activities (+ existing template on edit).
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
    ])
      .then(([tpl, pkgs, attrs, evts]) => {
        if (!active) return;
        setPackages(pkgs as AvailableActivity[]);
        setAttractions(attrs as AvailableActivity[]);
        setEvents(evts as AvailableActivity[]);
        if (tpl) {
          setTitle(tpl.title);
          setInternalDescription(tpl.internalDescription ?? "");
          setStatus(tpl.status);
          setIsDefault(tpl.isDefault);
          setBodyText(tpl.bodyText);
          setValidityDays(
            tpl.validityDurationDays != null ? String(tpl.validityDurationDays) : "",
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
          setLoadError(e instanceof Error ? e.message : "Failed to load template");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [editId, isEdit]);

  const toggleIn = (
    setter: React.Dispatch<React.SetStateAction<number[]>>,
    id: number,
  ) =>
    setter((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const statusLabel =
    STATUS_OPTIONS.find((o) => o.value === status)?.label ?? "Draft";
  const duplicateLabel =
    DUPLICATE_OPTIONS.find((o) => o.value === duplicateRule)?.label ?? "";

  const hasActivities = useMemo(
    () => packages.length + attractions.length + events.length > 0,
    [packages, attractions, events],
  );

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
      medical_ack_enabled: clauses.medicalAckEnabled,
      property_damage_enabled: clauses.propertyDamageEnabled,
      group_leader_clause_enabled: clauses.groupLeaderClauseEnabled,
      electronic_consent_enabled: clauses.electronicConsentEnabled,
      marketing_consent_enabled: marketingEnabled,
      marketing_consent_text: marketingEnabled ? marketingText.trim() || null : null,
      marketing_helper_text: marketingEnabled ? marketingHelper.trim() || null : null,
      assigned_package_ids: selectedPackages,
      assigned_attraction_ids: selectedAttractions,
      assigned_event_ids: selectedEvents,
    };

    setSubmitting(true);
    try {
      if (isEdit) await updateTemplate(token, editId!, payload);
      else await createTemplate(token, payload);
      markTemplatesStale();
      Alert.alert(isEdit ? "Template updated" : "Template created", undefined, [
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
      {/* Header */}
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
          <Text className="text-gray-900 dark:text-white text-lg font-bold">
            {isEdit ? "Edit Template" : "New Template"}
          </Text>
          <View style={{ width: 36 }} />
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={PRIMARY} />
        </View>
      ) : loadError ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-red-600 font-semibold text-center">{loadError}</Text>
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
            contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          >
            {/* Basics */}
            <Section icon="info" title="Basics">
              <InputField
                label="Title"
                icon="type"
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
                icon="file-text"
                value={internalDescription}
                onChangeText={setInternalDescription}
                placeholder="Optional note for staff"
                containerClassName="mb-4"
              />
              <Text className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                Status
              </Text>
              <Pressable
                onPress={() => setSheet("status")}
                className="h-14 flex-row items-center justify-between rounded-full border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-5 mb-4"
              >
                <Text className="text-base text-gray-900 dark:text-white">
                  {statusLabel}
                </Text>
                <Feather name="chevron-down" size={18} color="#9CA3AF" />
              </Pressable>
              <ToggleRow
                label="Use as default catch-all template"
                value={isDefault}
                onValueChange={setIsDefault}
              />
            </Section>

            {/* Waiver text */}
            <Section icon="file-text" title="Waiver Text">
              <View
                className={`rounded-2xl border bg-white dark:bg-neutral-900 px-4 py-3 ${
                  errors.body ? "border-red-400" : "border-gray-200 dark:border-neutral-700"
                }`}
              >
                <TextInput
                  value={bodyText}
                  onChangeText={(t) => {
                    setBodyText(t);
                    if (errors.body) setErrors((e) => ({ ...e, body: undefined }));
                  }}
                  placeholder="Enter the full legal waiver text. Merge tags like {{full_name}} are supported."
                  placeholderTextColor="#9CA3AF"
                  multiline
                  textAlignVertical="top"
                  className="text-sm text-gray-900 dark:text-white min-h-[160px]"
                />
              </View>
              {errors.body && (
                <Text className="ml-4 mt-1.5 text-xs text-red-500">{errors.body}</Text>
              )}
            </Section>

            {/* Rules */}
            <Section icon="sliders" title="Rules">
              <InputField
                label="Validity (days, blank = never expires)"
                icon="clock"
                value={validityDays}
                onChangeText={setValidityDays}
                placeholder="e.g. 365"
                keyboardType="number-pad"
                containerClassName="mb-4"
              />
              <InputField
                label="Max minors per waiver"
                icon="users"
                value={maxMinors}
                onChangeText={setMaxMinors}
                placeholder="10"
                keyboardType="number-pad"
                containerClassName="mb-4"
              />
              <Text className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                Duplicate rule
              </Text>
              <Pressable
                onPress={() => setSheet("duplicate")}
                className="h-14 flex-row items-center justify-between rounded-full border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-5 mb-2"
              >
                <Text className="text-base text-gray-900 dark:text-white">
                  {duplicateLabel}
                </Text>
                <Feather name="chevron-down" size={18} color="#9CA3AF" />
              </Pressable>
              <ToggleRow
                label="Send a 24-hour reminder if incomplete"
                value={reminderEligible}
                onValueChange={setReminderEligible}
              />
            </Section>

            {/* Clauses */}
            <Section icon="check-square" title="Clauses & Fields">
              {CLAUSES.map((c) => (
                <ToggleRow
                  key={c.key}
                  label={c.label}
                  value={clauses[c.key]}
                  onValueChange={(v) => setClauses((prev) => ({ ...prev, [c.key]: v }))}
                />
              ))}
            </Section>

            {/* Marketing */}
            <Section icon="mail" title="Marketing Consent">
              <ToggleRow
                label="Collect marketing consent"
                value={marketingEnabled}
                onValueChange={setMarketingEnabled}
              />
              {marketingEnabled && (
                <View className="mt-3">
                  <InputField
                    label="Consent text"
                    icon="message-square"
                    value={marketingText}
                    onChangeText={setMarketingText}
                    placeholder="I agree to receive marketing emails"
                    containerClassName="mb-4"
                  />
                  <InputField
                    label="Helper text"
                    icon="help-circle"
                    value={marketingHelper}
                    onChangeText={setMarketingHelper}
                    placeholder="Optional supporting text"
                  />
                </View>
              )}
            </Section>

            {/* Assign to activities */}
            <Section icon="link" title="Assign to Activities">
              {hasActivities ? (
                <>
                  <Text className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                    Each activity can belong to only one template. Items assigned
                    elsewhere are not shown.
                  </Text>
                  <ActivityGroup
                    title="Packages"
                    activities={packages}
                    selected={selectedPackages}
                    onToggle={(id) => toggleIn(setSelectedPackages, id)}
                  />
                  <ActivityGroup
                    title="Attractions"
                    activities={attractions}
                    selected={selectedAttractions}
                    onToggle={(id) => toggleIn(setSelectedAttractions, id)}
                  />
                  <ActivityGroup
                    title="Events"
                    activities={events}
                    selected={selectedEvents}
                    onToggle={(id) => toggleIn(setSelectedEvents, id)}
                  />
                </>
              ) : (
                <Text className="text-sm text-gray-500 dark:text-gray-400">
                  No unassigned activities available.
                </Text>
              )}
            </Section>
          </ScrollView>

          {/* Sticky footer */}
          <View
            className="bg-white dark:bg-neutral-900 border-t border-gray-100 dark:border-neutral-800 px-5 pt-4"
            style={{ paddingBottom: insets.bottom + 12 }}
          >
            <PrimaryButton
              label={isEdit ? "Save Changes" : "Create Template"}
              onPress={submit}
              loading={submitting}
            />
          </View>
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
    </View>
  );
};

export default CreateTemplate;
