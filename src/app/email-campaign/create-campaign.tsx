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
import { markEmailCampaignsStale } from "../../lib/emailStale";
import { getToken } from "../../lib/session";
import {
  createEmailCampaign,
  fetchEmailTemplateVariables,
  type CampaignRecipientType,
  type EmailVariableGroups,
} from "../../services/emailService";

const RECIPIENT_CARDS: {
  value: CampaignRecipientType;
  label: string;
  desc: string;
  icon: React.ComponentProps<typeof Feather>["name"];
}[] = [
  { value: "customers", label: "Customers", desc: "All active customers", icon: "users" },
  { value: "attendants", label: "Attendants", desc: "Staff members at location", icon: "user-check" },
  { value: "company_admin", label: "Company Admins", desc: "Company administrators", icon: "briefcase" },
  { value: "location_managers", label: "Location Managers", desc: "Location managers", icon: "map-pin" },
];

const TIPS = [
  "Always send a test email before sending to all recipients",
  "Use variables to personalize your emails",
  "Keep your subject line clear and engaging",
  "Preview your email to see how it looks",
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CreateCampaign = () => {
  const insets = useSafeAreaInsets();

  const [name, setName] = useState("");
  const [recipients, setRecipients] = useState<CampaignRecipientType[]>([]);
  const [customEmails, setCustomEmails] = useState<string[]>([]);
  const [emailDraft, setEmailDraft] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [vars, setVars] = useState<EmailVariableGroups | null>(null);
  const [saving, setSaving] = useState<null | "draft" | "send">(null);

  const lastFocused = useRef<"subject" | "body">("body");

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetchEmailTemplateVariables(token)
      .then(setVars)
      .catch(() => {});
  }, []);

  const insert = (token: string) => {
    if (lastFocused.current === "subject") setSubject((s) => s + token);
    else setBody((b) => b + token);
  };

  const toggleRecipient = (v: CampaignRecipientType) =>
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

  const variableGroups = useMemo(
    () => [
      { title: "Default Variables", vars: vars?.default ?? [] },
      { title: "Customer Variables", vars: vars?.customer ?? [] },
      { title: "User Variables", vars: vars?.user ?? [] },
    ],
    [vars],
  );

  const save = async (sendNow: boolean) => {
    if (!name.trim()) return Alert.alert("Missing name", "Enter a campaign name.");
    if (recipients.length === 0 && customEmails.length === 0)
      return Alert.alert("No recipients", "Select at least one recipient group or add a custom email.");
    if (!subject.trim() || !body.trim())
      return Alert.alert("Incomplete", "A subject and body are required.");
    const token = getToken();
    if (!token) return Alert.alert("Not signed in", "Please sign in again.");

    setSaving(sendNow ? "send" : "draft");
    try {
      const recipientTypes = [...recipients];
      if (customEmails.length > 0 && !recipientTypes.includes("custom"))
        recipientTypes.push("custom");
      await createEmailCampaign(token, {
        name: name.trim(),
        subject: subject.trim(),
        body: body.trim(),
        recipientTypes,
        customEmails: customEmails.length ? customEmails : undefined,
        sendNow,
      });
      markEmailCampaignsStale();
      router.back();
    } catch (e) {
      Alert.alert(
        "Failed",
        e instanceof Error ? e.message : "Could not create the campaign.",
      );
    } finally {
      setSaving(null);
    }
  };

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <ComposerHeader
        icon="send"
        title="Create Email Campaign"
        subtitle="Send bulk emails to selected recipients"
        onBack={() => router.back()}
        actions={
          <>
            <HeaderAction
              label="Save Draft"
              icon="save"
              loading={saving === "draft"}
              disabled={saving !== null}
              onPress={() => save(false)}
            />
            <HeaderAction
              label="Send Campaign"
              icon="send"
              variant="primary"
              loading={saving === "send"}
              disabled={saving !== null}
              onPress={() =>
                Alert.alert(
                  "Send campaign?",
                  "This sends the email to all selected recipients now.",
                  [
                    { text: "Cancel", style: "cancel" },
                    { text: "Send", onPress: () => save(true) },
                  ],
                )
              }
            />
          </>
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
          <EmailSection title="Campaign Information">
            <LabeledInput
              label="Campaign Name"
              required
              value={name}
              onChangeText={setName}
              placeholder="e.g. January Newsletter"
            />
          </EmailSection>

          <EmailSection title="Recipients">
            <View className="flex-row flex-wrap -mx-1">
              {RECIPIENT_CARDS.map((r) => {
                const active = recipients.includes(r.value);
                return (
                  <View key={r.value} className="w-1/2 px-1 mb-2">
                    <Pressable
                      onPress={() => toggleRecipient(r.value)}
                      className={`flex-row items-center gap-2 rounded-xl border p-3 ${
                        active
                          ? "border-[#0644C7] bg-blue-50 dark:bg-blue-900/20"
                          : "border-gray-200 dark:border-neutral-700"
                      }`}
                    >
                      <View className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-neutral-800 items-center justify-center">
                        <Feather name={r.icon} size={16} color={active ? PRIMARY : "#6B7280"} />
                      </View>
                      <View className="flex-1">
                        <Text className="text-xs font-semibold text-gray-900 dark:text-white" numberOfLines={1}>
                          {r.label}
                        </Text>
                        <Text className="text-[10px] text-gray-400 dark:text-gray-500" numberOfLines={1}>
                          {r.desc}
                        </Text>
                      </View>
                      {active && <Feather name="check" size={14} color={PRIMARY} />}
                    </Pressable>
                  </View>
                );
              })}
            </View>

            <View className="h-px bg-gray-100 dark:bg-neutral-800 my-3" />

            <Text className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1.5">
              Custom Email Addresses
            </Text>
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
          </EmailSection>

          <EmailSection title="Email Content">
            <LabeledInput
              label="Subject Line"
              required
              value={subject}
              onChangeText={setSubject}
              onFocus={() => (lastFocused.current = "subject")}
              placeholder="e.g. Happy New Year from {{ company_name }}!"
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
          </EmailSection>

          <VariablePanel
            intro="Tap to insert variables that personalize each recipient's email."
            groups={variableGroups}
            onInsert={insert}
          />

          <EmailSection title="Tips">
            {TIPS.map((t) => (
              <View key={t} className="flex-row gap-2 mb-2">
                <Text className="text-[#0644C7]">•</Text>
                <Text className="flex-1 text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                  {t}
                </Text>
              </View>
            ))}
          </EmailSection>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

export default CreateCampaign;
