import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RegistrationLoadFailure } from "../../components/events/RegistrationLoadFailure";
import { RegistrationStatusPill } from "../../components/events/RegistrationStatusPill";
import { RegistrationSummary } from "../../components/events/RegistrationTile";
import { HubShortcuts, type HubQuickLink } from "../../components/ui/ModuleHub";
import { Toast, type ToastType } from "../../components/ui/Toast";
import { toCsv } from "../../lib/attractions/attractionsCsv";
import { useTransientAlert } from "../../lib/hooks/useTransientAlert";
import { useActiveLocation } from "../../lib/location/activeLocationStore";
import {
  decodeIds,
  describeFailure,
  entryWord,
  groupCsvFilename,
  groupExportTable,
  groupScope,
  locationDisplayName,
  pendingAddLocations,
  takeRegistrationFormsNotice,
  type StaffRequestFailure,
} from "../../lib/registrationForms/registrationForms";
import { shareCsvFile } from "../../lib/registrationForms/shareCsv";
import { getCurrentUser, getToken } from "../../lib/session";
import { formatDateLong } from "../../lib/waivers/returningCustomers";
import {
  exportRegistrationEventGroup,
  fetchRegistrationEventGroup,
  type RegistrationEventGroupDetail,
} from "../../services/registrationFormsService";

const PRIMARY = "#0644C7";

/** Horizontal page padding (`px-4`) — the More shortcuts row bleeds past it. */
const SCREEN_GUTTER = 16;

/** One labelled cell in a location card's Entries / Unique strip. */
const Spec = ({
  label,
  value,
  divider = false,
}: {
  label: string;
  value: string;
  divider?: boolean;
}) => (
  <View
    className={`flex-1 px-3 py-2.5 ${
      divider ? "border-l border-gray-200 dark:border-neutral-800" : ""
    }`}
  >
    <Text className="text-[11px] text-gray-500 dark:text-gray-400">
      {label}
    </Text>
    <Text
      numberOfLines={1}
      className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5"
    >
      {value}
    </Text>
  </View>
);

const openForm = (id: number) =>
  router.push({
    pathname: "/events/registration-form-details",
    params: { id: String(id) },
  } as never);

const openGroup = (id: number) =>
  router.push({
    pathname: "/events/registration-event",
    params: { id: String(id) },
  } as never);

