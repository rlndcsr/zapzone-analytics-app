import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { DatePickerSheet } from "../../components/ui/DatePickerSheet";
import { EmailSuggestions } from "../../components/ui/EmailSuggestions";
import { EventRecipientPicker } from "../../components/ui/EventRecipientPicker";
import { CheckboxRow, SegmentedToggle } from "../../components/ui/FormControls";
import { TimePickerSheet } from "../../components/ui/TimePickerSheet";
import { formatShortDate } from "../../lib/date/calendar";
import {
  canScheduleCampaign,
  formatClock,
  formatScheduleTime,
  resolveSchedule,
} from "../../lib/email/campaignSchedule";
import { campaignSendOutcome } from "../../lib/email/campaignSendOutcome";
import {
  canManageEventPhotoEmails,
  registrantGapMessage,
  registrantSummary,
  usesPhotoLink,
} from "../../lib/email/emailTemplateOptions";
import { markEmailCampaignsStale } from "../../lib/emailStale";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  createEmailCampaign,
  fetchEmailTemplateVariables,
  previewCampaignRecipients,
  type CampaignRecipientPreview,
  type CampaignRecipientType,
  type EmailVariableGroups,
} from "../../services/emailService";

type RecipientCard = {
  value: CampaignRecipientType;
  label: string;
  desc: string;
  icon: React.ComponentProps<typeof Feather>["name"];
};

const RECIPIENT_CARDS: RecipientCard[] = [
  { value: "customers", label: "Customers", desc: "All active customers; each email has an unsubscribe link", icon: "users" },
  { value: "attendants", label: "Attendants", desc: "Staff members at location", icon: "user-check" },
  { value: "company_admin", label: "Company Admins", desc: "Company administrators", icon: "briefcase" },
  { value: "location_managers", label: "Location Managers", desc: "Location managers", icon: "map-pin" },
];

// Only managers and admins may email event registrants (the server refuses everyone else).
const EVENT_REGISTRANTS_CARD: RecipientCard = {
  value: "event_registrants",
  label: "Event Registrants",
  desc: "People who registered for the events you pick",
  icon: "calendar",
};

