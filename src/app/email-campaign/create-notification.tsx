import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
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
import { EmailSuggestions } from "../../components/ui/EmailSuggestions";
import { SelectField, type SelectOption } from "../../components/ui/FormControls";
import { VisitEmailSettings } from "../../components/ui/VisitEmailSettings";
import { firstFieldError } from "../../lib/api";
import {
  adminLocationField,
  APPLY_TO_OPTIONS,
  canCreateVisitEmail,
  canSetUpVisitEmail,
  defaultVisitPayloadFields,
  isVisitTrigger,
  readOnlyVisitEmailMessage,
  RETIRED_TRIGGER_LABELS,
  triggerForEntity,
  triggerGroupsFor,
  VISIT_EMAIL_CREATE_DENIED,
  visitPayloadFields,
  type VisitActivityFilter,
} from "../../lib/email/visitEmail";
import { markEmailNotificationsStale } from "../../lib/emailStale";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  createEmailNotification,
  fetchEmailNotificationDetail,
  fetchEmailTemplates,
  NOTIFICATION_VARIABLE_GROUPS,
  updateEmailNotification,
  type EmailPromoSummary,
  type EmailTemplateRow,
  type NotificationEntityType,
  type NotificationRecipientType,
  type VisitEmailOverride,
} from "../../services/emailService";
import { fetchLocations } from "../../services/locationsService";

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

  // Edit mode when navigated with an id (from the notification details/actions).
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editId = id ? Number(id) : null;
  const isEdit = editId != null && !Number.isNaN(editId);

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

  // Visit Completed / Visit Follow-up settings (web VisitEmailSettings).
  const [promoId, setPromoId] = useState<number | null>(null);
  const [fromName, setFromName] = useState("");
  const [reviewUrl, setReviewUrl] = useState("");
  const [activityFilter, setActivityFilter] = useState<VisitActivityFilter | null>(null);
  const [promoSummary, setPromoSummary] = useState<EmailPromoSummary | null>(null);
  const [overrides, setOverrides] = useState<VisitEmailOverride[]>([]);
  const [canEdit, setCanEdit] = useState(true);
  const [isDefault, setIsDefault] = useState(false);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [originalTrigger, setOriginalTrigger] = useState<string | null>(null);
  const [locations, setLocations] = useState<{ id: number; name: string }[]>([]);

  const currentUser = getCurrentUser();
  const isCompanyAdmin = currentUser?.role === "company_admin";
  const isVisitEmail = isVisitTrigger(triggerType);
  const canCreateVisit = canCreateVisitEmail(currentUser?.role);
  // Editing a follow-up email needs a role that may set one up (web `visitLocked`).
  const visitLocked =
    isEdit && isVisitEmail && !canSetUpVisitEmail(currentUser?.role, currentUser?.location_id);
  const visitLocationId = isEdit
    ? locationId
    : isCompanyAdmin
      ? null
      : (currentUser?.location_id ?? null);

  const lastFocused = useRef<"subject" | "body">("body");

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetchEmailTemplates(token)
      .then((r) => setTemplates(r.rows))
      .catch(() => {});
  }, []);

  // Edit mode: prefill every field from the existing notification.
  useEffect(() => {
    if (!isEdit || editId == null) return;
    const token = getToken();
    if (!token) return;
    let active2 = true;
    fetchEmailNotificationDetail(token, editId)
      .then((d) => {
        if (!active2) return;
        setName(d.name);
        setEntityType(d.entityType as NotificationEntityType);
        setTriggerType(d.triggerType || "booking_created");
        setActive(d.isActive);
        setRecipients(d.recipientTypes as NotificationRecipientType[]);
        setIncludeQr(d.includeQrCode);
        setCustomEmails(d.customEmails);
        setSubject(d.subject);
        setBody(d.body);
        setPromoId(d.promoId);
        setFromName(d.fromName);
        setReviewUrl(d.reviewUrl);
        setActivityFilter(d.activityFilter);
        setPromoSummary(d.promoSummary);
        setOverrides(d.visitOverrides);
        setCanEdit(d.canEdit);
        setIsDefault(d.isDefault);
        setLocationId(d.locationId);
        setOriginalTrigger(d.triggerType || null);
        if (d.emailTemplateId != null) {
          setUseTemplate(true);
          setTemplateId(d.emailTemplateId);
        }
      })
      .catch(() => {});
    return () => {
      active2 = false;
    };
  }, [isEdit, editId]);

  // Location names for the promo picker's "works only at …" line.
  useEffect(() => {
    if (!isVisitEmail || locations.length > 0) return;
    const token = getToken();
    if (!token) return;
    const controller = new AbortController();
    fetchLocations(token, controller.signal)
      .then((list) => setLocations(list.map((l) => ({ id: l.id, name: l.name }))))
      .catch(() => {});
    return () => controller.abort();
  }, [isVisitEmail, locations.length]);

  const triggerOptions: SelectOption[] = useMemo(() => {
    const options = triggerGroupsFor(entityType).flatMap((g) =>
      g.options.map((o) => ({
        label: `${g.label.replace(" Events", "")} · ${o.label}`,
        value: o.value,
      })),
    );
    // An email saved on a retired trigger keeps showing it, labelled as never sent.
    if (originalTrigger && triggerType === originalTrigger && !options.some((o) => o.value === triggerType)) {
      options.unshift({
        label: RETIRED_TRIGGER_LABELS[triggerType] ?? triggerType.replace(/_/g, " "),
        value: triggerType,
      });
    }
    return options;
  }, [entityType, triggerType, originalTrigger]);

  const changeEntityType = (next: NotificationEntityType) => {
    setEntityType(next);
    setTriggerType((current) => triggerForEntity(next, current));
  };

  const applyToOptions: SelectOption[] = useMemo(
    () =>
      entityType === "waiver"
        ? [...APPLY_TO_OPTIONS, { label: "Waivers", value: "waiver" }]
        : APPLY_TO_OPTIONS,
    [entityType],
  );

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
    if (isEdit && (!canEdit || visitLocked)) return;
    if (!name.trim()) return Alert.alert("Missing name", "Enter a notification name.");
    if (!isEdit && isVisitEmail && !canCreateVisit)
      return Alert.alert(VISIT_EMAIL_CREATE_DENIED);
    if (!isVisitEmail && recipients.length === 0)
      return Alert.alert("No recipients", "Select at least one recipient.");
    if (useTemplate) {
      if (templateId == null)
        return Alert.alert("No template", "Choose a template or turn off 'Use existing template'.");
    } else if (!subject.trim() || !body.trim()) {
      return Alert.alert("Incomplete", "A subject and body are required.");
    }
    if (!isVisitEmail && recipients.includes("custom") && customEmails.length === 0)
      return Alert.alert("Custom emails", "Add at least one custom email address.");

    const token = getToken();
    if (!token) return Alert.alert("Not signed in", "Please sign in again.");

    setSaving(true);
    try {
      const payload = {
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
        visitFields: {
          // Mobile has no location picker, so an admin keeps the email's saved scope (All Locations on create).
          ...(isEdit && isDefault ? {} : adminLocationField(currentUser?.role, isEdit ? locationId : null)),
          ...(isEdit && isDefault ? defaultVisitPayloadFields : visitPayloadFields)({
            triggerType,
            entityType,
            promoId,
            fromName,
            reviewUrl,
            activityFilter,
          }),
        },
      };
      // Update in edit mode, otherwise create — same payload either way.
      if (isEdit && editId != null) await updateEmailNotification(token, editId, payload);
      else await createEmailNotification(token, payload);
      markEmailNotificationsStale();
      router.back();
    } catch (e) {
      Alert.alert(
        "Failed",
        firstFieldError(e) ??
          (e instanceof Error ? e.message : "Could not save the notification."),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <ComposerHeader
        icon="bell"
        title={isEdit ? "Edit Email Notification" : "Create Email Notification"}
        subtitle={
          isEdit
            ? "Update this automated notification"
            : "Set up automated email notifications for events"
        }
        onBack={() => router.back()}
        actions={
          <HeaderAction
            label={isEdit ? "Save Changes" : "Create Notification"}
            icon="check"
            variant="primary"
            loading={saving}
            disabled={isEdit && (!canEdit || visitLocked)}
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
          {canEdit && visitLocked && <ReadOnlyBanner text={VISIT_EMAIL_CREATE_DENIED} />}
          {isEdit && !canEdit && (
            <ReadOnlyBanner text={readOnlyVisitEmailMessage(locationId)} />
          )}
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
                  options={applyToOptions}
                  onSelect={(v) => changeEntityType(v as NotificationEntityType)}
                />
              </View>
              <View className="flex-1">
                <SelectField
                  label="Trigger Event"
                  required
                  value={triggerType}
                  options={triggerOptions}
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

          {isVisitEmail && (
            <>
              {!isEdit && !canCreateVisit && <ReadOnlyBanner text={VISIT_EMAIL_CREATE_DENIED} />}
              <VisitEmailSettings
                triggerType={triggerType}
                promoId={promoId}
                onPromoChange={setPromoId}
                locationId={visitLocationId}
                locations={locations}
                promoSummary={promoSummary}
                disabled={isEdit ? !canEdit : !canCreateVisit}
                fromName={fromName}
                onFromNameChange={setFromName}
                reviewUrl={reviewUrl}
                onReviewUrlChange={setReviewUrl}
                activityFilter={activityFilter}
                onActivityFilterChange={setActivityFilter}
                canFilterActivity={!(isEdit && isDefault) && entityType !== "event"}
                overrides={overrides}
              />
            </>
          )}

          {!isVisitEmail && (
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
                {/* Between the field and the addresses already added, so it
                    reads type → suggestion → added. */}
                <EmailSuggestions value={emailDraft} onSelect={setEmailDraft} />
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
          )}

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

function ReadOnlyBanner({ text }: { text: string }) {
  return (
    <View className="mb-4 flex-row items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-900/20">
      <Feather name="alert-triangle" size={18} color="#B45309" />
      <Text className="flex-1 text-sm text-amber-900 dark:text-amber-200">{text}</Text>
    </View>
  );
}

export default CreateNotification;
