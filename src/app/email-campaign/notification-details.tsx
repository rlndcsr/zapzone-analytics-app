import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "../../components/ui/BottomSheet";
import { CARD_SHADOW, DetailActionButton } from "../../components/ui/DetailKit";
import { GuestRatingsPanel } from "../../components/ui/GuestRatingsPanel";
import { SendTestEmailSheet } from "../../components/ui/SendTestEmailSheet";
import { OverrideList } from "../../components/ui/VisitEmailSettings";
import { mediaUrl } from "../../lib/api";
import {
  canDuplicateNotification,
  canSetUpVisitEmail,
  visitFollowupTiming,
} from "../../lib/email/visitEmail";
import { markEmailNotificationsStale } from "../../lib/emailStale";
import { extractImageSrcs, htmlToPlainText } from "../../lib/htmlText";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  deleteEmailNotification,
  duplicateEmailNotification,
  fetchEmailNotificationDetail,
  fetchEmailNotificationLogs,
  resendEmailNotificationLog,
  sendTestEmailNotification,
  toggleEmailNotificationStatus,
  type EmailNotificationDetail,
  type EmailNotificationLog,
} from "../../services/emailService";

const PRIMARY = "#0644C7";
const LOGS_PER_PAGE = 10;
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

type IconName = React.ComponentProps<typeof Feather>["name"];

