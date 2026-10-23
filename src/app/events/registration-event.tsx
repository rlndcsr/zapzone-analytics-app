import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
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
import { RegistrationTile } from "../../components/events/RegistrationTile";
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

type IconName = ComponentProps<typeof Feather>["name"];

const ActionButton = ({
  label,
  icon,
  primary,
  loading,
  disabled,
  onPress,
}: {
  label: string;
  icon: IconName;
  primary?: boolean;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={label}
    className={`flex-row items-center gap-1.5 px-3 py-2 rounded-lg border active:opacity-70 ${
      primary
        ? "border-[#0644C7] bg-[#0644C7]"
        : "border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
    } ${disabled ? "opacity-50" : ""}`}
  >
    {loading ? (
      <ActivityIndicator size="small" color={primary ? "#FFFFFF" : PRIMARY} />
    ) : (
      <Feather name={icon} size={14} color={primary ? "#FFFFFF" : PRIMARY} />
    )}
    <Text
      className={`text-xs font-semibold ${
        primary ? "text-white" : "text-gray-700 dark:text-gray-200"
      }`}
    >
      {label}
    </Text>
  </Pressable>
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

  const header = (
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
          Registration Event
        </Text>
        <View style={{ width: 36 }} />
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

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {header}

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <View className="px-5 pt-5 gap-5">
          <View className="gap-2">
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
            <View className="flex-row flex-wrap items-center gap-2">
              <Text className="text-2xl font-bold text-gray-900 dark:text-white">
                {group.name}
              </Text>
              <RegistrationStatusPill status={group.status} />
            </View>
            <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
              <View className="flex-row items-center gap-1.5">
                <Feather name="calendar" size={14} color="#9CA3AF" />
                <Text className="text-sm text-gray-600 dark:text-gray-400">
                  {formatDateLong(group.eventDate)}
                </Text>
              </View>
              <View className="flex-row items-center gap-1.5">
                <Feather name="map-pin" size={14} color="#9CA3AF" />
                <Text className="text-sm text-gray-600 dark:text-gray-400">
                  {group.locationFormsTotal} participating location
                  {group.locationFormsTotal === 1 ? "" : "s"}
                </Text>
              </View>
            </View>
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

            {group.canManage && (
              <View className="flex-row flex-wrap gap-2 mt-1">
                <ActionButton label="Edit event" icon="edit-2" onPress={() => openEditor("edit")} />
                {isCompanyAdmin && (
                  <ActionButton
                    label="Add location form"
                    icon="plus"
                    primary
                    onPress={() => openEditor("add")}
                  />
                )}
                {!group.nextGroup && (
                  <ActionButton
                    label={"Next year's event"}
                    icon="copy"
                    onPress={() =>
                      router.push({
                        pathname: "/events/registration-event-editor",
                        params: { nextFrom: String(group.id) },
                      } as never)
                    }
                  />
                )}
              </View>
            )}
          </View>

          <View className="flex-row items-center gap-2 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-900/20 px-4 py-3">
            <Feather name="map-pin" size={15} color={PRIMARY} />
            <Text className="flex-1 text-sm text-gray-800 dark:text-gray-100">
              <Text className="font-semibold">This event</Text> · {scope.label}
            </Text>
          </View>

          <View>
            <View className="flex-row flex-wrap -m-1.5">
              <RegistrationTile
                label="Total entries"
                value={group.counts.totalEntries}
                hint="Every form submitted, including repeats."
              />
              <RegistrationTile
                label="Unique registrations"
                value={group.counts.uniqueRegistrations}
                hint="Entries with the same phone and the same email count once."
              />
              <RegistrationTile
                label="Location forms"
                value={group.counts.locationForms}
                hint={
                  scope.allLocations
                    ? "Participating locations for this event."
                    : "Your locations in this event."
                }
              />
              <RegistrationTile
                label="Registered before"
                value={group.counts.registeredBefore}
                hint="Registered for an earlier event that had already taken place."
              />
            </View>
            <Text className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              {scope.allLocations
                ? "Combined registrations for this event across all participating locations."
                : `Registrations for this event at ${scope.soleVenue ?? "your locations"}.`}{" "}
              {"They don't show who attended."}
            </Text>
          </View>

          <View className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-100 dark:border-neutral-800">
            <View className="p-4 gap-3 border-b border-gray-100 dark:border-neutral-800">
              <View className="flex-row items-center gap-2">
                <Feather name="map-pin" size={17} color={PRIMARY} />
                <Text className="text-base font-semibold text-gray-900 dark:text-white">
                  Participating location forms
                </Text>
              </View>
              {group.forms.length > 1 && (
                <View className="flex-row items-center gap-2 rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3.5 py-3">
                  <Feather name="search" size={15} color="#9CA3AF" />
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search locations"
                    placeholderTextColor="#9CA3AF"
                    autoCapitalize="none"
                    autoCorrect={false}
                    className="flex-1 text-sm text-gray-900 dark:text-white"
                    accessibilityLabel="Search locations"
                  />
                </View>
              )}
            </View>

            {forms.length === 0 ? (
              <Text className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
                No locations match.
              </Text>
            ) : (
              <View className="p-3 gap-2">
                {forms.map((form) => {
                  const highlighted = highlightedLocation === form.locationId;
                  return (
                    <Pressable
                      key={form.id}
                      onPress={() => openForm(form.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${form.locationName ?? "location"} form`}
                      className={`rounded-xl border p-3 flex-row items-center gap-3 active:opacity-70 ${
                        highlighted
                          ? "border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20"
                          : "border-gray-100 dark:border-neutral-800"
                      }`}
                    >
                      <View className="flex-1 gap-1">
                        <View className="flex-row flex-wrap items-center gap-2">
                          <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                            {form.locationName ? locationDisplayName(form.locationName) : "Location"}
                          </Text>
                          <RegistrationStatusPill status={form.status} />
                        </View>
                        <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
                          <View className="flex-row items-center gap-1.5">
                            <Feather name="calendar" size={13} color="#9CA3AF" />
                            <Text className="text-sm text-gray-600 dark:text-gray-400">
                              {formatDateLong(form.eventDate)}
                            </Text>
                          </View>
                          <View className="flex-row items-center gap-1.5">
                            <Feather name="users" size={13} color="#9CA3AF" />
                            <Text className="text-sm text-gray-600 dark:text-gray-400">
                              {form.totalEntries} {entryWord(form.totalEntries)} ·{" "}
                              {form.uniqueRegistrations} unique
                            </Text>
                          </View>
                          {form.photoFrames && (
                            <View className="min-w-0 flex-row items-center gap-1.5">
                              <Feather name="camera" size={13} color="#9CA3AF" />
                              <Text
                                className="shrink text-sm text-gray-600 dark:text-gray-400"
                                numberOfLines={1}
                              >
                                {form.photoFrames.frames.length > 0
                                  ? `Frame: ${form.photoFrames.frames[0].name}`
                                  : "No frame"}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                      <Feather name="chevron-right" size={18} color="#9CA3AF" />
                    </Pressable>
                  );
                })}
              </View>
            )}

            <View className="p-4 border-t border-gray-100 dark:border-neutral-800 flex-row justify-end">
              <ActionButton
                label="Export event CSV"
                icon="download"
                loading={exporting}
                disabled={exporting}
                onPress={() => void exportCsv()}
              />
            </View>
          </View>
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
