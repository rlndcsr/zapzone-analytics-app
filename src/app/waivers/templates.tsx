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
import { StatusBadge } from "../../components/ui/StatusBadge";
import { WaiversListSkeleton } from "../../components/ui/skeleton/WaiversSkeleton";
import {
  consumeTemplatesStale,
  markTemplatesStale,
  useWaiverTemplates,
} from "../../lib/hooks/useWaiverTemplates";
import { useWaiverSettings } from "../../lib/hooks/useWaiverSettings";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  deleteTemplate,
  forceDeleteTemplate,
  restoreTemplate,
  setTemplateStatus,
  type TemplateStatus,
  type WaiverTemplate,
} from "../../services/waiversService";

const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const STATUS_OPTIONS: { label: string; value: TemplateStatus | "all" }[] = [
  { label: "All Statuses", value: "all" },
  { label: "Active", value: "active" },
  { label: "Draft", value: "draft" },
  { label: "Inactive", value: "inactive" },
  { label: "Archived", value: "archived" },
];

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const TemplateCard = ({
  template,
  deleted,
  onPress,
  onMore,
}: {
  template: WaiverTemplate;
  deleted: boolean;
  onPress: () => void;
  onMore: () => void;
}) => (
  <Pressable
    onPress={onPress}
    className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3 shadow-sm active:opacity-90"
    style={CARD_SHADOW}
    accessibilityRole="button"
    accessibilityLabel={`Template ${template.title}`}
  >
    <View className="flex-row items-start justify-between mb-2">
      <View className="flex-1 mr-3">
        <Text
          className="text-base font-bold text-gray-900 dark:text-white"
          numberOfLines={1}
        >
          {template.title}
        </Text>
        {!!template.internalDescription && (
          <Text
            className="text-xs text-gray-400 dark:text-gray-500 mt-0.5"
            numberOfLines={1}
          >
            {template.internalDescription}
          </Text>
        )}
      </View>
      <StatusBadge status={deleted ? "deleted" : template.status} />
    </View>

    <View className="flex-row items-center gap-3">
      <View className="flex-row items-center gap-1.5">
        <Feather name="git-commit" size={12} color="#9CA3AF" />
        <Text className="text-xs text-gray-500 dark:text-gray-400">
          v{template.currentVersion}
        </Text>
      </View>
      {template.isDefault && (
        <View className="bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-full">
          <Text className="text-[10px] font-medium text-blue-700 dark:text-blue-400">
            Default
          </Text>
        </View>
      )}
      <View className="flex-row items-center gap-1.5">
        <Feather name="link" size={12} color="#9CA3AF" />
        <Text className="text-xs text-gray-500 dark:text-gray-400">
          {template.assignmentCount} assigned
        </Text>
      </View>
    </View>

    <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
      <Text className="text-xs text-gray-400 dark:text-gray-500">
        {deleted ? "Deleted" : "Updated"} {formatDate(template.updatedAt)}
      </Text>
      <Pressable
        onPress={onMore}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={`Actions for ${template.title}`}
        className="p-1.5 rounded-full active:bg-gray-100 dark:active:bg-neutral-800"
      >
        <Feather name="more-vertical" size={18} color="#9CA3AF" />
      </Pressable>
    </View>
  </Pressable>
);

