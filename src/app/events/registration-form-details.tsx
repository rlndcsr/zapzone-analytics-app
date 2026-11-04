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
import { RegistrationLoadFailure } from "../../components/events/RegistrationLoadFailure";
import { RegistrationQrPanel } from "../../components/events/RegistrationQrPanel";
import { RegistrationStatusPill } from "../../components/events/RegistrationStatusPill";
import {
  RegistrationSummary,
  type RegistrationTileData,
} from "../../components/events/RegistrationTile";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { SelectField } from "../../components/ui/FormControls";
import { HubShortcuts, type HubQuickLink } from "../../components/ui/ModuleHub";
import { Toast, type ToastType } from "../../components/ui/Toast";
import { toCsv } from "../../lib/attractions/attractionsCsv";
import { formatDateTimeET } from "../../lib/date/venueTime";
import { useTransientAlert } from "../../lib/hooks/useTransientAlert";
import { formatPhoneForDisplay } from "../../lib/phone";
import {
  REGISTRATIONS_PER_PAGE,
  describeFailure,
  duplicateHint,
  editionLabel,
  emptyListMessage,
  entryWord,
  filterOptions,
  formatEventDates,
  hiddenEntriesLink,
  historyButtonLabel,
  listSummary,
  locationDisplayName,
  markRegistrationFormsStale,
  registrationExportTable,
  registrationsCsvFilename,
  shortVenueName,
  totalEntriesHint,
  type StaffRequestFailure,
} from "../../lib/registrationForms/registrationForms";
import { shareCsvFile } from "../../lib/registrationForms/shareCsv";
import { getToken } from "../../lib/session";
import { formatDateLong } from "../../lib/waivers/returningCustomers";
import {
  exportRegistrations,
  fetchRegistrationForm,
  fetchRegistrations,
  setRegistrationEntryHidden,
  updateRegistrationForm,
  type RegistrationCounts,
  type RegistrationEntry,
  type RegistrationFormDetail,
  type RegistrationGroup,
  type RegistrationListFilter,
  type RegistrationPagination,
  type RegistrationPhotoFrames,
} from "../../services/registrationFormsService";

const PRIMARY = "#0644C7";

/** The backend refuses a search longer than this. */
const MAX_SEARCH = 100;

/** Horizontal page padding (`px-4`) — the More shortcuts row bleeds past it. */
const SCREEN_GUTTER = 16;

type IconName = ComponentProps<typeof Feather>["name"];

/** Which photo frame this location's event day uses (web: RegistrationEventDetails). */
const PhotoFrameLine = ({
  frames,
  past,
  onOpenOverlays,
  onAddFrame,
}: {
  frames: RegistrationPhotoFrames;
  past: boolean;
  onOpenOverlays: () => void;
  onAddFrame: () => void;
}) => {
  const first = frames.frames[0];
  const days =
    frames.firstDay === frames.eventDate
      ? formatDateLong(frames.eventDate)
      : `${formatDateLong(frames.firstDay)} – ${formatDateLong(frames.eventDate)}`;
  return (
    <View className="flex-row items-start gap-2">
      <Feather name="camera" size={14} color="#9CA3AF" style={{ marginTop: 3 }} />
      {first ? (
        <Text className="flex-1 text-sm text-gray-600 dark:text-gray-400">
          {"Photo frame: "}
          <Text className="font-medium text-gray-800 dark:text-gray-200">{first.name}</Text>
          {!first.isEnabled ? " (turned off)" : first.neverRuns ? " (never used)" : ""}
          {frames.frames.length > 1 ? ` +${frames.frames.length - 1} more` : ""}
          {` · used for photos on ${days} · `}
          <Text
            onPress={onOpenOverlays}
            accessibilityRole="link"
            className="font-medium text-[#0644C7] dark:text-blue-400"
          >
            Photo overlays
          </Text>
        </Text>
      ) : past ? (
        <Text className="flex-1 text-sm text-gray-600 dark:text-gray-400">
          No photo frame. The event day has passed.
        </Text>
      ) : (
        <Text className="flex-1 text-sm text-gray-600 dark:text-gray-400">
          {"No photo frame. "}
          <Text
            onPress={onAddFrame}
            accessibilityRole="link"
            className="font-medium text-[#0644C7] dark:text-blue-400"
          >
            Add one
          </Text>
        </Text>
      )}
    </View>
  );
};

