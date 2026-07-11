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
import { InputField } from "../../components/ui/InputField";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import { markWaiversStale } from "../../lib/hooks/useWaivers";
import { getToken } from "../../lib/session";
import {
  assignWaiver,
  fetchTemplates,
  type WaiverTemplate,
} from "../../services/waiversService";

const PRIMARY = "#0644C7";

/** Local date as YYYY-MM-DD (backend `selected_date`). */
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

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return ymd(d);
}

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

const CreateWaiver = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  const [templates, setTemplates] = useState<WaiverTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState<string | null>(null);

  const [templateId, setTemplateId] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState(ymd(new Date()));
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [activityName, setActivityName] = useState("");

  const [templateSheet, setTemplateSheet] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ template?: string; contact?: string }>({});
  const submitLock = useRef(false);

  // Load active templates to assign from (mirrors the web AssignWaiverModal).
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
    if (!email.trim() && !phone.trim())
      nextErrors.contact = "Enter a guardian email or phone number.";
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
      await assignWaiver(token, {
        waiverTemplateId: templateId!,
        selectedDate,
        adultEmail: email,
        adultPhone: phone,
        activityName,
      });
      markWaiversStale();
      Alert.alert("Waiver assigned", "The signing link has been sent.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert(
        "Could not assign waiver",
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
            Assign Waiver
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
          <Section icon="file-text" title="Waiver Template">
            <Text className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
              Template
            </Text>
            <Pressable
              onPress={() => setTemplateSheet(true)}
              disabled={templatesLoading}
              className={`h-14 flex-row items-center justify-between rounded-full border bg-white dark:bg-neutral-900 px-5 ${
                errors.template
                  ? "border-red-400"
                  : "border-gray-200 dark:border-neutral-700"
              }`}
            >
              <Text
                className={`text-base flex-1 ${
                  selectedTemplate
                    ? "text-gray-900 dark:text-white"
                    : "text-gray-400"
                }`}
                numberOfLines={1}
              >
                {templatesLoading
                  ? "Loading templates..."
                  : selectedTemplate
                    ? selectedTemplate.title
                    : "Select a template"}
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

            {/* Visit date */}
            <Text className="mt-4 mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
              Visit date
            </Text>
            <View className="flex-row items-center gap-3">
              <Pressable
                onPress={() => setSelectedDate((d) => shiftDate(d, -1))}
                className="h-12 w-12 items-center justify-center rounded-full border border-gray-200 dark:border-neutral-700"
              >
                <Feather name="chevron-left" size={18} color={headerIcon} />
              </Pressable>
              <View className="flex-1 h-12 items-center justify-center rounded-full bg-gray-50 dark:bg-neutral-800">
                <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                  {prettyDate(selectedDate)}
                </Text>
              </View>
              <Pressable
                onPress={() => setSelectedDate((d) => shiftDate(d, 1))}
                className="h-12 w-12 items-center justify-center rounded-full border border-gray-200 dark:border-neutral-700"
              >
                <Feather name="chevron-right" size={18} color={headerIcon} />
              </Pressable>
            </View>
            <Pressable
              onPress={() => setSelectedDate(ymd(new Date()))}
              className="mt-2 self-start"
            >
              <Text className="text-xs font-medium text-blue-600 dark:text-blue-400">
                Reset to today
              </Text>
            </Pressable>
          </Section>

          <Section icon="user" title="Guardian Contact">
            <Text className="mb-3 text-xs text-gray-500 dark:text-gray-400">
              Enter an email or phone number — the signing link is sent there.
            </Text>
            <InputField
              label="Email"
              icon="mail"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                if (errors.contact) setErrors((e) => ({ ...e, contact: undefined }));
              }}
              placeholder="guardian@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              containerClassName="mb-4"
            />
            <InputField
              label="Phone"
              icon="phone"
              value={phone}
              onChangeText={(t) => {
                setPhone(t);
                if (errors.contact) setErrors((e) => ({ ...e, contact: undefined }));
              }}
              placeholder="(555) 123-4567"
              keyboardType="phone-pad"
              error={errors.contact}
            />
          </Section>

          <Section icon="tag" title="Activity (optional)">
            <InputField
              label="Activity name"
              icon="tag"
              value={activityName}
              onChangeText={setActivityName}
              placeholder="e.g. Trampoline session"
            />
          </Section>
        </ScrollView>

        {/* Sticky footer */}
        <View
          className="bg-white dark:bg-neutral-900 border-t border-gray-100 dark:border-neutral-800 px-5 pt-4"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          <Text className="text-xs text-gray-400 dark:text-gray-500 text-center mb-3">
            A waiver link will be sent by email and/or SMS.
          </Text>
          <View className="flex-row items-center gap-3">
            <Pressable
              onPress={() => router.back()}
              disabled={submitting}
              className="flex-1 h-14 items-center justify-center rounded-full border border-gray-200 dark:border-neutral-700 active:opacity-80"
            >
              <Text className="text-base font-semibold text-gray-700 dark:text-gray-200">
                Cancel
              </Text>
            </Pressable>
            <View className="flex-1">
              <PrimaryButton
                label="Assign & Send"
                onPress={submit}
                loading={submitting}
                disabled={templatesLoading}
              />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>

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

export default CreateWaiver;
