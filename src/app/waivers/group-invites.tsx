import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "../../components/ui/BottomSheet";
import { GroupInviteRecipientsSheet } from "../../components/ui/GroupInviteRecipientsSheet";
import {
  formatInviteDate,
  GroupInvitesTable,
} from "../../components/ui/GroupInvitesTable";
import { HubShortcuts, type HubQuickLink } from "../../components/ui/ModuleHub";
import { ModuleHeader, SearchField } from "../../components/ui/ModuleHeader";
import { Pagination } from "../../components/ui/Pagination";
import {
  AttractionsListSkeleton,
  AttractionsTableSkeleton,
} from "../../components/ui/skeleton/AttractionsSkeleton";
import {
  ListEmptyState,
  ListErrorBanner,
  ListHeader,
  ToneDotBadge,
} from "../../components/ui/SummaryPanel";
import { ViewToggle, type ViewMode } from "../../components/ui/ViewToggle";
import {
  consumeGroupInvitesStale,
  useGroupInvites,
} from "../../lib/hooks/useGroupInvites";
import { getCurrentUser, getToken } from "../../lib/session";
import { buildChaperoneLink, buildGroupLink } from "../../lib/waivers/chaperoneLink";
import { groupLinkState } from "../../lib/waivers/groupInvites";
import {
  resendGroupInvite,
  type GroupInvite,
} from "../../services/waiversService";

const PRIMARY = "#0644C7";

/** Horizontal page padding (`px-4`) — the More shortcuts row bleeds past it. */
const SCREEN_GUTTER = 16;

/** Whether the chaperone's own invite went out (the invite's `status`). */
const InviteStatusPill = ({ status }: { status: string }) =>
  status === "sent" ? (
    <ToneDotBadge tone="blue" label="Invite sent" />
  ) : status === "not_sent" ? (
    <ToneDotBadge tone="gray" label="Not sent yet" />
  ) : (
    <ToneDotBadge tone="gray" label={status.replace(/_/g, " ")} />
  );

const InviteCard = ({
  invite,
  onMore,
}: {
  invite: GroupInvite;
  onMore: () => void;
}) => {
  const contact = invite.chaperoneEmail || invite.chaperonePhone;
  const link = groupLinkState(invite);
  return (
    <Pressable
      onPress={onMore}
      className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 p-4 mb-3 active:bg-gray-50 dark:active:bg-neutral-800"
      accessibilityRole="button"
      accessibilityLabel={`Invite for ${invite.chaperoneName}`}
    >
      <View className="flex-row items-start justify-between gap-3">
        <Text
          className="flex-1 text-base font-semibold text-gray-900 dark:text-white"
          numberOfLines={1}
        >
          {invite.chaperoneName}
        </Text>
        <InviteStatusPill status={invite.status} />
      </View>
      {!!contact && (
        <Text className="text-xs text-gray-500 dark:text-gray-400 mt-1" numberOfLines={1}>
          {contact}
        </Text>
      )}

      <View className="flex-row items-center gap-1.5 mt-2">
        <Feather name="file-text" size={13} color="#9CA3AF" />
        <Text
          className="shrink text-[13px] font-medium text-gray-700 dark:text-gray-200"
          numberOfLines={1}
        >
          {invite.templateTitle ?? "—"}
        </Text>
      </View>

      {/* Signed / not delivered / group link — the web row's numbers */}
      <View className="flex-row mt-3 rounded-xl bg-gray-50 dark:bg-neutral-800/60 border border-gray-100 dark:border-neutral-800">
        <View className="flex-1 px-3 py-2.5">
          <Text className="text-[11px] text-gray-500 dark:text-gray-400">Signed</Text>
          <Text className="text-sm font-semibold mt-0.5 text-gray-900 dark:text-white">
            {invite.completeCount} of {invite.recipientsCount}
          </Text>
        </View>
        <View className="flex-1 px-3 py-2.5 border-l border-gray-200 dark:border-neutral-800">
          <Text className="text-[11px] text-gray-500 dark:text-gray-400">Not delivered</Text>
          <Text
            className={`text-sm font-semibold mt-0.5 ${
              invite.failedCount > 0
                ? "text-red-600 dark:text-red-400"
                : "text-gray-900 dark:text-white"
            }`}
          >
            {invite.failedCount}
          </Text>
        </View>
        <View className="flex-1 px-3 py-2.5 border-l border-gray-200 dark:border-neutral-800">
          <Text className="text-[11px] text-gray-500 dark:text-gray-400">Group link</Text>
          <Text
            className={`text-sm font-semibold mt-0.5 ${
              link === "off" ? "text-gray-400 dark:text-gray-500" : "text-emerald-700 dark:text-emerald-400"
            }`}
          >
            {link === "copy" ? "Ready" : link === "enabled" ? "Enabled" : "Off"}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center justify-between gap-3 mt-3">
        <View className="flex-row items-center gap-1.5 shrink">
          <Feather name="calendar" size={12} color="#9CA3AF" />
          <Text className="text-xs text-gray-400 dark:text-gray-500" numberOfLines={1}>
            {formatInviteDate(invite.selectedDate)}
          </Text>
        </View>
        <View className="flex-row items-center gap-0.5">
          <Text className="text-xs font-medium text-gray-500 dark:text-gray-400">Actions</Text>
          <Feather name="chevron-right" size={14} color="#9CA3AF" />
        </View>
      </View>
    </Pressable>
  );
};

