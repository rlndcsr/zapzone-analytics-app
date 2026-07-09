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
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "../../components/ui/BottomSheet";
import { InputField } from "../../components/ui/InputField";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import { markGroupInvitesStale } from "../../lib/hooks/useGroupInvites";
import { getToken } from "../../lib/session";
import {
  createGroupInvite,
  fetchTemplates,
  type WaiverTemplate,
} from "../../services/waiversService";

const PRIMARY = "#0644C7";

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
          <Section icon="file-text" title="Waiver & Date">
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
                  selectedTemplate ? "text-gray-900 dark:text-white" : "text-gray-400"
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

          <Section icon="user" title="Chaperone">
            <InputField
              label="Name"
              icon="user"
              value={chaperoneName}
              onChangeText={(t) => {
                setChaperoneName(t);
                if (errors.name) setErrors((e) => ({ ...e, name: undefined }));
              }}
              placeholder="Chaperone full name"
              error={errors.name}
              containerClassName="mb-4"
            />
            <InputField
              label="Email"
              icon="mail"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                if (errors.contact) setErrors((e) => ({ ...e, contact: undefined }));
              }}
              placeholder="chaperone@email.com"
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

          <Section icon="link" title="Sharing">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm text-gray-700 dark:text-gray-200 flex-1 mr-3">
                Allow a shareable link the chaperone can forward
              </Text>
              <Switch
                value={allowShareable}
                onValueChange={setAllowShareable}
                trackColor={{ false: "#D1D5DB", true: PRIMARY }}
                thumbColor="#FFFFFF"
                ios_backgroundColor="#D1D5DB"
              />
            </View>
          </Section>
        </ScrollView>

        <View
          className="bg-white dark:bg-neutral-900 border-t border-gray-100 dark:border-neutral-800 px-5 pt-4"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          <PrimaryButton
            label="Send Invite"
            onPress={submit}
            loading={submitting}
            disabled={templatesLoading}
          />
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

export default CreateGroupInvite;
