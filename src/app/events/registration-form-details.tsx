import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useColorScheme } from "nativewind";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RegistrationHistorySheet } from "../../components/events/RegistrationHistorySheet";
import { RegistrationQrPanel } from "../../components/events/RegistrationQrPanel";
import { RegistrationStatusPill } from "../../components/events/RegistrationStatusPill";
import { SelectField } from "../../components/ui/FormControls";
import { Toast, type ToastType } from "../../components/ui/Toast";
import { toCsv } from "../../lib/attractions/attractionsCsv";
import { formatDateTimeET } from "../../lib/date/venueTime";
import { useTransientAlert } from "../../lib/hooks/useTransientAlert";
import {
  canSwitchLocation,
  workLocationsOf,
} from "../../lib/location/staffLocation";
import { formatPhoneForDisplay } from "../../lib/phone";
import {
  DELETE_WARNING,
  REGISTRATIONS_PER_PAGE,
  describeFailure,
  duplicateHint,
  emptyListMessage,
  entryWord,
  filterOptions,
  historyButtonLabel,
  listSummary,
  locationDisplayName,
  markRegistrationFormsStale,
  registrationExportTable,
  registrationsCsvFilename,
  type StaffRequestFailure,
} from "../../lib/registrationForms/registrationForms";
import { getCurrentUser, getToken } from "../../lib/session";
import { formatDateLong } from "../../lib/waivers/returningCustomers";
import {
  deleteRegistrationForm,
  exportRegistrations,
  fetchRegistrationForm,
  fetchRegistrations,
  saveRegistrationForm,
  setRegistrationEntryHidden,
  type RegistrationCounts,
  type RegistrationEntry,
  type RegistrationFormDetail,
  type RegistrationGroup,
  type RegistrationListFilter,
  type RegistrationPagination,
} from "../../services/registrationFormsService";
import { switchStaffLocation } from "../../services/staffLocationService";

const PRIMARY = "#0644C7";

type IconName = ComponentProps<typeof Feather>["name"];

const Tile = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) => (
  <View className="w-1/2 p-1.5">
    <View className="flex-1 bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-3">
      <Text className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </Text>
      <Text className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
        {value}
      </Text>
      <Text className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        {hint}
      </Text>
    </View>
  </View>
);

const Chip = ({
  label,
  tone,
}: {
  label: string;
  tone: "amber" | "blue" | "gray";
}) => {
  const styles = {
    amber: [
      "bg-amber-100 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800",
      "text-amber-800 dark:text-amber-300",
    ],
    blue: [
      "bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800",
      "text-blue-800 dark:text-blue-300",
    ],
    gray: [
      "bg-gray-100 dark:bg-neutral-800 border-gray-200 dark:border-neutral-700",
      "text-gray-700 dark:text-gray-300",
    ],
  }[tone];
  return (
    <View className={`px-2 py-0.5 rounded-full border ${styles[0]}`}>
      <Text className={`text-xs font-medium ${styles[1]}`}>{label}</Text>
    </View>
  );
};

