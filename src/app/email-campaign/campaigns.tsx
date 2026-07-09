import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { StatTile } from "../../components/ui/StatTile";
import { getToken } from "../../lib/session";
import {
  fetchEmailCampaigns,
  fetchEmailCampaignStats,
  type EmailCampaignRow,
  type EmailCampaignStats,
} from "../../services/emailService";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const PRIMARY = "#0644C7";
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** ISO -> "Jan 3, 2026, 8:22 AM". */
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

/** Pill classes for a campaign status. */
function statusPill(status: string): { pill: string; text: string } {
  switch (status) {
    case "completed":
      return { pill: "bg-green-100 dark:bg-green-900/40", text: "text-green-700 dark:text-green-300" };
    case "sending":
      return { pill: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-300" };
    case "scheduled":
      return { pill: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-300" };
    case "failed":
      return { pill: "bg-red-100 dark:bg-red-900/40", text: "text-red-700 dark:text-red-300" };
    default:
      return { pill: "bg-gray-200 dark:bg-neutral-700", text: "text-gray-600 dark:text-gray-300" };
  }
}

const comingSoon = () =>
  Alert.alert("Coming soon", "Creating campaigns from the app is coming soon.");

const EmailCampaigns = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const headerIcon = scheme === "dark" ? "#fff" : "#111";

  const [campaigns, setCampaigns] = useState<EmailCampaignRow[]>([]);
  const [stats, setStats] = useState<EmailCampaignStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const [list, s] = await Promise.all([
        fetchEmailCampaigns(token),
        fetchEmailCampaignStats(token).catch(() => null),
      ]);
      setCampaigns(list.rows);
      setStats(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return campaigns;
    return campaigns.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.subject.toLowerCase().includes(q),
    );
  }, [campaigns, search]);

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header */}
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
          <Text className="text-gray-900 dark:text-white text-lg font-bold">
            Email Campaigns
          </Text>
          <Pressable
            onPress={onRefresh}
            className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
            accessibilityRole="button"
            accessibilityLabel="Refresh"
          >
            <Feather name="refresh-cw" size={18} color={headerIcon} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View className="px-5 gap-4">
          {/* Intro */}
          <View className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mt-6" style={CARD_SHADOW}>
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Email Campaigns
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Send bulk emails to customers and staff
            </Text>
          </View>

          {/* Templates + New Campaign (coming soon) */}
          <View className="flex-row gap-3">
            <Pressable
              onPress={() => router.push("/email-campaign/email-templates")}
              className="flex-1 flex-row items-center justify-center gap-2 bg-white dark:bg-neutral-900 py-3.5 rounded-xl border border-gray-200 dark:border-neutral-800"
            >
              <Feather name="mail" size={16} color="#6B7280" />
              <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
                Templates
              </Text>
            </Pressable>
            <Pressable
              onPress={comingSoon}
              className="flex-1 flex-row items-center justify-center gap-2 bg-[#0644C7] py-3.5 rounded-xl active:opacity-90"
            >
              <Feather name="plus" size={16} color="#FFFFFF" />
              <Text className="text-sm font-semibold text-white">New</Text>
              <View className="bg-white/20 px-2 py-0.5 rounded-full">
                <Text className="text-[10px] font-semibold text-white">Soon</Text>
              </View>
            </Pressable>
          </View>

          {/* Stats */}
          <View className="flex-row flex-wrap gap-3">
            <StatTile icon="send" iconBg="bg-blue-50 dark:bg-blue-900/30" iconColor={PRIMARY} label="Total Campaigns" value={String(stats?.totalCampaigns ?? 0)} hint="All time campaigns created" />
            <StatTile icon="check-circle" iconBg="bg-blue-50 dark:bg-blue-900/30" iconColor={PRIMARY} label="Emails Sent" value={String(stats?.emailsSent ?? 0)} hint="Successfully delivered emails" />
            <StatTile icon="x-circle" iconBg="bg-red-50 dark:bg-red-900/30" iconColor="#DC2626" label="Failed Emails" value={String(stats?.failedEmails ?? 0)} hint="Delivery failures" />
            <StatTile icon="bar-chart-2" iconBg="bg-green-50 dark:bg-green-900/30" iconColor="#16A34A" label="Success Rate" value={`${stats?.successRate ?? 0}%`} hint="Email delivery success rate" />
          </View>

          {/* Search */}
          <View className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-800">
            <Feather name="search" size={18} color="#9CA3AF" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search campaigns by name or subject..."
              placeholderTextColor="#9CA3AF"
              className="flex-1 text-sm text-gray-900 dark:text-white"
              style={{ paddingVertical: 0 }}
            />
          </View>

          {/* States */}
          {loading && campaigns.length === 0 && (
            <Text className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">
              Loading campaigns…
            </Text>
          )}
          {error && campaigns.length === 0 && (
            <View className="items-center py-10">
              <Feather name="alert-circle" size={36} color="#EF4444" />
              <Text className="text-sm text-gray-600 dark:text-gray-300 mt-3 text-center">
                {error}
              </Text>
              <Pressable onPress={load} className="mt-4 px-5 py-2.5 rounded-xl bg-[#0644C7]">
                <Text className="text-sm font-semibold text-white">Retry</Text>
              </Pressable>
            </View>
          )}

          {/* List */}
          {filtered.map((c) => {
            const pill = statusPill(c.status);
            const pct = c.recipients > 0 ? Math.round((c.sentCount / c.recipients) * 100) : 0;
            return (
              <View
                key={c.id}
                className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800"
                style={CARD_SHADOW}
              >
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 mr-2">
                    <Text className="text-base font-bold text-gray-900 dark:text-white">
                      {c.name}
                    </Text>
                    {!!c.subject && (
                      <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5" numberOfLines={1}>
                        {c.subject}
                      </Text>
                    )}
                  </View>
                  <View className={`px-3 py-1 rounded-full ${pill.pill}`}>
                    <Text className={`text-xs font-semibold ${pill.text}`}>
                      {c.statusLabel}
                    </Text>
                  </View>
                </View>

                {/* Recipients + progress */}
                <View className="flex-row items-center gap-4 mt-3">
                  <View className="flex-row items-center gap-1.5">
                    <Feather name="users" size={13} color="#9CA3AF" />
                    <Text className="text-xs text-gray-500 dark:text-gray-400">
                      {c.recipients} recipient{c.recipients === 1 ? "" : "s"}
                    </Text>
                  </View>
                  <Text className="text-xs text-gray-500 dark:text-gray-400">
                    {c.sentCount}/{c.recipients} sent
                  </Text>
                </View>
                <View className="h-1.5 rounded-full bg-gray-100 dark:bg-neutral-800 mt-2 overflow-hidden">
                  <View
                    className="h-full rounded-full bg-[#0644C7]"
                    style={{ width: `${pct}%` }}
                  />
                </View>

                <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
                  <Text className="text-xs text-gray-400 dark:text-gray-500">Sent at</Text>
                  <Text className="text-xs text-gray-500 dark:text-gray-400">
                    {fmtDateTime(c.sentAt)}
                  </Text>
                </View>
              </View>
            );
          })}

          {!loading && !error && filtered.length === 0 && (
            <View className="items-center py-10">
              <Feather name="send" size={36} color="#D1D5DB" />
              <Text className="text-sm text-gray-500 dark:text-gray-400 mt-3">
                {campaigns.length === 0 ? "No campaigns yet" : "No campaigns match your search"}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default EmailCampaigns;
