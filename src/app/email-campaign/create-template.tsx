import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DetailActionButton } from "../../components/ui/DetailKit";
import {
  ComposerHeader,
  EmailSection,
  HeaderAction,
  LabeledInput,
  VariablePanel,
} from "../../components/ui/EmailComposerKit";
import { EmailPreviewSheet } from "../../components/ui/EmailPreviewSheet";
import { SelectField, type SelectOption } from "../../components/ui/FormControls";
import { markEmailTemplatesStale } from "../../lib/emailStale";
import { useLocationOptions } from "../../lib/hooks/useLocationOptions";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  createEmailTemplate,
  fetchEmailTemplateDetail,
  fetchEmailTemplateVariables,
  previewEmailContent,
  updateEmailTemplate,
  type EmailTemplateStatus,
  type EmailVariableGroups,
} from "../../services/emailService";

const PRIMARY = "#0644C7";

const CATEGORY_OPTIONS: SelectOption[] = [
  { label: "Onboarding", value: "onboarding" },
  { label: "Marketing", value: "marketing" },
  { label: "Transactional", value: "transactional" },
  { label: "Newsletter", value: "newsletter" },
  { label: "Reminder", value: "reminder" },
  { label: "Notification", value: "notification" },
  { label: "Other", value: "other" },
];

