import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "../../components/ui/BottomSheet";
import { KpiCard } from "../../components/ui/KpiCard";
import { Pagination } from "../../components/ui/Pagination";
import { StatusBadge } from "../../components/ui/StatusBadge";
import {
  consumeStaffStale,
  markStaffStale,
  useStaffAccounts,
  useStaffStats,
} from "../../lib/hooks/useStaffAccounts";
import { useLocationOptions } from "../../lib/hooks/useLocationOptions";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  deleteStaffUser,
  resendStaffCredentials,
  roleLabel,
  toggleStaffStatus,
  type StaffFilters,
  type StaffRole,
  type StaffStatus,
  type StaffUser,
} from "../../services/usersService";

const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const PER_PAGE_OPTIONS = [10, 25, 50];

type RoleFilter = "all" | StaffRole;
const ROLE_OPTIONS: { label: string; value: RoleFilter }[] = [
  { label: "All Roles", value: "all" },
  { label: "Company Admin", value: "company_admin" },
  { label: "Location Manager", value: "location_manager" },
  { label: "Attendant", value: "attendant" },
];

const STATUS_OPTIONS: { label: string; value: StaffStatus }[] = [
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
];

// Role → pill tint (mirrors the web "Type" badges).
const ROLE_TONE: Record<string, string> = {
  company_admin:
    "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300",
  location_manager:
    "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
  attendant:
    "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
};

function formatLastLogin(value: string | null): string {
  if (!value) return "Never";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Never";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const RoleBadge = ({ role }: { role: StaffRole }) => {
  const tone =
    ROLE_TONE[role] ??
    "bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-gray-300";
  return (
    <View className={`px-2 py-1 rounded-full ${tone}`}>
      <Text className={`text-[10px] font-semibold ${tone}`}>
        {roleLabel(role)}
      </Text>
    </View>
  );
};

