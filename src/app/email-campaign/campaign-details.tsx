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
import { mediaUrl } from "../../lib/api";
import { markEmailCampaignsStale } from "../../lib/emailStale";
import { extractImageSrcs, htmlToPlainText } from "../../lib/htmlText";
import { getToken } from "../../lib/session";
import {
  cancelEmailCampaign,
  deleteEmailCampaign,
  fetchEmailCampaignDetail,
  resendEmailCampaign,
  type EmailCampaignDetail,
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

// Same status colors as the Campaigns card/table view.
function statusPill(status: string): { pill: string; text: string } {
  switch (status) {
    case "completed":
      return { pill: "bg-green-100 dark:bg-green-900/40", text: "text-green-700 dark:text-green-300" };
    case "sending":
      return { pill: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-300" };
    case "pending":
    case "scheduled":
      return { pill: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-300" };
    case "failed":
      return { pill: "bg-red-100 dark:bg-red-900/40", text: "text-red-700 dark:text-red-300" };
    default:
      return { pill: "bg-gray-200 dark:bg-neutral-700", text: "text-gray-600 dark:text-gray-300" };
  }
}

const prettyType = (t: string) =>
  t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const logStatusColor = (s: string) =>
  s === "sent" ? "#16A34A" : s === "failed" ? "#DC2626" : "#9CA3AF";

const CampaignDetails = () => {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const headerIcon = scheme === "dark" ? "#FFFFFF" : "#111827";

  const { id } = useLocalSearchParams<{ id?: string }>();
  const campaignId = id ? Number(id) : null;

  const [detail, setDetail] = useState<EmailCampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    if (campaignId == null || Number.isNaN(campaignId)) {
      setError("Campaign not found");
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
      const d = await fetchEmailCampaignDetail(token, campaignId);
      setDetail(d);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load campaign");
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  // Run a mutation, then refresh (or leave, for delete).
  const runAction = useCallback(
    async (key: string, fn: () => Promise<void>, leave = false) => {
      const token = getToken();
      if (!token || campaignId == null) return;
      setBusy(key);
      try {
        await fn();
        markEmailCampaignsStale();
        if (leave) router.back();
        else await loadDetail();
      } catch (err) {
        Alert.alert("Action failed", err instanceof Error ? err.message : "Please try again.");
      } finally {
        setBusy(null);
      }
    },
    [campaignId, loadDetail],
  );

  const confirmCancel = () =>
    Alert.alert("Cancel campaign?", "This stops any further sending.", [
      { text: "Keep sending", style: "cancel" },
      {
        text: "Cancel campaign",
        style: "destructive",
        onPress: () => runAction("cancel", () => cancelEmailCampaign(getToken()!, campaignId!)),
      },
    ]);

  const confirmDelete = () =>
    Alert.alert("Delete campaign?", "This permanently removes the campaign.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => runAction("delete", () => deleteEmailCampaign(getToken()!, campaignId!), true),
      },
    ]);

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
            Campaign Details
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
            {error ?? "Campaign not found"}
          </Text>
          <Pressable onPress={() => router.back()} className="mt-4 px-5 py-2.5 rounded-xl bg-[#0644C7]">
            <Text className="text-sm font-semibold text-white">Back to Campaigns</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const pill = statusPill(detail.status);
  const successRate =
    detail.totalRecipients > 0
      ? Math.round((detail.sentCount / detail.totalRecipients) * 100)
      : 0;
  const rateColor = successRate >= 90 ? "#16A34A" : successRate >= 70 ? "#D97706" : "#DC2626";
  const bodyText = htmlToPlainText(detail.body);
  const images = extractImageSrcs(detail.body)
    .map((s) => mediaUrl(s))
    .filter((u): u is string => !!u);

  const canCancel = detail.status === "pending" || detail.status === "sending";
  const isFinished =
    detail.status === "completed" || detail.status === "cancelled" || detail.status === "failed";

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
          <View className="flex-row items-start justify-between gap-3">
            <Text className="text-xl font-bold text-gray-900 dark:text-white flex-1">
              {detail.name}
            </Text>
            <View className={`px-2.5 py-1 rounded-full ${pill.pill}`}>
              <Text className={`text-xs font-semibold ${pill.text}`}>{detail.statusLabel}</Text>
            </View>
          </View>
        </View>

        {/* Statistics */}
        <DetailSection icon="bar-chart-2" title="Statistics">
          <InfoRow label="Total Recipients" value={String(detail.totalRecipients)} />
          <InfoRow
            label="Sent Successfully"
            value={String(detail.sentCount)}
            valueClass="text-green-600 dark:text-green-400"
          />
          <InfoRow
            label="Failed"
            value={String(detail.failedCount)}
            valueClass={detail.failedCount > 0 ? "text-red-600 dark:text-red-400" : ""}
          />
          <View className="mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
            <View className="flex-row items-center justify-between mb-1.5">
              <Text className="text-sm text-gray-500 dark:text-gray-400">Delivery Rate</Text>
              <Text className="text-sm font-semibold text-gray-900 dark:text-white">{successRate}%</Text>
            </View>
            <View className="h-2 rounded-full bg-gray-100 dark:bg-neutral-800 overflow-hidden">
              <View style={{ width: `${successRate}%`, height: "100%", backgroundColor: rateColor, borderRadius: 999 }} />
            </View>
          </View>
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
            <View className="mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
              <Text className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
                Custom Emails ({detail.customEmails.length})
              </Text>
              <View className="gap-1">
                {detail.customEmails.map((e) => (
                  <Text key={e} className="text-sm text-gray-700 dark:text-gray-200" numberOfLines={1}>
                    {e}
                  </Text>
                ))}
              </View>
            </View>
          )}
        </DetailSection>

        {/* Email content */}
        <DetailSection icon="mail" title="Email Content">
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
        </DetailSection>

        {/* Metadata */}
        <DetailSection icon="info" title="Campaign Details">
          <InfoRow label="Created" value={fmtDateTime(detail.createdAt)} />
          {!!detail.sentAt && <InfoRow label="Sent At" value={fmtDateTime(detail.sentAt)} />}
          {!!detail.completedAt && <InfoRow label="Completed At" value={fmtDateTime(detail.completedAt)} />}
          {!!detail.createdByName && <InfoRow label="Created By" value={detail.createdByName} />}
          {!!detail.locationName && <InfoRow label="Location" value={detail.locationName} />}
        </DetailSection>

        {/* Delivery logs */}
        {detail.logs.length > 0 && (
          <DetailSection icon="list" title="Delivery Logs">
            <View className="gap-0">
              {detail.logs.slice(0, 25).map((l, i) => (
                <View
                  key={l.id}
                  className={`flex-row items-center justify-between py-2.5 ${
                    i < Math.min(detail.logs.length, 25) - 1
                      ? "border-b border-gray-100 dark:border-neutral-800"
                      : ""
                  }`}
                >
                  <View className="flex-1 mr-2">
                    <Text className="text-sm text-gray-900 dark:text-white" numberOfLines={1}>
                      {l.recipientEmail || "—"}
                    </Text>
                    <Text className="text-xs text-gray-400 dark:text-gray-500">
                      {prettyType(l.recipientType)} · {fmtDateTime(l.sentAt)}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <Feather
                      name={l.status === "sent" ? "check-circle" : l.status === "failed" ? "x-circle" : "clock"}
                      size={13}
                      color={logStatusColor(l.status)}
                    />
                    <Text className="text-xs font-medium" style={{ color: logStatusColor(l.status) }}>
                      {prettyType(l.status)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </DetailSection>
        )}

        {/* Actions */}
        <View className="flex-row flex-wrap gap-2 mt-1">
          <DetailActionButton icon="x" label="Close" onPress={() => router.back()} />
          {canCancel && (
            <DetailActionButton
              icon="slash"
              label="Cancel Campaign"
              variant="danger"
              busy={busy === "cancel"}
              disabled={busy !== null}
              onPress={confirmCancel}
            />
          )}
          {isFinished && detail.failedCount > 0 && (
            <DetailActionButton
              icon="rotate-ccw"
              label="Resend Failed"
              variant="primary"
              busy={busy === "resend"}
              disabled={busy !== null}
              onPress={() => runAction("resend", () => resendEmailCampaign(getToken()!, campaignId!, "failed"))}
            />
          )}
          {isFinished && (
            <DetailActionButton
              icon="trash-2"
              label="Delete Campaign"
              variant="danger"
              busy={busy === "delete"}
              disabled={busy !== null}
              onPress={confirmDelete}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default CampaignDetails;