// The web Edit page's Status select, in its order.
const STATUS_OPTIONS: SelectOption[] = [
  { label: "Draft", value: "draft" },
  { label: "Active", value: "active" },
  { label: "Archived", value: "archived" },
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

  // Edit mode when navigated with a template id (the list's Edit action, the
  // preview's Edit Template button, or the details screen).
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editId = id ? Number(id) : null;
  const isEdit = editId != null && !Number.isNaN(editId);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [status, setStatus] = useState<EmailTemplateStatus>("draft");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [vars, setVars] = useState<EmailVariableGroups>(FALLBACK_VARS);
  const [saving, setSaving] = useState<null | "changes" | EmailTemplateStatus>(null);

  // Edit mode: the template as saved, read from GET /api/email-templates/{id}.
  const [originalName, setOriginalName] = useState("");
  const [loadingTemplate, setLoadingTemplate] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Preview: the subject and body with variables replaced by the server's sample data.
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<{ subject: string; body: string } | null>(null);

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

  // Edit mode: prefill every field from the saved template, as the web Edit page does.
  useEffect(() => {
    if (!isEdit || editId == null) return;
    const token = getToken();
    if (!token) {
      setLoadError("Not signed in");
      setLoadingTemplate(false);
      return;
    }
    let active = true;
    setLoadingTemplate(true);
    setLoadError(null);
    fetchEmailTemplateDetail(token, editId)
      .then((t) => {
        if (!active) return;
        setOriginalName(t.name);
        setName(t.name);
        // the saved value, not the "General" label shown for a template with none
        setCategory(t.categoryValue);
        setLocationId(t.locationId);
        setStatus(t.status);
        setSubject(t.subject);
        setBody(t.body);
      })
      .catch((err) => {
        if (active) setLoadError(err instanceof Error ? err.message : "Failed to load template");
      })
      .finally(() => {
        if (active) setLoadingTemplate(false);
      });
    return () => {
      active = false;
    };
  }, [isEdit, editId, reloadKey]);

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

  const preview = async () => {
    if (!subject.trim() || !body.trim()) {
      Alert.alert("Nothing to preview", "Please enter subject and body to preview");
      return;
    }
    const token = getToken();
    if (!token) return Alert.alert("Not signed in", "Please sign in again.");
    setPreviewLoading(true);
    try {
      setPreviewData(await previewEmailContent(token, { subject, body }));
      setPreviewOpen(true);
    } catch (e) {
      Alert.alert(
        "Failed to preview template",
        e instanceof Error ? e.message : "Please try again.",
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  /** Create: save as a draft or active. */
  const create = async (nextStatus: EmailTemplateStatus) => {
    if (!name.trim()) return Alert.alert("Missing name", "Enter a template name.");
    if (nextStatus === "active" && (!subject.trim() || !body.trim()))
      return Alert.alert(
        "Incomplete",
        "A subject and body are required to activate a template.",
      );
    const token = getToken();
    if (!token) return Alert.alert("Not signed in", "Please sign in again.");
    setSaving(nextStatus);
    try {
      await createEmailTemplate(token, {
        name: name.trim(),
        subject: subject.trim(),
        body: body.trim(),
        status: nextStatus,
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

  /**
   * Edit: "Save Changes" keeps the chosen Status; "Save & Activate" saves it as
   * active. Same rules as the web Edit page — name, subject and body are all
   * required whichever button is used.
   */
  const saveChanges = async (activate: boolean) => {
    if (editId == null) return;
    if (!name.trim()) return Alert.alert("Missing name", "Please enter a template name");
    if (!subject.trim()) return Alert.alert("Missing subject", "Please enter an email subject");
    if (!body.trim()) return Alert.alert("Missing body", "Please enter email body content");
    const token = getToken();
    if (!token) return Alert.alert("Not signed in", "Please sign in again.");
    setSaving(activate ? "active" : "changes");
    try {
      await updateEmailTemplate(token, editId, {
        name: name.trim(),
        subject: subject.trim(),
        body: body.trim(),
        status: activate ? "active" : status,
        category: category ?? undefined,
        locationId: locationId || null,
      });
      markEmailTemplatesStale();
      router.back();
      Alert.alert("Template updated", "Template updated successfully!");
    } catch (e) {
      Alert.alert(
        "Failed to save template",
        e instanceof Error ? e.message : "Please try again.",
      );
    } finally {
      setSaving(null);
    }
  };

  const busy = saving !== null || loadingTemplate || !!loadError;

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <ComposerHeader
        icon="mail"
        title={isEdit ? "Edit Email Template" : "Create Email Template"}
        subtitle={
          isEdit
            ? `Editing: ${originalName || "Template"}`
            : "Design a reusable email with dynamic variables"
        }
        onBack={() => router.back()}
        actions={
          <>
            <HeaderAction
              label="Preview"
              icon="eye"
              loading={previewLoading}
              disabled={busy}
              onPress={preview}
            />
            {isEdit ? (
              <>
                <HeaderAction
                  label="Save Changes"
                  icon="save"
                  loading={saving === "changes"}
                  disabled={busy}
                  onPress={() => saveChanges(false)}
                />
                {status !== "active" && (
                  <HeaderAction
                    label="Save & Activate"
                    icon="check"
                    variant="primary"
                    loading={saving === "active"}
                    disabled={busy}
                    onPress={() => saveChanges(true)}
                  />
                )}
              </>
            ) : (
              <>
                <HeaderAction
                  label="Save Draft"
                  icon="save"
                  loading={saving === "draft"}
                  disabled={busy}
                  onPress={() => create("draft")}
                />
                <HeaderAction
                  label="Save & Activate"
                  icon="check"
                  variant="primary"
                  loading={saving === "active"}
                  disabled={busy}
                  onPress={() => create("active")}
                />
              </>
            )}
          </>
        }
      />

      {loadingTemplate ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={PRIMARY} />
          <Text className="text-sm text-gray-500 dark:text-gray-400 mt-3">Loading template...</Text>
        </View>
      ) : loadError ? (
        <View className="flex-1 items-center justify-center px-8">
          <Feather name="alert-circle" size={36} color="#EF4444" />
          <Text className="text-sm text-gray-600 dark:text-gray-300 mt-3 text-center">
            {loadError}
          </Text>
          <Pressable
            onPress={() => setReloadKey((k) => k + 1)}
            className="mt-4 px-5 py-2.5 rounded-xl bg-[#0644C7]"
          >
            <Text className="text-sm font-semibold text-white">Retry</Text>
          </Pressable>
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
              {isEdit && (
                <View className="mt-3">
                  <SelectField
                    label="Status"
                    value={status}
                    options={STATUS_OPTIONS}
                    onSelect={(v) => setStatus(v as EmailTemplateStatus)}
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
      )}

      {/* Template Preview — variables replaced with sample data (web Preview button) */}
      <EmailPreviewSheet
        visible={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Template Preview"
        subtitle="Variables replaced with sample data"
        subject={previewData?.subject ?? ""}
        body={previewData?.body ?? ""}
        footer={
          <DetailActionButton icon="x" label="Close Preview" onPress={() => setPreviewOpen(false)} />
        }
      />
    </View>
  );
};

export default CreateTemplate;