const Templates = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  const role = getCurrentUser()?.role;
  const isCompanyAdmin = role === "company_admin";
  const { settings } = useWaiverSettings();
  // Template writes: admin, or manager when the company allows it.
  const canManage =
    isCompanyAdmin ||
    (role === "location_manager" && (settings?.managerCanBuildTemplates ?? false));

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TemplateStatus | "all">("all");
  const [showDeleted, setShowDeleted] = useState(false);
  const [sheet, setSheet] = useState<null | "status">(null);
  const [refreshing, setRefreshing] = useState(false);
  const [actionsTemplate, setActionsTemplate] = useState<WaiverTemplate | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const filters = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      status: !showDeleted && statusFilter !== "all" ? statusFilter : undefined,
      trashed: showDeleted,
    }),
    [debouncedSearch, statusFilter, showDeleted],
  );

  const { templates, loading, error, refetch } = useWaiverTemplates(filters);

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
      if (consumeTemplatesStale()) refetch();
    }, [refetch]),
  );

  const runAction = async (fn: () => Promise<void>, failMsg: string) => {
    const token = getToken();
    if (!token) {
      Alert.alert("Not authenticated");
      return;
    }
    setBusy(true);
    try {
      await fn();
      setActionsTemplate(null);
      markTemplatesStale();
      await refetch();
    } catch (e) {
      Alert.alert(failMsg, e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const onToggleStatus = (t: WaiverTemplate) => {
    const token = getToken()!;
    const next: TemplateStatus = t.status === "active" ? "inactive" : "active";
    runAction(
      () => setTemplateStatus(token, t.id, next),
      "Could not update status",
    );
  };

  const onDelete = (t: WaiverTemplate) => {
    Alert.alert("Delete template?", `"${t.title}" will be moved to trash.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          runAction(
            () => deleteTemplate(getToken()!, t.id),
            "Could not delete template",
          ),
      },
    ]);
  };

  const onRestore = (t: WaiverTemplate) =>
    runAction(() => restoreTemplate(getToken()!, t.id), "Could not restore");

  const onForceDelete = (t: WaiverTemplate) => {
    Alert.alert(
      "Delete permanently?",
      `"${t.title}" will be permanently removed. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete forever",
          style: "destructive",
          onPress: () =>
            runAction(
              () => forceDeleteTemplate(getToken()!, t.id),
              "Could not delete permanently",
            ),
        },
      ],
    );
  };

  const statusLabel =
    STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ?? "All Statuses";

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
            Templates
          </Text>
          <Pressable
            onPress={() => setShowDeleted((v) => !v)}
            className={`p-2 rounded-full ${
              showDeleted ? "bg-blue-100 dark:bg-blue-900/30" : "bg-gray-100 dark:bg-neutral-800"
            }`}
            accessibilityRole="button"
            accessibilityLabel="Toggle deleted templates"
          >
            <Feather
              name="trash-2"
              size={18}
              color={showDeleted ? PRIMARY : headerIcon}
            />
          </Pressable>
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
              {showDeleted ? "Deleted Templates" : "Waiver Templates"}
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {showDeleted
                ? "Restore or permanently remove trashed templates"
                : "Reusable legal text assigned to activities"}
            </Text>
          </View>

          {/* Search */}
          <View className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3 rounded-xl border border-gray-100 dark:border-neutral-800 mb-3">
            <Feather name="search" size={16} color="#9CA3AF" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search templates..."
              placeholderTextColor="#9CA3AF"
              className="flex-1 text-sm text-gray-900 dark:text-white"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <Feather name="x" size={16} color="#9CA3AF" />
              </Pressable>
            )}
          </View>

          {/* Status filter (hidden in deleted view) */}
          {!showDeleted && (
            <Pressable
              onPress={() => setSheet("status")}
              className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800 mb-5"
            >
              <Feather name="check-circle" size={16} color={PRIMARY} />
              <Text
                className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1"
                numberOfLines={1}
              >
                {statusLabel}
              </Text>
              <Feather name="chevron-down" size={14} color="#9CA3AF" />
            </Pressable>
          )}

          {!loading && error && (
            <View className="bg-red-50 border border-red-100 rounded-2xl p-5 mb-5">
              <Text className="text-red-600 font-semibold">Something went wrong</Text>
              <Text className="text-red-500 text-sm mt-1">{error}</Text>
            </View>
          )}

          {!loading && !error && (
            <View className="flex-row items-center gap-2 mb-4">
              <Text className="shrink text-lg font-bold text-gray-900 dark:text-white">
                {showDeleted ? "Trash" : "All Templates"}
              </Text>
              <View className="shrink-0 bg-gray-100 dark:bg-neutral-800 px-2.5 py-0.5 rounded-full">
                <Text className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  {templates.length}
                </Text>
              </View>
            </View>
          )}

          {loading ? (
            <WaiversListSkeleton />
          ) : !error && templates.length === 0 ? (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl p-8 items-center shadow-sm">
              <View className="w-16 h-16 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center mb-3">
                <Feather name={showDeleted ? "trash-2" : "layout"} size={26} color="#9CA3AF" />
              </View>
              <Text className="text-gray-700 dark:text-gray-200 font-semibold text-lg">
                {showDeleted ? "Trash is empty" : "No templates found"}
              </Text>
              <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1 max-w-xs">
                {showDeleted
                  ? "Deleted templates will appear here."
                  : canManage
                    ? "Tap + to create your first template."
                    : "No templates match your search."}
              </Text>
            </View>
          ) : (
            !error &&
            templates.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                deleted={showDeleted}
                onPress={() =>
                  showDeleted
                    ? setActionsTemplate(t)
                    : canManage
                      ? router.push(`/waivers/create-template?id=${t.id}` as never)
                      : setActionsTemplate(t)
                }
                onMore={() => setActionsTemplate(t)}
              />
            ))
          )}
        </View>
      </ScrollView>

      {/* Status filter sheet */}
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

      {/* Per-template actions */}
      <BottomSheet
        visible={actionsTemplate !== null}
        onClose={() => (busy ? undefined : setActionsTemplate(null))}
        title={actionsTemplate?.title ?? "Template"}
      >
        <View className="px-4 pb-8">
          {busy && (
            <View className="items-center py-4">
              <ActivityIndicator color={PRIMARY} />
            </View>
          )}

          {actionsTemplate && !showDeleted && (
            <>
              {canManage && (
                <Pressable
                  onPress={() => {
                    const t = actionsTemplate;
                    setActionsTemplate(null);
                    router.push(`/waivers/create-template?id=${t.id}` as never);
                  }}
                  className="flex-row items-center gap-3 px-4 py-4 rounded-xl active:bg-gray-50 dark:active:bg-neutral-800"
                >
                  <Feather name="edit-2" size={18} color={PRIMARY} />
                  <Text className="text-base font-medium text-gray-800 dark:text-gray-100">
                    Edit template
                  </Text>
                </Pressable>
              )}
              {canManage && (
                <Pressable
                  disabled={busy}
                  onPress={() => onToggleStatus(actionsTemplate)}
                  className="flex-row items-center gap-3 px-4 py-4 rounded-xl active:bg-gray-50 dark:active:bg-neutral-800"
                >
                  <Feather name="power" size={18} color="#F59E0B" />
                  <Text className="text-base font-medium text-gray-800 dark:text-gray-100">
                    {actionsTemplate.status === "active"
                      ? "Set inactive"
                      : "Set active"}
                  </Text>
                </Pressable>
              )}
              {canManage && (
                <Pressable
                  disabled={busy}
                  onPress={() => onDelete(actionsTemplate)}
                  className="flex-row items-center gap-3 px-4 py-4 rounded-xl active:bg-gray-50 dark:active:bg-neutral-800"
                >
                  <Feather name="trash-2" size={18} color="#DC2626" />
                  <Text className="text-base font-medium text-red-600">
                    Delete template
                  </Text>
                </Pressable>
              )}
              {!canManage && (
                <Text className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                  You do not have permission to manage templates.
                </Text>
              )}
            </>
          )}

          {actionsTemplate && showDeleted && (
            <>
              {canManage && (
                <Pressable
                  disabled={busy}
                  onPress={() => onRestore(actionsTemplate)}
                  className="flex-row items-center gap-3 px-4 py-4 rounded-xl active:bg-gray-50 dark:active:bg-neutral-800"
                >
                  <Feather name="rotate-ccw" size={18} color="#10B981" />
                  <Text className="text-base font-medium text-gray-800 dark:text-gray-100">
                    Restore template
                  </Text>
                </Pressable>
              )}
              {isCompanyAdmin && (
                <Pressable
                  disabled={busy}
                  onPress={() => onForceDelete(actionsTemplate)}
                  className="flex-row items-center gap-3 px-4 py-4 rounded-xl active:bg-gray-50 dark:active:bg-neutral-800"
                >
                  <Feather name="trash" size={18} color="#DC2626" />
                  <Text className="text-base font-medium text-red-600">
                    Delete permanently
                  </Text>
                </Pressable>
              )}
            </>
          )}
        </View>
      </BottomSheet>

      {/* FAB — New Template */}
      {canManage && !showDeleted && (
        <Pressable
          onPress={() => router.push("/waivers/create-template" as never)}
          accessibilityRole="button"
          accessibilityLabel="Create template"
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

export default Templates;
