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
  fetchEmailTemplates,
  type EmailTemplateRow,
  type EmailTemplateStatus,
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
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

const STATUS_PILL: Record<
  EmailTemplateStatus,
  { label: string; pill: string; text: string }
> = {
  active: {
    label: "Active",
    pill: "bg-green-100 dark:bg-green-900/40",
    text: "text-green-700 dark:text-green-300",
  },
  draft: {
    label: "Draft",
    pill: "bg-amber-100 dark:bg-amber-900/40",
    text: "text-amber-700 dark:text-amber-300",
  },
  archived: {
    label: "Archived",
    pill: "bg-gray-200 dark:bg-neutral-700",
    text: "text-gray-600 dark:text-gray-300",
  },
};

const comingSoon = () =>
  Alert.alert("Coming soon", "Creating templates from the app is coming soon.");

const EmailTemplates = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const headerIcon = scheme === "dark" ? "#fff" : "#111";

  const [templates, setTemplates] = useState<EmailTemplateRow[]>([]);
  const [total, setTotal] = useState(0);
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
      const { rows, total: t } = await fetchEmailTemplates(token);
      setTemplates(rows);
      setTotal(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load templates");
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

  const counts = useMemo(
    () => ({
      total,
      active: templates.filter((t) => t.status === "active").length,
      draft: templates.filter((t) => t.status === "draft").length,
      archived: templates.filter((t) => t.status === "archived").length,
    }),
    [templates, total],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q),
    );
  }, [templates, search]);

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
            Email Templates
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
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View className="px-5 gap-4">
          {/* Intro */}
          <View
            className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mt-6"
            style={CARD_SHADOW}
          >
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Email Templates
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Create and manage reusable email templates
            </Text>
          </View>

          {/* Create (coming soon) */}
          <View className="gap-3 mb-5">
            <View className="flex-row gap-3">
              <Pressable
                onPress={() => router.push("/email-campaign/campaigns")}
                className="flex-1 flex-row items-center justify-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-200 dark:border-neutral-800"
                accessibilityRole="button"
                accessibilityLabel="Scan member"
              >
                <Feather name="send" size={16} color="#6B7280" />
                <Text
                  className="text-xs font-medium text-gray-700 dark:text-gray-200"
                  numberOfLines={1}
                >
                  Campaigns
                </Text>
              </Pressable>
              <Pressable
                onPress={() => router.push("/email-campaign/email-notification")}
                className="flex-1 flex-row items-center justify-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-200 dark:border-neutral-800"
                accessibilityRole="button"
                accessibilityLabel="Plans"
              >
                <Feather name="bell" size={16} color="#6B7280" />
                <Text
                  className="text-xs font-medium text-gray-700 dark:text-gray-200"
                  numberOfLines={1}
                >
                  Email Notifications
                </Text>
              </Pressable>
            </View>

            <Pressable
              onPress={() => router.push("/email-campaign/create-template")}
              className="flex-row items-center justify-center gap-2 bg-[#0644C7] py-3.5 rounded-xl active:opacity-90"
            >
              <Feather name="plus" size={16} color="#FFFFFF" />
              <Text className="text-sm font-semibold text-white">
                Create Template
              </Text>
            </Pressable>
          </View>

          {/* Stats */}
          <View className="flex-row flex-wrap gap-3">
            <StatTile
              icon="layout"
              iconBg="bg-blue-50 dark:bg-blue-900/30"
              iconColor={PRIMARY}
              label="Total Templates"
              value={String(counts.total)}
              hint="All templates in system"
            />
            <StatTile
              icon="check-circle"
              iconBg="bg-blue-50 dark:bg-blue-900/30"
              iconColor={PRIMARY}
              label="Active"
              value={String(counts.active)}
              hint="Ready to use in campaigns"
            />
            <StatTile
              icon="clock"
              iconBg="bg-amber-50 dark:bg-amber-900/30"
              iconColor="#D97706"
              label="Draft"
              value={String(counts.draft)}
              hint="Work in progress"
            />
            <StatTile
              icon="archive"
              iconBg="bg-gray-100 dark:bg-neutral-800"
              iconColor="#6B7280"
              label="Archived"
              value={String(counts.archived)}
              hint="No longer in use"
            />
          </View>

          {/* Search */}
          <View className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-800">
            <Feather name="search" size={18} color="#9CA3AF" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search templates by name or subject..."
              placeholderTextColor="#9CA3AF"
              className="flex-1 text-sm text-gray-900 dark:text-white"
              style={{ paddingVertical: 0 }}
            />
          </View>

          {/* States */}
          {loading && templates.length === 0 && (
            <Text className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">
              Loading templates…
            </Text>
          )}
          {error && templates.length === 0 && (
            <View className="items-center py-10">
              <Feather name="alert-circle" size={36} color="#EF4444" />
              <Text className="text-sm text-gray-600 dark:text-gray-300 mt-3 text-center">
                {error}
              </Text>
              <Pressable
                onPress={load}
                className="mt-4 px-5 py-2.5 rounded-xl bg-[#0644C7]"
              >
                <Text className="text-sm font-semibold text-white">Retry</Text>
              </Pressable>
            </View>
          )}

          {/* List */}
          {filtered.map((t) => {
            const pill = STATUS_PILL[t.status] ?? STATUS_PILL.draft;
            return (
              <View
                key={t.id}
                className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800"
                style={CARD_SHADOW}
              >
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 mr-2">
                    <Text className="text-base font-bold text-gray-900 dark:text-white">
                      {t.name}
                    </Text>
                    {!!t.subject && (
                      <Text
                        className="text-xs text-gray-500 dark:text-gray-400 mt-0.5"
                        numberOfLines={1}
                      >
                        {t.subject}
                      </Text>
                    )}
                  </View>
                  <View className={`px-3 py-1 rounded-full ${pill.pill}`}>
                    <Text className={`text-xs font-semibold ${pill.text}`}>
                      {pill.label}
                    </Text>
                  </View>
                </View>
                <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
                  <View className="bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-md">
                    <Text className="text-xs font-medium text-[#0644C7] dark:text-blue-300">
                      {t.category}
                    </Text>
                  </View>
                  <Text className="text-xs text-gray-500 dark:text-gray-400">
                    {fmtDate(t.createdAt)}
                  </Text>
                </View>
              </View>
            );
          })}

          {!loading && !error && filtered.length === 0 && (
            <View className="items-center py-10">
              <Feather name="mail" size={36} color="#D1D5DB" />
              <Text className="text-sm text-gray-500 dark:text-gray-400 mt-3">
                {templates.length === 0
                  ? "No templates yet"
                  : "No templates match your search"}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default EmailTemplates;
