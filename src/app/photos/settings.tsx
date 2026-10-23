import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

import { MessageLinksPanel } from "../../components/photos/MessageLinksPanel";
import { EmailSuggestions } from "../../components/ui/EmailSuggestions";
import { LocationWorkspaceSelector } from "../../components/ui/LocationWorkspaceSelector";
import { SheetSelect } from "../../components/ui/SheetSelect";
import { Toast, type ToastType } from "../../components/ui/Toast";
import {
  SkeletonBlock,
  usePulse,
} from "../../components/ui/skeleton/SkeletonBlock";
import { useAppUpdateNoticeInset } from "../../lib/hooks/useAppUpdateNotice";
import { useTransientAlert } from "../../lib/hooks/useTransientAlert";
import { escapeRoomEmailNote } from "../../lib/escapeRooms/gameFollowUp";
import { useActiveLocation } from "../../lib/location/activeLocationStore";
import {
  fallbackTextingStatus,
  TEXTING_STATE_BADGE,
  TEXTING_STATE_CARD,
  testTextSizeLine,
  textingRecentLine,
  textingTopProblemLine,
  textingVerifiedLine,
} from "../../lib/photos/deliveryOutcome";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  fetchPhotoSettings,
  fetchPhotoTemplates,
  fetchTestMessageStatus,
  resetPhotoTemplate,
  resetTextingConfirmation,
  rotatePhotoPasscode,
  sendPhotoTestMessage,
  updatePhotoSettings,
  updatePhotoTemplate,
  type PhotoMessageLink,
  type PhotoMessageTemplate,
  type PhotoSettings,
  type PhotoTemplates,
  type PhotoTestChannel,
} from "../../services/photosService";

const TEST_POLL_INTERVAL_MS = 4000;
const TEST_POLL_LIMIT = 15;

