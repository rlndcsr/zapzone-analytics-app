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

import {
  CARD_SHADOW,
  DetailActionButton,
  DetailSection,
  InfoRow,
} from "../../components/ui/DetailKit";
import { SendTestEmailSheet } from "../../components/ui/SendTestEmailSheet";
import { mediaUrl } from "../../lib/api";
import { markEmailNotificationsStale } from "../../lib/emailStale";
import { extractImageSrcs, htmlToPlainText } from "../../lib/htmlText";
import { getToken } from "../../lib/session";
import {
  deleteEmailNotification,
  duplicateEmailNotification,
  fetchEmailNotificationDetail,
  resetDefaultNotification,
  sendTestEmailNotification,
  toggleEmailNotificationStatus,
  type EmailNotificationDetail,
} from "../../services/emailService";

const PRIMARY = "#0644C7";
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  let h = d.getHours();
  const mer = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const min = `${d.getMinutes()}`.padStart(2, "0");
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}, ${h}:${min} ${mer}`;
}

const prettyType = (t: string) =>
  t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

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

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

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
    Alert.alert("Delete notification?", "This permanently removes the notification.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          runAction("delete", () => deleteEmailNotification(getToken()!, notificationId!), true),
      },
    ]);

  const sendTest = useCallback(
    async (email: string) => {
      const token = getToken();
      if (!token || notificationId == null || !email) return;
      setSendingTest(true);
      try {
        await sendTestEmailNotification(token, notificationId, email);
        setShowTest(false);
        Alert.alert("Test sent", "A test email has been sent.");
      } catch (err) {
        Alert.alert("Send failed", err instanceof Error ? err.message : "Please try again.");
      } finally {
        setSendingTest(false);
      }
    },
    [notificationId],
  );

  const Header = () => (
    <View className="bg-white dark:bg-neutral-900 pt-12 pb-5 px-5 w-full border-b border-gray-100 dark:border-neutral-800">
      <View className="flex-row items-center justify-between">
        <Pressable
          onPress={() => router.back()}
          className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Feather name="chevron-left" size={20} color={headerIcon} />
        </Pressable>
        <View className="items-center flex-1 mx-2">
          <Text className="text-gray-900 dark:text-white text-lg font-bold">
            Notification Details
          </Text>
          {!!detail && (
            <Text className="text-xs text-gray-400 dark:text-gray-500" numberOfLines={1}>
              {detail.name}
            </Text>
          )}
        </View>
        <View style={{ width: 36 }} />
      </View>
    </View>
  );

  if (loading) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-black">
        <Header />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={PRIMARY} />
        </View>
      </View>
    );
  }

  if (error || !detail) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-black">
        <Header />
        <View className="flex-1 items-center justify-center px-8">
          <Feather name="alert-circle" size={36} color="#EF4444" />
          <Text className="text-sm text-gray-600 dark:text-gray-300 mt-3 text-center">
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
    detail.entityType === "all" ? "All Entities" : prettyType(detail.entityType);

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <Header />
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
      >
        {/* Name + status */}
        <View className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mb-4 shadow-sm" style={CARD_SHADOW}>
          <View className="flex-row items-start justify-between gap-2">
            <View className="flex-1 flex-row items-center gap-2 flex-wrap">
              <Text className="text-xl font-bold text-gray-900 dark:text-white">{detail.name}</Text>
              {detail.isDefault && (
                <View className="flex-row items-center gap-1 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
                  <Feather name="shield" size={10} color={PRIMARY} />
                  <Text className="text-[10px] font-semibold text-[#0644C7] dark:text-blue-300">Default</Text>
                </View>
              )}
            </View>
            <View
              className={`flex-row items-center gap-1 px-2.5 py-1 rounded-full ${
                detail.isActive ? "bg-green-100 dark:bg-green-900/40" : "bg-gray-200 dark:bg-neutral-700"
              }`}
            >
              <Feather
                name={detail.isActive ? "check-circle" : "slash"}
                size={11}
                color={detail.isActive ? "#16A34A" : "#6B7280"}
              />
              <Text
                className={`text-xs font-semibold ${
                  detail.isActive ? "text-green-700 dark:text-green-300" : "text-gray-600 dark:text-gray-300"
                }`}
              >
                {detail.isActive ? "Active" : "Inactive"}
              </Text>
            </View>
          </View>
          <Text className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            Created {fmtDateTime(detail.createdAt)}
          </Text>
        </View>

        {/* Configuration */}
        <DetailSection icon="settings" title="Configuration">
          <InfoRow label="Trigger" value={detail.triggerLabel || "—"} />
          <InfoRow label="Applies To" value={appliesTo} />
          <InfoRow label="Location" value={detail.locationName || "All Locations"} />
          <InfoRow label="QR Code" value={detail.includeQrCode ? "Included" : "Not included"} />
          {(detail.sendBeforeHours != null || detail.sendAfterHours != null) && (
            <InfoRow
              label="Timing"
              value={
                [
                  detail.sendBeforeHours != null ? `${detail.sendBeforeHours}h before` : null,
                  detail.sendAfterHours != null ? `${detail.sendAfterHours}h after` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"
              }
            />
          )}
        </DetailSection>

        {/* Recipients */}
        <DetailSection icon="users" title="Recipients">
          <View className="flex-row flex-wrap gap-2">
            {detail.recipientTypes.length === 0 ? (
              <Text className="text-sm text-gray-400 dark:text-gray-500">None</Text>
            ) : (
              detail.recipientTypes.map((t) => (
                <View key={t} className="bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-full">
                  <Text className="text-xs font-medium text-[#0644C7] dark:text-blue-300">{prettyType(t)}</Text>
                </View>
              ))
            )}
          </View>
          {detail.customEmails.length > 0 && (
            <View className="mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800 gap-1">
              {detail.customEmails.map((e) => (
                <Text key={e} className="text-sm text-gray-700 dark:text-gray-200" numberOfLines={1}>
                  {e}
                </Text>
              ))}
            </View>
          )}
        </DetailSection>

        {/* Email content */}
        <DetailSection icon="mail" title="Email Content">
          {detail.templateName ? (
            <View className="rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/50 p-4">
              <Text className="text-xs text-gray-400 dark:text-gray-500">Using template</Text>
              <Text className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5">
                {detail.templateName}
              </Text>
            </View>
          ) : (
            <>
              <Text className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
                Subject
              </Text>
              <Text className="text-sm font-medium text-gray-900 dark:text-white">
                {detail.subject || "—"}
              </Text>
              <View className="mt-4">
                <Text className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
                  Body
                </Text>
                <View className="rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/50 p-4">
                  {bodyText ? (
                    <Text className="text-sm leading-6 text-gray-700 dark:text-gray-200">{bodyText}</Text>
                  ) : (
                    <Text className="text-sm italic text-gray-400 dark:text-gray-500">No body content</Text>
                  )}
                </View>
              </View>
              {images.length > 0 && (
                <View className="mt-4 gap-3">
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
          )}
        </DetailSection>

        {/* Actions */}
        <View className="flex-row flex-wrap gap-2 mt-1">
          <DetailActionButton icon="x" label="Close" onPress={() => router.back()} />
          <DetailActionButton
            icon="send"
            label="Send Test"
            busy={busy === "test"}
            disabled={busy !== null}
            onPress={() => setShowTest(true)}
          />
          <DetailActionButton
            icon="copy"
            label="Duplicate"
            busy={busy === "duplicate"}
            disabled={busy !== null}
            onPress={() => runAction("duplicate", () => duplicateEmailNotification(getToken()!, notificationId!))}
          />
          <DetailActionButton
            icon={detail.isActive ? "slash" : "check-circle"}
            label={detail.isActive ? "Deactivate" : "Activate"}
            busy={busy === "toggle"}
            disabled={busy !== null}
            onPress={() => runAction("toggle", () => toggleEmailNotificationStatus(getToken()!, notificationId!))}
          />
          <DetailActionButton
            icon="edit-2"
            label="Edit"
            variant="primary"
            disabled={busy !== null}
            onPress={() =>
              router.push({
                pathname: "/email-campaign/create-notification",
                params: { id: String(detail.id) },
              })
            }
          />
          {detail.isDefault && (
            <DetailActionButton
              icon="rotate-ccw"
              label="Reset"
              busy={busy === "reset"}
              disabled={busy !== null}
              onPress={() => runAction("reset", () => resetDefaultNotification(getToken()!, notificationId!))}
            />
          )}
          {!detail.isDefault && (
            <DetailActionButton
              icon="trash-2"
              label="Delete"
              variant="danger"
              busy={busy === "delete"}
              disabled={busy !== null}
              onPress={confirmDelete}
            />
          )}
        </View>
      </ScrollView>

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
