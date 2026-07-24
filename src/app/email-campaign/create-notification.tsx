import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
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

import {
  ComposerHeader,
  EmailSection,
  HeaderAction,
  LabeledInput,
  PRIMARY,
  VariablePanel,
} from "../../components/ui/EmailComposerKit";
import { SelectField, type SelectOption } from "../../components/ui/FormControls";
import { markEmailNotificationsStale } from "../../lib/emailStale";
import { getToken } from "../../lib/session";
import {
  createEmailNotification,
  fetchEmailTemplates,
  NOTIFICATION_TRIGGER_GROUPS,
  NOTIFICATION_VARIABLE_GROUPS,
  type EmailTemplateRow,
  type NotificationEntityType,
  type NotificationRecipientType,
} from "../../services/emailService";

const APPLY_TO_OPTIONS: SelectOption[] = [
  { label: "All (Packages & Attractions)", value: "all" },
  { label: "Packages Only", value: "package" },
  { label: "Attractions Only", value: "attraction" },
];

const TRIGGER_OPTIONS: SelectOption[] = NOTIFICATION_TRIGGER_GROUPS.flatMap((g) =>
  g.options.map((o) => ({ label: `${g.label.replace(" Events", "")} · ${o.label}`, value: o.value })),
);

const RECIPIENT_PILLS: { value: NotificationRecipientType; label: string }[] = [
  { value: "customer", label: "Customer" },
  { value: "staff", label: "Staff" },
  { value: "company_admin", label: "Company Admin" },
  { value: "location_manager", label: "Location Manager" },
  { value: "custom", label: "Custom Emails" },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CreateNotification = () => {
  const insets = useSafeAreaInsets();

  const [name, setName] = useState("");
  const [entityType, setEntityType] = useState<NotificationEntityType>("all");
  const [triggerType, setTriggerType] = useState("booking_created");
  const [active, setActive] = useState(true);

  const [recipients, setRecipients] = useState<NotificationRecipientType[]>(["customer"]);
  const [includeQr, setIncludeQr] = useState(false);
  const [customEmails, setCustomEmails] = useState<string[]>([]);
  const [emailDraft, setEmailDraft] = useState("");

  const [useTemplate, setUseTemplate] = useState(false);
  const [templates, setTemplates] = useState<EmailTemplateRow[]>([]);
  const [templateId, setTemplateId] = useState<number | null>(null);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const lastFocused = useRef<"subject" | "body">("body");

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetchEmailTemplates(token)
      .then((r) => setTemplates(r.rows))
      .catch(() => {});
  }, []);

  const insert = (token: string) => {
    if (lastFocused.current === "subject") setSubject((s) => s + token);
    else setBody((b) => b + token);
  };

  const toggleRecipient = (v: NotificationRecipientType) =>
    setRecipients((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
    );

  const addEmail = () => {
    const e = emailDraft.trim();
    if (!e) return;
    if (!EMAIL_RE.test(e)) return Alert.alert("Invalid email", "Enter a valid email address.");
    setCustomEmails((prev) => [...new Set([...prev, e])]);
    setEmailDraft("");
  };

  const templateOptions: SelectOption[] = useMemo(
    () => templates.map((t) => ({ label: t.name, value: t.id })),
    [templates],
  );

  const create = async () => {
    if (!name.trim()) return Alert.alert("Missing name", "Enter a notification name.");
    if (recipients.length === 0)
      return Alert.alert("No recipients", "Select at least one recipient.");
    if (useTemplate) {
      if (templateId == null)
        return Alert.alert("No template", "Choose a template or turn off 'Use existing template'.");
    } else if (!subject.trim() || !body.trim()) {
      return Alert.alert("Incomplete", "A subject and body are required.");
    }
    if (recipients.includes("custom") && customEmails.length === 0)
      return Alert.alert("Custom emails", "Add at least one custom email address.");

    const token = getToken();
    if (!token) return Alert.alert("Not signed in", "Please sign in again.");

    setSaving(true);
    try {
      await createEmailNotification(token, {
        name: name.trim(),
        triggerType,
        entityType,
        recipientTypes: recipients,
        customEmails: customEmails.length ? customEmails : undefined,
        subject: useTemplate ? "" : subject.trim(),
        body: useTemplate ? "" : body.trim(),
        includeQrCode: includeQr,
        isActive: active,
        emailTemplateId: useTemplate ? templateId : null,
      });
      markEmailNotificationsStale();
      router.back();
    } catch (e) {
      Alert.alert(
        "Failed",
        e instanceof Error ? e.message : "Could not create the notification.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <ComposerHeader
        icon="bell"
        title="Create Email Notification"
        subtitle="Set up automated email notifications for events"
        onBack={() => router.back()}
        actions={
          <HeaderAction
            label="Create Notification"
            icon="check"
            variant="primary"
            loading={saving}
            onPress={create}
          />
        }
      />

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
        >
          <EmailSection title="Notification Settings">
            <LabeledInput
              label="Notification Name"
              required
              value={name}
              onChangeText={setName}
              placeholder="e.g. Booking Confirmation Email"
            />
            <View className="flex-row gap-3 mt-3">
              <View className="flex-1">
                <SelectField
                  label="Apply To"
                  required
                  value={entityType}
                  options={APPLY_TO_OPTIONS}
                  onSelect={(v) => setEntityType(v as NotificationEntityType)}
                />
              </View>
              <View className="flex-1">
                <SelectField
                  label="Trigger Event"
                  required
                  value={triggerType}
                  options={TRIGGER_OPTIONS}
                  onSelect={(v) => setTriggerType(String(v))}
                />
              </View>
            </View>
            <Pressable
              onPress={() => setActive((v) => !v)}
              className="flex-row items-center gap-2.5 mt-3"
            >
              <View
                className={`w-5 h-5 rounded-md items-center justify-center ${
                  active ? "bg-[#0644C7]" : "border-2 border-gray-300 dark:border-neutral-600"
                }`}
              >
                {active && <Feather name="check" size={13} color="#FFFFFF" />}
              </View>
              <Text className="text-sm text-gray-800 dark:text-gray-100">
                Active (will send emails when triggered)
              </Text>
            </Pressable>
          </EmailSection>

          <EmailSection title="Recipients">
            <View className="flex-row flex-wrap gap-2">
              {RECIPIENT_PILLS.map((r) => {
                const on = recipients.includes(r.value);
                return (
                  <Pressable
                    key={r.value}
                    onPress={() => toggleRecipient(r.value)}
                    className={`px-3.5 py-2 rounded-lg border ${
                      on
                        ? "border-[#0644C7] bg-blue-50 dark:bg-blue-900/20"
                        : "border-gray-200 dark:border-neutral-700"
                    }`}
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        on ? "text-[#0644C7] dark:text-blue-300" : "text-gray-600 dark:text-gray-300"
                      }`}
                    >
                      {r.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {recipients.includes("custom") && (
              <View className="mt-3">
                <View className="flex-row items-center gap-2">
                  <View className="flex-1 rounded-xl px-3.5 py-2.5 border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800">
                    <TextInput
                      value={emailDraft}
                      onChangeText={setEmailDraft}
                      onSubmitEditing={addEmail}
                      placeholder="Enter email address..."
                      placeholderTextColor="#9CA3AF"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      className="text-sm text-gray-900 dark:text-white"
                      style={{ paddingVertical: 0 }}
                    />
                  </View>
                  <Pressable
                    onPress={addEmail}
                    className="flex-row items-center gap-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-neutral-700"
                  >
                    <Feather name="plus" size={14} color={PRIMARY} />
                    <Text className="text-sm font-semibold text-[#0644C7]">Add</Text>
                  </Pressable>
                </View>
                {customEmails.length > 0 && (
                  <View className="flex-row flex-wrap mt-2">
                    {customEmails.map((e) => (
                      <Pressable
                        key={e}
                        onPress={() => setCustomEmails((prev) => prev.filter((x) => x !== e))}
                        className="flex-row items-center gap-1 bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-full mr-2 mb-2"
                      >
                        <Text className="text-xs font-medium text-[#0644C7] dark:text-blue-300">{e}</Text>
                        <Feather name="x" size={12} color={PRIMARY} />
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            )}

            <View className="h-px bg-gray-100 dark:bg-neutral-800 my-3" />
            <Pressable
              onPress={() => setIncludeQr((v) => !v)}
              className="flex-row items-center gap-2.5"
            >
              <View
                className={`w-5 h-5 rounded-md items-center justify-center ${
                  includeQr ? "bg-[#0644C7]" : "border-2 border-gray-300 dark:border-neutral-600"
                }`}
              >
                {includeQr && <Feather name="check" size={13} color="#FFFFFF" />}
              </View>
              <Feather name="maximize" size={14} color="#6B7280" />
              <Text className="text-sm text-gray-800 dark:text-gray-100">
                Include QR code for check-in
              </Text>
            </Pressable>
          </EmailSection>

          <EmailSection
            title="Email Content"
            right={
              <Pressable
                onPress={() => setUseTemplate((v) => !v)}
                className="flex-row items-center gap-2"
              >
                <View
                  className={`w-4.5 h-4.5 rounded items-center justify-center ${
                    useTemplate ? "bg-[#0644C7]" : "border-2 border-gray-300 dark:border-neutral-600"
                  }`}
                  style={{ width: 18, height: 18 }}
                >
                  {useTemplate && <Feather name="check" size={11} color="#FFFFFF" />}
                </View>
                <Text className="text-xs font-medium text-gray-600 dark:text-gray-300">
                  Use Existing Template
                </Text>
              </Pressable>
            }
          >
            {useTemplate ? (
              <SelectField
                label="Template"
                placeholder={templates.length ? "Choose a template…" : "No templates available"}
                value={templateId}
                options={templateOptions}
                onSelect={(v) => setTemplateId(Number(v))}
              />
            ) : (
              <>
                <LabeledInput
                  label="Subject Line"
                  required
                  value={subject}
                  onChangeText={setSubject}
                  onFocus={() => (lastFocused.current = "subject")}
                  placeholder="e.g. Your booking has been confirmed!"
                  hint="You can use variables like {{ customer_name }}"
                />
                <View className="mt-3">
                  <LabeledInput
                    label="Email Body"
                    required
                    value={body}
                    onChangeText={setBody}
                    onFocus={() => (lastFocused.current = "body")}
                    placeholder="Write your email…  You can paste HTML or plain text."
                    multiline
                  />
                </View>
              </>
            )}
          </EmailSection>

          {!useTemplate && (
            <VariablePanel
              intro="Tap to insert variables replaced with actual data when emails are sent."
              groups={NOTIFICATION_VARIABLE_GROUPS}
              onInsert={insert}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

export default CreateNotification;