const TIPS = [
  "Always send a test email before sending to all recipients",
  "Use variables to personalize your emails",
  "Keep your subject line clear and engaging",
  "Preview your email to see how it looks",
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CreateCampaign = () => {
  const insets = useSafeAreaInsets();
  const canEmailRegistrants = canManageEventPhotoEmails(getCurrentUser()?.role);
  const recipientCards = canEmailRegistrants ? [...RECIPIENT_CARDS, EVENT_REGISTRANTS_CARD] : RECIPIENT_CARDS;

  const [name, setName] = useState("");
  const [recipients, setRecipients] = useState<CampaignRecipientType[]>([]);
  const [customEmails, setCustomEmails] = useState<string[]>([]);
  const [emailDraft, setEmailDraft] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [vars, setVars] = useState<EmailVariableGroups | null>(null);
  const [saving, setSaving] = useState<null | "draft" | "send">(null);

  // "Schedule for later": a day + "HH:mm" on this device's clock; the server sends it then.
  const [sendLater, setSendLater] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [schedulePicker, setSchedulePicker] = useState<null | "date" | "time">(null);

  // Event Registrants: the picked location forms, and "only people whose photos
  // are ready" (null until ticked by hand: it then follows whether the email uses
  // {{ photo_link }}, as on the web).
  const [eventFormIds, setEventFormIds] = useState<number[]>([]);
  const [photosChoice, setPhotosChoice] = useState<boolean | null>(null);
  const [preview, setPreview] = useState<CampaignRecipientPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewRequest = useRef(0);
  const previewPending = useRef(false);

  const lastFocused = useRef<"subject" | "body">("body");

  const sendsToEvents = recipients.includes("event_registrants");
  const scheduling = sendLater && canScheduleCampaign(recipients);
  const onlyWithPhotos = photosChoice ?? usesPhotoLink(subject, body);
  const registrantGap = registrantGapMessage(onlyWithPhotos);

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

  const recipientTypes = useMemo(() => {
    const types = [...recipients];
    if (customEmails.length > 0 && !types.includes("custom")) types.push("custom");
    return types;
  }, [recipients, customEmails]);

  const recipientInput = useMemo(
    () => ({
      recipientTypes,
      customEmails: customEmails.length ? customEmails : undefined,
      events: sendsToEvents ? { registrationEventIds: eventFormIds, onlyWithPhotos } : undefined,
    }),
    [recipientTypes, customEmails, sendsToEvents, eventFormIds, onlyWithPhotos],
  );

  // Who the events would reach, counted by the server half a second after the
  // last change (web: the recipient preview).
  const countRecipients = useCallback(async () => {
    const request = ++previewRequest.current;
    const token = getToken();
    if (!token || !sendsToEvents || eventFormIds.length === 0) {
      setPreview(null);
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }
    setPreviewLoading(true);
    try {
      const result = await previewCampaignRecipients(token, recipientInput);
      if (request !== previewRequest.current) return;
      setPreview(result);
      setPreviewError(null);
    } catch (e) {
      if (request !== previewRequest.current) return;
      setPreview(null);
      setPreviewError(e instanceof Error ? e.message : "Could not count the recipients. Please try again.");
    } finally {
      if (request === previewRequest.current) setPreviewLoading(false);
    }
  }, [recipientInput, sendsToEvents, eventFormIds.length]);

  useEffect(() => {
    previewPending.current = true;
    const timer = setTimeout(() => {
      previewPending.current = false;
      void countRecipients();
    }, 500);
    return () => clearTimeout(timer);
  }, [countRecipients]);

  const variableGroups = useMemo(() => {
    const general = [
      { title: "Default Variables", vars: vars?.default ?? [] },
      { title: "Customer Variables", vars: vars?.customer ?? [] },
      { title: "User Variables", vars: vars?.user ?? [] },
    ];
    // emailing registrants: their event photo fields come first
    return sendsToEvents && (vars?.event.length ?? 0) > 0
      ? [
          {
            title: "Event Photo Variables",
            note: "Filled in for each person from the event they registered for.",
            vars: vars!.event,
          },
          ...general,
        ]
      : general;
  }, [vars, sendsToEvents]);

  const registrantCount = preview?.byType.event_registrant ?? 0;

  /** Before sending to events: make sure someone from them would get it (the server refuses otherwise). */
  const someoneGetsIt = async (token: string): Promise<boolean> => {
    let total = preview?.total ?? 0;
    if (!preview || previewLoading || previewPending.current || previewError) {
      try {
        total = (await previewCampaignRecipients(token, recipientInput)).total;
      } catch (e) {
        Alert.alert(
          "Could not check who gets this email",
          e instanceof Error ? e.message : "Please try again.",
        );
        return false;
      }
    }
    if (total === 0) {
      Alert.alert("Nobody would get this email", registrantGap);
      return false;
    }
    return true;
  };

  const save = async (sendNow: boolean) => {
    if (!name.trim()) return Alert.alert("Missing name", "Enter a campaign name.");
    if (recipients.length === 0 && customEmails.length === 0)
      return Alert.alert("No recipients", "Select at least one recipient group or add a custom email.");
    if (sendsToEvents && eventFormIds.length === 0)
      return Alert.alert("No events", "Pick at least one event to send to");
    if (!subject.trim() || !body.trim())
      return Alert.alert("Incomplete", "A subject and body are required.");
    // re-checked here: the picked time may have passed while the confirm was open
    const timing = sendNow
      ? resolveSchedule({ sendLater, recipientTypes, date: scheduleDate, time: scheduleTime })
      : ({ kind: "now" } as const);
    if (timing.kind === "invalid") return Alert.alert("Pick another time", timing.message);
    const token = getToken();
    if (!token) return Alert.alert("Not signed in", "Please sign in again.");

    setSaving(sendNow ? "send" : "draft");
    try {
      if (sendsToEvents && !(await someoneGetsIt(token))) return;
      const result = await createEmailCampaign(token, {
        name: name.trim(),
        subject: subject.trim(),
        body: body.trim(),
        ...recipientInput,
        sendNow,
        scheduledAt: timing.kind === "later" ? timing.at : null,
      });
      markEmailCampaignsStale();
      router.back();
      const outcome = campaignSendOutcome(result.status, result.message);
      if (timing.kind === "later") {
        Alert.alert("Campaign scheduled", `It goes out ${formatScheduleTime(timing.at)}.`);
      } else if (outcome.kind === "refused") {
        // Resend turned it down: the reply is still a success, so don't leave it looking sent
        Alert.alert("Campaign not sent", outcome.message);
      } else if (outcome.kind === "sending") {
        // a large send carries on after the reply; say so rather than leave it looking done
        Alert.alert("Campaign sending", outcome.message);
      }
    } catch (e) {
      Alert.alert(
        "Failed",
        e instanceof Error ? e.message : "Could not create the campaign.",
      );
    } finally {
      setSaving(null);
    }
  };

  const confirmSend = () => {
    const timing = resolveSchedule({ sendLater, recipientTypes, date: scheduleDate, time: scheduleTime });
    if (timing.kind === "invalid") return Alert.alert("Pick another time", timing.message);
    if (timing.kind === "later") {
      return Alert.alert(
        "Schedule campaign?",
        `This sends the email to all selected recipients on ${formatScheduleTime(timing.at)}.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Schedule", onPress: () => save(true) },
        ],
      );
    }
    Alert.alert("Send campaign?", "This sends the email to all selected recipients now.", [
      { text: "Cancel", style: "cancel" },
      { text: "Send", onPress: () => save(true) },
    ]);
  };

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <ComposerHeader
        icon="send"
        title="Create Email Campaign"
        subtitle="Send bulk emails to selected recipients"
        onBack={() => router.back()}
      />

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        >
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
              {recipientCards.map((r) => {
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

            {sendsToEvents && (
              <View className="mt-1 mb-2 rounded-xl border border-gray-200 dark:border-neutral-700 p-3 gap-3">
                <View>
                  <Text className="text-sm font-semibold text-gray-900 dark:text-white">Which events?</Text>
                  <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Everyone who registered for the events you pick gets one email, even if they
                    registered more than once. Someone with photos from more than one session gets
                    one email for each, each with its own photo link. An Unsubscribe link is added at
                    the bottom of these emails automatically. Hidden registrations, and people who
                    unsubscribed, are skipped.
                  </Text>
                </View>

                <EventRecipientPicker
                  selectedIds={eventFormIds}
                  onChange={setEventFormIds}
                  disabled={saving !== null}
                />

                <CheckboxRow
                  alignTop
                  checked={onlyWithPhotos}
                  onToggle={() => setPhotosChoice(!onlyWithPhotos)}
                  label={
                    <View>
                      <Text className="text-sm font-medium text-gray-800 dark:text-gray-100">
                        Only people whose photos are ready
                      </Text>
                      <Text className="text-xs text-gray-500 dark:text-gray-400">
                        Skips anyone who has no photos ready to view yet.
                      </Text>
                    </View>
                  }
                />

                {usesPhotoLink(subject, body) && !onlyWithPhotos && (
                  <View className="flex-row items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-900/20">
                    <Feather name="alert-triangle" size={14} color="#B45309" style={{ marginTop: 1 }} />
                    <Text className="flex-1 text-xs text-amber-800 dark:text-amber-200">
                      {"This email uses {{ photo_link }}. People whose photos are not ready still get it, but with no photo link."}
                    </Text>
                  </View>
                )}

                {eventFormIds.length === 0 ? (
                  <Text className="text-sm text-gray-500 dark:text-gray-400">
                    Pick at least one event to see who gets this email.
                  </Text>
                ) : previewLoading && !preview ? (
                  <ActivityIndicator color={PRIMARY} />
                ) : previewError ? (
                  <Text className="text-sm text-red-600">{previewError}</Text>
                ) : preview ? (
                  registrantCount === 0 ? (
                    <View className="flex-row items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-900/20">
                      <Feather name="alert-triangle" size={14} color="#B45309" style={{ marginTop: 1 }} />
                      <Text className="flex-1 text-xs text-amber-800 dark:text-amber-200">
                        {preview.total > 0
                          ? `${registrantGap} The other people you picked will still get it.`
                          : registrantGap}
                      </Text>
                    </View>
                  ) : (
                    <Text className="text-sm text-gray-700 dark:text-gray-200">
                      {registrantSummary(registrantCount, preview.withPhotos)}
                    </Text>
                  )
                ) : null}

                <Text className="text-xs text-gray-500 dark:text-gray-400">
                  Each person gets their own photo link, if they have one, and the details and links
                  of the location they registered at. Photos are not attached to campaign emails.
                </Text>
              </View>
            )}

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
            {/* Between the field and the addresses already added, so it reads
                type → suggestion → added. */}
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
          </EmailSection>

          <EmailSection title="When to Send">
            {sendsToEvents ? (
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                Emails to event registrants go out right away, so everyone who registered is included.
              </Text>
            ) : (
              <>
                <SegmentedToggle
                  options={[
                    { value: "now", label: "Send now" },
                    { value: "later", label: "Schedule for later" },
                  ]}
                  value={sendLater ? "later" : "now"}
                  onChange={(v) => setSendLater(v === "later")}
                />
                {sendLater && (
                  <View className="gap-2">
                    {(
                      [
                        { key: "date", icon: "calendar", label: "Date", value: formatShortDate(scheduleDate), empty: "Pick a date" },
                        { key: "time", icon: "clock", label: "Time", value: formatClock(scheduleTime), empty: "Pick a time" },
                      ] as const
                    ).map((row) => (
                      <Pressable
                        key={row.key}
                        onPress={() => setSchedulePicker(row.key)}
                        disabled={saving !== null}
                        accessibilityRole="button"
                        accessibilityLabel={`${row.label}: ${row.value || row.empty}`}
                        className="flex-row items-center gap-3 rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800 px-3.5 py-3"
                      >
                        <Feather name={row.icon} size={15} color={PRIMARY} />
                        <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 w-10">{row.label}</Text>
                        <Text
                          key={row.value ? "set" : "empty"}
                          className={`flex-1 text-sm ${row.value ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-500"}`}
                        >
                          {row.value || row.empty}
                        </Text>
                        <Feather name="chevron-right" size={15} color="#9CA3AF" />
                      </Pressable>
                    ))}
                    <Text className="text-xs text-gray-500 dark:text-gray-400">
                      Who gets it is settled now. Unsubscribes are checked again when it goes out.
                    </Text>
                  </View>
                )}
              </>
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
            // reopen the first group when the event photo fields come and go
            key={sendsToEvents ? "event" : "general"}
            intro="Tap to insert variables that personalize each recipient's email."
            groups={variableGroups}
            onInsert={insert}
          />
        </ScrollView>

        {/* The actions sit in a bar under the form, always in reach, rather
            than crowding the header. */}
        <View
          className="flex-row gap-3 px-4 pt-3 bg-white dark:bg-neutral-900 border-t border-gray-100 dark:border-neutral-800"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          {/* A draft has no send time, so it is offered only for sending now. */}
          {!scheduling && (
            <HeaderAction
              label="Save Draft"
              icon="save"
              block
              loading={saving === "draft"}
              disabled={saving !== null}
              onPress={() => save(false)}
            />
          )}
          <HeaderAction
            label={scheduling ? "Schedule Campaign" : "Send Campaign"}
            icon={scheduling ? "clock" : "send"}
            variant="primary"
            block
            loading={saving === "send"}
            disabled={saving !== null}
            onPress={confirmSend}
          />
        </View>
      </KeyboardAvoidingView>

      <DatePickerSheet
        visible={schedulePicker === "date"}
        value={scheduleDate}
        title="Send On"
        onClose={() => setSchedulePicker(null)}
        onSelect={(date) => {
          setScheduleDate(date);
          setSchedulePicker(null);
        }}
      />
      <TimePickerSheet
        visible={schedulePicker === "time"}
        value={scheduleTime || "09:00"}
        title="Send At"
        onClose={() => setSchedulePicker(null)}
        onSelect={(time) => {
          setScheduleTime(time);
          setSchedulePicker(null);
        }}
      />
    </View>
  );
};

export default CreateCampaign;
