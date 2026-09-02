import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmailSuggestions } from "../../components/ui/EmailSuggestions";
import { LocationWorkspaceSelector } from "../../components/ui/LocationWorkspaceSelector";
import { SheetSelect } from "../../components/ui/SheetSelect";
import { Toast, type ToastType } from "../../components/ui/Toast";
import {
  SkeletonBlock,
  usePulse,
} from "../../components/ui/skeleton/SkeletonBlock";
import { useTransientAlert } from "../../lib/hooks/useTransientAlert";
import { useActiveLocation } from "../../lib/location/activeLocationStore";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  fetchPhotoSettings,
  fetchPhotoTemplates,
  resetPhotoTemplate,
  rotatePhotoPasscode,
  sendPhotoTestMessage,
  updatePhotoSettings,
  updatePhotoTemplate,
  type PhotoMessageTemplate,
  type PhotoSettings,
  type PhotoTestChannel,
  type PhotoTestResult,
} from "../../services/photosService";

const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const POSITION_LABELS: Record<string, string> = {
  top_left: "Top left",
  top_right: "Top right",
  bottom_left: "Bottom left",
  bottom_right: "Bottom right",
};

const BACKGROUND_LABELS: Record<string, string> = {
  none: "Plain text",
  solid: "Dark panel behind the date",
  shadow: "Drop shadow behind the date",
};

const KIND_LABELS: Record<string, string> = {
  immediate: "Immediate waiver delivery",
  next_day: "9:00 AM next-day delivery",
  kiosk: "Kiosk delivery",
};

/** Same bounds as the web's number inputs. */
const BOUNDS = {
  dateFontSize: { min: 16, max: 80, label: "Text size" },
  dateMargin: { min: 8, max: 120, label: "Margin from the edge" },
  retentionDays: { min: 1, max: 730, label: "Backend retention (days)" },
} as const;

const errorMessage = (e: unknown, fallback: string): string =>
  e instanceof Error && e.message ? e.message : fallback;

type Form = {
  kioskEnabled: boolean;
  slideshowEnabled: boolean;
  kioskCountdownSeconds: number;
  slideshowDurationSeconds: number;
  dateFormat: string;
  datePosition: string;
  dateBackground: string;
  dateFontSize: string;
  dateMargin: string;
  retentionDays: string;
  failureNotifyEmail: string;
};

const countdownLabel = (seconds: number): string =>
  seconds === 0 ? "No countdown — capture straight away" : `${seconds} seconds`;

function SectionCard({
  title,
  description,
  children,
  tinted = false,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  tinted?: boolean;
}) {
  return (
    <View
      className={`mb-4 rounded-2xl border border-gray-100 p-5 dark:border-neutral-800 ${
        tinted
          ? "bg-gray-50 dark:bg-neutral-900/60"
          : "bg-white dark:bg-neutral-900"
      }`}
      style={CARD_SHADOW}
    >
      <Text className="font-semibold text-gray-900 dark:text-white">
        {title}
      </Text>
      {!!description && (
        <Text className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          {description}
        </Text>
      )}
      <View className="mt-4">{children}</View>
    </View>
  );
}

function FieldLabel({ children }: { children: string }) {
  return (
    <Text className="mb-1 text-sm text-gray-700 dark:text-gray-200">
      {children}
    </Text>
  );
}

function Hint({ children }: { children: string }) {
  return (
    <Text className="mt-1 text-xs text-gray-500 dark:text-gray-400">
      {children}
    </Text>
  );
}

/** Bordered text input matching SheetSelect's trigger, for form parity. */
function TextField({
  value,
  onChangeText,
  keyboardType,
  placeholder,
  multiline,
  numberOfLines,
  mono,
}: {
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: "default" | "number-pad" | "email-address";
  placeholder?: string;
  multiline?: boolean;
  numberOfLines?: number;
  mono?: boolean;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      keyboardType={keyboardType}
      placeholder={placeholder}
      placeholderTextColor="#9CA3AF"
      multiline={multiline}
      numberOfLines={numberOfLines}
      autoCapitalize={keyboardType === "email-address" ? "none" : "sentences"}
      autoCorrect={keyboardType !== "email-address"}
      textAlignVertical={multiline ? "top" : "center"}
      className={`rounded-xl border border-gray-100 bg-white px-4 text-gray-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white ${
        multiline ? "py-3" : "py-3.5"
      } ${mono ? "text-xs" : "text-sm"}`}
      style={multiline ? { minHeight: (numberOfLines ?? 3) * 22 } : undefined}
    />
  );
}