/** Web d5a759e event page: combined numbers, each location's form, and the event's actions. */
const RegistrationEvent = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  const params = useLocalSearchParams<{
    id?: string;
    addLocations?: string;
    eventLinks?: string;
  }>();
  const groupId = Number(params.id);

  const isCompanyAdmin = getCurrentUser()?.role === "company_admin";
  const activeLocation = useActiveLocation();
  const [group, setGroup] = useState<RegistrationEventGroupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<StaffRequestFailure | null>(null);
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  const [toast, showToast] = useTransientAlert<{
    message: string;
    type: ToastType;
  }>();
  const focusedOnce = useRef(false);
  // "Add to this event" from a new event's editor arrives once, as params.
  const pendingAdd = useRef(
    params.addLocations ? { ids: decodeIds(params.addLocations), links: params.eventLinks ?? "" } : null,
  );

  const notify = useCallback(
    (message: string, type: ToastType) => showToast({ message, type }),
    [showToast],
  );

  const load = useCallback(async () => {
    const token = getToken();
    if (!token || !Number.isFinite(groupId)) {
      setFailure({ message: "This event could not be loaded.", unavailable: false, switchLocationId: null, status: null });
      setLoading(false);
      return;
    }
    try {
      setGroup(await fetchRegistrationEventGroup(token, groupId));
      setFailure(null);
    } catch (err) {
      setFailure(describeFailure(err, "This event could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Fresh again whenever an editor or a location form hands focus back.
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) void load();
      focusedOnce.current = true;
      const notice = takeRegistrationFormsNotice();
      if (notice) notify(notice, "success");
    }, [load, notify]),
  );

  const openEditor = useCallback(
    (mode: "edit" | "add", extra: Record<string, string> = {}) =>
      router.push({
        pathname: "/events/registration-event-editor",
        params: { id: String(groupId), mode, ...extra },
      } as never),
    [groupId],
  );

  useEffect(() => {
    const pending = pendingAdd.current;
    if (!pending || !group) return;
    pendingAdd.current = null;
    if (!group.canManage || !isCompanyAdmin) {
      notify("Only a company admin can change this event.", "info");
      return;
    }
    const { fresh, alreadyMessage } = pendingAddLocations(group, pending.ids);
    if (alreadyMessage) {
      notify(alreadyMessage, "info");
      return;
    }
    openEditor("add", { locations: fresh.join(","), eventLinks: pending.links });
  }, [group, isCompanyAdmin, notify, openEditor]);

  const exportCsv = async () => {
    const token = getToken();
    if (!group || !token) return;
    setExporting(true);
    try {
      const result = await exportRegistrationEventGroup(token, group.id);
      const table = groupExportTable(result.rows, result.hasPreviousGroup);
      const today = new Date().toISOString().slice(0, 10);
      const shared = await shareCsvFile(
        groupCsvFilename(group.name, today),
        toCsv(table.headers, table.rows),
        "Export event registrations",
      );
      if (!shared) notify("Sharing isn't available on this device.", "error");
      else if (result.capped)
        notify(
          `The export holds the first ${result.rows.length.toLocaleString()} of ${result.total.toLocaleString()} entries.`,
          "info",
        );
    } catch (err) {
      notify(describeFailure(err, "The export failed. Please try again.").message, "error");
    } finally {
      setExporting(false);
    }
  };

  // Adding a location form stays company-admin only, as before.
  const canAddForm = !!group?.canManage && isCompanyAdmin;

  const header = (
    <View className="bg-white dark:bg-neutral-900 pt-12 pb-3 px-4 w-full z-10 border-b border-gray-100 dark:border-neutral-800">
      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={() => router.back()}
          className="w-9 h-9 items-center justify-center bg-gray-100 dark:bg-neutral-800 rounded-full active:opacity-70"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Feather name="chevron-left" size={20} color={headerIcon} />
        </Pressable>
        <Text
          numberOfLines={1}
          className="flex-1 text-gray-900 dark:text-white text-lg font-semibold"
        >
          Registration Event
        </Text>
        {canAddForm && (
          <Pressable
            onPress={() => openEditor("add")}
            className="flex-row items-center gap-1 h-9 pl-2.5 pr-3.5 rounded-full bg-[#0644C7] active:opacity-90"
            accessibilityRole="button"
            accessibilityLabel="Add location form"
          >
            <Feather name="plus" size={16} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-white">Add</Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  if (loading) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-black">
        {header}
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={PRIMARY} />
        </View>
      </View>
    );
  }

  if (failure || !group) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-black">
        {header}
        <RegistrationLoadFailure
          failure={failure}
          fallback="This event could not be loaded."
          returnTo={`/events/registration-event?id=${groupId}`}
          iconColor={headerIcon}
          onRetry={() => {
            setLoading(true);
            void load();
          }}
        />
      </View>
    );
  }

  const scope = groupScope(group);
  const needle = group.forms.length > 1 ? search.trim().toLowerCase() : "";
  const forms = group.forms.filter(
    (form) => !needle || (form.locationName ?? "").toLowerCase().includes(needle),
  );
  const highlightedLocation =
    isCompanyAdmin && activeLocation.id !== "all" ? activeLocation.id : null;

  // The event's secondary actions as module-hub shortcuts, like the Manage
  // Attractions "More" row. Same gates as before: managing is canManage only.
  const moreShortcuts: HubQuickLink[] = [
    ...(group.canManage
      ? [
          {
            label: "Edit event",
            icon: "edit-2",
            onPress: () => openEditor("edit"),
          } as HubQuickLink,
        ]
      : []),
    ...(group.canManage && !group.nextGroup
      ? [
          {
            label: "Next year's event",
            icon: "copy",
            onPress: () =>
              router.push({
                pathname: "/events/registration-event-editor",
                params: { nextFrom: String(group.id) },
              } as never),
          } as HubQuickLink,
        ]
      : []),
    {
      label: exporting ? "Exporting…" : "Export event CSV",
      icon: "download",
      onPress: () => {
        if (!exporting) void exportCsv();
      },
    },
  ];

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {header}

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <View className="px-4 mt-4">
          {/* Breadcrumb, then the event's name, date, venues and year links. */}
          <View className="gap-1.5 mb-4">
            <Pressable
              onPress={() => router.dismissTo("/events/registration-forms" as never)}
              accessibilityRole="link"
              className="flex-row items-center gap-1 self-start py-1"
            >
              <Feather name="arrow-left" size={14} color={PRIMARY} />
              <Text className="text-sm font-medium text-[#0644C7] dark:text-blue-400">
                All events
              </Text>
            </Pressable>
            <View className="flex-row items-start justify-between gap-3">
              <Text className="flex-1 text-xl font-semibold text-gray-900 dark:text-white">
                {group.name}
              </Text>
              <View className="mt-1">
                <RegistrationStatusPill status={group.status} />
              </View>
            </View>
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              {formatDateLong(group.eventDate)}
              {"  ·  "}
              {group.locationFormsTotal} participating location
              {group.locationFormsTotal === 1 ? "" : "s"}
            </Text>
            {group.previousGroup && (
              <Pressable onPress={() => openGroup(group.previousGroup!.id)} accessibilityRole="link">
                <Text className="text-sm text-[#0644C7] dark:text-blue-400">
                  {`Last year's event: ${group.previousGroup.name}`}
                </Text>
              </Pressable>
            )}
            {group.nextGroup && (
              <Pressable onPress={() => openGroup(group.nextGroup!.id)} accessibilityRole="link">
                <Text className="text-sm text-[#0644C7] dark:text-blue-400">
                  {`Next year's event: ${group.nextGroup.name}`}
                </Text>
              </Pressable>
            )}
          </View>

          {/* Scope — which locations these numbers cover. */}
          <View className="flex-row items-center gap-2 mb-4 px-3.5 py-2.5 rounded-xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800">
            <Feather name="map-pin" size={14} color="#6B7280" />
            <Text className="flex-1 text-xs text-gray-600 dark:text-gray-300">
              <Text className="font-semibold">This event</Text> · {scope.label}
            </Text>
          </View>

          {/* Summary — one panel, four counts, divided by hairlines. */}
          <RegistrationSummary
            tiles={[
              {
                icon: "file-text",
                label: "Total entries",
                value: group.counts.totalEntries,
                hint: "Every form submitted, including repeats.",
              },
              {
                icon: "user-check",
                label: "Unique registrations",
                value: group.counts.uniqueRegistrations,
                hint: "Entries with the same phone and the same email count once.",
              },
              {
                icon: "map-pin",
                label: "Location forms",
                value: group.counts.locationForms,
                hint: scope.allLocations
                  ? "Participating locations for this event."
                  : "Your locations in this event.",
              },
              {
                icon: "rotate-ccw",
                label: "Registered before",
                value: group.counts.registeredBefore,
                hint: "Registered for an earlier event that had already taken place.",
              },
            ]}
          />
          <Text className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            {scope.allLocations
              ? "Combined registrations for this event across all participating locations."
              : `Registrations for this event at ${scope.soleVenue ?? "your locations"}.`}{" "}
            {"They don't show who attended."}
          </Text>

          {/* More — the event's secondary actions as module-hub shortcuts. */}
          <View className="mt-5">
            <HubShortcuts
              title="More"
              links={moreShortcuts}
              gutter={SCREEN_GUTTER}
            />
          </View>

          {/* Search — only once there's more than one location to search. */}
          {group.forms.length > 1 && (
            <View className="flex-row items-center gap-2 h-11 px-3.5 mt-4 rounded-xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800">
              <Feather name="search" size={16} color="#9CA3AF" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search locations"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                className="flex-1 text-sm text-gray-900 dark:text-white"
                accessibilityLabel="Search locations"
              />
              {search.length > 0 && (
                <Pressable
                  onPress={() => setSearch("")}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                >
                  <Feather name="x-circle" size={16} color="#9CA3AF" />
                </Pressable>
              )}
            </View>
          )}

          {/* List header — title + count. */}
          <View className="flex-row items-baseline gap-2 mt-4 mb-3">
            <Text
              numberOfLines={1}
              className="shrink text-base font-semibold text-gray-900 dark:text-white"
            >
              Participating location forms
            </Text>
            <Text className="text-sm text-gray-400 dark:text-gray-500">
              {forms.length}
            </Text>
          </View>

          {forms.length === 0 ? (
            <View
              key="forms-empty"
              className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 px-6 py-10 items-center"
            >
              <View className="w-12 h-12 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center mb-3">
                <Feather name="search" size={20} color="#9CA3AF" />
              </View>
              <Text className="text-base font-semibold text-gray-900 dark:text-white">
                No locations match.
              </Text>
              {search.length > 0 && (
                <Pressable
                  onPress={() => setSearch("")}
                  className="mt-4 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-neutral-700 active:opacity-70"
                  accessibilityRole="button"
                >
                  <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Clear search
                  </Text>
                </Pressable>
              )}
            </View>
          ) : (
            <View key="forms-list">
              {forms.map((form) => {
                const highlighted = highlightedLocation === form.locationId;
                return (
                  <Pressable
                    key={form.id}
                    onPress={() => openForm(form.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`View ${form.locationName ?? "location"} form`}
                    className={`rounded-2xl border p-4 mb-3 active:bg-gray-50 dark:active:bg-neutral-800 ${
                      highlighted
                        ? "border-blue-300 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-900/20"
                        : "border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900"
                    }`}
                  >
                    {/* Location + status */}
                    <View className="flex-row items-start justify-between gap-3">
                      <Text
                        numberOfLines={1}
                        className="flex-1 text-base font-semibold text-gray-900 dark:text-white"
                      >
                        {form.locationName ? locationDisplayName(form.locationName) : "Location"}
                      </Text>
                      <RegistrationStatusPill status={form.status} />
                    </View>

                    {/* Event date · photo frame */}
                    <Text
                      numberOfLines={1}
                      className="text-xs text-gray-500 dark:text-gray-400 mt-1"
                    >
                      {formatDateLong(form.eventDate)}
                      {form.photoFrames
                        ? `  ·  ${
                            form.photoFrames.frames.length > 0
                              ? `Frame: ${form.photoFrames.frames[0].name}`
                              : "No frame"
                          }`
                        : ""}
                    </Text>

                    {/* Entries / Unique */}
                    <View className="flex-row mt-3 rounded-xl bg-gray-50 dark:bg-neutral-800/60 border border-gray-100 dark:border-neutral-800">
                      <Spec
                        label="Entries"
                        value={`${form.totalEntries} ${entryWord(form.totalEntries)}`}
                      />
                      <Spec
                        divider
                        label="Unique"
                        value={String(form.uniqueRegistrations)}
                      />
                    </View>

                    {/* Affordance */}
                    <View className="flex-row items-center justify-end gap-0.5 mt-3">
                      <Text className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        Details
                      </Text>
                      <Feather name="chevron-right" size={14} color="#9CA3AF" />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => showToast(null)}
        />
      )}
    </View>
  );
};

export default RegistrationEvent;