/** One row of the per-invite actions sheet. */
const SheetAction = ({
  icon,
  label,
  color = PRIMARY,
  disabled = false,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  color?: string;
  disabled?: boolean;
  onPress: () => void;
}) => (
  <Pressable
    disabled={disabled}
    onPress={onPress}
    className="flex-row items-center gap-3 px-4 py-4 rounded-xl active:bg-gray-50 dark:active:bg-neutral-800"
    accessibilityRole="button"
  >
    <Feather name={icon} size={18} color={color} />
    <Text className="text-base font-medium text-gray-800 dark:text-gray-100">
      {label}
    </Text>
  </Pressable>
);

const GroupInvites = () => {
  const insets = useSafeAreaInsets();

  const role = getCurrentUser()?.role;
  // Group-invite create/resend is admin/manager only (attendant blocked).
  const canManage = role === "company_admin" || role === "location_manager";

  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [actionsInvite, setActionsInvite] = useState<GroupInvite | null>(null);
  const [viewingInvite, setViewingInvite] = useState<GroupInvite | null>(null);
  const [busy, setBusy] = useState(false);
  // Shared by the table's Resend button and the sheet's, so a quick double tap
  // on either can't notify the chaperone twice.
  const resendLock = useRef(false);
  // Presentation layout only — table by default, card view on toggle, mirroring
  // the web admin's Group Invites table (Chaperone / Template / Date / Signed
  // / Group link) and the same pattern used across the app's other list screens.
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

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

  const paged = useMemo(
    () => filtered.slice((page - 1) * perPage, page * perPage),
    [filtered, page, perPage],
  );
  useEffect(() => {
    setPage(1);
  }, [search, perPage]);
  // A refetch that shrinks the list would otherwise leave an empty page.
  useEffect(() => {
    const last = Math.max(1, Math.ceil(filtered.length / perPage));
    if (page > last) setPage(last);
  }, [page, filtered.length, perPage]);

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

  const onResend = useCallback(async (invite: GroupInvite) => {
    if (resendLock.current) return;
    const token = getToken();
    if (!token) {
      Alert.alert("Not authenticated");
      return;
    }
    resendLock.current = true;
    setBusy(true);
    try {
      // Resolves only when an email or text actually went out — the server
      // answers 422 with the reason otherwise, which lands in the catch.
      await resendGroupInvite(token, invite.id);
      setActionsInvite(null);
      Alert.alert("Invite resent", "The chaperone has been notified again.");
    } catch (e) {
      Alert.alert(
        "Could not resend",
        e instanceof Error ? e.message : "Please try again.",
      );
    } finally {
      resendLock.current = false;
      setBusy(false);
    }
  }, []);

  // The actions sheet closes first; opening the list on top of it while it
  // animates out would stack two modals.
  const onViewRecipients = useCallback(
    (invite: GroupInvite) => {
      if (actionsInvite) {
        setActionsInvite(null);
        setTimeout(() => setViewingInvite(invite), 280);
      } else {
        setViewingInvite(invite);
      }
    },
    [actionsInvite],
  );

  const onCopyGroupLink = async (invite: GroupInvite) => {
    if (!invite.shareableToken) return;
    setActionsInvite(null);
    try {
      await Clipboard.setStringAsync(buildGroupLink(invite.shareableToken));
      Alert.alert(
        "Group link copied",
        "Everyone in the group who opens it signs their own waiver.",
      );
    } catch {
      Alert.alert("Copy failed", "Could not copy the group link.");
    }
  };

  // The web row's "Copy chaperone link" — the table has it inline; the card
  // view reaches it through this sheet.
  const onCopyChaperoneLink = async (invite: GroupInvite) => {
    setActionsInvite(null);
    try {
      await Clipboard.setStringAsync(buildChaperoneLink(invite.manageToken));
      Alert.alert(
        "Chaperone link copied",
        "The chaperone opens it to add their group and track who has signed.",
      );
    } catch {
      Alert.alert("Copy failed", "Could not copy the chaperone link.");
    }
  };

  const onShare = async (invite: GroupInvite) => {
    setActionsInvite(null);
    try {
      // The same public chaperone URL the web's copy button builds.
      await Share.share({
        message: `ZapZone group waiver for ${invite.chaperoneName} (${formatInviteDate(
          invite.selectedDate,
        )}): ${buildChaperoneLink(invite.manageToken)}`,
      });
    } catch {
      /* user dismissed the share sheet */
    }
  };

  const showError = !loading && !!error;

  const moreShortcuts: HubQuickLink[] = [
    { label: "Waiver Records", icon: "file-text", route: "/waivers/waivers" },
    { label: "Templates", icon: "layout", route: "/waivers/templates" },
    { label: "Refresh", icon: "refresh-cw", onPress: onRefresh },
  ];

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <ModuleHeader
        title="Group Invites"
        action={{
          onPress: () => router.push("/waivers/create-group-invite"),
          accessibilityLabel: "New group invite",
        }}
      />

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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
        <View className="px-4 mt-4">
          <Text className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {"Invite a chaperone or group leader to collect each parent's waiver."}
          </Text>

          {/* More — related Waivers screens as hub shortcuts. */}
          <View>
            <HubShortcuts title="More" links={moreShortcuts} gutter={SCREEN_GUTTER} />
          </View>

          {/* Search */}
          <View className="flex-row items-center gap-2 mt-4 mb-4">
            <SearchField
              value={search}
              onChangeText={setSearch}
              placeholder="Search by chaperone or template"
            />
          </View>

          {showError && (
            <ListErrorBanner
              title="Could not load group invites"
              message={error ?? ""}
              onRetry={() => void refetch()}
            />
          )}

          {!loading && !error && (
            <ListHeader title="All Invites" count={filtered.length}>
              <ViewToggle mode={viewMode} onChange={setViewMode} />
            </ListHeader>
          )}

          {/* Each state is keyed so switching between them remounts cleanly. */}
          {loading ? (
            <View key="s-loading">
              {viewMode === "table" ? <AttractionsTableSkeleton /> : <AttractionsListSkeleton />}
            </View>
          ) : showError ? null : filtered.length === 0 ? (
            invites.length === 0 ? (
              <View key="s-empty">
                <ListEmptyState
                  icon="users"
                  title="No group invites yet"
                  message="Invite a chaperone to collect waivers for their whole group."
                  actionLabel="New Invite"
                  actionIcon="plus"
                  primary
                  onAction={() => router.push("/waivers/create-group-invite")}
                />
              </View>
            ) : (
              <View key="s-no-match">
                <ListEmptyState
                  icon="search"
                  title="No invites found"
                  message="No group invites match your search."
                  actionLabel="Clear search"
                  onAction={() => setSearch("")}
                />
              </View>
            )
          ) : (
            <View key="s-list">
              {viewMode === "table" ? (
                <GroupInvitesTable
                  invites={paged}
                  canManage={canManage}
                  onRowPress={setActionsInvite}
                  onResend={onResend}
                  onViewRecipients={onViewRecipients}
                />
              ) : (
                paged.map((invite) => (
                  <InviteCard
                    key={invite.id}
                    invite={invite}
                    onMore={() => setActionsInvite(invite)}
                  />
                ))
              )}
              <Pagination
                page={page}
                perPage={perPage}
                total={filtered.length}
                options={[10, 25, 50]}
                onPageChange={setPage}
                onPerPageChange={setPerPage}
              />
            </View>
          )}
        </View>
      </ScrollView>

      {/* Per-invite actions */}
      <BottomSheet
        visible={actionsInvite !== null}
        onClose={() => (busy ? undefined : setActionsInvite(null))}
        title={actionsInvite?.chaperoneName ?? "Invite"}
        subtitle={
          actionsInvite
            ? `${formatInviteDate(actionsInvite.selectedDate)} · ${actionsInvite.completeCount} of ${actionsInvite.recipientsCount} signed`
            : undefined
        }
      >
        <View className="px-4 pb-8">
          {busy && (
            <View className="items-center py-4">
              <ActivityIndicator color={PRIMARY} />
            </View>
          )}
          {actionsInvite && (
            <>
              <SheetAction
                icon="list"
                label="See who has signed"
                disabled={busy}
                onPress={() => onViewRecipients(actionsInvite)}
              />
              <SheetAction
                icon="link-2"
                label="Copy chaperone link"
                disabled={busy}
                onPress={() => onCopyChaperoneLink(actionsInvite)}
              />
              {groupLinkState(actionsInvite) === "copy" && (
                <SheetAction
                  icon="copy"
                  label="Copy group link"
                  disabled={busy}
                  onPress={() => onCopyGroupLink(actionsInvite)}
                />
              )}
              {canManage && (
                <SheetAction
                  icon="send"
                  label="Resend to chaperone"
                  disabled={busy}
                  onPress={() => onResend(actionsInvite)}
                />
              )}
              <SheetAction
                icon="share-2"
                label="Share chaperone link"
                color="#6B7280"
                onPress={() => onShare(actionsInvite)}
              />
            </>
          )}
        </View>
      </BottomSheet>

      <GroupInviteRecipientsSheet
        invite={viewingInvite}
        onClose={() => setViewingInvite(null)}
      />
    </View>
  );
};

export default GroupInvites;
