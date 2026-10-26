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
import { CheckboxRow, SelectField, type SelectOption } from "../../components/ui/FormControls";
import { TemplateLocationsPicker } from "../../components/ui/TemplateLocationsPicker";
import { ApiError } from "../../lib/api";
import {
  EMAIL_TEMPLATE_CATEGORIES,
  EVENT_PHOTOS_CATEGORY,
  EVENT_PHOTO_SMS_LIMIT,
  EVENT_PHOTO_STARTER,
  TEMPLATE_SUBJECT_LIMIT,
  canManageEventPhotoEmails,
  isCompanyLevelRole,
  isSharedEventPhotoTemplate,
  templateLocationIds,
  templateLocationsFrom,
  templateLocationSummary,
  templatePreviewLocationId,
  templateReadOnlyReason,
  templateVariableGroups,
  type TemplateLocationsValue,
} from "../../lib/email/emailTemplateOptions";
import { cleanEmailHtml } from "../../lib/email/safeEmailHtml";
import { markEmailTemplatesStale } from "../../lib/emailStale";
import { useLocationOptions } from "../../lib/hooks/useLocationOptions";
import { shortVenueName } from "../../lib/registrationForms/registrationForms";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  createEmailTemplate,
  duplicateEmailTemplate,
  fetchEmailTemplateDetail,
  fetchEmailTemplateVariables,
  previewEmailContent,
  updateEmailTemplate,
  type EmailTemplateDetail,
  type EmailTemplateStatus,
  type EmailVariableGroups,
} from "../../services/emailService";

const PRIMARY = "#0644C7";

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
  event: [],
};

type Field = "subject" | "body" | "sms";

const FIELD_LABELS: Record<Field, string> = {
  subject: "subject line",
  body: "email body",
  sms: "text message",
};

/** The first message under `location_ids` in a 422/403, for the field's own error line. */
const locationFieldError = (err: unknown): string | null => {
  if (!(err instanceof ApiError)) return null;
  const first = err.fieldErrors?.location_ids?.[0];
  return typeof first === "string" && first.trim() ? first : null;
};