const Chip = ({
  label,
  tone,
}: {
  label: string;
  tone: "amber" | "blue" | "gray";
}) => {
  // Soft, borderless chips — the quiet tag look of the Attractions table.
  const styles = {
    amber: ["bg-amber-50 dark:bg-amber-900/30", "text-amber-700 dark:text-amber-400"],
    blue: ["bg-blue-50 dark:bg-blue-900/30", "text-blue-700 dark:text-blue-400"],
    gray: ["bg-gray-100 dark:bg-neutral-800", "text-gray-700 dark:text-gray-300"],
  }[tone];
  return (
    <View className={`px-2 py-0.5 rounded-md ${styles[0]}`}>
      <Text className={`text-xs font-medium ${styles[1]}`}>{label}</Text>
    </View>
  );
};

/** One contact: a compact row (web d5a759e) that opens to its details and entries. */
const ContactRow = ({
  group,
  open,
  previousName,
  disabled,
  onToggle,
  onMenu,
  onToggleEntry,
  isFirst,
}: {
  group: RegistrationGroup;
  open: boolean;
  previousName: string;
  disabled: boolean;
  onToggle: () => void;
  onMenu: () => void;
  onToggleEntry: (entry: RegistrationEntry) => void;
  /** The first row sits on the card's own border, so it draws no hairline. */
  isFirst: boolean;
}) => {
  const primaryName = group.entries[0]?.name ?? group.names[0] ?? group.email;
  const otherNames = Math.max(group.names.length - 1, 0);
  return (
    // Divider width via style: a dark: class added after mount crashes css-interop.
    <View
      className="border-gray-100 dark:border-neutral-800"
      style={{ borderTopWidth: isFirst ? 0 : 1 }}
    >
      <View className="flex-row items-center gap-2 px-4 py-3">
        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          className="flex-1 gap-0.5 active:opacity-70"
        >
          <View className="flex-row flex-wrap items-center gap-2">
            <Text numberOfLines={1} className="shrink font-medium text-gray-900 dark:text-white">
              {primaryName}
              {otherNames > 0 ? ` +${otherNames}` : ""}
            </Text>
            {group.isDuplicate && (
              <Chip label={`Same contact ×${group.entryCount}`} tone="amber" />
            )}
          </View>
          <Text className="text-xs text-gray-500 dark:text-gray-400">
            {group.entryCount} {entryWord(group.entryCount)}
            {group.lastRegisteredAt
              ? ` · ${formatDateLong(group.lastRegisteredAt.slice(0, 10))}`
              : ""}
          </Text>
        </Pressable>
        <Feather name={open ? "chevron-up" : "chevron-down"} size={16} color="#9CA3AF" />
        <Pressable
          onPress={onMenu}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Actions for ${primaryName}`}
          className="p-2 rounded-lg active:opacity-70"
        >
          <Feather name="more-vertical" size={16} color="#6B7280" />
        </Pressable>
      </View>

      {open && (
        <View className="px-4 pb-4 gap-3">
          <View className="rounded-xl border border-gray-100 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800/60 px-3 py-2.5 gap-1">
            <Text selectable className="text-sm text-gray-700 dark:text-gray-300">
              {group.email}
            </Text>
            <Text selectable className="text-sm text-gray-700 dark:text-gray-300">
              {formatPhoneForDisplay(group.phone) || group.phone}
            </Text>
            {(group.isDuplicate || group.registeredBeforeOtherName) && (
              <View className="flex-row flex-wrap items-center gap-1.5 pt-1">
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
      )}
    </View>
  );
};

const MenuItem = ({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: IconName;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    className="flex-row items-center gap-3 px-1 py-3.5 active:opacity-70"
  >
    <Feather name={icon} size={17} color="#374151" />
    <Text className="text-sm font-medium text-gray-800 dark:text-gray-100">
      {label}
    </Text>
  </Pressable>
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
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [menuGroup, setMenuGroup] = useState<RegistrationGroup | null>(null);
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
        status: null,
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

  // The list needs only the form id, so it loads alongside the form rather than
  // after it (one round trip instead of two); it stops once the form has failed.
  const listEnabled = Number.isFinite(formId) && failure === null;

  useEffect(() => {
    if (!listEnabled) return;
    void loadList();
  }, [listEnabled, loadList]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim().slice(0, MAX_SEARCH));
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const hasPreviousEdition = Boolean(form?.previousEdition);

  useEffect(() => {
    if (filter === "previous_edition" && !hasPreviousEdition) setFilter("all");
  }, [filter, hasPreviousEdition]);

  const toggleExpanded = (contactId: number) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });

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

  // Back to the form's event, popping to it when it's already open underneath.
  const openParentEvent = () => {
    if (!form?.group) {
      router.dismissTo("/events/registration-forms" as never);
      return;
    }
    router.dismissTo({
      pathname: "/events/registration-event",
      params: { id: String(form.group.id) },
    } as never);
  };

  const openLinkedEvent = (eventId: number) =>
    router.push({
      pathname: "/events/edit-event",
      params: { id: String(eventId) },
    } as never);

  const toggleOpen = async () => {
    const token = getToken();
    if (!form || !token) return;
    setActing("toggle");
    try {
      const updated = await updateRegistrationForm(token, form.id, {
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
      const table = registrationExportTable(
        result.rows,
        editionLabel(form.previousEdition),
      );
      const today = new Date().toISOString().slice(0, 10);
      const shared = await shareCsvFile(
        registrationsCsvFilename(form.name, form.locationName, today),
        toCsv(table.headers, table.rows),
        "Export registrations",
      );
      if (!shared) notify("Sharing isn't available on this device.", "error");
      else if (result.capped)
        notify(
          `The export holds the first ${result.rows.length.toLocaleString()} of ${result.total.toLocaleString()} entries.`,
          "info",
        );
    } catch (err) {
      notify(
        describeFailure(err, "The export failed. Please try again.").message,
        "error",
      );
    } finally {
      setActing(null);
    }
  };

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
          Location Form
        </Text>
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
    return (
      <View className="flex-1 bg-gray-50 dark:bg-black">
        {header}
        <RegistrationLoadFailure
          failure={failure}
          fallback="This registration form could not be loaded."
          returnTo={`/events/registration-form-details?id=${formId}`}
          iconColor={headerIcon}
          onRetry={() => {
            setLoadingForm(true);
            void loadForm();
          }}
        />
      </View>
    );
  }

  const tallies = counts ?? form.counts;
  const past = form.status === "past";
  const previousName = editionLabel(form.previousEdition);
  const unfiltered = filter === "all" && !search;
  const venue = form.locationName ? locationDisplayName(form.locationName) : "This location";
  const shortVenue = shortVenueName(form.locationName) ?? venue;
  const eventName = form.group?.name ?? form.name;

  const summaryTiles: RegistrationTileData[] = [
    {
      icon: "file-text",
      label: "Total entries",
      value: tallies.totalEntries,
      hint: totalEntriesHint(tallies),
    },
    {
      icon: "user-check",
      label: "Unique registrations",
      value: tallies.uniqueRegistrations,
      hint: "Entries with the same phone and the same email count once.",
    },
    {
      icon: "users",
      label: "Same-contact groups",
      value: tallies.duplicateGroups,
      hint: duplicateHint(tallies),
    },
    {
      icon: "rotate-ccw",
      label: "Registered before",
      value: tallies.returningContacts,
      hint: "Registered for an earlier event that had already taken place.",
    },
    ...(hasPreviousEdition
      ? [
          {
            icon: "repeat",
            label: `Registered for ${previousName}`,
            value: tallies.previousEditionRegistrants,
            hint: "The same person also registered for last year's edition here.",
          } as RegistrationTileData,
        ]
      : []),
  ];

  // The form's actions as module-hub shortcuts, like the Manage Attractions
  // "More" row. A shortcut can't disable itself, so each one ignores taps while
  // another action runs, and Close / Reopen is left out once the date passed.
  const whenIdle = (run: () => void) => () => {
    if (acting === null) run();
  };
  const moreShortcuts: HubQuickLink[] = [
    ...(form.group
      ? [
          {
            label: eventName,
            icon: "arrow-left",
            onPress: whenIdle(openParentEvent),
          } as HubQuickLink,
        ]
      : []),
    { label: "Edit form", icon: "edit-2", onPress: whenIdle(openEditor) },
    ...(past
      ? []
      : [
          {
            label:
              acting === "toggle"
                ? "Updating…"
                : form.isOpen
                  ? "Close registration"
                  : "Reopen registration",
            icon: form.isOpen ? "lock" : "unlock",
            onPress: whenIdle(() => void toggleOpen()),
          } as HubQuickLink,
        ]),
    {
      label: acting === "export" ? "Exporting…" : "Export CSV",
      icon: "download",
      onPress: whenIdle(() => void exportCsv()),
    },
  ];

  const pageBusy = (atEdge: boolean) => atEdge || listLoading;

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
          {/* Breadcrumb, then this location's title, the event, and the year links. */}
          <View className="gap-1.5 mb-4">
            <View className="flex-row flex-wrap items-center gap-1.5">
              <Pressable
                onPress={() => router.dismissTo("/events/registration-forms" as never)}
                accessibilityRole="link"
              >
                <Text className="text-sm text-gray-500 dark:text-gray-400">All events</Text>
              </Pressable>
              {form.group && (
                <>
                  <Text className="text-sm text-gray-400">/</Text>
                  <Pressable onPress={openParentEvent} accessibilityRole="link">
                    <Text className="text-sm font-medium text-[#0644C7] dark:text-blue-400">
                      {eventName}
                    </Text>
                  </Pressable>
                </>
              )}
              <Text className="text-sm text-gray-400">/</Text>
              <Text className="text-sm text-gray-700 dark:text-gray-300">{shortVenue}</Text>
            </View>
            <View className="flex-row items-start justify-between gap-3">
              <Text className="flex-1 text-xl font-semibold text-gray-900 dark:text-white">
                {venue}
              </Text>
              <View className="mt-1">
                <RegistrationStatusPill status={form.status} />
              </View>
            </View>
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              {eventName}  ·  {formatDateLong(form.eventDate)}
            </Text>
            {form.event && (
              <View className="flex-row flex-wrap items-center gap-x-1">
                <Text className="text-xs text-gray-500 dark:text-gray-400">
                  For the event
                </Text>
                <Pressable
                  onPress={() => openLinkedEvent(form.event!.id)}
                  accessibilityRole="link"
                >
                  <Text className="text-xs font-medium text-[#0644C7] dark:text-blue-400">
                    {form.event.name}
                  </Text>
                </Pressable>
                <Text className="text-xs text-gray-500 dark:text-gray-400">
                  · {formatEventDates(form.event)}
                </Text>
              </View>
            )}
            {form.previousEdition && (
              <Pressable
                onPress={() => openEdition(form.previousEdition!.id)}
                accessibilityRole="link"
              >
                <Text className="text-sm text-[#0644C7] dark:text-blue-400">
                  {`Last year's form: ${previousName}`}
                </Text>
              </Pressable>
            )}
            {form.nextEdition && (
              <Pressable
                onPress={() => openEdition(form.nextEdition!.id)}
                accessibilityRole="link"
              >
                <Text className="text-sm text-[#0644C7] dark:text-blue-400">
                  {`Next year's form: ${form.nextEdition.name}`}
                </Text>
              </Pressable>
            )}
            {past && (
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                Registration closed automatically after the event date.
                Everything stays here.
              </Text>
            )}
          </View>

          {/* Scope — which location these numbers cover. */}
          <View className="flex-row items-center gap-2 mb-4 px-3.5 py-2.5 rounded-xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800">
            <Feather name="map-pin" size={14} color="#6B7280" />
            <Text className="flex-1 text-xs text-gray-600 dark:text-gray-300">
              <Text className="font-semibold">This event</Text> · {shortVenue} only
            </Text>
          </View>

          {/* Summary — this location form's tallies, never one page's or the event's. */}
          <RegistrationSummary tiles={summaryTiles} />
          <Text className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            {`Registration totals for ${shortVenue}'s ${eventName} form only. They don't show who attended.`}
          </Text>
          {tallies.hiddenEntries > 0 && filter !== "hidden" && (
            <Pressable
              onPress={() => {
                setFilter("hidden");
                setPage(1);
              }}
              accessibilityRole="button"
              className="self-start mt-1 py-1"
            >
              <Text className="text-xs font-semibold text-[#0644C7] dark:text-blue-300">
                {hiddenEntriesLink(tallies.hiddenEntries)}
              </Text>
            </Pressable>
          )}

          {/* More — the form's actions as module-hub shortcuts. */}
          <View className="mt-5">
            <HubShortcuts
              title="More"
              links={moreShortcuts}
              gutter={SCREEN_GUTTER}
            />
          </View>

          {/* Photos — the frame and email this location's registrants get,
              as one bordered detail panel divided by a hairline. */}
          {form.photoFrames && (
            <View className="mt-4 bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
              <View className="p-4">
                <PhotoFrameLine
                  frames={form.photoFrames}
                  past={past}
                  onOpenOverlays={() => router.push("/photos/overlays" as never)}
                  onAddFrame={() =>
                    router.push({
                      pathname: "/photos/overlays",
                      params: { event: String(form.id), location: String(form.locationId) },
                    } as never)
                  }
                />
              </View>
              {/* Which email registrants' photos go out with (web: RegistrationEventDetails). */}
              <View className="p-4 flex-row items-start gap-2 border-t border-gray-100 dark:border-neutral-800">
                <Feather name="mail" size={14} color="#9CA3AF" style={{ marginTop: 3 }} />
                {form.photoEmail ? (
                  <Text className="flex-1 text-sm text-gray-600 dark:text-gray-400">
                    {"Photos sent to people who registered use the "}
                    <Text className="font-medium text-gray-800 dark:text-gray-200">
                      {form.photoEmail.name}
                    </Text>
                    {" email. "}
                    {form.photoEmail.canManage
                      ? ""
                      : form.photoEmail.allLocations
                        ? "It is shared with every location, so only a company admin can change it. "
                        : "It is shared with other locations, so only a company admin can change it. Ask one if you need your own. "}
                    <Text
                      onPress={() =>
                        router.push({
                          pathname: "/email-campaign/create-template",
                          params: { id: String(form.photoEmail!.id) },
                        })
                      }
                      accessibilityRole="link"
                      className="font-medium text-[#0644C7] dark:text-blue-400"
                    >
                      {form.photoEmail.canManage ? "Edit its wording" : "View it"}
                    </Text>
                    {!form.photoEmail.canManage && form.photoEmail.allLocations
                      ? " to duplicate it for your location."
                      : ""}
                  </Text>
                ) : (
                  <Text className="flex-1 text-sm text-gray-600 dark:text-gray-400">
                    {"No event photo email covers this location, so people who registered get the usual photo email. "}
                    <Text
                      onPress={() =>
                        router.push({
                          pathname: "/email-campaign/create-template",
                          params: { category: "event_photos", location: String(form.locationId) },
                        })
                      }
                      accessibilityRole="link"
                      className="font-medium text-[#0644C7] dark:text-blue-400"
                    >
                      Create one
                    </Text>
                  </Text>
                )}
              </View>
            </View>
          )}

          <View className="mt-4">
            <RegistrationQrPanel form={form} onNotify={notify} />
          </View>

          {/* Registrations — list header, search, then the filter. */}
          <View className="mt-5 mb-3">
            <Text className="text-base font-semibold text-gray-900 dark:text-white">
              Registrations
            </Text>
            {pagination && (
              <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {listSummary(pagination, tallies.totalEntries, unfiltered)}
              </Text>
            )}
          </View>

          <View className="flex-row items-center gap-2 h-11 px-3.5 mb-2 rounded-xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800">
            <Feather name="search" size={16} color="#9CA3AF" />
            <TextInput
              value={searchInput}
              onChangeText={setSearchInput}
              maxLength={MAX_SEARCH}
              placeholder="Search name, email or phone"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              className="flex-1 text-sm text-gray-900 dark:text-white"
              accessibilityLabel="Search registrations"
            />
            {searchInput.length > 0 && (
              <Pressable
                onPress={() => setSearchInput("")}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <Feather name="x-circle" size={16} color="#9CA3AF" />
              </Pressable>
            )}
          </View>

          <View className="mb-3">
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
          </View>

          {/* List / states. Distinct keys per state so css-interop never
              upgrades one container into another in place. */}
          {listError ? (
            <View
              key="registrations-error"
              className="flex-row gap-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40 rounded-2xl p-4"
            >
              <Feather name="alert-circle" size={18} color="#DC2626" />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-red-700 dark:text-red-400">
                  Could not load registrations
                </Text>
                <Text className="text-sm text-red-600/90 dark:text-red-400/80 mt-0.5">
                  {listError}
                </Text>
                <Pressable
                  onPress={() => void loadList()}
                  className="self-start mt-2.5 px-3 py-1.5 rounded-lg bg-white dark:bg-neutral-900 border border-red-200 dark:border-red-900/50 active:opacity-70"
                  accessibilityRole="button"
                >
                  <Text className="text-xs font-semibold text-red-700 dark:text-red-400">
                    Try again
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : listLoading && groups.length === 0 ? (
            <View
              key="registrations-loading"
              className="py-12 items-center bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800"
            >
              <ActivityIndicator color={PRIMARY} />
            </View>
          ) : groups.length === 0 ? (
            <View
              key="registrations-empty"
              className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 px-6 py-10 items-center"
            >
              <View className="w-12 h-12 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center mb-3">
                <Feather name={unfiltered ? "users" : "search"} size={20} color="#9CA3AF" />
              </View>
              <Text className="text-sm font-semibold text-gray-900 dark:text-white text-center">
                {emptyListMessage(filter, search)}
              </Text>
              {unfiltered && (
                <Text className="text-sm text-gray-500 dark:text-gray-400 text-center mt-1 max-w-xs">
                  Share the QR code or link above. Registrations show up here
                  as soon as guests submit the form.
                </Text>
              )}
            </View>
          ) : (
            <View
              key="registrations-list"
              className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden"
              style={{ opacity: listLoading ? 0.6 : 1 }}
            >
              {groups.map((group, index) => (
                <ContactRow
                  key={group.contactId}
                  group={group}
                  isFirst={index === 0}
                  open={expanded.has(group.contactId)}
                  previousName={previousName}
                  disabled={acting !== null}
                  onToggle={() => toggleExpanded(group.contactId)}
                  onMenu={() => setMenuGroup(group)}
                  onToggleEntry={toggleEntry}
                />
              ))}
            </View>
          )}

          {pagination && pagination.lastPage > 1 && (
            <View className="flex-row items-center justify-between gap-2 mt-3">
              <Pressable
                onPress={() => setPage((current) => Math.max(1, current - 1))}
                disabled={pageBusy(pagination.currentPage <= 1)}
                className={`flex-row items-center gap-1 h-9 px-3 rounded-xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 ${
                  pageBusy(pagination.currentPage <= 1) ? "opacity-50" : ""
                }`}
                accessibilityRole="button"
              >
                <Feather name="chevron-left" size={14} color={headerIcon} />
                <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  Previous
                </Text>
              </Pressable>
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                Page {pagination.currentPage} of {pagination.lastPage}
              </Text>
              <Pressable
                onPress={() =>
                  setPage((current) =>
                    Math.min(pagination.lastPage, current + 1),
                  )
                }
                disabled={pageBusy(pagination.currentPage >= pagination.lastPage)}
                className={`flex-row items-center gap-1 h-9 px-3 rounded-xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 ${
                  pageBusy(pagination.currentPage >= pagination.lastPage)
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
      </ScrollView>

      {/* The web row menu: details, and history except in the Hidden list. */}
      <BottomSheet
        visible={menuGroup !== null}
        onClose={() => setMenuGroup(null)}
        title={
          menuGroup
            ? (menuGroup.entries[0]?.name ?? menuGroup.names[0] ?? menuGroup.email)
            : ""
        }
      >
        {menuGroup && (
          <View>
            <MenuItem
              label={expanded.has(menuGroup.contactId) ? "Hide details" : "Show details"}
              icon={expanded.has(menuGroup.contactId) ? "chevron-up" : "chevron-down"}
              onPress={() => {
                toggleExpanded(menuGroup.contactId);
                setMenuGroup(null);
              }}
            />
            {filter !== "hidden" && (
              <MenuItem
                label={historyButtonLabel(menuGroup.otherEventCount)}
                icon="clock"
                onPress={() => {
                  const contactId = menuGroup.contactId;
                  setMenuGroup(null);
                  // After the menu closes, so two native Modals are never mounted at once.
                  setTimeout(() => setHistoryContactId(contactId), 280);
                }}
              />
            )}
          </View>
        )}
      </BottomSheet>

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