/** "Sep 30, 2026, 10:14 PM" — the web's `formatDate` (2-digit hour). */
function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  let h = d.getHours();
  const mer = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const hh = `${h}`.padStart(2, "0");
  const min = `${d.getMinutes()}`.padStart(2, "0");
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}, ${hh}:${min} ${mer}`;
}

const titleCase = (t: string) =>
  t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const RECIPIENT_LABEL: Record<string, string> = {
  customer: "Customer",
  staff: "Staff",
  company_admin: "Company Admin",
  location_manager: "Location Manager",
  custom: "Custom Email",
};

/** The web's getTriggerIcon, in Feather. */
function triggerIcon(trigger: string): IconName {
  if (trigger.startsWith("booking_")) return "calendar";
  if (trigger.startsWith("purchase_")) return "tag";
  if (trigger.startsWith("payment_")) return "credit-card";
  if (trigger === "visit_followup") return "star";
  if (trigger === "visit_completed") return "award";
  return "bell";
}

function entityIcon(entity: string): IconName {
  if (entity === "package") return "package";
  if (entity === "attraction") return "tag";
  return "users";
}

const LOG_STATUS: Record<
  EmailNotificationLog["status"],
  { label: string; icon: IconName; color: string; wrap: string; text: string }
> = {
  sent: {
    label: "Sent",
    icon: "check-circle",
    color: "#1D4ED8",
    wrap: "bg-blue-100 dark:bg-blue-900/30",
    text: "text-blue-700 dark:text-blue-300",
  },
  failed: {
    label: "Failed",
    icon: "x-circle",
    color: "#B91C1C",
    wrap: "bg-red-100 dark:bg-red-900/30",
    text: "text-red-700 dark:text-red-300",
  },
  pending: {
    label: "Pending",
    icon: "clock",
    color: "#374151",
    wrap: "bg-gray-100 dark:bg-neutral-800",
    text: "text-gray-700 dark:text-gray-300",
  },
};

/* --- Presentational helpers ------------------------------------------- */

const Card = ({
  children,
  padded = true,
}: {
  children: React.ReactNode;
  padded?: boolean;
}) => (
  <View
    className={`bg-white dark:bg-neutral-900 rounded-2xl mb-4 border border-gray-100 dark:border-neutral-800 overflow-hidden ${
      padded ? "p-5" : ""
    }`}
    style={CARD_SHADOW}
  >
    {children}
  </View>
);

const CardTitle = ({ icon, title }: { icon?: IconName; title: string }) => (
  <View className="flex-row items-center gap-2 mb-4">
    {!!icon && <Feather name={icon} size={18} color="#4B5563" />}
    <Text className="text-lg font-semibold text-gray-900 dark:text-white">{title}</Text>
  </View>
);

const FieldLabel = ({ children }: { children: string }) => (
  <Text className="text-sm font-medium text-gray-500 dark:text-gray-400">{children}</Text>
);

/** Small outlined button for a card header (Preview / Refresh). */
const SmallButton = ({
  icon,
  label,
  onPress,
  disabled = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={label}
    className={`flex-row items-center gap-1.5 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-1.5 ${
      disabled ? "opacity-50" : "active:opacity-70"
    }`}
  >
    <Feather name={icon} size={13} color="#374151" />
    <Text className="text-xs font-medium text-gray-700 dark:text-gray-200">{label}</Text>
  </Pressable>
);

const StatRow = ({
  icon,
  label,
  value,
  wrap,
  tint,
  text,
}: {
  icon: IconName;
  label: string;
  value: number;
  wrap: string;
  tint: string;
  text: string;
}) => (
  <View className={`flex-row items-center justify-between p-3 rounded-lg ${wrap}`}>
    <View className="flex-row items-center gap-2">
      <Feather name={icon} size={15} color={tint} />
      <Text className={`text-sm ${text}`}>{label}</Text>
    </View>
    <Text className={`text-lg font-semibold ${text}`}>{value}</Text>
  </View>
);

/** The body as the app can show it — text, then any images it carries. */
const BodyContent = ({ text, images }: { text: string; images: string[] }) => (
  <>
    {text ? (
      <Text className="text-sm leading-6 text-gray-700 dark:text-gray-200">{text}</Text>
    ) : (
      <Text className="text-sm italic text-gray-400 dark:text-gray-500">(No content)</Text>
    )}
    {images.length > 0 && (
      <View className="mt-3 gap-3">
        {images.map((uri, i) => (
          <Image
            key={`${uri}-${i}`}
            source={{ uri }}
            style={{ width: "100%", height: 180, borderRadius: 12 }}
            contentFit="contain"
            transition={150}
          />
        ))}
      </View>
    )}
  </>
);

const NotificationDetails = () => {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const headerIcon = scheme === "dark" ? "#FFFFFF" : "#111827";

  const { id } = useLocalSearchParams<{ id?: string }>();
  const notificationId = id ? Number(id) : null;

  const [detail, setDetail] = useState<EmailNotificationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showTest, setShowTest] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const [logs, setLogs] = useState<EmailNotificationLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsPage, setLogsPage] = useState(1);
  const [logsLastPage, setLogsLastPage] = useState(1);
  const [logsTotal, setLogsTotal] = useState(0);
  const [resendingId, setResendingId] = useState<number | null>(null);

  const loadDetail = useCallback(async () => {
    if (notificationId == null || Number.isNaN(notificationId)) {
      setError("Notification not found");
      setLoading(false);
      return;
    }
    const token = getToken();
    if (!token) {
      setError("Not signed in");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const d = await fetchEmailNotificationDetail(token, notificationId);
      setDetail(d);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notification");
    } finally {
      setLoading(false);
    }
  }, [notificationId]);

  const loadLogs = useCallback(async () => {
    const token = getToken();
    if (!token || notificationId == null || Number.isNaN(notificationId)) return;
    setLogsLoading(true);
    try {
      const r = await fetchEmailNotificationLogs(token, notificationId, logsPage, LOGS_PER_PAGE);
      setLogs(r.logs);
      setLogsTotal(r.total);
      setLogsLastPage(r.lastPage);
    } catch {
      // Leave the last good page on screen; Refresh retries.
    } finally {
      setLogsLoading(false);
    }
  }, [notificationId, logsPage]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const runAction = useCallback(
    async (key: string, fn: () => Promise<void>, leave = false) => {
      const token = getToken();
      if (!token || notificationId == null) return;
      setBusy(key);
      try {
        await fn();
        markEmailNotificationsStale();
        if (leave) router.back();
        else await loadDetail();
      } catch (err) {
        Alert.alert("Action failed", err instanceof Error ? err.message : "Please try again.");
      } finally {
        setBusy(null);
      }
    },
    [notificationId, loadDetail],
  );

  const confirmDelete = () =>
    Alert.alert(
      "Delete Notification",
      `Are you sure you want to delete "${detail?.name ?? "this notification"}"? All associated logs will also be deleted.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Notification",
          style: "destructive",
          onPress: () =>
            runAction("delete", () => deleteEmailNotification(getToken()!, notificationId!), true),
        },
      ],
    );

  const sendTest = useCallback(
    async (email: string) => {
      const token = getToken();
      if (!token || notificationId == null || !email) return;
      setSendingTest(true);
      try {
        await sendTestEmailNotification(token, notificationId, email);
        setShowTest(false);
        Alert.alert("Test sent", "A test email has been sent.");
        void loadLogs();
      } catch (err) {
        Alert.alert("Send failed", err instanceof Error ? err.message : "Please try again.");
      } finally {
        setSendingTest(false);
      }
    },
    [notificationId, loadLogs],
  );

  const resendLog = useCallback(
    async (logId: number) => {
      const token = getToken();
      if (!token || notificationId == null) return;
      setResendingId(logId);
      try {
        await resendEmailNotificationLog(token, notificationId, logId);
        Alert.alert("Email resent", "The email was sent again.");
        void loadLogs();
      } catch (err) {
        Alert.alert("Resend failed", err instanceof Error ? err.message : "Please try again.");
      } finally {
        setResendingId(null);
      }
    },
    [notificationId, loadLogs],
  );

  const openEdit = () => {
    if (!detail) return;
    router.push({
      pathname: "/email-campaign/create-notification",
      params: { id: String(detail.id) },
    });
  };

  const BackBar = ({ children }: { children?: React.ReactNode }) => (
    <View className="bg-white dark:bg-neutral-900 pt-12 pb-4 px-5 w-full border-b border-gray-100 dark:border-neutral-800">
      <View className="flex-row items-start gap-3">
        <Pressable
          onPress={() => router.back()}
          className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Feather name="chevron-left" size={20} color={headerIcon} />
        </Pressable>
        <View className="flex-1">{children}</View>
      </View>
    </View>
  );

  if (loading && !detail) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-black">
        <BackBar />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={PRIMARY} />
        </View>
      </View>
    );
  }

  if (error || !detail) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-black">
        <BackBar />
        <View className="flex-1 items-center justify-center px-8">
          <Feather name="bell" size={40} color="#9CA3AF" />
          <Text className="text-lg font-medium text-gray-900 dark:text-white mt-3 text-center">
            {error ?? "Notification not found"}
          </Text>
          <Pressable onPress={() => router.back()} className="mt-4 px-5 py-2.5 rounded-xl bg-[#0644C7]">
            <Text className="text-sm font-semibold text-white">Back to Notifications</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const bodyText = htmlToPlainText(detail.body);
  const images = extractImageSrcs(detail.body)
    .map((s) => mediaUrl(s))
    .filter((u): u is string => !!u);
  const appliesTo =
    detail.entityType === "all"
      ? detail.triggerType.startsWith("visit_")
        ? "Every Visit"
        : "All Entities"
      : titleCase(`${detail.entityType}s`);
  const promo = detail.promoSummary;
  // Truthy, as the web tests them — a 0-hour value shows no Timing row.
  const timing = [
    detail.sendBeforeHours ? `${detail.sendBeforeHours} hours before event` : null,
    detail.sendAfterHours
      ? detail.triggerType === "visit_followup"
        ? visitFollowupTiming(detail.sendAfterHours)
        : `${detail.sendAfterHours} hours after event`
      : null,
  ]
    .filter(Boolean)
    .join("");
  const stats = detail.statistics;
  const countOf = (s: EmailNotificationLog["status"]) => logs.filter((l) => l.status === s).length;

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Name + status, then "Created on …" — the web page header. */}
      <BackBar>
        <View className="flex-row items-center gap-2 flex-wrap">
          <Text className="text-xl font-bold text-gray-900 dark:text-white">{detail.name}</Text>
          <View
            className={`flex-row items-center gap-1 px-2.5 py-1 rounded-full ${
              detail.isActive ? "bg-blue-100 dark:bg-blue-900/30" : "bg-gray-100 dark:bg-neutral-800"
            }`}
          >
            <Feather
              name={detail.isActive ? "check-circle" : "x-circle"}
              size={12}
              color={detail.isActive ? "#1D4ED8" : "#4B5563"}
            />
            <Text
              className={`text-xs font-medium ${
                detail.isActive ? "text-blue-700 dark:text-blue-300" : "text-gray-600 dark:text-gray-300"
              }`}
            >
              {detail.isActive ? "Active" : "Inactive"}
            </Text>
          </View>
        </View>
        <Text className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Created on {fmtDateTime(detail.createdAt)}
        </Text>
      </BackBar>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
      >
        {/* Actions — at the top, in the web's order. */}
        <View className="flex-row flex-wrap gap-2 mb-4">
          <DetailActionButton
            icon="send"
            label="Send Test"
            disabled={busy !== null}
            onPress={() => setShowTest(true)}
          />
          {canDuplicateNotification(
            detail.isDefault,
            detail.triggerType,
            canSetUpVisitEmail(getCurrentUser()?.role, getCurrentUser()?.location_id),
          ) && (
            <DetailActionButton
              icon="copy"
              label="Duplicate"
              busy={busy === "duplicate"}
              disabled={busy !== null}
              onPress={() => runAction("duplicate", () => duplicateEmailNotification(getToken()!, notificationId!))}
            />
          )}
          <DetailActionButton
            icon="power"
            label={detail.isActive ? "Deactivate" : "Activate"}
            variant={detail.isActive ? "outline" : "primary"}
            busy={busy === "toggle"}
            disabled={busy !== null || !detail.canEdit}
            onPress={() => runAction("toggle", () => toggleEmailNotificationStatus(getToken()!, notificationId!))}
          />
          <DetailActionButton
            icon="edit"
            label="Edit"
            variant="primary"
            disabled={busy !== null}
            onPress={openEdit}
          />
          {/* The server refuses to delete a default, so it is shown but greyed out. */}
          <DetailActionButton
            icon="trash-2"
            label="Delete"
            variant="dangerSolid"
            busy={busy === "delete"}
            disabled={busy !== null || !detail.canEdit || detail.isDefault}
            onPress={confirmDelete}
          />
        </View>

        {/* Configuration */}
        <Card>
          <CardTitle title="Configuration" />
          <View className="gap-4">
            <View>
              <FieldLabel>Trigger Type</FieldLabel>
              <View className="mt-1 flex-row">
                <View className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-100 border border-blue-200 dark:bg-blue-900/30 dark:border-blue-900/50">
                  <Feather name={triggerIcon(detail.triggerType)} size={14} color="#1D4ED8" />
                  <Text className="text-sm font-medium text-blue-700 dark:text-blue-300">
                    {detail.triggerLabel || detail.triggerType}
                  </Text>
                </View>
              </View>
            </View>

            <View>
              <FieldLabel>Applies To</FieldLabel>
              <View className="mt-1 flex-row">
                <View className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 border border-gray-200 dark:bg-neutral-800 dark:border-neutral-700">
                  <Feather name={entityIcon(detail.entityType)} size={14} color="#374151" />
                  <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">{appliesTo}</Text>
                </View>
              </View>
            </View>

            <View className="flex-row gap-4">
              <View className="flex-1">
                <FieldLabel>Location</FieldLabel>
                <Text className="mt-1 text-sm text-gray-900 dark:text-white">
                  {detail.locationName || "All Locations"}
                </Text>
              </View>
              <View className="flex-1">
                <FieldLabel>QR Code</FieldLabel>
                {detail.includeQrCode ? (
                  <View className="mt-1 flex-row items-center gap-1.5">
                    <Feather name="grid" size={14} color={PRIMARY} />
                    <Text className="text-sm text-[#0644C7]">Included</Text>
                  </View>
                ) : (
                  <Text className="mt-1 text-sm text-gray-500 dark:text-gray-400">Not included</Text>
                )}
              </View>
            </View>

            {!!timing && (
              <View>
                <FieldLabel>Timing</FieldLabel>
                <View className="mt-1 flex-row items-start gap-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 p-2.5">
                  <Feather name="clock" size={15} color="#1D4ED8" style={{ marginTop: 2 }} />
                  <Text className="flex-1 text-sm text-blue-700 dark:text-blue-300">{timing}</Text>
                </View>
              </View>
            )}
          </View>
        </Card>

        {/* Recipients — the web keeps the promo code and overrides here too. */}
        <Card>
          <CardTitle icon="users" title="Recipients" />
          <View className="flex-row flex-wrap gap-2">
            {detail.recipientTypes.length === 0 ? (
              <Text className="text-sm text-gray-400 dark:text-gray-500">None</Text>
            ) : (
              detail.recipientTypes.map((t) => (
                <View
                  key={t}
                  className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 dark:bg-blue-900/30 dark:border-blue-900/50"
                >
                  <Feather name="users" size={13} color="#1D4ED8" />
                  <Text className="text-sm font-medium text-blue-700 dark:text-blue-300">
                    {RECIPIENT_LABEL[t] ?? titleCase(t)}
                  </Text>
                </View>
              ))
            )}
          </View>

          {detail.customEmails.length > 0 && (
            <View className="mt-3 pt-3 border-t border-gray-200 dark:border-neutral-800">
              <FieldLabel>Custom Email Addresses</FieldLabel>
              <View className="mt-2 flex-row flex-wrap gap-2">
                {detail.customEmails.map((e) => (
                  <View key={e} className="flex-row items-center gap-1.5 px-2 py-1 rounded bg-gray-100 dark:bg-neutral-800">
                    <Feather name="mail" size={13} color="#374151" />
                    <Text className="text-sm text-gray-700 dark:text-gray-200">{e}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {detail.triggerType === "visit_completed" && (
            <View className="mt-3 gap-1">
              <FieldLabel>Return-visit promo code</FieldLabel>
              {promo?.code ? (
                <View className="flex-row flex-wrap items-center gap-2">
                  <View className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-900/40">
                    <Feather name="tag" size={13} color="#92400E" />
                    <Text className="text-sm font-medium text-amber-800 dark:text-amber-300">
                      <Text className="font-mono">{promo.code}</Text>
                      {promo.offer ? ` · ${promo.offer}` : ""}
                    </Text>
                  </View>
                  {!!promo.problem && (
                    <Text className="text-xs text-red-700 dark:text-red-400">{promo.problem}</Text>
                  )}
                </View>
              ) : promo?.problem ? (
                <Text className="text-xs text-red-700 dark:text-red-400">{promo.problem}</Text>
              ) : (
                <Text className="text-sm text-gray-500 dark:text-gray-400">
                  No promo code chosen. Pick one on the edit page.
                </Text>
              )}
              {!!promo?.terms && (
                <Text className="text-xs text-gray-600 dark:text-gray-300">{promo.terms}</Text>
              )}
              {!!promo?.location_note && (
                <Text className="text-xs text-amber-700 dark:text-amber-400">{promo.location_note}</Text>
              )}
            </View>
          )}

          {detail.visitOverrides.length > 0 && (
            <View className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 gap-1 dark:border-amber-900/40 dark:bg-amber-900/20">
              <Text className="text-sm font-medium text-amber-900 dark:text-amber-200">
                {detail.visitOverrides.some((o) => o.covers_everything)
                  ? "This email is never sent: another active email covers every visit it does."
                  : "Other active emails are sent instead for some visits:"}
              </Text>
              <OverrideList
                overrides={detail.visitOverrides}
                isThanks={detail.triggerType === "visit_completed"}
              />
            </View>
          )}
        </Card>

        {detail.triggerType === "visit_followup" && <GuestRatingsPanel />}

        {/* Email Content */}
        <Card>
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-lg font-semibold text-gray-900 dark:text-white">Email Content</Text>
            <SmallButton icon="eye" label="Preview" onPress={() => setShowPreview(true)} />
          </View>
          {detail.templateName ? (
            <View className="p-4 rounded-lg bg-gray-50 dark:bg-neutral-800/50">
              <Text className="text-sm text-gray-600 dark:text-gray-400">Using template:</Text>
              <Text className="text-sm font-medium text-gray-900 dark:text-white">{detail.templateName}</Text>
            </View>
          ) : (
            <View className="gap-4">
              <View>
                <FieldLabel>Subject</FieldLabel>
                <Text className="mt-1 text-sm text-gray-900 dark:text-white">
                  {detail.subject || "(No subject)"}
                </Text>
              </View>
              <View>
                <FieldLabel>Body Preview</FieldLabel>
                {/* A short window onto the body, scrollable — the web's max-h-48 box. */}
                <View className="mt-2 rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/50">
                  <ScrollView
                    style={{ maxHeight: 192 }}
                    nestedScrollEnabled
                    contentContainerStyle={{ padding: 16 }}
                  >
                    <BodyContent text={bodyText} images={images} />
                  </ScrollView>
                </View>
              </View>
            </View>
          )}
        </Card>

        {/* Notification Logs */}
        <Card padded={false}>
          <View className="flex-row items-center justify-between p-5 border-b border-gray-200 dark:border-neutral-800">
            <Text className="flex-1 text-lg font-semibold text-gray-900 dark:text-white">
              Notification Logs{" "}
              <Text className="text-sm font-normal text-gray-500 dark:text-gray-400">
                ({logsTotal} total)
              </Text>
            </Text>
            <SmallButton icon="refresh-cw" label="Refresh" onPress={() => void loadLogs()} disabled={logsLoading} />
          </View>

          {logsLoading && logs.length === 0 ? (
            <View className="p-8 items-center">
              <ActivityIndicator color={PRIMARY} />
            </View>
          ) : logs.length === 0 ? (
            <View className="p-8 items-center">
              <Feather name="mail" size={44} color="#D1D5DB" />
              <Text className="text-sm text-gray-500 dark:text-gray-400 mt-3">No emails sent yet</Text>
            </View>
          ) : (
            <>
              {logs.map((log, i) => {
                const s = LOG_STATUS[log.status];
                return (
                  <View
                    key={log.id}
                    className={`p-4 flex-row items-start gap-3 ${
                      i > 0 ? "border-t border-gray-100 dark:border-neutral-800" : ""
                    }`}
                  >
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2 flex-wrap">
                        <View className={`flex-row items-center gap-1 px-2 py-0.5 rounded-full ${s.wrap}`}>
                          <Feather name={s.icon} size={11} color={s.color} />
                          <Text className={`text-xs font-medium ${s.text}`}>{s.label}</Text>
                        </View>
                        <Text className="text-sm text-gray-500 dark:text-gray-400">
                          {RECIPIENT_LABEL[log.recipientType] ?? log.recipientType}
                        </Text>
                      </View>
                      <Text className="text-sm font-medium text-gray-900 dark:text-white mt-1">
                        {log.recipientEmail}
                      </Text>
                      <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{log.subject}</Text>
                      {!!log.errorMessage && (
                        <View className="flex-row items-start gap-1 mt-1">
                          <Feather name="alert-circle" size={12} color="#DC2626" style={{ marginTop: 1 }} />
                          <Text className="flex-1 text-xs text-red-600 dark:text-red-400">{log.errorMessage}</Text>
                        </View>
                      )}
                    </View>
                    <View className="items-end gap-1">
                      <Text className="text-xs text-gray-500 dark:text-gray-400">
                        {fmtDateTime(log.sentAt ?? log.createdAt)}
                      </Text>
                      {log.status === "failed" && (
                        <Pressable
                          onPress={() => void resendLog(log.id)}
                          disabled={resendingId !== null}
                          accessibilityRole="button"
                          accessibilityLabel={`Resend to ${log.recipientEmail}`}
                          className="p-1.5 rounded active:bg-blue-50"
                        >
                          {resendingId === log.id ? (
                            <ActivityIndicator size="small" color={PRIMARY} />
                          ) : (
                            <Feather name="rotate-ccw" size={16} color={PRIMARY} />
                          )}
                        </Pressable>
                      )}
                    </View>
                  </View>
                );
              })}

              {logsLastPage > 1 && (
                <View className="flex-row items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800/40">
                  <SmallButton
                    icon="chevron-left"
                    label="Previous"
                    disabled={logsPage <= 1 || logsLoading}
                    onPress={() => setLogsPage((p) => Math.max(1, p - 1))}
                  />
                  <Text className="text-xs text-gray-600 dark:text-gray-300">
                    Page {logsPage} of {logsLastPage}
                  </Text>
                  <SmallButton
                    icon="chevron-right"
                    label="Next"
                    disabled={logsPage >= logsLastPage || logsLoading}
                    onPress={() => setLogsPage((p) => Math.min(logsLastPage, p + 1))}
                  />
                </View>
              )}
            </>
          )}
        </Card>

        {/* Statistics + Quick Actions — the web's side card, placed last on a phone. */}
        <Card>
          <Text className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Statistics</Text>
          <View className="gap-3">
            <StatRow
              icon="mail"
              label="Total Sent"
              value={logsTotal}
              wrap="bg-gray-50 dark:bg-neutral-800/50"
              tint="#6B7280"
              text="text-gray-900 dark:text-white"
            />
            <StatRow
              icon="check-circle"
              label="Successful"
              value={stats?.sent ?? countOf("sent")}
              wrap="bg-blue-50 dark:bg-blue-900/20"
              tint={PRIMARY}
              text="text-blue-700 dark:text-blue-300"
            />
            <StatRow
              icon="x-circle"
              label="Failed"
              value={stats?.failed ?? countOf("failed")}
              wrap="bg-red-50 dark:bg-red-900/20"
              tint="#DC2626"
              text="text-red-700 dark:text-red-300"
            />
            <StatRow
              icon="clock"
              label="Pending"
              value={stats?.pending ?? countOf("pending")}
              wrap="bg-gray-50 dark:bg-neutral-800/50"
              tint="#4B5563"
              text="text-gray-700 dark:text-gray-300"
            />
          </View>

          <View className="mt-5 pt-5 border-t border-gray-200 dark:border-neutral-800">
            <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Quick Actions</Text>
            <View className="gap-2">
              <DetailActionButton icon="send" label="Send Test Email" onPress={() => setShowTest(true)} />
              <DetailActionButton icon="edit" label="Edit Notification" onPress={openEdit} />
            </View>
          </View>
        </Card>
      </ScrollView>

      {/* Email Preview — subject + full body, like the web modal. */}
      <BottomSheet
        visible={showPreview}
        onClose={() => setShowPreview(false)}
        title="Email Preview"
        subtitle={detail.name}
      >
        <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12 }}>
          <FieldLabel>Subject</FieldLabel>
          <Text className="text-sm text-gray-900 dark:text-white mt-1 mb-4">
            {detail.subject || detail.templateName || "(No subject)"}
          </Text>
          <FieldLabel>Body</FieldLabel>
          <View className="mt-2 rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/50 p-4">
            <BodyContent text={bodyText} images={images} />
          </View>
          {detail.includeQrCode && (
            <View className="mt-4 p-4 rounded-lg bg-gray-100 dark:bg-neutral-800 items-center">
              <Feather name="grid" size={56} color="#9CA3AF" />
              <Text className="text-sm text-gray-500 dark:text-gray-400 mt-2">QR Code will appear here</Text>
            </View>
          )}
        </ScrollView>
        {/* The sheet already pads for the home indicator. */}
        <View className="flex-row justify-end px-5 pt-3 pb-3 border-t border-gray-200 dark:border-neutral-800">
          <DetailActionButton icon="x" label="Close" onPress={() => setShowPreview(false)} />
        </View>
      </BottomSheet>

      {/* Send Test Email */}
      <SendTestEmailSheet
        visible={showTest}
        sending={sendingTest}
        onClose={() => setShowTest(false)}
        onSend={sendTest}
      />
    </View>
  );
};

export default NotificationDetails;
