import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "../../components/ui/BottomSheet";
import { DatePickerSheet } from "../../components/ui/DatePickerSheet";
import { EmailSuggestions } from "../../components/ui/EmailSuggestions";
import { InputField } from "../../components/ui/InputField";
import { CONTROL_RADIUS, PrimaryButton } from "../../components/ui/PrimaryButton";
import { markGroupInvitesStale } from "../../lib/hooks/useGroupInvites";
import { getToken } from "../../lib/session";
import {
  createGroupInvite,
  fetchTemplates,
  type WaiverTemplate,
} from "../../services/waiversService";

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function prettyDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** The visit date can be in the past here, as on the web's plain date input. */
const EARLIEST_SELECTABLE = "2000-01-01";

/** Field label, matching the web modal's `Template *` / `Email` labels. */
const FieldLabel = ({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <Text
    className={`mb-2 text-sm font-medium text-gray-700 dark:text-gray-200 ${className}`}
  >
    {children}
  </Text>
);

const CreateGroupInvite = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  const [templates, setTemplates] = useState<WaiverTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState<string | null>(null);

  const [templateId, setTemplateId] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState(ymd(new Date()));
  const [chaperoneName, setChaperoneName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [allowShareable, setAllowShareable] = useState(false);

  const [templateSheet, setTemplateSheet] = useState(false);
  const [datePicker, setDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{
    template?: string;
    name?: string;
    contact?: string;
  }>({});
  const submitLock = useRef(false);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const token = getToken();
    if (!token) {
      setTemplatesError("Not authenticated");
      setTemplatesLoading(false);
      return;
    }
    fetchTemplates(token, { status: "active" }, controller.signal)
      .then((list) => {
        if (!active) return;
        setTemplates(list);
        if (list.length === 1) setTemplateId(list[0].id);
      })
      .catch((e) => {
        if (active)
          setTemplatesError(
            e instanceof Error ? e.message : "Failed to load templates",
          );
      })
      .finally(() => {
        if (active) setTemplatesLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const selectedTemplate = templates.find((t) => t.id === templateId) ?? null;

  const submit = async () => {
    const nextErrors: typeof errors = {};
    if (templateId == null) nextErrors.template = "Select a waiver template.";
    if (!chaperoneName.trim()) nextErrors.name = "Chaperone name is required.";
    if (!email.trim() && !phone.trim())
      nextErrors.contact = "Enter a chaperone email or phone number.";
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

    setSubmitting(true);
    try {
      await createGroupInvite(token, {
        waiverTemplateId: templateId!,
        selectedDate,
        chaperoneName,
        chaperoneEmail: email,
        chaperonePhone: phone,
        allowShareableLink: allowShareable,
      });
      markGroupInvitesStale();
      Alert.alert("Invite sent", "The chaperone has been notified.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert(
        "Could not create invite",
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
            New Group Invite
          </Text>
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
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        >
          {/* One card, laid out like the web's New Group Invite modal:
              Template · Visit date · Chaperone name · Email | Phone · the
              shareable-link checkbox. */}
          <View className="bg-white dark:bg-neutral-900 rounded-2xl p-5 shadow-sm">
            <FieldLabel>Template *</FieldLabel>
            <Pressable
              onPress={() => setTemplateSheet(true)}
              disabled={templatesLoading}
              className={`h-14 flex-row items-center justify-between rounded-lg border bg-white dark:bg-neutral-900 px-5 ${
                errors.template
                  ? "border-red-400"
                  : "border-gray-200 dark:border-neutral-700"
              }`}
            >
              <Text
                className={`text-base flex-1 ${
                  selectedTemplate ? "text-gray-900 dark:text-white" : "text-gray-400"
                }`}
                numberOfLines={1}
              >
                {templatesLoading
                  ? "Loading templates…"
                  : selectedTemplate
                    ? selectedTemplate.title
                    : "Select a template…"}
              </Text>
              <Feather name="chevron-down" size={18} color="#9CA3AF" />
            </Pressable>
            {errors.template && (
              <Text className="ml-4 mt-1.5 text-xs text-red-500">
                {errors.template}
              </Text>
            )}
            {templatesError && (
              <Text className="ml-4 mt-1.5 text-xs text-red-500">
                {templatesError}
              </Text>
            )}

            <FieldLabel className="mt-4">Visit date *</FieldLabel>
            <Pressable
              onPress={() => setDatePicker(true)}
              accessibilityRole="button"
              accessibilityLabel="Choose the visit date"
              className="h-14 flex-row items-center justify-between rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-5"
            >
              <Text className="flex-1 text-base text-gray-900 dark:text-white">
                {prettyDate(selectedDate)}
              </Text>
              <Feather name="calendar" size={18} color="#9CA3AF" />
            </Pressable>

            <InputField
              label="Chaperone name *"
              value={chaperoneName}
              onChangeText={(t) => {
                setChaperoneName(t);
                if (errors.name) setErrors((e) => ({ ...e, name: undefined }));
              }}
              placeholder="e.g. Coach Carter"
              error={errors.name}
              containerClassName="mt-4"
            />

            {/* Email and Phone share a row, as in the web modal's 2-col grid. */}
            <View className="flex-row gap-3 mt-4">
              <InputField
                label="Email"
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  if (errors.contact)
                    setErrors((e) => ({ ...e, contact: undefined }));
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                containerClassName="flex-1"
              />
              <InputField
                label="Phone"
                value={phone}
                onChangeText={(t) => {
                  setPhone(t);
                  if (errors.contact)
                    setErrors((e) => ({ ...e, contact: undefined }));
                }}
                keyboardType="phone-pad"
                containerClassName="flex-1"
              />
            </View>
            {/* Below the row for the same reason as the error line: a
                half-width column is too narrow for the chips. */}
            <EmailSuggestions
              value={email}
              onSelect={(next) => {
                setEmail(next);
                if (errors.contact)
                  setErrors((e) => ({ ...e, contact: undefined }));
              }}
            />
            {/* Below the row, not under one field — "add an email or phone"
                belongs to the pair, and wraps badly in a half-width column. */}
            {errors.contact && (
              <Text className="ml-1 mt-1.5 text-xs text-red-500">
                {errors.contact}
              </Text>
            )}

            <Pressable
              onPress={() => setAllowShareable((v) => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: allowShareable }}
              className="flex-row items-center gap-3 mt-5"
            >
              <View
                className={`w-5 h-5 rounded items-center justify-center border ${
                  allowShareable
                    ? "bg-[#0644C7] border-[#0644C7]"
                    : "border-gray-300 dark:border-neutral-600"
                }`}
              >
                {allowShareable && (
                  <Feather name="check" size={13} color="#FFFFFF" />
                )}
              </View>
              <Text className="flex-1 text-sm text-gray-700 dark:text-gray-200">
                Allow a shareable link the chaperone can forward
              </Text>
            </Pressable>
          </View>
        </ScrollView>

        <View
          className="bg-white dark:bg-neutral-900 border-t border-gray-100 dark:border-neutral-800 px-5 pt-4"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          {/* Cancel + Create & Notify, as in the web modal's footer. The radius
              is an inline style, not a class: NativeWind resolves conflicting
              utilities by CSS order, so PrimaryButton's `rounded-full` would
              win over a class override here (see CONTROL_RADIUS). */}
          <View className="flex-row gap-3">
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              className="flex-1 h-14 items-center justify-center border border-gray-300 dark:border-neutral-700 active:opacity-70"
              style={{ borderRadius: CONTROL_RADIUS }}
            >
              <Text className="text-base font-semibold text-gray-700 dark:text-gray-200">
                Cancel
              </Text>
            </Pressable>
            <View className="flex-1">
              <PrimaryButton
                label="Create & Notify"
                onPress={submit}
                loading={submitting}
                disabled={templatesLoading}
                style={{ borderRadius: CONTROL_RADIUS }}
              />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Visit date calendar — past dates stay selectable, like the web's plain
          date input (the backend only requires a valid date). */}
      <DatePickerSheet
        visible={datePicker}
        value={selectedDate}
        minDate={EARLIEST_SELECTABLE}
        title="Visit date"
        onClose={() => setDatePicker(false)}
        onSelect={(date) => {
          setSelectedDate(date);
          setDatePicker(false);
        }}
      />

      {/* Template picker */}
      <BottomSheet
        visible={templateSheet}
        onClose={() => setTemplateSheet(false)}
        title="Select Template"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {templates.length === 0 ? (
            <View className="px-4 py-8 items-center">
              <Text className="text-gray-500 dark:text-gray-400 text-sm text-center">
                No active templates. Create one under Templates first.
              </Text>
            </View>
          ) : (
            templates.map((t) => {
              const isSelected = templateId === t.id;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => {
                    setTemplateId(t.id);
                    setTemplateSheet(false);
                    setErrors((e) => ({ ...e, template: undefined }));
                  }}
                  className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
                    isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                  }`}
                >
                  <Text
                    className={`text-base font-medium flex-1 mr-2 ${
                      isSelected
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-gray-700 dark:text-gray-200"
                    }`}
                    numberOfLines={1}
                  >
                    {t.title}
                  </Text>
                  {isSelected && (
                    <View className="w-6 h-6 rounded-full bg-blue-500 items-center justify-center">
                      <Feather name="check" size={14} color="#FFFFFF" />
                    </View>
                  )}
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </BottomSheet>
    </View>
  );
};

export default CreateGroupInvite;