const CreateTemplate = () => {
  const insets = useSafeAreaInsets();
  const user = getCurrentUser();
  const isCompanyLevel = isCompanyLevelRole(user?.role);
  const canEventPhotos = canManageEventPhotoEmails(user?.role);
  const { locations } = useLocationOptions();

  // Edit mode when navigated with a template id (the list's Edit action, the
  // preview's Edit Template button, or the details screen). "Create one" links
  // from Photo settings and registration forms open it with category=event_photos
  // and the location to cover.
  const params = useLocalSearchParams<{ id?: string; category?: string; location?: string }>();
  const editId = params.id ? Number(params.id) : null;
  const isEdit = editId != null && !Number.isNaN(editId);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [locationsValue, setLocationsValue] = useState<TemplateLocationsValue>({
    allLocations: true,
    selectedIds: [],
  });
  const [locationError, setLocationError] = useState<string | null>(null);
  const [status, setStatus] = useState<EmailTemplateStatus>("draft");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachPhotos, setAttachPhotos] = useState(true);
  const [smsBody, setSmsBody] = useState("");
  const [vars, setVars] = useState<EmailVariableGroups>(FALLBACK_VARS);
  const [saving, setSaving] = useState<null | "changes" | EmailTemplateStatus>(null);
  const [duplicating, setDuplicating] = useState(false);

  // Edit mode: the template as saved, read from GET /api/email-templates/{id}.
  const [original, setOriginal] = useState<EmailTemplateDetail | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Preview: the subject and body with variables replaced by the server's sample data.
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<{ subject: string; body: string } | null>(null);

  const lastFocused = useRef<Field>("body");
  const prefillRead = useRef(false);

  const isEventPhotos = category === EVENT_PHOTOS_CATEGORY;
  // The server says when this user may only look at a template (another location's, or every location's).
  const readOnly = original?.canManage === false;
  const readOnlyReason = original ? templateReadOnlyReason(original, canEventPhotos) : "";
  const canDuplicate =
    readOnly &&
    !!original &&
    !isSharedEventPhotoTemplate(original) &&
    (original.categoryValue !== EVENT_PHOTOS_CATEGORY || canEventPhotos);

  const categoryOptions: SelectOption[] = useMemo(
    () =>
      EMAIL_TEMPLATE_CATEGORIES.filter(
        (option) =>
          option.value !== EVENT_PHOTOS_CATEGORY ||
          canEventPhotos ||
          original?.categoryValue === EVENT_PHOTOS_CATEGORY,
      ).map((option) => ({ label: option.label, value: option.value })),
    [canEventPhotos, original?.categoryValue],
  );

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
          event: v.event,
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
        setOriginal(t);
        setName(t.name);
        // the saved value, not the "General" label shown for a template with none
        setCategory(t.categoryValue);
        setLocationsValue(templateLocationsFrom(t));
        setStatus(t.status);
        setSubject(t.subject);
        // cleaned as the web editor loads it, so saving an older template isn't refused for code in it
        setBody(cleanEmailHtml(t.body));
        setAttachPhotos(t.attachPhotos);
        setSmsBody(t.smsBody);
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

  // "Create one" from Photo settings or a registration form: start an event photo
  // email (with the starter wording) for that location, as the web does.
  useEffect(() => {
    if (prefillRead.current || isEdit) return;
    prefillRead.current = true;
    if (params.category !== EVENT_PHOTOS_CATEGORY || !canEventPhotos) return;
    setCategory(EVENT_PHOTOS_CATEGORY);
    setName((prev) => prev || EVENT_PHOTO_STARTER.name);
    setSubject((prev) => prev || EVENT_PHOTO_STARTER.subject);
    setBody((prev) => prev || EVENT_PHOTO_STARTER.body);
    const target = Number(params.location);
    if (isCompanyLevel && Number.isInteger(target) && target > 0) {
      setLocationsValue({ allLocations: false, selectedIds: [target] });
    }
  }, [isEdit, params.category, params.location, canEventPhotos, isCompanyLevel]);

  /** Switching an empty template to Event photos fills in the starter wording. */
  const applyCategory = (next: string) => {
    const useStarter = next === EVENT_PHOTOS_CATEGORY && !subject.trim() && !body.trim();
    setCategory(next);
    if (useStarter) {
      setName((prev) => prev || EVENT_PHOTO_STARTER.name);
      setSubject(EVENT_PHOTO_STARTER.subject);
      setBody(EVENT_PHOTO_STARTER.body);
    }
  };

  // Variables go into the field used last; the text message only exists on an event photo email.
  const insert = (token: string) => {
    if (readOnly) return;
    const target: Field = lastFocused.current === "sms" && !isEventPhotos ? "body" : lastFocused.current;
    if (target === "body") {
      setBody((b) => b + token);
      return;
    }
    const current = target === "subject" ? subject : smsBody;
    const limit = target === "subject" ? TEMPLATE_SUBJECT_LIMIT : EVENT_PHOTO_SMS_LIMIT;
    if (current.length + token.length > limit) {
      Alert.alert("Too long", `The ${FIELD_LABELS[target]} can be up to ${limit} characters.`);
      return;
    }
    if (target === "subject") setSubject(current + token);
    else setSmsBody(current + token);
  };

  const variableGroups = useMemo(
    () => templateVariableGroups(vars, isEventPhotos),
    [vars, isEventPhotos],
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
      setPreviewData(
        await previewEmailContent(token, {
          subject,
          body,
          locationId: isCompanyLevel ? templatePreviewLocationId(locationsValue, locations) : undefined,
        }),
      );
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

  /** Company-level staff must pick at least one location unless it's for every location. */
  const locationsChosen = (): boolean => {
    if (isCompanyLevel && !locationsValue.allLocations && templateLocationIds(locationsValue).length === 0) {
      setLocationError("Tick at least one location, or choose Every location.");
      Alert.alert("Choose locations", "Choose which locations use this template");
      return false;
    }
    setLocationError(null);
    return true;
  };

  /** What both create and save send besides name, subject, body and status. */
  const extraFields = () => ({
    category: category ?? undefined,
    ...(isCompanyLevel ? { locationIds: templateLocationIds(locationsValue) } : {}),
    ...(isEventPhotos
      ? { attachPhotos, smsBody: smsBody.trim() === "" ? null : smsBody }
      : {}),
  });

  const saveFailed = (title: string, e: unknown, fallback: string) => {
    const fieldError = locationFieldError(e);
    if (fieldError) setLocationError(fieldError);
    Alert.alert(title, e instanceof Error ? e.message : fallback);
  };

  /** Create: save as a draft or active. */
  const create = async (nextStatus: EmailTemplateStatus) => {
    if (!name.trim()) return Alert.alert("Missing name", "Enter a template name.");
    if (nextStatus === "active" && (!subject.trim() || !body.trim()))
      return Alert.alert(
        "Incomplete",
        "A subject and body are required to activate a template.",
      );
    if (!locationsChosen()) return;
    const token = getToken();
    if (!token) return Alert.alert("Not signed in", "Please sign in again.");
    setSaving(nextStatus);
    try {
      await createEmailTemplate(token, {
        name: name.trim(),
        subject: subject.trim(),
        body: body.trim(),
        status: nextStatus,
        ...extraFields(),
      });
      markEmailTemplatesStale();
      router.back();
    } catch (e) {
      saveFailed("Save failed", e, "Could not save the template.");
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
    if (editId == null || readOnly) return;
    if (!name.trim()) return Alert.alert("Missing name", "Please enter a template name");
    if (!subject.trim()) return Alert.alert("Missing subject", "Please enter an email subject");
    if (!body.trim()) return Alert.alert("Missing body", "Please enter email body content");
    if (!locationsChosen()) return;
    const token = getToken();
    if (!token) return Alert.alert("Not signed in", "Please sign in again.");
    setSaving(activate ? "active" : "changes");
    try {
      await updateEmailTemplate(token, editId, {
        name: name.trim(),
        subject: subject.trim(),
        body: body.trim(),
        status: activate ? "active" : status,
        ...extraFields(),
      });
      markEmailTemplatesStale();
      router.back();
      Alert.alert("Template updated", "Template updated successfully!");
    } catch (e) {
      saveFailed("Failed to save template", e, "Please try again.");
    } finally {
      setSaving(null);
    }
  };

  /** A read-only template: make a draft copy for this user's location and open it. */
  const duplicate = async () => {
    if (editId == null) return;
    const token = getToken();
    if (!token) return Alert.alert("Not signed in", "Please sign in again.");
    setDuplicating(true);
    try {
      const copyId = await duplicateEmailTemplate(token, editId);
      markEmailTemplatesStale();
      router.replace({ pathname: "/email-campaign/create-template", params: { id: String(copyId) } });
    } catch (e) {
      Alert.alert(
        "The template could not be copied",
        e instanceof Error ? e.message : "Please try again.",
      );
    } finally {
      setDuplicating(false);
    }
  };

  const busy = saving !== null || loadingTemplate || !!loadError;
  const ownLocationName = (() => {
    const fromTemplate = original?.locationNames[0];
    const fromUser = user?.location?.name ?? null;
    const raw = fromTemplate || fromUser;
    return raw ? (shortVenueName(raw) ?? raw) : "your location";
  })();

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <ComposerHeader
        icon="mail"
        title={isEdit ? "Edit Email Template" : "Create Email Template"}
        subtitle={
          isEdit
            ? `Editing: ${original?.name || "Template"}`
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
              !readOnly && (
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
              )
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
            {readOnly && (
              <View className="mb-4 gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-900/20">
                <Text className="text-sm text-amber-900 dark:text-amber-200">{readOnlyReason}</Text>
                {canDuplicate && (
                  <DetailActionButton
                    icon="copy"
                    label="Duplicate for my location"
                    busy={duplicating}
                    disabled={duplicating}
                    onPress={duplicate}
                  />
                )}
              </View>
            )}

            <EmailSection title="Template Information">
              <LabeledInput
                label="Template Name"
                required
                value={name}
                onChangeText={setName}
                editable={!readOnly}
                placeholder="e.g. Welcome Email"
              />
              <View className="mt-3">
                <SelectField
                  label="Category"
                  placeholder="Select Category"
                  value={category}
                  options={categoryOptions}
                  disabled={readOnly}
                  onSelect={(v) => applyCategory(String(v))}
                />
              </View>
              {isCompanyLevel && locations.length > 0 && (
                <View className="mt-3">
                  <TemplateLocationsPicker
                    locations={locations}
                    targetLocations={original?.targetLocations}
                    value={locationsValue}
                    onChange={(value) => {
                      setLocationsValue(value);
                      setLocationError(null);
                    }}
                    disabled={readOnly}
                    error={locationError}
                  />
                  <Text className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5">
                    {isEventPhotos
                      ? "People who registered for an event at these locations get this email with their photos."
                      : "Staff at these locations can use this template."}
                  </Text>
                </View>
              )}
              {!isCompanyLevel && (!isEdit || original) && (
                <View className="mt-3 flex-row items-start gap-2">
                  <Feather name="map-pin" size={14} color="#9CA3AF" style={{ marginTop: 2 }} />
                  <Text className="flex-1 text-sm text-gray-600 dark:text-gray-300">
                    {readOnly && original
                      ? original.allLocations
                        ? "Used at every location."
                        : `Used at ${templateLocationSummary(original)}.`
                      : `For ${ownLocationName} only. A company admin can share a template with other locations.`}
                  </Text>
                </View>
              )}
              {isEdit && (
                <View className="mt-3">
                  <SelectField
                    label="Status"
                    value={status}
                    options={STATUS_OPTIONS}
                    disabled={readOnly}
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
                editable={!readOnly}
                maxLength={TEMPLATE_SUBJECT_LIMIT}
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
                  editable={!readOnly}
                  placeholder="Write your email…  You can paste HTML or plain text."
                  hint={readOnly ? "This template is read-only here." : undefined}
                  multiline
                />
              </View>
            </EmailSection>

            {isEventPhotos && (
              <EmailSection title="Event photo delivery">
                <Text className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                  While this template is active, people who registered for an event at its locations
                  get it when staff send them their photos. Change the wording here once and every
                  location it covers uses the new wording.
                </Text>
                <Text className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                  Each location can have one active event photo email. A template for chosen
                  locations is used before one for every location, and a location without one sends
                  the usual photo email.
                </Text>
                <View style={readOnly ? { opacity: 0.6 } : undefined} pointerEvents={readOnly ? "none" : "auto"}>
                  <CheckboxRow
                    alignTop
                    checked={attachPhotos}
                    onToggle={() => setAttachPhotos((v) => !v)}
                    label="Attach the photos to the email as well as the link"
                  />
                </View>
                <View className="mt-4">
                  <LabeledInput
                    label="Text message (optional)"
                    value={smsBody}
                    onChangeText={setSmsBody}
                    onFocus={() => (lastFocused.current = "sms")}
                    editable={!readOnly}
                    maxLength={EVENT_PHOTO_SMS_LIMIT}
                    placeholder="Your photos from {{ event_name }} are ready: {{ photo_link }}"
                    multiline
                    minHeight={80}
                    hint={`Only sent when staff tick “Also text the selected event registrations” while sending photos. Leave it empty to use the usual photo text. ${smsBody.length}/${EVENT_PHOTO_SMS_LIMIT}`}
                  />
                </View>
              </EmailSection>
            )}

            <VariablePanel
              // the event photo fields lead for an event photo email, so reopen the first group when that flips
              key={isEventPhotos ? "event" : "general"}
              intro={
                readOnly
                  ? "This template is read-only, so variables cannot be added to it."
                  : isEventPhotos
                    ? "Tap a variable to add it to the subject, body or text message you were last in."
                    : "Tap a variable to add it to the subject or body you were last in."
              }
              groups={variableGroups}
              onInsert={readOnly ? undefined : insert}
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