const AccountCard = ({
  user,
  showLocation,
  onPress,
}: {
  user: StaffUser;
  showLocation: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3 shadow-sm active:opacity-90"
    style={CARD_SHADOW}
    accessibilityRole="button"
    accessibilityLabel={`Manage ${user.name}`}
  >
    <View className="flex-row items-start justify-between mb-2">
      <View className="flex-1 mr-3">
        <Text
          className="text-base font-bold text-gray-900 dark:text-white"
          numberOfLines={1}
        >
          {user.name}
        </Text>
        <Text
          className="text-xs text-gray-400 dark:text-gray-500 mt-0.5"
          numberOfLines={1}
        >
          {user.email}
        </Text>
      </View>
      <StatusBadge status={user.status} />
    </View>

    <View className="flex-row items-center flex-wrap gap-1.5">
      <RoleBadge role={user.role} />
      {!!user.department && (
        <View className="bg-gray-100 dark:bg-neutral-800 px-2 py-1 rounded-full">
          <Text className="text-[10px] font-medium text-gray-600 dark:text-gray-300">
            {user.department}
          </Text>
        </View>
      )}
    </View>

    {!!user.phone && (
      <View className="flex-row items-center gap-1.5 mt-2">
        <Feather name="phone" size={12} color="#9CA3AF" />
        <Text className="text-xs text-gray-500 dark:text-gray-400">
          {user.phone}
        </Text>
      </View>
    )}

    {showLocation && !!user.locationName && (
      <View className="flex-row items-center gap-1.5 mt-1">
        <Feather name="map-pin" size={12} color="#9CA3AF" />
        <Text className="text-xs text-gray-500 dark:text-gray-400" numberOfLines={1}>
          {user.locationName}
        </Text>
      </View>
    )}

    <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
      <View className="flex-row items-center gap-1.5">
        <Feather name="clock" size={12} color="#9CA3AF" />
        <Text className="text-xs text-gray-500 dark:text-gray-400">
          Last login: {formatLastLogin(user.lastLogin)}
        </Text>
      </View>
      <Feather name="more-horizontal" size={18} color="#9CA3AF" />
    </View>
  </Pressable>
);

const ManageAccounts = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  const currentUser = getCurrentUser();
  const role = currentUser?.role;
  const isCompanyAdmin = role === "company_admin";
  // Create/manage staff: company_admin or location_manager (attendant blocked).
  const canManage = isCompanyAdmin || role === "location_manager";

  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StaffStatus>("active");
  const [locationFilter, setLocationFilter] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sheet, setSheet] = useState<null | "role" | "status" | "location">(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [refreshing, setRefreshing] = useState(false);
  const [statsNonce, setStatsNonce] = useState(0);
  const [selected, setSelected] = useState<StaffUser | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const { locations } = useLocationOptions();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [roleFilter, statusFilter, locationFilter, debouncedSearch, perPage]);

  const filters = useMemo<StaffFilters>(
    () => ({
      search: debouncedSearch || undefined,
      role: roleFilter === "all" ? undefined : roleFilter,
      status: statusFilter,
      locationId:
        isCompanyAdmin && locationFilter != null ? locationFilter : undefined,
    }),
    [debouncedSearch, roleFilter, statusFilter, locationFilter, isCompanyAdmin],
  );

  const { users, total, loading, error, refetch } = useStaffAccounts({
    filters,
    page,
    perPage,
  });
  const { stats } = useStaffStats(statsNonce);

  const bumpStats = useCallback(() => setStatsNonce((n) => n + 1), []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
      bumpStats();
    } finally {
      setRefreshing(false);
    }
  }, [refetch, bumpStats]);

  useFocusEffect(
    useCallback(() => {
      if (consumeStaffStale()) {
        refetch();
        bumpStats();
      }
    }, [refetch, bumpStats]),
  );

  const afterMutation = useCallback(() => {
    markStaffStale();
    setSelected(null);
    refetch();
    bumpStats();
  }, [refetch, bumpStats]);

  const runToggle = useCallback(async () => {
    if (!selected) return;
    setActionBusy(true);
    try {
      await toggleStaffStatus(getToken() ?? "", selected.id);
      afterMutation();
    } catch (err) {
      Alert.alert(
        "Update failed",
        err instanceof Error ? err.message : "Could not update this account.",
      );
    } finally {
      setActionBusy(false);
    }
  }, [selected, afterMutation]);

  const runResend = useCallback(async () => {
    if (!selected) return;
    setActionBusy(true);
    try {
      await resendStaffCredentials(getToken() ?? "", selected.id);
      Alert.alert("Credentials sent", `A new password was emailed to ${selected.email}.`);
      setSelected(null);
    } catch (err) {
      Alert.alert(
        "Send failed",
        err instanceof Error ? err.message : "Could not resend credentials.",
      );
    } finally {
      setActionBusy(false);
    }
  }, [selected]);

  const confirmDelete = useCallback(() => {
    if (!selected) return;
    Alert.alert(
      "Delete account",
      `Permanently delete ${selected.name}'s account? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setActionBusy(true);
            try {
              await deleteStaffUser(getToken() ?? "", selected.id);
              afterMutation();
            } catch (err) {
              Alert.alert(
                "Delete failed",
                err instanceof Error ? err.message : "Could not delete this account.",
              );
            } finally {
              setActionBusy(false);
            }
          },
        },
      ],
    );
  }, [selected, afterMutation]);

  const roleLabelText =
    ROLE_OPTIONS.find((o) => o.value === roleFilter)?.label ?? "All Roles";
  const statusLabelText =
    STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ?? "Active";
  const locationLabelText =
    locationFilter == null
      ? "All Locations"
      : (locations.find((l) => l.id === locationFilter)?.name ?? "Location");

  const isSelf = selected?.id === currentUser?.id;

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header */}
      <View className="bg-white dark:bg-neutral-900 pt-12 pb-5 px-5 w-full relative overflow-hidden z-10 border-b border-gray-100 dark:border-neutral-800">
        <View className="flex-row items-center justify-between relative z-10">
          <Pressable
            onPress={() => router.back()}
            className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Feather name="chevron-left" size={20} color={headerIcon} />
          </Pressable>
          <Text className="text-gray-900 dark:text-white text-lg font-bold">
            Manage Accounts
          </Text>
          <View style={{ width: 36 }} />
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={PRIMARY}
            colors={[PRIMARY]}
            progressBackgroundColor="#FFFFFF"
          />
        }
      >
        <View className="px-5">
          {/* Intro */}
          <View className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mt-6 mb-5 shadow-sm">
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Manage Accounts
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Manage all attendant and location manager accounts
            </Text>
          </View>

          {/* Sub-navigation */}
          <View className="flex-row gap-3 mb-5">
            <Pressable
              onPress={() => router.push("/user-managements/activity-logs" as never)}
              className="flex-1 flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800"
            >
              <Feather name="activity" size={16} color={PRIMARY} />
              <Text
                className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1"
                numberOfLines={1}
              >
                Activity Log
              </Text>
              <Feather name="chevron-right" size={14} color="#9CA3AF" />
            </Pressable>

            <Pressable
              onPress={() => router.push("/user-managements/day-offs" as never)}
              className="flex-1 flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800"
            >
              <Feather name="calendar" size={16} color={PRIMARY} />
              <Text
                className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1"
                numberOfLines={1}
              >
                Day Offs
              </Text>
              <Feather name="chevron-right" size={14} color="#9CA3AF" />
            </Pressable>
          </View>

          {/* Error state */}
          {!loading && error && (
            <View className="bg-red-50 border border-red-100 rounded-2xl p-5 mb-5">
              <Text className="text-red-600 font-semibold">Something went wrong</Text>
              <Text className="text-red-500 text-sm mt-1">{error}</Text>
            </View>
          )}

          {/* KPI cards */}
          <View className="flex-row flex-wrap -mx-1.5 mb-3">
            <View className="w-1/2">
              <KpiCard
                icon="users"
                tone={{ bg: "#0644C720", tint: PRIMARY }}
                title="Total Accounts"
                value={String(stats.total)}
                hint={`${stats.activeTotal} active`}
              />
            </View>
            <View className="w-1/2">
              <KpiCard
                icon="shield"
                tone={{ bg: "#3B82F620", tint: "#3B82F6" }}
                title="Location Managers"
                value={String(stats.managers)}
                hint="Active managers"
              />
            </View>
            <View className="w-1/2">
              <KpiCard
                icon="user"
                tone={{ bg: "#F59E0B20", tint: "#F59E0B" }}
                title="Attendants"
                value={String(stats.attendants)}
                hint="Active attendants"
              />
            </View>
            <View className="w-1/2">
              <KpiCard
                icon="user-plus"
                tone={{ bg: "#10B98120", tint: "#10B981" }}
                title="New Accounts"
                value={String(stats.newAccounts)}
                hint="Last 30 days"
              />
            </View>
          </View>

          {/* Search */}
          <View className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3 rounded-xl border border-gray-100 dark:border-neutral-800 mt-2 mb-3">
            <Feather name="search" size={16} color="#9CA3AF" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search accounts..."
              placeholderTextColor="#9CA3AF"
              className="flex-1 text-sm text-gray-900 dark:text-white"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <Feather name="x" size={16} color="#9CA3AF" />
              </Pressable>
            )}
          </View>

          {/* Filters */}
          <View className="flex-row gap-3 mb-3">
            <Pressable
              onPress={() => setSheet("role")}
              className="flex-1 flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800"
            >
              <Feather name="tag" size={16} color={PRIMARY} />
              <Text
                className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1"
                numberOfLines={1}
              >
                {roleLabelText}
              </Text>
              <Feather name="chevron-down" size={14} color="#9CA3AF" />
            </Pressable>

            <Pressable
              onPress={() => setSheet("status")}
              className="flex-1 flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800"
            >
              <Feather name="check-circle" size={16} color={PRIMARY} />
              <Text
                className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1"
                numberOfLines={1}
              >
                {statusLabelText}
              </Text>
              <Feather name="chevron-down" size={14} color="#9CA3AF" />
            </Pressable>
          </View>

          {isCompanyAdmin && (
            <Pressable
              onPress={() => setSheet("location")}
              className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800 mb-5"
            >
              <Feather name="map-pin" size={16} color={PRIMARY} />
              <Text
                className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1"
                numberOfLines={1}
              >
                {locationLabelText}
              </Text>
              <Feather name="chevron-down" size={14} color="#9CA3AF" />
            </Pressable>
          )}

          {/* List header */}
          {!loading && !error && (
            <View className="flex-row items-center gap-2 mb-4 mt-1">
              <Text
                numberOfLines={1}
                className="shrink text-lg font-bold text-gray-900 dark:text-white"
              >
                Accounts
              </Text>
              <View className="shrink-0 bg-gray-100 dark:bg-neutral-800 px-2.5 py-0.5 rounded-full">
                <Text className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  {total}
                </Text>
              </View>
            </View>
          )}

          {/* List / states */}
          {loading ? (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl p-10 items-center shadow-sm">
              <ActivityIndicator color={PRIMARY} />
            </View>
          ) : !error && users.length === 0 ? (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl p-8 items-center shadow-sm">
              <View className="w-16 h-16 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center mb-3">
                <Feather name="users" size={26} color="#9CA3AF" />
              </View>
              <Text className="text-gray-700 dark:text-gray-200 font-semibold text-lg">
                No accounts found
              </Text>
              <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1 max-w-xs">
                Try a different role, status, or search term.
              </Text>
            </View>
          ) : (
            !error && (
              <>
                {users.map((u) => (
                  <AccountCard
                    key={u.id}
                    user={u}
                    showLocation={isCompanyAdmin}
                    onPress={() => setSelected(u)}
                  />
                ))}

                <Pagination
                  page={page}
                  perPage={perPage}
                  total={total}
                  options={PER_PAGE_OPTIONS}
                  onPageChange={setPage}
                  onPerPageChange={setPerPage}
                />
              </>
            )
          )}
        </View>
      </ScrollView>

      {/* Role filter */}
      <BottomSheet
        visible={sheet === "role"}
        onClose={() => setSheet(null)}
        title="Filter by Role"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {ROLE_OPTIONS.map((option) => {
            const isSelected = roleFilter === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  setRoleFilter(option.value);
                  setSheet(null);
                }}
                className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
                  isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                }`}
              >
                <Text
                  className={`text-base font-medium ${
                    isSelected
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  {option.label}
                </Text>
                {isSelected && (
                  <View className="w-6 h-6 rounded-full bg-blue-500 items-center justify-center">
                    <Feather name="check" size={14} color="#FFFFFF" />
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>

      {/* Status filter */}
      <BottomSheet
        visible={sheet === "status"}
        onClose={() => setSheet(null)}
        title="Filter by Status"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {STATUS_OPTIONS.map((option) => {
            const isSelected = statusFilter === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  setStatusFilter(option.value);
                  setSheet(null);
                }}
                className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
                  isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                }`}
              >
                <Text
                  className={`text-base font-medium ${
                    isSelected
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  {option.label}
                </Text>
                {isSelected && (
                  <View className="w-6 h-6 rounded-full bg-blue-500 items-center justify-center">
                    <Feather name="check" size={14} color="#FFFFFF" />
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>

      {/* Location filter (company admin) */}
      <BottomSheet
        visible={sheet === "location"}
        onClose={() => setSheet(null)}
        title="Filter by Location"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {[{ id: null as number | null, name: "All Locations" }, ...locations].map(
            (option) => {
              const isSelected = locationFilter === option.id;
              return (
                <Pressable
                  key={String(option.id ?? "all")}
                  onPress={() => {
                    setLocationFilter(option.id);
                    setSheet(null);
                  }}
                  className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
                    isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                  }`}
                >
                  <Text
                    className={`text-base font-medium ${
                      isSelected
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-gray-700 dark:text-gray-200"
                    }`}
                  >
                    {option.name}
                  </Text>
                  {isSelected && (
                    <View className="w-6 h-6 rounded-full bg-blue-500 items-center justify-center">
                      <Feather name="check" size={14} color="#FFFFFF" />
                    </View>
                  )}
                </Pressable>
              );
            },
          )}
        </ScrollView>
      </BottomSheet>

      {/* Account actions */}
      <BottomSheet
        visible={selected !== null}
        onClose={() => (actionBusy ? undefined : setSelected(null))}
        title={selected?.name ?? "Account"}
      >
        <View className="px-4 pb-8">
          <View className="flex-row items-center gap-2 px-4 pb-3 mb-2 border-b border-gray-100 dark:border-neutral-800">
            {selected && <RoleBadge role={selected.role} />}
            {selected && <StatusBadge status={selected.status} />}
            <Text
              className="text-xs text-gray-400 dark:text-gray-500 flex-1 text-right"
              numberOfLines={1}
            >
              {selected?.email}
            </Text>
          </View>

          {actionBusy ? (
            <View className="py-6 items-center">
              <ActivityIndicator color={PRIMARY} />
            </View>
          ) : canManage && !isSelf ? (
            <>
              <Pressable
                onPress={runToggle}
                className="flex-row items-center gap-3 px-4 py-4 rounded-xl active:bg-gray-50 dark:active:bg-neutral-800"
              >
                <Feather
                  name={selected?.status === "active" ? "user-x" : "user-check"}
                  size={18}
                  color={PRIMARY}
                />
                <Text className="text-base font-medium text-gray-800 dark:text-gray-100 flex-1">
                  {selected?.status === "active" ? "Deactivate account" : "Activate account"}
                </Text>
              </Pressable>

              {isCompanyAdmin && (
                <Pressable
                  onPress={runResend}
                  className="flex-row items-center gap-3 px-4 py-4 rounded-xl active:bg-gray-50 dark:active:bg-neutral-800"
                >
                  <Feather name="key" size={18} color={PRIMARY} />
                  <Text className="text-base font-medium text-gray-800 dark:text-gray-100 flex-1">
                    Resend credentials
                  </Text>
                </Pressable>
              )}

              {isCompanyAdmin && (
                <Pressable
                  onPress={confirmDelete}
                  className="flex-row items-center gap-3 px-4 py-4 rounded-xl active:bg-red-50 dark:active:bg-red-900/20"
                >
                  <Feather name="trash-2" size={18} color="#EF4444" />
                  <Text className="text-base font-medium text-red-600 flex-1">
                    Delete account
                  </Text>
                </Pressable>
              )}
            </>
          ) : (
            <Text className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">
              {isSelf
                ? "You can't manage your own account from here."
                : "You don't have permission to manage this account."}
            </Text>
          )}
        </View>
      </BottomSheet>
    </View>
  );
};

export default ManageAccounts;