/** A test send's line under the field; a text stays "info" until the carrier answers. */
type TestOutcome = { tone: "success" | "error" | "info"; message: string };

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
  immediate: "Immediate delivery",
  next_day: "9:00 AM next-day delivery",
  kiosk: "Kiosk delivery",
  registration: "Event registration photos",
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
  badge,
  cardClass,
  detail,
  note,
  children,
}: {
  icon: keyof typeof Feather.glyphMap;
  name: string;
  available: boolean;
  /** Overrides the sending / not sending badge (SMS shows its texting state). */
  badge?: { label: string; className: string };
  cardClass?: string;
  detail: React.ReactNode;
  note: string | null;
  children?: React.ReactNode;
}) {
  return (
    <View
      className={`mb-3 rounded-xl border p-4 ${
        cardClass ??
        (available
          ? "border-green-200 bg-green-50/60 dark:border-green-900/40 dark:bg-green-900/10"
          : "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/10")
      }`}
    >
      <View className="flex-row items-center gap-2">
        <Feather name={icon} size={16} color="#111827" />
        <Text className="font-medium text-gray-900 dark:text-white">
          {name}
        </Text>
        <View
          className={`ml-auto rounded-full px-2 py-0.5 ${
            badge?.className ?? (available ? "bg-green-600" : "bg-amber-500")
          }`}
        >
          <Text className="text-xs text-white">
            {badge?.label ?? (available ? "sending" : "not sending")}
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
  size,
  tracking,
}: {
  label: string;
  placeholder: string;
  keyboardType: "email-address" | "phone-pad";
  value: string;
  onChangeText: (v: string) => void;
  onSend: () => void;
  sending: boolean;
  result: TestOutcome | null;
  /** How a real photo text is billed (SMS only). */
  size?: string | null;
  /** Still waiting for the carrier to confirm the test text. */
  tracking?: boolean;
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
        <View className="mt-2 flex-row items-start gap-1.5">
          {tracking && <ActivityIndicator size="small" color="#374151" />}
          <Text
            accessibilityLiveRegion="polite"
            className={`flex-1 text-sm ${
              result.tone === "success"
                ? "text-green-800 dark:text-green-400"
                : result.tone === "error"
                  ? "text-red-700 dark:text-red-400"
                  : "text-gray-700 dark:text-gray-300"
            }`}
          >
            {result.message}
          </Text>
        </View>
      )}
      {!!size && (
        <Text className="mt-1 text-xs text-gray-600 dark:text-gray-400">{size}</Text>
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

/** A ticked option for the registration email's switches (the web's checkboxes). */
function CheckRow({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <Pressable
      onPress={onToggle}
      className="flex-row items-start gap-2.5"
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View
        className={`mt-0.5 h-5 w-5 items-center justify-center rounded border-2 ${
          checked ? "border-[#0644C7] bg-[#0644C7]" : "border-gray-300 dark:border-neutral-600"
        }`}
      >
        {checked && <Feather name="check" size={13} color="#FFFFFF" />}
      </View>
      <Text className="flex-1 text-sm text-gray-800 dark:text-gray-200">{label}</Text>
    </Pressable>
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
  // "Edit its wording" on a registration form opens the event registration email.
  const { open: openParam } = useLocalSearchParams<{ open?: string }>();
  // The update reminder floats above every screen until the app is
  // updated; without this it would sit on top of the buttons below.
  const updateNoticeInset = useAppUpdateNoticeInset();

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
    Record<PhotoTestChannel, TestOutcome | null>
  >({ email: null, sms: null });
  const [testSize, setTestSize] = useState<string | null>(null);
  // A test text the carrier has not confirmed yet, checked every few seconds.
  const [smsTracking, setSmsTracking] = useState<{
    reference: string;
    token: string;
    checks: number;
  } | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const [resettingTexting, setResettingTexting] = useState(false);
  const [showConfirmHelp, setShowConfirmHelp] = useState(false);
  const canResetTexting = ["company_admin", "admin"].includes(String(user?.role ?? ""));

  const [templates, setTemplates] = useState<PhotoMessageTemplate[]>([]);
  const [variables, setVariables] = useState<string[]>([]);
  const [escapeRoomEmail, setEscapeRoomEmail] =
    useState<PhotoTemplates["escapeRoomEmail"]>(null);
  const escapeRoomNote = escapeRoomEmailNote(escapeRoomEmail);
  const [openTemplate, setOpenTemplate] = useState<number | null>(null);
  const [templateDraft, setTemplateDraft] = useState<
    Record<number, PhotoMessageTemplate>
  >({});
  const [variablesByKind, setVariablesByKind] = useState<Record<string, string[]> | null>(null);
  const [linkVariables, setLinkVariables] = useState<string[]>([]);
  const [templateTestTo, setTemplateTestTo] = useState<Record<number, string>>({});
  const [templateTesting, setTemplateTesting] = useState<number | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const registrationCardRef = useRef<View>(null);
  const openedFromLink = useRef(false);

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
      setVariablesByKind(templateData.variablesByKind);
      setLinkVariables(templateData.linkVariables.map((link) => link.variable));
      setEscapeRoomEmail(templateData.escapeRoomEmail);
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
      if (channel === "sms") {
        setTestSize(null);
        setSmsTracking(null);
      }
      try {
        const result = await sendPhotoTestMessage(token, {
          locationId: effectiveLocationId,
          channel,
          destination,
        });
        // A text accepted by the provider is not yet on the phone, so it reads as pending.
        const tone = result.success ? (channel === "sms" ? "info" : "success") : "error";
        setTestResult((r) => ({ ...r, [channel]: { tone, message: result.message } }));
        if (channel === "sms") {
          setTestSize(testTextSizeLine(result));
          if (result.success && result.providerReference && result.checkToken) {
            setSmsTracking({ reference: result.providerReference, token: result.checkToken, checks: 0 });
          }
        }
      } finally {
        setTesting(null);
      }
    },
    [effectiveLocationId, testTo, testing],
  );

  useEffect(() => {
    if (!smsTracking || !effectiveLocationId) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const token = getToken();
      if (!token) return;
      try {
        const status = await fetchTestMessageStatus(token, {
          locationId: effectiveLocationId,
          providerReference: smsTracking.reference,
          checkToken: smsTracking.token,
        });
        if (cancelled || !mounted.current) return;
        if (status.final) {
          setTestResult((r) => ({
            ...r,
            sms: { tone: status.delivered ? "success" : "error", message: status.message },
          }));
          setSmsTracking(null);
          return;
        }
      } catch {
        if (cancelled || !mounted.current) return;
      }
      if (cancelled) return;
      if (smsTracking.checks + 1 >= TEST_POLL_LIMIT) {
        setTestResult((r) => ({
          ...r,
          sms: {
            tone: "info",
            message:
              "The phone carrier has not confirmed the test yet. Check the phone. If nothing arrives, an administrator can run: php artisan sms:diagnose --sid=" +
              smsTracking.reference,
          },
        }));
        setSmsTracking(null);
        return;
      }
      setSmsTracking((prev) =>
        prev && prev.reference === smsTracking.reference ? { ...prev, checks: prev.checks + 1 } : prev,
      );
    }, TEST_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [effectiveLocationId, smsTracking]);

  const resetTexting = useCallback(() => {
    const token = getToken();
    if (!token || !effectiveLocationId || resettingTexting) return;
    Alert.alert(
      "Mark texting as not confirmed?",
      "It shows as confirmed again once a guest receives a photo text on their phone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Mark not confirmed",
          style: "destructive",
          onPress: async () => {
            setResettingTexting(true);
            try {
              const result = await resetTextingConfirmation(token, effectiveLocationId);
              setData((prev) =>
                prev && result.texting
                  ? {
                      ...prev,
                      channels: { ...prev.channels, smsStatus: result.texting, smsNote: result.texting.note },
                    }
                  : prev,
              );
              showToast({ message: result.message, type: "success" });
            } catch (e) {
              showToast({ message: errorMessage(e, "That could not be reset."), type: "error" });
            } finally {
              setResettingTexting(false);
            }
          },
        },
      ],
    );
  }, [effectiveLocationId, resettingTexting, showToast]);

  const texting = data
    ? (data.channels.smsStatus ?? fallbackTextingStatus(data.channels.smsAvailable, data.channels.smsNote))
    : null;

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
          ...(draft.kind === "registration"
            ? { isActive: draft.isActive, attachPhotos: draft.attachPhotos }
            : {}),
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

  const sendTemplateTest = useCallback(
    async (template: PhotoMessageTemplate) => {
      const token = getToken();
      if (!token || !effectiveLocationId || templateTesting !== null) return;
      const destination = (templateTestTo[template.id] ?? "").trim();
      if (!destination) {
        showToast({ message: "Enter an email address for the test.", type: "error" });
        return;
      }
      setTemplateTesting(template.id);
      try {
        const result = await sendPhotoTestMessage(token, {
          locationId: effectiveLocationId,
          channel: "email",
          destination,
          kind: template.kind,
        });
        showToast({
          message:
            result.message ||
            (result.success ? "Test email sent." : "The test email could not be sent."),
          type: result.success ? "success" : "error",
        });
      } finally {
        setTemplateTesting(null);
      }
    },
    [effectiveLocationId, showToast, templateTestTo, templateTesting],
  );

  const notify = useCallback(
    (message: string, type: ToastType) => showToast({ message, type }),
    [showToast],
  );
  const handleLinksChanged = useCallback(
    (links: PhotoMessageLink[]) => setLinkVariables(links.map((link) => link.variable)),
    [],
  );

  // Opened from a registration form: open the event registration email and bring it into view.
  useEffect(() => {
    if (openedFromLink.current || openParam !== "registration-email") return;
    const registration = templates.find((template) => template.kind === "registration");
    if (!registration) return;
    openedFromLink.current = true;
    setOpenTemplate(registration.id);
    const timer = setTimeout(() => {
      const card = registrationCardRef.current;
      const scroll = scrollRef.current;
      if (!card || !scroll) return;
      try {
        card.measureLayout(
          scroll as unknown as View,
          (_x, y) => scroll.scrollTo({ y: Math.max(0, scrollY.current + y - 16), animated: true }),
          () => {},
        );
      } catch {
        // The card is open either way; scrolling to it is a convenience.
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [openParam, templates]);

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
          ref={scrollRef}
          className="flex-1"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onScroll={(e) => {
            scrollY.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
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
                description="Whether this site can actually send a photo link right now. Waivers and event registrations that only carry an unavailable channel are shown as not contactable, so staff are pointed at the direct QR code instead."
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
                {texting && (
                  <ChannelCard
                    icon="message-square"
                    name="SMS"
                    available={data.channels.smsAvailable}
                    badge={TEXTING_STATE_BADGE[texting.state]}
                    cardClass={TEXTING_STATE_CARD[texting.state]}
                    note={null}
                    detail={
                      <View>
                        <Text className="text-sm text-gray-700 dark:text-gray-200">
                          Provider: Twilio
                          {!!texting.sender && (
                            <Text>
                              {" · sending from "}
                              <Text className="text-xs text-gray-900 dark:text-white">
                                {texting.sender}
                              </Text>
                              {texting.senderKind === "toll_free" ? " (toll-free)" : ""}
                            </Text>
                          )}
                        </Text>
                        <Text className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                          {texting.headline}
                        </Text>
                        {!!data.channels.smsNote && (
                          <Text className="mt-1 text-sm text-gray-800 dark:text-gray-200">
                            {data.channels.smsNote}
                          </Text>
                        )}
                        {!!textingVerifiedLine(texting) && (
                          <Text className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                            {textingVerifiedLine(texting)}
                          </Text>
                        )}
                        {!!textingRecentLine(texting) && (
                          <Text className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                            {textingRecentLine(texting)}
                          </Text>
                        )}
                        {!!textingTopProblemLine(texting) && (
                          <Text className="mt-1 text-xs text-red-700 dark:text-red-400">
                            {textingTopProblemLine(texting)}
                          </Text>
                        )}
                        {(texting.state === "unverified" || texting.state === "failing") && (
                          <View className="mt-3">
                            <Pressable
                              onPress={() => setShowConfirmHelp((v) => !v)}
                              accessibilityRole="button"
                              accessibilityState={{ expanded: showConfirmHelp }}
                              className="flex-row items-center gap-1 active:opacity-70"
                            >
                              <Feather
                                name={showConfirmHelp ? "chevron-down" : "chevron-right"}
                                size={14}
                                color="#1F2937"
                              />
                              <Text className="text-sm font-medium text-gray-800 dark:text-gray-200">
                                How to confirm texting works
                              </Text>
                            </Pressable>
                            {showConfirmHelp && (
                              <View className="mt-2 gap-1 pl-1">
                                <Text className="text-sm text-gray-800 dark:text-gray-200">
                                  1. On Photo Capture, send a photo to a real guest&apos;s waiver that has their mobile number.
                                </Text>
                                <Text className="text-sm text-gray-800 dark:text-gray-200">
                                  2. Stay on the result screen until the text shows “Delivered to the phone” or “Not delivered”.
                                </Text>
                                <Text className="text-sm text-gray-800 dark:text-gray-200">
                                  3. Ask the guest to show you the text. If it is there, tap “Guest received it”. The guest opening the link from the text confirms it straight away.
                                </Text>
                                <Text className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                                  A staff tap counts once the phone carrier reports that text delivered, or after three days if the carrier reports no problem. The test below only checks the provider and the carrier; it does not confirm texting for guests on its own.
                                </Text>
                              </View>
                            )}
                          </View>
                        )}
                        {canResetTexting && !!texting.verified && (
                          <Pressable
                            onPress={resetTexting}
                            disabled={resettingTexting}
                            accessibilityRole="button"
                            className={`mt-3 self-start ${resettingTexting ? "opacity-50" : "active:opacity-70"}`}
                          >
                            <Text className="text-xs text-gray-700 underline dark:text-gray-300">
                              Mark texting as not confirmed
                            </Text>
                          </Pressable>
                        )}
                      </View>
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
                      size={testSize}
                      tracking={!!smsTracking}
                    />
                  </ChannelCard>
                )}

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
                <View className="mb-3 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 dark:border-indigo-900/40 dark:bg-indigo-900/20">
                  <Text className="text-sm text-gray-600 dark:text-gray-300">
                    {escapeRoomNote.before}
                    {escapeRoomNote.links.map((link, index) => (
                      <Text key={link.id ?? "all"}>
                        {index > 0 ? "; " : ""}
                        <Text
                          className="font-semibold underline"
                          onPress={() =>
                            router.push(
                              link.id != null
                                ? {
                                    pathname: "/email-campaign/create-notification",
                                    params: { id: String(link.id) },
                                  }
                                : "/email-campaign/email-notification",
                            )
                          }
                        >
                          {link.text}
                        </Text>
                        {link.rooms !== null ? ` (${link.rooms})` : ""}
                      </Text>
                    ))}
                    {escapeRoomNote.after}
                  </Text>
                </View>
                <View className="gap-3">
                  {templates.map((template) => {
                    const draft = templateDraft[template.id] ?? template;
                    const open = openTemplate === template.id;
                    const isRegistration = template.kind === "registration";
                    const templateVariables = [
                      ...(variablesByKind?.[template.kind] ?? variables),
                      ...linkVariables,
                    ];

                    return (
                      <View
                        key={template.id}
                        ref={isRegistration ? registrationCardRef : undefined}
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
                            {isRegistration && (
                              <View className="gap-2 rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-neutral-800 dark:bg-neutral-800/60">
                                <Text className="text-sm text-gray-700 dark:text-gray-300">
                                  {"Used for every photo sent to someone who registered for an event, from the photo screen or the photo library. Change the wording between events; {{event_name}} and {{event_date}} fill in by themselves."}
                                </Text>
                                <CheckRow
                                  checked={draft.isActive}
                                  onToggle={() =>
                                    setTemplateDraft((prev) => ({
                                      ...prev,
                                      [template.id]: { ...draft, isActive: !draft.isActive },
                                    }))
                                  }
                                  label="Use this email for event registrations (when off, registrants get the usual photo email)"
                                />
                                <CheckRow
                                  checked={draft.attachPhotos}
                                  onToggle={() =>
                                    setTemplateDraft((prev) => ({
                                      ...prev,
                                      [template.id]: { ...draft, attachPhotos: !draft.attachPhotos },
                                    }))
                                  }
                                  label="Attach the photos to the email as well as the link"
                                />
                              </View>
                            )}

                            <Text className="text-xs text-gray-500 dark:text-gray-400">
                              {`Variables for this message: ${templateVariables
                                .map((v) => `{{${v}}}`)
                                .join(", ")}`}
                            </Text>

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
                              {isRegistration && (
                                <TestSendRow
                                  label="Send a test of the saved email to"
                                  placeholder="you@example.com"
                                  keyboardType="email-address"
                                  value={templateTestTo[template.id] ?? ""}
                                  onChangeText={(v) =>
                                    setTemplateTestTo((prev) => ({ ...prev, [template.id]: v }))
                                  }
                                  onSend={() => void sendTemplateTest(template)}
                                  sending={templateTesting === template.id}
                                  result={null}
                                />
                              )}
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

              <MessageLinksPanel
                onNotify={notify}
                onLinksChanged={handleLinksChanged}
              />

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
            style={{ paddingBottom: insets.bottom + 12 + updateNoticeInset }}
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