const ActionButton = ({
  label,
  icon,
  danger,
  loading,
  disabled,
  onPress,
}: {
  label: string;
  icon: IconName;
  danger?: boolean;
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
      danger
        ? "border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/30"
        : "border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
    } ${disabled ? "opacity-50" : ""}`}
  >
    {loading ? (
      <ActivityIndicator size="small" color={danger ? "#EF4444" : PRIMARY} />
    ) : (
      <Feather name={icon} size={14} color={danger ? "#EF4444" : PRIMARY} />
    )}
    <Text
      className={`text-xs font-semibold ${
        danger ? "text-red-600" : "text-gray-700 dark:text-gray-200"
      }`}
    >
      {label}
    </Text>
  </Pressable>
);

const GroupCard = ({
  group,
  previousName,
  showHistory,
  disabled,
  onHistory,
  onToggleEntry,
}: {
  group: RegistrationGroup;
  previousName: string;
  showHistory: boolean;
  disabled: boolean;
  onHistory: () => void;
  onToggleEntry: (entry: RegistrationEntry) => void;
}) => (
  <View className="px-4 py-4 gap-3 border-t border-gray-100 dark:border-neutral-800">
    <View className="gap-1">
      <Text className="font-medium text-gray-900 dark:text-white">
        {group.email}
      </Text>
      <Text className="text-sm text-gray-600 dark:text-gray-400">
        {formatPhoneForDisplay(group.phone) || group.phone} · {group.entryCount}{" "}
        {entryWord(group.entryCount)}
      </Text>
      {(group.isDuplicate || group.registeredBeforeOtherName) && (
        <View className="flex-row flex-wrap items-center gap-1.5">
          {group.isDuplicate && (
            <Chip label={`Same contact ×${group.entryCount}`} tone="amber" />
          )}
          {group.registeredBeforeOtherName && (
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              These contact details registered before under another name
            </Text>
          )}
        </View>
      )}
      {showHistory && (
        <Pressable
          onPress={onHistory}
          accessibilityRole="button"
          className="flex-row items-center gap-1.5 self-start py-1 active:opacity-70"
        >
          <Feather name="clock" size={13} color={PRIMARY} />
          <Text className="text-xs font-semibold text-[#0644C7]">
            {historyButtonLabel(group.otherEventCount)}
          </Text>
        </Pressable>
      )}
    </View>

    <View className="rounded-xl border border-gray-100 dark:border-neutral-800">
      {group.entries.map((entry, index) => (
        <View
          key={entry.id}
          // Divider width via style: a dark: class added after mount crashes css-interop.
          className="px-3 py-2.5 flex-row items-start gap-2 border-gray-100 dark:border-neutral-800"
          style={{ borderTopWidth: index > 0 ? 1 : 0 }}
        >
          <View className="flex-1 gap-1">
            <Text className="text-sm font-medium text-gray-900 dark:text-white">
              {entry.name}
            </Text>
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              Registered {formatDateTimeET(entry.registeredAt)}
            </Text>
            {(entry.returning || entry.registeredPreviousEdition) && (
              <View className="flex-row flex-wrap gap-1.5">
                {entry.returning && (
                  <Chip label="Registered before" tone="blue" />
                )}
                {entry.registeredPreviousEdition && (
                  <Chip label={`Registered for ${previousName}`} tone="gray" />
                )}
              </View>
            )}
          </View>
          <Pressable
            onPress={() => onToggleEntry(entry)}
            disabled={disabled}
            accessibilityRole="button"
            className={`flex-row items-center gap-1 px-2 py-1 rounded-md active:opacity-70 ${
              disabled ? "opacity-50" : ""
            }`}
          >
            <Feather
              name={entry.hiddenAt === null ? "eye-off" : "rotate-ccw"}
              size={13}
              color="#6B7280"
            />
            <Text className="text-xs font-medium text-gray-600 dark:text-gray-300">
              {entry.hiddenAt === null ? "Hide" : "Restore"}
            </Text>
          </Pressable>
        </View>
      ))}
    </View>
  </View>
);

const RegistrationFormDetails = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  const params = useLocalSearchParams<{ id?: string }>();
  const formId = Number(params.id);

  const [form, setForm] = useState<RegistrationFormDetail | null>(null);
  const [loadingForm, setLoadingForm] = useState(true);
  const [failure, setFailure] = useState<StaffRequestFailure | null>(null);
  const [counts, setCounts] = useState<RegistrationCounts | null>(null);
  const [groups, setGroups] = useState<RegistrationGroup[]>([]);
  const [pagination, setPagination] = useState<RegistrationPagination | null>(
    null,
  );
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RegistrationListFilter>("all");
  const [page, setPage] = useState(1);
  const [reloadTick, setReloadTick] = useState(0);
  const [acting, setActing] = useState<string | null>(null);
  const [historyContactId, setHistoryContactId] = useState<number | null>(null);
  const [switching, setSwitching] = useState(false);
  const [toast, showToast] = useTransientAlert<{
    message: string;
    type: ToastType;
  }>();
  const listSequence = useRef(0);
  const focusedOnce = useRef(false);

  const notify = useCallback(
    (message: string, type: ToastType) => showToast({ message, type }),
    [showToast],
  );

  const loadForm = useCallback(async () => {
    const token = getToken();
    if (!token || !Number.isFinite(formId)) {
      setFailure({
        message: "This registration form could not be loaded.",
        unavailable: false,
        switchLocationId: null,
      });
      setLoadingForm(false);
      return;
    }
    try {
      const result = await fetchRegistrationForm(token, formId);
      setForm(result);
      setCounts(result.counts);
      setFailure(null);
    } catch (err) {
      setFailure(
        describeFailure(err, "This registration form could not be loaded."),
      );
    } finally {
      setLoadingForm(false);
    }
  }, [formId]);

  // Fresh on first open, and again whenever the editor hands focus back.
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) {
        void loadForm();
        setReloadTick((tick) => tick + 1);
      }
      focusedOnce.current = true;
    }, [loadForm]),
  );

  useEffect(() => {
    void loadForm();
  }, [loadForm]);

  const formLoaded = form !== null;

  const loadList = useCallback(async () => {
    const current = ++listSequence.current;
    const token = getToken();
    if (!token) return;
    setListLoading(true);
    setListError(null);
    try {
      const result = await fetchRegistrations(token, formId, {
        search: search || undefined,
        filter,
        page,
        perPage: REGISTRATIONS_PER_PAGE,
      });
      if (current !== listSequence.current) return;
      setGroups(result.groups);
      setPagination(result.pagination);
      setCounts(result.counts);
      if (result.pagination.currentPage !== page)
        setPage(result.pagination.currentPage);
    } catch (err) {
      if (current !== listSequence.current) return;
      setListError(
        describeFailure(err, "Registrations could not be loaded.").message,
      );
    } finally {
      if (current === listSequence.current) setListLoading(false);
    }
    // reloadTick re-runs the same query after a hide/restore.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formId, search, filter, page, reloadTick]);

  useEffect(() => {
    if (!formLoaded) return;
    void loadList();
  }, [formLoaded, loadList]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const hasPreviousEdition = Boolean(form?.previousEdition);

  useEffect(() => {
    if (filter === "previous_edition" && !hasPreviousEdition) setFilter("all");
  }, [filter, hasPreviousEdition]);

  const openEditor = () =>
    router.push({
      pathname: "/events/registration-form-editor",
      params: { id: String(formId) },
    } as never);

  const openEdition = (id: number) =>
    router.push({
      pathname: "/events/registration-form-details",
      params: { id: String(id) },
    } as never);

  const toggleOpen = async () => {
    const token = getToken();
    if (!form || !token) return;
    setActing("toggle");
    try {
      const updated = await saveRegistrationForm(token, form.id, {
        isOpen: !form.isOpen,
      });
      setForm(updated);
      setCounts(updated.counts);
      markRegistrationFormsStale();
      notify(
        updated.isOpen ? "Registration reopened" : "Registration closed",
        "success",
      );
    } catch (err) {
      notify(
        describeFailure(err, "The form could not be updated.").message,
        "error",
      );
    } finally {
      setActing(null);
    }
  };

  const remove = () => {
    if (!form) return;
    Alert.alert("Delete registration form", DELETE_WARNING(form.name), [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const token = getToken();
          if (!token) return;
          setActing("delete");
          try {
            await deleteRegistrationForm(token, form.id);
            markRegistrationFormsStale();
            router.back();
          } catch (err) {
            notify(
              describeFailure(err, "The form could not be deleted.").message,
              "error",
            );
            setActing(null);
          }
        },
      },
    ]);
  };

  const applyEntryToggle = async (entry: RegistrationEntry) => {
    const token = getToken();
    if (!form || !token) return;
    const hiding = entry.hiddenAt === null;
    setActing(`entry-${entry.id}`);
    try {
      const fresh = await setRegistrationEntryHidden(
        token,
        form.id,
        entry.id,
        hiding,
      );
      setCounts(fresh);
      markRegistrationFormsStale();
      notify(hiding ? "Entry hidden" : "Entry restored", "success");
      setReloadTick((tick) => tick + 1);
    } catch (err) {
      notify(
        describeFailure(err, "The entry could not be updated.").message,
        "error",
      );
    } finally {
      setActing(null);
    }
  };

  const toggleEntry = (entry: RegistrationEntry) => {
    if (entry.hiddenAt !== null) {
      void applyEntryToggle(entry);
      return;
    }
    Alert.alert(
      "Hide this entry?",
      "It stops counting everywhere but stays in the Hidden list, where you can restore it.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Hide", onPress: () => void applyEntryToggle(entry) },
      ],
    );
  };

  const exportCsv = async () => {
    const token = getToken();
    if (!form || !token) return;
    setActing("export");
    try {
      const result = await exportRegistrations(token, form.id);
      const table = registrationExportTable(result.rows);
      const csv = toCsv(table.headers, table.rows);
      // Loaded lazily so these native modules never run at app startup.
      const FileSystem = await import("expo-file-system/legacy");
      const Sharing = await import("expo-sharing");
      const today = new Date().toISOString().slice(0, 10);
      const uri = `${FileSystem.cacheDirectory}${registrationsCsvFilename(form.name, today)}`;
      await FileSystem.writeAsStringAsync(uri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "text/csv",
          dialogTitle: "Export registrations",
          UTI: "public.comma-separated-values-text",
        });
      } else {
        notify("Sharing isn't available on this device.", "error");
        return;
      }
      if (result.capped) {
        notify(
          `The export holds the first ${result.rows.length.toLocaleString()} of ${result.total.toLocaleString()} entries.`,
          "info",
        );
      }
    } catch (err) {
      notify(
        describeFailure(err, "The export failed. Please try again.").message,
        "error",
      );
    } finally {
      setActing(null);
    }
  };

  // A manager opening another of their locations' forms: switch there, as the web does.
  const switchToLocation = async (locationId: number) => {
    const user = getCurrentUser();
    const name =
      workLocationsOf(user).find((l) => l.id === locationId)?.name ??
      "the new location";
    setSwitching(true);
    try {
      await switchStaffLocation(locationId);
      if (router.canDismiss()) router.dismissAll();
      router.replace({
        pathname: "/switch-account",
        params: { locationName: name },
      } as never);
    } catch (err) {
      setSwitching(false);
      Alert.alert(
        "Couldn't switch locations",
        describeFailure(err, "Please try again.").message,
      );
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
          Registration Form
        </Text>
        <View style={{ width: 36 }} />
      </View>
    </View>
  );

  if (loadingForm) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-black">
        {header}
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={PRIMARY} />
        </View>
      </View>
    );
  }

  if (failure || !form) {
    const switchId = failure?.switchLocationId ?? null;
    return (
      <View className="flex-1 bg-gray-50 dark:bg-black">
        {header}
        <View className="flex-1 items-center justify-center px-6 gap-4">
          <Feather name="alert-circle" size={44} color="#EF4444" />
          <Text className="text-lg font-bold text-gray-900 dark:text-white text-center">
            {failure?.message ?? "This registration form could not be loaded."}
          </Text>
          {switchId != null && canSwitchLocation(getCurrentUser()) && (
            <Pressable
              onPress={() => void switchToLocation(switchId)}
              disabled={switching}
              className="flex-row items-center gap-2 px-5 py-3 rounded-xl bg-[#0644C7] active:opacity-90"
              accessibilityRole="button"
            >
              {switching && <ActivityIndicator size="small" color="#FFFFFF" />}
              <Text className="text-sm font-semibold text-white">
                Switch to that location
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => router.back()}
            className="flex-row items-center gap-2 px-5 py-3 rounded-xl border border-gray-200 dark:border-neutral-700 active:opacity-70"
            accessibilityRole="button"
          >
            <Feather name="arrow-left" size={15} color={headerIcon} />
            <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Back to registration forms
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const tallies = counts ?? form.counts;
  const past = form.status === "past";
  const previousName = form.previousEdition?.name ?? "";

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
          {/* Title, date, venue and the edition links. */}
          <View className="gap-2">
            <View className="flex-row flex-wrap items-center gap-2">
              <Text className="text-2xl font-bold text-gray-900 dark:text-white">
                {form.name}
              </Text>
              <RegistrationStatusPill status={form.status} />
            </View>
            <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
              <View className="flex-row items-center gap-1.5">
                <Feather name="calendar" size={14} color="#9CA3AF" />
                <Text className="text-sm text-gray-600 dark:text-gray-400">
                  {formatDateLong(form.eventDate)}
                </Text>
              </View>
              {!!form.locationName && (
                <View className="flex-row items-center gap-1.5">
                  <Feather name="map-pin" size={14} color="#9CA3AF" />
                  <Text className="text-sm text-gray-600 dark:text-gray-400">
                    {locationDisplayName(form.locationName)}
                  </Text>
                </View>
              )}
            </View>
            {form.previousEdition && (
              <Pressable
                onPress={() => openEdition(form.previousEdition!.id)}
                accessibilityRole="link"
              >
                <Text className="text-sm text-[#0644C7] dark:text-blue-400">
                  {`Last year's edition: ${form.previousEdition.name}`}
                </Text>
              </Pressable>
            )}
            {form.nextEdition && (
              <Pressable
                onPress={() => openEdition(form.nextEdition!.id)}
                accessibilityRole="link"
              >
                <Text className="text-sm text-[#0644C7] dark:text-blue-400">
                  Next edition: {form.nextEdition.name}
                </Text>
              </Pressable>
            )}

            <View className="flex-row flex-wrap gap-2 mt-1">
              <ActionButton
                label="Edit"
                icon="edit-2"
                disabled={acting !== null}
                onPress={openEditor}
              />
              <ActionButton
                label={
                  form.isOpen ? "Close registration" : "Reopen registration"
                }
                icon={form.isOpen ? "lock" : "unlock"}
                loading={acting === "toggle"}
                disabled={past || acting !== null}
                onPress={() => void toggleOpen()}
              />
              <ActionButton
                label="Delete"
                icon="trash-2"
                danger
                loading={acting === "delete"}
                disabled={acting !== null}
                onPress={remove}
              />
            </View>
            {past && (
              <Text className="text-sm text-gray-600 dark:text-gray-400">
                Registration closed automatically after the event date.
                Everything stays here.
              </Text>
            )}
          </View>

          <RegistrationQrPanel form={form} onNotify={notify} />

          {/* Count tiles — the whole form's tallies, never one page's. */}
          <View>
            <View className="flex-row flex-wrap -m-1.5">
              <Tile
                label="Total entries"
                value={tallies.totalEntries}
                hint="Every form submitted, including repeats."
              />
              <Tile
                label="Unique registrations"
                value={tallies.uniqueRegistrations}
                hint="Entries with the same phone and the same email count once — e.g. a parent who registers 3 children with their own details: 3 entries, 1 unique."
              />
              <Tile
                label="Same-contact groups"
                value={tallies.duplicateGroups}
                hint={duplicateHint(tallies)}
              />
              <Tile
                label="Registered before"
                value={tallies.returningContacts}
                hint="Registered for an earlier event that had already taken place."
              />
              {hasPreviousEdition && (
                <Tile
                  label={`Registered for ${previousName}`}
                  value={tallies.previousEditionRegistrants}
                  hint={
                    "The same person also registered for last year's edition."
                  }
                />
              )}
            </View>
            <Text className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              {
                "These numbers count registrations only. They don't show who attended."
              }
            </Text>
          </View>

          {/* Registrations */}
          <View className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-100 dark:border-neutral-800">
            <View className="p-4 gap-3">
              <View className="flex-row items-center justify-between gap-2">
                <View className="flex-row items-center gap-2">
                  <Feather name="users" size={17} color="#6B7280" />
                  <Text className="text-base font-semibold text-gray-900 dark:text-white">
                    Registrations
                  </Text>
                </View>
                <ActionButton
                  label="Export CSV"
                  icon="download"
                  loading={acting === "export"}
                  disabled={acting !== null}
                  onPress={() => void exportCsv()}
                />
              </View>

              <View className="flex-row items-center gap-2 rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3.5 py-3">
                <Feather name="search" size={15} color="#9CA3AF" />
                <TextInput
                  value={searchInput}
                  onChangeText={setSearchInput}
                  placeholder="Search name, email or phone"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="flex-1 text-sm text-gray-900 dark:text-white"
                  accessibilityLabel="Search registrations"
                />
                {searchInput.length > 0 && (
                  <Pressable onPress={() => setSearchInput("")} hitSlop={8}>
                    <Feather name="x" size={15} color="#9CA3AF" />
                  </Pressable>
                )}
              </View>

              <SelectField
                value={filter}
                options={filterOptions(
                  hasPreviousEdition ? previousName : null,
                  tallies.hiddenEntries,
                )}
                onSelect={(value) => {
                  setFilter(value as RegistrationListFilter);
                  setPage(1);
                }}
              />

              {pagination && (
                <Text className="text-xs text-gray-500 dark:text-gray-400">
                  {listSummary(pagination, tallies.totalEntries)}
                </Text>
              )}
            </View>

            {listError ? (
              <View className="p-6 items-center gap-3 border-t border-gray-100 dark:border-neutral-800">
                <Text className="text-sm text-red-600 text-center">
                  {listError}
                </Text>
                <Pressable
                  onPress={() => void loadList()}
                  className="px-4 py-2 rounded-lg border border-gray-200 dark:border-neutral-700 active:opacity-70"
                  accessibilityRole="button"
                >
                  <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Try again
                  </Text>
                </Pressable>
              </View>
            ) : listLoading && groups.length === 0 ? (
              <View className="py-12 items-center border-t border-gray-100 dark:border-neutral-800">
                <ActivityIndicator color={PRIMARY} />
              </View>
            ) : groups.length === 0 ? (
              <View className="p-10 items-center border-t border-gray-100 dark:border-neutral-800">
                <Text className="text-sm text-gray-500 dark:text-gray-400 text-center">
                  {emptyListMessage(filter, search)}
                </Text>
              </View>
            ) : (
              <View style={{ opacity: listLoading ? 0.6 : 1 }}>
                {groups.map((group) => (
                  <GroupCard
                    key={group.contactId}
                    group={group}
                    previousName={previousName}
                    showHistory={filter !== "hidden"}
                    disabled={acting !== null}
                    onHistory={() => setHistoryContactId(group.contactId)}
                    onToggleEntry={toggleEntry}
                  />
                ))}
              </View>
            )}

            {pagination && pagination.lastPage > 1 && (
              <View className="flex-row items-center justify-between gap-2 p-4 border-t border-gray-100 dark:border-neutral-800">
                <Pressable
                  onPress={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={pagination.currentPage <= 1 || listLoading}
                  className={`flex-row items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-neutral-700 ${
                    pagination.currentPage <= 1 || listLoading
                      ? "opacity-50"
                      : ""
                  }`}
                  accessibilityRole="button"
                >
                  <Feather name="chevron-left" size={14} color={headerIcon} />
                  <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
                    Previous
                  </Text>
                </Pressable>
                <Text className="text-sm text-gray-600 dark:text-gray-400">
                  Page {pagination.currentPage} of {pagination.lastPage}
                </Text>
                <Pressable
                  onPress={() =>
                    setPage((current) =>
                      Math.min(pagination.lastPage, current + 1),
                    )
                  }
                  disabled={
                    pagination.currentPage >= pagination.lastPage || listLoading
                  }
                  className={`flex-row items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-neutral-700 ${
                    pagination.currentPage >= pagination.lastPage || listLoading
                      ? "opacity-50"
                      : ""
                  }`}
                  accessibilityRole="button"
                >
                  <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
                    Next
                  </Text>
                  <Feather name="chevron-right" size={14} color={headerIcon} />
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      <RegistrationHistorySheet
        formId={form.id}
        contactId={historyContactId}
        onClose={() => setHistoryContactId(null)}
      />

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

export default RegistrationFormDetails;