function ChannelCard({
  icon,
  name,
  available,
  detail,
  note,
  children,
}: {
  icon: keyof typeof Feather.glyphMap;
  name: string;
  available: boolean;
  detail: React.ReactNode;
  note: string | null;
  children?: React.ReactNode;
}) {
  return (
    <View
      className={`mb-3 rounded-xl border p-4 ${
        available
          ? "border-green-200 bg-green-50/60 dark:border-green-900/40 dark:bg-green-900/10"
          : "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/10"
      }`}
    >
      <View className="flex-row items-center gap-2">
        <Feather name={icon} size={16} color="#111827" />
        <Text className="font-medium text-gray-900 dark:text-white">
          {name}
        </Text>
        <View
          className={`ml-auto rounded-full px-2 py-0.5 ${
            available ? "bg-green-600" : "bg-amber-500"
          }`}
        >
          <Text className="text-xs text-white">
            {available ? "sending" : "not sending"}
          </Text>
        </View>
      </View>
      <View className="mt-2">{detail}</View>
      {!!note && (
        <Text className="mt-2 text-sm text-amber-900 dark:text-amber-300">
          {note}
        </Text>
      )}
      {children}
    </View>
  );
}

/** "Send a test email to" / "Send a test text to" — input, Send, inline result. */
function TestSendRow({
  label,
  placeholder,
  keyboardType,
  value,
  onChangeText,
  onSend,
  sending,
  result,
}: {
  label: string;
  placeholder: string;
  keyboardType: "email-address" | "phone-pad";
  value: string;
  onChangeText: (v: string) => void;
  onSend: () => void;
  sending: boolean;
  result: PhotoTestResult | null;
}) {
  const ready = value.trim().length > 0 && !sending;
  return (
    <View className="mt-3 border-t border-white/60 pt-3 dark:border-neutral-700/60">
      <Text className="text-xs font-medium text-gray-700 dark:text-gray-200">
        {label}
      </Text>
      <View className="mt-1 flex-row items-center gap-2">
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
          keyboardType={keyboardType}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="send"
          onSubmitEditing={() => ready && onSend()}
          className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
        />
        <Pressable
          onPress={onSend}
          disabled={!ready}
          className={`flex-row items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 dark:bg-neutral-700 ${
            ready ? "active:opacity-80" : "opacity-40"
          }`}
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          <Feather name="send" size={13} color="#FFFFFF" />
          <Text className="text-sm font-medium text-white">
            {sending ? "Sending…" : "Send"}
          </Text>
        </Pressable>
      </View>
      {/* This row also serves the SMS channel, where a domain means nothing. */}
      {keyboardType === "email-address" ? (
        <EmailSuggestions
          value={value}
          onSelect={onChangeText}
          suppressed={sending}
        />
      ) : null}
      {!!result && (
        <Text
          accessibilityLiveRegion="polite"
          className={`mt-2 text-sm ${
            result.success
              ? "text-green-800 dark:text-green-400"
              : "text-red-700 dark:text-red-400"
          }`}
        >
          {result.message}
        </Text>
      )}
    </View>
  );
}

/** Read-only note: where every photo link points. */
function PhotoLinkAddress({
  base,
  note,
}: {
  base: string | null;
  note: string | null;
}) {
  return (
    <View className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-neutral-800 dark:bg-neutral-900/60">
      <View className="flex-row items-center gap-2">
        <Feather name="link-2" size={15} color="#111827" />
        <Text className="font-medium text-gray-900 dark:text-white">
          Photo link address
        </Text>
      </View>
      <View className="mt-2 flex-row flex-wrap items-center gap-1.5">
        <Text className="text-sm text-gray-700 dark:text-gray-200">
          Every message links here:
        </Text>
        <Text className="rounded bg-white px-1.5 py-0.5 text-xs text-gray-900 dark:bg-neutral-800 dark:text-gray-100">
          {base || "not set"}
        </Text>
      </View>
      {note ? (
        <Text className="mt-2 text-sm text-amber-900 dark:text-amber-300">
          {note}
        </Text>
      ) : (
        <Text className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          This is the address visitors reach, so the links you send will open
          for them.
        </Text>
      )}
    </View>
  );
}

function LockedRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between gap-4 border-b border-gray-200/60 py-1.5 dark:border-neutral-800">
      <Text className="text-sm text-gray-600 dark:text-gray-400">{label}</Text>
      <Text className="flex-1 text-right text-sm text-gray-900 dark:text-gray-100">
        {value}
      </Text>
    </View>
  );
}

function SettingsSkeleton() {
  const pulse = usePulse();
  return (
    <View className="gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <View
          key={i}
          className="gap-3 rounded-2xl border border-gray-100 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900"
        >
          <SkeletonBlock pulse={pulse} className="h-4 w-1/3" />
          <SkeletonBlock pulse={pulse} className="h-3 w-3/4" />
          <SkeletonBlock pulse={pulse} className="h-12 w-full" />
        </View>
      ))}
    </View>
  );
}

export default function PhotoSettingsScreen() {
  const insets = useSafeAreaInsets();

  const user = getCurrentUser();
  const isCompanyAdmin = user?.role === "company_admin";
  const activeLocation = useActiveLocation();
  const effectiveLocationId = isCompanyAdmin
    ? activeLocation.id === "all"
      ? null
      : activeLocation.id
    : (user?.location_id ?? null);

  // The web guards /photos/settings to company_admin and location_manager.
  const canManage = isCompanyAdmin || user?.role === "location_manager";

  const [data, setData] = useState<PhotoSettings | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, showToast] = useTransientAlert<{
    message: string;
    type: ToastType;
  }>(4000);

  const [testTo, setTestTo] = useState({ email: "", sms: "" });
  const [testing, setTesting] = useState<PhotoTestChannel | null>(null);
  const [testResult, setTestResult] = useState<
    Record<PhotoTestChannel, PhotoTestResult | null>
  >({ email: null, sms: null });

  const [templates, setTemplates] = useState<PhotoMessageTemplate[]>([]);
  const [variables, setVariables] = useState<string[]>([]);
  const [openTemplate, setOpenTemplate] = useState<number | null>(null);
  const [templateDraft, setTemplateDraft] = useState<
    Record<number, PhotoMessageTemplate>
  >({});

  const load = useCallback(async () => {
    const token = getToken();
    if (!token || !canManage || !effectiveLocationId) return;
    setLoading(true);
    try {
      const [settings, templateData] = await Promise.all([
        fetchPhotoSettings(token, effectiveLocationId),
        fetchPhotoTemplates(token),
      ]);
      setData(settings);
      setForm({
        kioskEnabled: settings.setting.kioskEnabled,
        slideshowEnabled: settings.setting.slideshowEnabled,
        kioskCountdownSeconds: settings.setting.kioskCountdownSeconds,
        slideshowDurationSeconds: settings.setting.slideshowDurationSeconds,
        dateFormat: settings.setting.dateFormat,
        datePosition: settings.setting.datePosition,
        dateBackground: settings.setting.dateBackground,
        dateFontSize: String(settings.setting.dateFontSize),
        dateMargin: String(settings.setting.dateMargin),
        retentionDays: String(settings.setting.retentionDays),
        failureNotifyEmail: settings.setting.failureNotifyEmail ?? "",
      });
      setTemplates(templateData.templates);
      setVariables(templateData.variables);
      setTemplateDraft(
        Object.fromEntries(templateData.templates.map((t) => [t.id, t])),
      );
    } catch (e) {
      showToast({
        message: errorMessage(e, "Could not load photo settings."),
        type: "error",
      });
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [canManage, effectiveLocationId, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const save = useCallback(async () => {
    const token = getToken();
    if (!token || !effectiveLocationId || !form) return;

    // Same ranges the web's number inputs declare; the server rejects them too.
    const numbers = {
      dateFontSize: Number(form.dateFontSize),
      dateMargin: Number(form.dateMargin),
      retentionDays: Number(form.retentionDays),
    };
    for (const key of Object.keys(numbers) as (keyof typeof numbers)[]) {
      const { min, max, label } = BOUNDS[key];
      const value = numbers[key];
      if (!Number.isInteger(value) || value < min || value > max) {
        showToast({
          message: `${label} must be a whole number between ${min} and ${max}.`,
          type: "error",
        });
        return;
      }
    }

    setSaving(true);
    try {
      const email = form.failureNotifyEmail.trim();
      await updatePhotoSettings(token, {
        locationId: effectiveLocationId,
        kioskEnabled: form.kioskEnabled,
        slideshowEnabled: form.slideshowEnabled,
        kioskCountdownSeconds: form.kioskCountdownSeconds,
        slideshowDurationSeconds: form.slideshowDurationSeconds,
        retentionDays: numbers.retentionDays,
        dateFormat: form.dateFormat,
        datePosition: form.datePosition,
        dateFontSize: numbers.dateFontSize,
        dateMargin: numbers.dateMargin,
        dateBackground: form.dateBackground,
        failureNotifyEmail: email === "" ? null : email,
      });
      showToast({ message: "Photo settings saved.", type: "success" });
      await load();
    } catch (e) {
      showToast({
        message: errorMessage(e, "Those settings could not be saved."),
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  }, [effectiveLocationId, form, load, showToast]);

  const rotate = useCallback(
    async (mode: "kiosk" | "slideshow") => {
      const token = getToken();
      if (!token || !effectiveLocationId) return;
      setSaving(true);
      try {
        await rotatePhotoPasscode(token, effectiveLocationId, mode);
        showToast({
          message: `New ${mode} passcode issued. Devices will need it again once their session expires.`,
          type: "success",
        });
        await load();
      } catch (e) {
        showToast({
          message: errorMessage(e, "That passcode could not be changed."),
          type: "error",
        });
      } finally {
        setSaving(false);
      }
    },
    [effectiveLocationId, load, showToast],
  );

  const sendTest = useCallback(
    async (channel: PhotoTestChannel) => {
      const token = getToken();
      const destination = (
        channel === "email" ? testTo.email : testTo.sms
      ).trim();
      if (!token || !effectiveLocationId || !destination || testing) return;
      setTesting(channel);
      setTestResult((r) => ({ ...r, [channel]: null }));
      try {
        const result = await sendPhotoTestMessage(token, {
          locationId: effectiveLocationId,
          channel,
          destination,
        });
        setTestResult((r) => ({ ...r, [channel]: result }));
      } finally {
        setTesting(null);
      }
    },
    [effectiveLocationId, testTo, testing],
  );

  const copy = useCallback(
    async (value: string, label: string) => {
      try {
        await Clipboard.setStringAsync(value);
        showToast({ message: `${label} copied.`, type: "success" });
      } catch {
        showToast({
          message: "Copying is not available on this device.",
          type: "info",
        });
      }
    },
    [showToast],
  );

  const saveTemplate = useCallback(
    async (templateId: number) => {
      const token = getToken();
      const draft = templateDraft[templateId];
      if (!token || !draft) return;
      setSaving(true);
      try {
        await updatePhotoTemplate(token, templateId, {
          emailSubject: draft.emailSubject,
          emailBody: draft.emailBody,
          smsBody: draft.smsBody,
        });
        showToast({ message: "Template saved.", type: "success" });
        await load();
      } catch (e) {
        showToast({
          message: errorMessage(e, "That template could not be saved."),
          type: "error",
        });
      } finally {
        setSaving(false);
      }
    },
    [load, showToast, templateDraft],
  );

  const restoreTemplate = useCallback(
    async (templateId: number) => {
      const token = getToken();
      if (!token) return;
      setSaving(true);
      try {
        await resetPhotoTemplate(token, templateId);
        showToast({
          message: "Template restored to the default wording.",
          type: "info",
        });
        await load();
      } catch (e) {
        showToast({
          message: errorMessage(e, "That template could not be reset."),
          type: "error",
        });
      } finally {
        setSaving(false);
      }
    },
    [load, showToast],
  );

  const header = (
    <View className="w-full border-b border-gray-100 bg-white px-5 pb-5 pt-12 dark:border-neutral-800 dark:bg-neutral-900">
      <View className="flex-row items-center justify-between">
        <Pressable
          onPress={() => router.back()}
          className="rounded-full bg-gray-100 p-2 dark:bg-neutral-800"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Feather name="chevron-left" size={20} color="#111827" />
        </Pressable>
        <Text className="text-lg font-bold text-gray-900 dark:text-white">
          Photo settings
        </Text>
        <Pressable
          onPress={() => void load()}
          disabled={loading || !canManage || !effectiveLocationId}
          className="rounded-full bg-gray-100 p-2 dark:bg-neutral-800"
          accessibilityRole="button"
          accessibilityLabel="Refresh"
        >
          {loading ? (
            <ActivityIndicator size="small" color={PRIMARY} />
          ) : (
            <Feather name="refresh-cw" size={18} color="#111827" />
          )}
        </Pressable>
      </View>
    </View>
  );

  if (!canManage) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-black">
        {header}
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <View className="items-center rounded-2xl border border-gray-100 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
            <Feather name="lock" size={34} color="#9CA3AF" />
            <Text className="mt-3 text-lg font-bold text-gray-900 dark:text-white">
              Settings are managed by a manager
            </Text>
            <Text className="mt-2 text-center text-sm text-gray-500 dark:text-gray-400">
              Your role does not have access to the photo settings. Please ask a
              manager if you need something changed.
            </Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (!effectiveLocationId) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-black">
        {header}
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          {isCompanyAdmin && (
            <View className="mb-4">
              <LocationWorkspaceSelector />
            </View>
          )}
          <View className="items-center rounded-2xl border border-gray-100 bg-white p-8 dark:border-neutral-800 dark:bg-neutral-900">
            <Feather name="map-pin" size={34} color="#9CA3AF" />
            <Text className="mt-3 text-lg font-bold text-gray-900 dark:text-white">
              Choose a location first
            </Text>
            <Text className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
              {isCompanyAdmin
                ? "Kiosk and slideshow passcodes, overlays and retention are all per location."
                : "Your account is not assigned to a location yet."}
            </Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {header}

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 20, paddingBottom: 24 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          <Text className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            {data ? data.location.name : ""}
            {data ? ` · times are ${data.location.timezone}` : ""}
          </Text>

          {isCompanyAdmin && (
            <View className="mb-4">
              <LocationWorkspaceSelector />
            </View>
          )}

          {!loaded && loading && <SettingsSkeleton />}

          {data && form && (
            <>
              <SectionCard
                title="Delivery channels"
                description="Whether this site can actually send a photo link right now. Waivers that only carry an unavailable channel are shown as not contactable, so staff are pointed at the direct QR code instead."
              >
                <ChannelCard
                  icon="mail"
                  name="Email"
                  available={data.channels.emailAvailable}
                  note={data.channels.emailNote}
                  detail={
                    <Text className="text-sm text-gray-700 dark:text-gray-200">
                      Transport:{" "}
                      <Text className="text-xs text-gray-900 dark:text-white">
                        {data.channels.emailTransport}
                      </Text>
                    </Text>
                  }
                >
                  <TestSendRow
                    label="Send a test email to"
                    placeholder="you@example.com"
                    keyboardType="email-address"
                    value={testTo.email}
                    onChangeText={(v) =>
                      setTestTo((t) => ({ ...t, email: v }))
                    }
                    onSend={() => void sendTest("email")}
                    sending={testing === "email"}
                    result={testResult.email}
                  />
                </ChannelCard>
                <ChannelCard
                  icon="message-square"
                  name="SMS"
                  available={data.channels.smsAvailable}
                  note={data.channels.smsNote}
                  detail={
                    <Text className="text-sm text-gray-700 dark:text-gray-200">
                      Provider: Twilio
                    </Text>
                  }
                >
                  <TestSendRow
                    label="Send a test text to"
                    placeholder="(810) 555-0134"
                    keyboardType="phone-pad"
                    value={testTo.sms}
                    onChangeText={(v) => setTestTo((t) => ({ ...t, sms: v }))}
                    onSend={() => void sendTest("sms")}
                    sending={testing === "sms"}
                    result={testResult.sms}
                  />
                </ChannelCard>

                <PhotoLinkAddress
                  base={data.channels.photoLinkBase}
                  note={data.channels.photoLinkNote}
                />
              </SectionCard>

              <SectionCard
                title="Kiosk behaviour"
                description="How long the visitor gets between pressing Capture and the shutter firing."
              >
                <FieldLabel>Capture countdown</FieldLabel>
                <SheetSelect
                  title="Capture countdown"
                  icon="clock"
                  value={form.kioskCountdownSeconds}
                  options={data.options.countdownOptions.map((seconds) => ({
                    label: countdownLabel(seconds),
                    value: seconds,
                  }))}
                  onSelect={(v) =>
                    setForm((f) =>
                      f ? { ...f, kioskCountdownSeconds: Number(v) } : f,
                    )
                  }
                />
                <Hint>
                  {form.kioskCountdownSeconds === 0
                    ? "The photo is taken the moment the visitor presses Capture."
                    : "The inactivity timer pauses while the countdown is running."}
                </Hint>
              </SectionCard>

              <SectionCard
                title="Device URLs and passcodes"
                description="Kiosk and slideshow are device functions, not accounts. A device with the URL and passcode can do only that one job and never reaches customers, waivers, reports or settings."
              >
                {(["kiosk", "slideshow"] as const).map((mode) => {
                  const url =
                    mode === "kiosk"
                      ? data.setting.kioskUrl
                      : data.setting.slideshowUrl;
                  const code =
                    mode === "kiosk"
                      ? data.setting.kioskPasscode
                      : data.setting.slideshowPasscode;
                  const enabled =
                    mode === "kiosk"
                      ? form.kioskEnabled
                      : form.slideshowEnabled;

                  return (
                    <View
                      key={mode}
                      className="mb-3 rounded-xl border border-gray-100 p-4 dark:border-neutral-800"
                    >
                      <View className="mb-3 flex-row items-center justify-between">
                        <Text className="font-medium capitalize text-gray-900 dark:text-white">
                          {mode} mode
                        </Text>
                        <View className="flex-row items-center gap-2">
                          <Text className="text-sm text-gray-700 dark:text-gray-200">
                            Enabled
                          </Text>
                          <Switch
                            value={enabled}
                            onValueChange={(v) =>
                              setForm((f) =>
                                f
                                  ? mode === "kiosk"
                                    ? { ...f, kioskEnabled: v }
                                    : { ...f, slideshowEnabled: v }
                                  : f,
                              )
                            }
                            trackColor={{ true: PRIMARY }}
                          />
                        </View>
                      </View>

                      <View className="gap-2">
                        <View className="flex-row items-center gap-2">
                          <Text
                            numberOfLines={1}
                            className="flex-1 rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-gray-100"
                          >
                            {url}
                          </Text>
                          <Pressable
                            onPress={() => void copy(url, `${mode} URL`)}
                            className="rounded p-1.5"
                            accessibilityRole="button"
                            accessibilityLabel={`Copy ${mode} URL`}
                          >
                            <Feather name="copy" size={16} color="#4B5563" />
                          </Pressable>
                        </View>

                        <View className="flex-row items-center gap-2">
                          <View className="flex-row items-center gap-1">
                            <Feather name="lock" size={13} color="#6B7280" />
                            <Text className="text-xs text-gray-500 dark:text-gray-400">
                              Passcode
                            </Text>
                          </View>
                          <Text
                            className="flex-1 rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-gray-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-gray-100"
                            style={{ letterSpacing: 4 }}
                          >
                            {code}
                          </Text>
                          <Pressable
                            onPress={() => void copy(code, "Passcode")}
                            className="rounded p-1.5"
                            accessibilityRole="button"
                            accessibilityLabel="Copy passcode"
                          >
                            <Feather name="copy" size={16} color="#4B5563" />
                          </Pressable>
                        </View>
                      </View>

                      <Pressable
                        onPress={() => void rotate(mode)}
                        disabled={saving}
                        className={`mt-3 self-start ${saving ? "opacity-40" : ""}`}
                        accessibilityRole="button"
                      >
                        <Text className="text-sm text-gray-600 underline dark:text-gray-300">
                          Issue a new passcode
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </SectionCard>

              <SectionCard
                title="Capture date on the photo"
                description="The date is a separate layer drawn above the uploaded overlay. It shows the capture date only — never a time, and never the delivery date."
              >
                <View className="gap-4">
                  <View>
                    <FieldLabel>Date format</FieldLabel>
                    <SheetSelect
                      title="Date format"
                      icon="calendar"
                      value={form.dateFormat}
                      options={data.options.dateFormats.map((o) => ({
                        label: o.preview,
                        value: o.value,
                      }))}
                      onSelect={(v) =>
                        setForm((f) =>
                          f ? { ...f, dateFormat: String(v) } : f,
                        )
                      }
                    />
                  </View>

                  <View>
                    <FieldLabel>Position</FieldLabel>
                    <SheetSelect
                      title="Position"
                      icon="move"
                      value={form.datePosition}
                      options={data.options.datePositions.map((p) => ({
                        label: POSITION_LABELS[p] ?? p,
                        value: p,
                      }))}
                      onSelect={(v) =>
                        setForm((f) =>
                          f ? { ...f, datePosition: String(v) } : f,
                        )
                      }
                    />
                  </View>

                  <View>
                    <FieldLabel>Text size</FieldLabel>
                    <TextField
                      value={form.dateFontSize}
                      onChangeText={(v) =>
                        setForm((f) => (f ? { ...f, dateFontSize: v } : f))
                      }
                      keyboardType="number-pad"
                    />
                  </View>

                  <View>
                    <FieldLabel>Margin from the edge</FieldLabel>
                    <TextField
                      value={form.dateMargin}
                      onChangeText={(v) =>
                        setForm((f) => (f ? { ...f, dateMargin: v } : f))
                      }
                      keyboardType="number-pad"
                    />
                  </View>

                  <View>
                    <FieldLabel>Readability</FieldLabel>
                    <SheetSelect
                      title="Readability"
                      icon="eye"
                      value={form.dateBackground}
                      options={data.options.dateBackgrounds.map((b) => ({
                        label: BACKGROUND_LABELS[b] ?? b,
                        value: b,
                      }))}
                      onSelect={(v) =>
                        setForm((f) =>
                          f ? { ...f, dateBackground: String(v) } : f,
                        )
                      }
                    />
                  </View>
                </View>
              </SectionCard>

              <SectionCard title="Slideshow, retention and alerts">
                <View className="gap-4">
                  <View>
                    <FieldLabel>Seconds per slide</FieldLabel>
                    <SheetSelect
                      title="Seconds per slide"
                      icon="monitor"
                      value={form.slideshowDurationSeconds}
                      options={data.options.slideshowDurations.map((s) => ({
                        label: `${s} seconds`,
                        value: s,
                      }))}
                      onSelect={(v) =>
                        setForm((f) =>
                          f ? { ...f, slideshowDurationSeconds: Number(v) } : f,
                        )
                      }
                    />
                  </View>

                  <View>
                    <FieldLabel>Backend retention (days)</FieldLabel>
                    <TextField
                      value={form.retentionDays}
                      onChangeText={(v) =>
                        setForm((f) => (f ? { ...f, retentionDays: v } : f))
                      }
                      keyboardType="number-pad"
                    />
                    <Hint>
                      Photos are removed from the photo library after this many
                      days.
                    </Hint>
                  </View>

                  <View>
                    <FieldLabel>Failure alert email</FieldLabel>
                    <TextField
                      value={form.failureNotifyEmail}
                      onChangeText={(v) =>
                        setForm((f) =>
                          f ? { ...f, failureNotifyEmail: v } : f,
                        )
                      }
                      keyboardType="email-address"
                      placeholder="manager@example.com"
                    />
                    <EmailSuggestions
                      value={form.failureNotifyEmail}
                      onSelect={(email) =>
                        setForm((f) =>
                          f ? { ...f, failureNotifyEmail: email } : f,
                        )
                      }
                    />
                    <Hint>
                      Delivery failures, kiosk errors, offline displays and
                      overlay conflicts.
                    </Hint>
                  </View>
                </View>
              </SectionCard>

              <SectionCard
                title="Message templates"
                description={`Separate email and SMS wording for each delivery kind. Available variables: ${variables
                  .map((v) => `{{${v}}}`)
                  .join(", ")}`}
              >
                <View className="gap-3">
                  {templates.map((template) => {
                    const draft = templateDraft[template.id] ?? template;
                    const open = openTemplate === template.id;

                    return (
                      <View
                        key={template.id}
                        className="rounded-xl border border-gray-100 dark:border-neutral-800"
                      >
                        <Pressable
                          onPress={() =>
                            setOpenTemplate(open ? null : template.id)
                          }
                          className="flex-row items-center justify-between px-4 py-3"
                          accessibilityRole="button"
                        >
                          <Text className="flex-1 font-medium text-gray-900 dark:text-white">
                            {KIND_LABELS[template.kind] ?? template.kind}
                          </Text>
                          <Text className="text-sm text-gray-500 dark:text-gray-400">
                            {open ? "Close" : "Edit"}
                          </Text>
                        </Pressable>

                        {open && (
                          <View className="gap-3 px-4 pb-4">
                            <View>
                              <FieldLabel>Email subject</FieldLabel>
                              <TextField
                                value={draft.emailSubject}
                                onChangeText={(v) =>
                                  setTemplateDraft((prev) => ({
                                    ...prev,
                                    [template.id]: {
                                      ...draft,
                                      emailSubject: v,
                                    },
                                  }))
                                }
                              />
                            </View>

                            <View>
                              <FieldLabel>Email body</FieldLabel>
                              <TextField
                                value={draft.emailBody}
                                onChangeText={(v) =>
                                  setTemplateDraft((prev) => ({
                                    ...prev,
                                    [template.id]: { ...draft, emailBody: v },
                                  }))
                                }
                                multiline
                                numberOfLines={6}
                                mono
                              />
                            </View>

                            <View>
                              <FieldLabel>SMS body</FieldLabel>
                              <TextField
                                value={draft.smsBody}
                                onChangeText={(v) =>
                                  setTemplateDraft((prev) => ({
                                    ...prev,
                                    [template.id]: { ...draft, smsBody: v },
                                  }))
                                }
                                multiline
                                numberOfLines={3}
                              />
                              <Hint>{`${draft.smsBody.length} characters`}</Hint>
                            </View>

                            <View className="flex-row gap-2">
                              <Pressable
                                onPress={() => void saveTemplate(template.id)}
                                disabled={saving}
                                className={`flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-[#0644C7] py-3 ${
                                  saving ? "opacity-60" : ""
                                }`}
                                accessibilityRole="button"
                              >
                                <Feather
                                  name="save"
                                  size={15}
                                  color="#FFFFFF"
                                />
                                <Text className="text-sm font-semibold text-white">
                                  Save template
                                </Text>
                              </Pressable>
                              <Pressable
                                onPress={() =>
                                  void restoreTemplate(template.id)
                                }
                                disabled={saving}
                                className={`flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-gray-200 py-3 dark:border-neutral-700 ${
                                  saving ? "opacity-60" : ""
                                }`}
                                accessibilityRole="button"
                              >
                                <Feather
                                  name="rotate-ccw"
                                  size={15}
                                  color="#4B5563"
                                />
                                <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                  Restore default
                                </Text>
                              </Pressable>
                            </View>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              </SectionCard>

              <SectionCard title="Fixed rules" tinted>
                <LockedRow
                  label="Staff session size"
                  value={`up to ${data.locked.staffMaxPhotos} photos`}
                />
                <LockedRow
                  label="Kiosk session size"
                  value={`${data.locked.kioskMaxPhotos} photo`}
                />
                <LockedRow
                  label="Kiosk inactivity reset"
                  value={`${data.locked.kioskIdleSeconds} seconds on every page`}
                />
                <LockedRow
                  label="QR validity"
                  value={`${data.locked.qrValidHours} hours`}
                />
                <LockedRow
                  label="Customer photo page"
                  value={`${data.locked.accessValidDays} days`}
                />
                <LockedRow
                  label="Operating day starts"
                  value={`${data.locked.operatingDayCutoffHour}:00 AM location time`}
                />
                <LockedRow
                  label="Scheduled delivery"
                  value={`${data.locked.nextDayDeliveryHour}:00 AM the next day`}
                />
              </SectionCard>
            </>
          )}
        </ScrollView>

        {/* Always reachable while the long form scrolls. */}
        {!!data && !!form && (
          <View
            className="border-t border-gray-100 bg-white px-5 pt-3 dark:border-neutral-800 dark:bg-neutral-900"
            style={{ paddingBottom: insets.bottom + 12 }}
          >
            <Pressable
              onPress={() => void save()}
              disabled={saving}
              className={`h-12 flex-row items-center justify-center gap-2 rounded-xl bg-[#0644C7] active:opacity-90 ${
                saving ? "opacity-60" : ""
              }`}
              accessibilityRole="button"
              accessibilityLabel="Save settings"
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Feather name="save" size={16} color="#FFFFFF" />
              )}
              <Text className="text-sm font-semibold text-white">
                Save settings
              </Text>
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>

      {!!toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => showToast(null)}
        />
      )}
    </View>
  );
}
