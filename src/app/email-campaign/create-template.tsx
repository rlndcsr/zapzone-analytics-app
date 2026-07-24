import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  ComposerHeader,
  EmailSection,
  HeaderAction,
  LabeledInput,
  VariablePanel,
} from "../../components/ui/EmailComposerKit";
import { SelectField, type SelectOption } from "../../components/ui/FormControls";
import { markEmailTemplatesStale } from "../../lib/emailStale";
import { useLocationOptions } from "../../lib/hooks/useLocationOptions";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  createEmailTemplate,
  fetchEmailTemplateVariables,
  type EmailTemplateStatus,
  type EmailVariableGroups,
} from "../../services/emailService";

const CATEGORY_OPTIONS: SelectOption[] = [
  { label: "Onboarding", value: "onboarding" },
  { label: "Marketing", value: "marketing" },
  { label: "Transactional", value: "transactional" },
  { label: "Newsletter", value: "newsletter" },
  { label: "Reminder", value: "reminder" },
  { label: "Notification", value: "notification" },
  { label: "Other", value: "other" },
];

// Shown until (or if) the /variables endpoint responds — matches the web panel.
const FALLBACK_VARS: EmailVariableGroups = {
  default: [
    { name: "recipient_email", description: "The recipient's email address" },
    { name: "recipient_name", description: "The recipient's full name" },
    { name: "recipient_first_name", description: "The recipient's first name" },
    { name: "recipient_last_name", description: "The recipient's last name" },
  ],
  customer: [],
  user: [],
};

const CreateTemplate = () => {
  const insets = useSafeAreaInsets();
  const isCompanyAdmin = getCurrentUser()?.role === "company_admin";
  const { locations } = useLocationOptions();

  const [name, setName] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [vars, setVars] = useState<EmailVariableGroups>(FALLBACK_VARS);
  const [saving, setSaving] = useState<null | EmailTemplateStatus>(null);

  const lastFocused = useRef<"subject" | "body">("body");

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetchEmailTemplateVariables(token)
      .then((v) => {
        // Keep the fallback groups if the server returns nothing for one.
        setVars({
          default: v.default.length ? v.default : FALLBACK_VARS.default,
          customer: v.customer,
          user: v.user,
        });
      })
      .catch(() => {});
  }, []);

  const insert = (token: string) => {
    if (lastFocused.current === "subject") setSubject((s) => s + token);
    else setBody((b) => b + token);
  };

  const variableGroups = useMemo(
    () => [
      { title: "Default Variables", vars: vars.default },
      { title: "Customer Variables", vars: vars.customer },
      { title: "User Variables", vars: vars.user },
    ],
    [vars],
  );

  const locationOptions: SelectOption[] = useMemo(
    () => [
      { label: "All Locations", value: 0 },
      ...locations.map((l) => ({ label: l.name, value: l.id })),
    ],
    [locations],
  );

  const save = async (status: EmailTemplateStatus) => {
    if (!name.trim()) return Alert.alert("Missing name", "Enter a template name.");
    if (status === "active" && (!subject.trim() || !body.trim()))
      return Alert.alert(
        "Incomplete",
        "A subject and body are required to activate a template.",
      );
    const token = getToken();
    if (!token) return Alert.alert("Not signed in", "Please sign in again.");
    setSaving(status);
    try {
      await createEmailTemplate(token, {
        name: name.trim(),
        subject: subject.trim(),
        body: body.trim(),
        status,
        category: category ?? undefined,
        locationId: locationId || null,
      });
      markEmailTemplatesStale();
      router.back();
    } catch (e) {
      Alert.alert(
        "Save failed",
        e instanceof Error ? e.message : "Could not save the template.",
      );
    } finally {
      setSaving(null);
    }
  };

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <ComposerHeader
        icon="mail"
        title="Create Email Template"
        subtitle="Design a reusable email with dynamic variables"
        onBack={() => router.back()}
        actions={
          <>
            <HeaderAction
              label="Save Draft"
              icon="save"
              loading={saving === "draft"}
              disabled={saving !== null}
              onPress={() => save("draft")}
            />
            <HeaderAction
              label="Save & Activate"
              icon="check"
              variant="primary"
              loading={saving === "active"}
              disabled={saving !== null}
              onPress={() => save("active")}
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
          <EmailSection title="Template Information">
            <LabeledInput
              label="Template Name"
              required
              value={name}
              onChangeText={setName}
              placeholder="e.g. Welcome Email"
            />
            <View className="mt-3">
              <SelectField
                label="Category"
                placeholder="Select Category"
                value={category}
                options={CATEGORY_OPTIONS}
                onSelect={(v) => setCategory(String(v))}
              />
            </View>
            {isCompanyAdmin && (
              <View className="mt-3">
                <SelectField
                  label="Location (Optional)"
                  placeholder="All Locations"
                  value={locationId ?? 0}
                  options={locationOptions}
                  onSelect={(v) => setLocationId(Number(v) || null)}
                />
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
              placeholder="e.g. Welcome to {{ company_name }}, {{ recipient_first_name }}!"
              hint="You can use variables in the subject line"
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
            intro="Tap to insert variables that will be replaced with actual data when sent."
            groups={variableGroups}
            onInsert={insert}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

export default CreateTemplate;
