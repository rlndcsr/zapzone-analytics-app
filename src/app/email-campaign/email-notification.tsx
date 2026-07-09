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

import { Pagination } from "../../components/ui/Pagination";
import { StatTile } from "../../components/ui/StatTile";
import { getToken } from "../../lib/session";
import {
  fetchEmailNotifications,
  type EmailNotificationRow,
  type EmailNotificationStats,
} from "../../services/emailService";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const PRIMARY = "#0644C7";

const comingSoon = () =>
  Alert.alert("Coming soon", "Creating notifications from the app is coming soon.");

const EmailNotifications = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const headerIcon = scheme === "dark" ? "#fff" : "#111";

  const [rows, setRows] = useState<EmailNotificationRow[]>([]);
  const [stats, setStats] = useState<EmailNotificationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const { rows: list, stats: s } = await fetchEmailNotifications(token);
      setRows(list);
      setStats(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notifications");
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
    if (!q) return rows;
    return rows.filter((n) => n.name.toLowerCase().includes(q));
  }, [rows, search]);

  // Reset to page 1 when the search changes the result set.
  useEffect(() => {
    setPage(1);
  }, [search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice(
    (currentPage - 1) * perPage,
    (currentPage - 1) * perPage + perPage,
  );

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
            Email Notifications
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
              Email Notifications
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Automated email notifications for bookings, purchases, and payments
            </Text>
          </View>

          {/* Create (coming soon) */}
          <Pressable
            onPress={comingSoon}
            className="flex-row items-center justify-center gap-2 bg-[#0644C7] py-3.5 rounded-xl active:opacity-90"
          >
            <Feather name="plus" size={16} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-white">Create Notification</Text>
            <View className="bg-white/20 px-2 py-0.5 rounded-full">
              <Text className="text-[10px] font-semibold text-white">Soon</Text>
            </View>
          </Pressable>

          {/* Stats */}
          <View className="flex-row flex-wrap gap-3">
            <StatTile icon="bell" iconBg="bg-blue-50 dark:bg-blue-900/30" iconColor={PRIMARY} label="Total Notifications" value={String(stats?.total ?? 0)} hint="All configured notifications" />
            <StatTile icon="check-circle" iconBg="bg-blue-50 dark:bg-blue-900/30" iconColor={PRIMARY} label="Active" value={String(stats?.active ?? 0)} hint="Currently sending emails" />
            <StatTile icon="calendar" iconBg="bg-blue-50 dark:bg-blue-900/30" iconColor={PRIMARY} label="Booking Triggers" value={String(stats?.bookingTriggers ?? 0)} hint="Booking event notifications" />
            <StatTile icon="tag" iconBg="bg-blue-50 dark:bg-blue-900/30" iconColor={PRIMARY} label="Purchase Triggers" value={String(stats?.purchaseTriggers ?? 0)} hint="Purchase event notifications" />
          </View>

          {/* Search */}
          <View className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-800">
            <Feather name="search" size={18} color="#9CA3AF" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search notifications by name..."
              placeholderTextColor="#9CA3AF"
              className="flex-1 text-sm text-gray-900 dark:text-white"
              style={{ paddingVertical: 0 }}
            />
          </View>

          {/* States */}
          {loading && rows.length === 0 && (
            <Text className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">
              Loading notifications…
            </Text>
          )}
          {error && rows.length === 0 && (
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
          {visible.map((n) => (
            <View
              key={n.id}
              className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800"
              style={CARD_SHADOW}
            >
              <View className="flex-row items-start justify-between">
                <View className="flex-1 mr-2 flex-row items-center gap-2 flex-wrap">
                  <Text className="text-base font-bold text-gray-900 dark:text-white">
                    {n.name}
                  </Text>
                  {n.isDefault && (
                    <View className="flex-row items-center gap-1 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
                      <Feather name="shield" size={10} color={PRIMARY} />
                      <Text className="text-[10px] font-semibold text-[#0644C7] dark:text-blue-300">
                        Default
                      </Text>
                    </View>
                  )}
                </View>
                <View
                  className={`flex-row items-center gap-1 px-3 py-1 rounded-full ${
                    n.isActive
                      ? "bg-green-100 dark:bg-green-900/40"
                      : "bg-gray-200 dark:bg-neutral-700"
                  }`}
                >
                  <Feather
                    name={n.isActive ? "check-circle" : "slash"}
                    size={11}
                    color={n.isActive ? "#16A34A" : "#6B7280"}
                  />
                  <Text
                    className={`text-xs font-semibold ${
                      n.isActive
                        ? "text-green-700 dark:text-green-300"
                        : "text-gray-600 dark:text-gray-300"
                    }`}
                  >
                    {n.isActive ? "Active" : "Inactive"}
                  </Text>
                </View>
              </View>

              {/* Trigger */}
              {!!n.triggerLabel && (
                <View className="flex-row items-center gap-1.5 mt-3">
                  <Feather name="bell" size={13} color={PRIMARY} />
                  <Text className="text-xs font-medium text-[#0644C7] dark:text-blue-300">
                    {n.triggerLabel}
                  </Text>
                </View>
              )}

              {/* Entity + recipients */}
              <View className="flex-row items-center gap-4 mt-2 pt-2 border-t border-gray-100 dark:border-neutral-800">
                <View className="flex-row items-center gap-1.5">
                  <Feather name="box" size={13} color="#9CA3AF" />
                  <Text className="text-xs text-gray-500 dark:text-gray-400">
                    {n.entityLabel}
                  </Text>
                </View>
                <View className="flex-row items-center gap-1.5">
                  <Feather name="users" size={13} color="#9CA3AF" />
                  <Text className="text-xs text-gray-500 dark:text-gray-400">
                    {n.recipientCount} type{n.recipientCount === 1 ? "" : "s"}
                  </Text>
                </View>
              </View>
            </View>
          ))}

          {!loading && !error && filtered.length === 0 && (
            <View className="items-center py-10">
              <Feather name="bell" size={36} color="#D1D5DB" />
              <Text className="text-sm text-gray-500 dark:text-gray-400 mt-3">
                {rows.length === 0 ? "No notifications yet" : "No notifications match your search"}
              </Text>
            </View>
          )}

          {!loading && !error && (
            <Pagination
              page={currentPage}
              perPage={perPage}
              total={filtered.length}
              onPageChange={setPage}
              onPerPageChange={(pp) => {
                setPerPage(pp);
                setPage(1);
              }}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default EmailNotifications;
