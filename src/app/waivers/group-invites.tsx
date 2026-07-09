import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "../../components/ui/BottomSheet";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { WaiversListSkeleton } from "../../components/ui/skeleton/WaiversSkeleton";
import {
  consumeGroupInvitesStale,
  useGroupInvites,
} from "../../lib/hooks/useGroupInvites";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  resendGroupInvite,
  type GroupInvite,
} from "../../services/waiversService";

const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(`${dateStr.substring(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const InviteCard = ({
  invite,
  onMore,
}: {
  invite: GroupInvite;
  onMore: () => void;
}) => {
  const contact = invite.chaperoneEmail || invite.chaperonePhone;
  return (
    <Pressable
      onPress={onMore}
      className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3 shadow-sm active:opacity-90"
      style={CARD_SHADOW}
      accessibilityRole="button"
      accessibilityLabel={`Invite for ${invite.chaperoneName}`}
    >
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-1 mr-3">
          <Text
            className="text-base font-bold text-gray-900 dark:text-white"
            numberOfLines={1}
          >
            {invite.chaperoneName}
          </Text>
          {!!contact && (
            <Text
              className="text-xs text-gray-400 dark:text-gray-500 mt-0.5"
              numberOfLines={1}
            >
              {contact}
            </Text>
          )}
        </View>
        <StatusBadge status={invite.status} />
      </View>

      <View className="flex-row items-center gap-1.5">
        <Feather name="file-text" size={12} color="#9CA3AF" />
        <Text
          className="text-sm font-medium text-gray-700 dark:text-gray-200 flex-1"
          numberOfLines={1}
        >
          {invite.templateTitle ?? "—"}
        </Text>
      </View>

      <View className="flex-row items-center gap-1.5 mt-1">
        <Feather name="calendar" size={12} color="#9CA3AF" />
        <Text className="text-xs text-gray-500 dark:text-gray-400">
          {formatDate(invite.selectedDate)}
        </Text>
      </View>

      <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
        <View className="flex-row items-center gap-1.5">
          <Feather name="users" size={12} color="#9CA3AF" />
          <Text className="text-xs text-gray-500 dark:text-gray-400">
            {invite.completeCount}/{invite.recipientsCount} complete
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          {invite.allowShareableLink && (
            <View className="bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">
              <Text className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                Shareable
              </Text>
            </View>
          )}
          <Feather name="more-vertical" size={18} color="#9CA3AF" />
        </View>
      </View>
    </Pressable>
  );
};

const GroupInvites = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  const role = getCurrentUser()?.role;
  // Group-invite create/resend is admin/manager only (attendant blocked).
  const canManage = role === "company_admin" || role === "location_manager";

  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [actionsInvite, setActionsInvite] = useState<GroupInvite | null>(null);
  const [busy, setBusy] = useState(false);

  const { invites, loading, error, refetch } = useGroupInvites();

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return invites;
    return invites.filter((i) =>
      `${i.chaperoneName} ${i.chaperoneEmail ?? ""} ${i.templateTitle ?? ""}`
        .toLowerCase()
        .includes(term),
    );
  }, [invites, search]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  useFocusEffect(
    useCallback(() => {
      if (consumeGroupInvitesStale()) refetch();
    }, [refetch]),
  );

  const onResend = async (invite: GroupInvite) => {
    const token = getToken();
    if (!token) {
      Alert.alert("Not authenticated");
      return;
    }
    setBusy(true);
    try {
      await resendGroupInvite(token, invite.id);
      setActionsInvite(null);
      Alert.alert("Invite resent", "The chaperone has been notified again.");
    } catch (e) {
      Alert.alert(
        "Could not resend",
        e instanceof Error ? e.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const onShare = async (invite: GroupInvite) => {
    setActionsInvite(null);
    try {
      // No public web origin is configured in the app, so we share the manage
      // token. Primary distribution is "Resend", which emails/texts the full
      // link server-side.
      await Share.share({
        message: `ZapZone group waiver for ${invite.chaperoneName} (${formatDate(
          invite.selectedDate,
        )}). Chaperone link code: ${invite.manageToken}`,
      });
    } catch {
      /* user dismissed the share sheet */
    }
  };

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
            Group Invites
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
          <View className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mt-6 mb-5 shadow-sm">
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Group Invites
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Send a chaperone one link to collect waivers for their whole group
            </Text>
          </View>

          {/* Search */}
          <View className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3 rounded-xl border border-gray-100 dark:border-neutral-800 mb-5">
            <Feather name="search" size={16} color="#9CA3AF" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search by chaperone or template..."
              placeholderTextColor="#9CA3AF"
              className="flex-1 text-sm text-gray-900 dark:text-white"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <Feather name="x" size={16} color="#9CA3AF" />
              </Pressable>
            )}
          </View>

          {!loading && error && (
            <View className="bg-red-50 border border-red-100 rounded-2xl p-5 mb-5">
              <Text className="text-red-600 font-semibold">Something went wrong</Text>
              <Text className="text-red-500 text-sm mt-1">{error}</Text>
            </View>
          )}

          {!loading && !error && (
            <View className="flex-row items-center gap-2 mb-4">
              <Text className="shrink text-lg font-bold text-gray-900 dark:text-white">
                All Invites
              </Text>
              <View className="shrink-0 bg-gray-100 dark:bg-neutral-800 px-2.5 py-0.5 rounded-full">
                <Text className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  {filtered.length}
                </Text>
              </View>
            </View>
          )}

          {loading ? (
            <WaiversListSkeleton />
          ) : !error && filtered.length === 0 ? (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl p-8 items-center shadow-sm">
              <View className="w-16 h-16 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center mb-3">
                <Feather name="users" size={26} color="#9CA3AF" />
              </View>
              <Text className="text-gray-700 dark:text-gray-200 font-semibold text-lg">
                No group invites
              </Text>
              <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1 max-w-xs">
                {canManage
                  ? "Tap + to invite a chaperone for a group."
                  : "No invites match your search."}
              </Text>
            </View>
          ) : (
            !error &&
            filtered.map((invite) => (
              <InviteCard
                key={invite.id}
                invite={invite}
                onMore={() => setActionsInvite(invite)}
              />
            ))
          )}
        </View>
      </ScrollView>

      {/* Per-invite actions */}
      <BottomSheet
        visible={actionsInvite !== null}
        onClose={() => (busy ? undefined : setActionsInvite(null))}
        title={actionsInvite?.chaperoneName ?? "Invite"}
      >
        <View className="px-4 pb-8">
          {busy && (
            <View className="items-center py-4">
              <ActivityIndicator color={PRIMARY} />
            </View>
          )}
          {actionsInvite && (
            <>
              {canManage && (
                <Pressable
                  disabled={busy}
                  onPress={() => onResend(actionsInvite)}
                  className="flex-row items-center gap-3 px-4 py-4 rounded-xl active:bg-gray-50 dark:active:bg-neutral-800"
                >
                  <Feather name="send" size={18} color={PRIMARY} />
                  <Text className="text-base font-medium text-gray-800 dark:text-gray-100">
                    Resend to chaperone
                  </Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => onShare(actionsInvite)}
                className="flex-row items-center gap-3 px-4 py-4 rounded-xl active:bg-gray-50 dark:active:bg-neutral-800"
              >
                <Feather name="share-2" size={18} color="#6B7280" />
                <Text className="text-base font-medium text-gray-800 dark:text-gray-100">
                  Share chaperone link
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </BottomSheet>

      {/* FAB — New Group Invite */}
      {canManage && (
        <Pressable
          onPress={() => router.push("/waivers/create-group-invite" as never)}
          accessibilityRole="button"
          accessibilityLabel="Create group invite"
          style={{
            position: "absolute",
            right: 20,
            bottom: insets.bottom + 20,
            shadowColor: PRIMARY,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.4,
            shadowRadius: 12,
            elevation: 8,
          }}
          className="h-14 w-14 items-center justify-center rounded-full bg-[#0644C7] active:opacity-90"
        >
          <Feather name="plus" size={26} color="#FFFFFF" />
        </Pressable>
      )}
    </View>
  );
};

export default GroupInvites;
