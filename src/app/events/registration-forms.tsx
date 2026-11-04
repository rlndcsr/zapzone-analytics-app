import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RegistrationStatusPill } from "../../components/events/RegistrationStatusPill";
import { RegistrationSummary } from "../../components/events/RegistrationTile";
import { SelectField } from "../../components/ui/FormControls";
import { LocationWorkspaceSelector } from "../../components/ui/LocationWorkspaceSelector";
import { Toast, type ToastType } from "../../components/ui/Toast";
import { AttractionsListSkeleton } from "../../components/ui/skeleton/AttractionsSkeleton";
import { venueDateKey } from "../../lib/date/venueTime";
import { useTransientAlert } from "../../lib/hooks/useTransientAlert";
import { useActiveLocation } from "../../lib/location/activeLocationStore";
import {
  EVENT_NOT_FOUND,
  consumeRegistrationFormsStale,
  describeFailure,
  entryWord,
  fromEventOutcome,
  locationDisplayName,
  takeRegistrationFormsNotice,
  venueSummary,
  yearChoices,
} from "../../lib/registrationForms/registrationForms";
import { getCurrentUser, getToken } from "../../lib/session";
import { formatDateLong } from "../../lib/waivers/returningCustomers";
import {
  fetchEventOptions,
  fetchRegistrationEventGroups,
  type RegistrationEventGroupList,
  type RegistrationEventGroupSummary,
} from "../../services/registrationFormsService";

const PRIMARY = "#0644C7";

const openEvent = (id: number) =>
  router.push({
    pathname: "/events/registration-event",
    params: { id: String(id) },
  } as never);

const openNewEvent = () =>
  router.push("/events/registration-event-editor" as never);

/** One labelled cell in the card's Event date / Entries strip. */
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

/** Card for one registration event, matching the Manage Attractions card:
 *  name + status, the venues, a date / entries strip and a Details hint. */
const EventCard = ({ group }: { group: RegistrationEventGroupSummary }) => (
  <Pressable
    onPress={() => openEvent(group.id)}
    accessibilityRole="button"
    accessibilityLabel={`View ${group.name}`}
    className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 p-4 mb-3 active:bg-gray-50 dark:active:bg-neutral-800"
  >
    {/* Name + status */}
    <View className="flex-row items-start justify-between gap-3">
      <Text
        numberOfLines={1}
        className="flex-1 text-base font-semibold text-gray-900 dark:text-white"
      >
        {group.name}
      </Text>
      <RegistrationStatusPill status={group.status} />
    </View>

    {/* Participating venues */}
    <View className="flex-row items-center gap-1.5 mt-1">
      <Feather name="map-pin" size={12} color="#9CA3AF" />
      <Text
        numberOfLines={1}
        className="shrink text-xs text-gray-500 dark:text-gray-400"
      >
        {venueSummary(group.locationNames, group.locationForms)}
      </Text>
    </View>

    {/* Event date / Entries */}
    <View className="flex-row mt-3 rounded-xl bg-gray-50 dark:bg-neutral-800/60 border border-gray-100 dark:border-neutral-800">
      <Spec label="Event date" value={formatDateLong(group.eventDate)} />
      <Spec
        divider
        label="Entries"
        value={`${group.totalEntries} ${entryWord(group.totalEntries)}`}
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

/** Web d5a759e "All events": one row per event across its location forms, by year. */
const RegistrationForms = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  const params = useLocalSearchParams<{ fromEvent?: string }>();
  const fromEvent = Number(params.fromEvent ?? 0);

  const user = getCurrentUser();
  const isCompanyAdmin = user?.role === "company_admin";
  const activeLocation = useActiveLocation();
  const activeLocationId =
    activeLocation.id === "all" ? undefined : activeLocation.id;

  const [thisYear] = useState(
    () => Number((venueDateKey(new Date().toISOString()) ?? "").slice(0, 4)) || new Date().getFullYear(),
  );
  const [year, setYear] = useState(thisYear);
  const [data, setData] = useState<{ key: string; result: RegistrationEventGroupList } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Manage Events' button lands here first; the list waits until its event resolves.
  const [resolving, setResolving] = useState(fromEvent > 0);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, showToast] = useTransientAlert<{
    message: string;
    type: ToastType;
  }>();
  const sequence = useRef(0);
  const resolvedEvent = useRef(false);
  const requestKey = `${year}|${activeLocationId ?? "all"}`;

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    const current = ++sequence.current;
    const key = `${year}|${activeLocationId ?? "all"}`;
    setLoading(true);
    setLoadError(null);
    try {
      const result = await fetchRegistrationEventGroups(token, {
        year,
        locationId: activeLocationId,
      });
      if (current === sequence.current) setData({ key, result });
    } catch (err) {
      if (current === sequence.current)
        setLoadError(describeFailure(err, "Registration events could not be loaded.").message);
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, [year, activeLocationId]);

  useEffect(() => {
    if (resolving) return;
    void load();
  }, [load, resolving]);

  useEffect(() => {
    if (!fromEvent || resolvedEvent.current) return;
    resolvedEvent.current = true;
    const token = getToken();
    if (!token) {
      setResolving(false);
      return;
    }
    fetchEventOptions(token, fromEvent)
      .then((options) => {
        const outcome = fromEventOutcome(options[0]);
        if (outcome.kind === "open") {
          router.replace({
            pathname: "/events/registration-form-details",
            params: { id: String(outcome.formId) },
          } as never);
        } else if (outcome.kind === "create") {
          router.replace({
            pathname: "/events/registration-event-editor",
            params: { fromEvent: String(fromEvent) },
          } as never);
        } else {
          showToast({ message: EVENT_NOT_FOUND, type: "info" });
          setResolving(false);
        }
      })
      .catch((err: unknown) => {
        const failure = describeFailure(
          err,
          "That event's registration form couldn't be opened. Please try again.",
        );
        if (failure.status !== 401 && failure.status !== 403)
          showToast({ message: failure.message, type: "error" });
        setResolving(false);
      });
  }, [fromEvent, showToast]);

  // A save or delete elsewhere marks the list stale.
  useFocusEffect(
    useCallback(() => {
      if (consumeRegistrationFormsStale()) void load();
      const notice = takeRegistrationFormsNotice();
      if (notice) showToast({ message: notice, type: "success" });
    }, [load, showToast]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const scopeLabel = isCompanyAdmin
    ? activeLocationId != null
      ? locationDisplayName(activeLocation.name)
      : "All locations"
    : user?.location?.name
      ? locationDisplayName(user.location.name)
      : "Your location";
  const scoped = !isCompanyAdmin || activeLocationId != null;
  // Totals belong to one year + location; never show another request's.
  const shown = data && data.key === requestKey ? data.result : null;
  const years = yearChoices(data?.result.years ?? [], thisYear, year);
  const totals = shown?.totals ?? null;
  const groups = shown?.groups ?? [];
  const where = scoped ? ` at ${scopeLabel}` : "";

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header — back, title, and the primary New action. */}
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
            Registration Forms
          </Text>
          <Pressable
            onPress={openNewEvent}
            className="flex-row items-center gap-1 h-9 pl-2.5 pr-3.5 rounded-full bg-[#0644C7] active:opacity-90"
            accessibilityRole="button"
            accessibilityLabel="New event"
          >
            <Feather name="plus" size={16} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-white">New</Text>
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
        <View className="px-4 mt-4">
          {/* Global workspace location selector (company-admin only). */}
          <View className="mb-4">
            <LocationWorkspaceSelector />
          </View>

          {/* Error state */}
          {!!loadError && (
            <View className="flex-row gap-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40 rounded-2xl p-4 mb-4">
              <Feather name="alert-circle" size={18} color="#DC2626" />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-red-700 dark:text-red-400">
                  Could not load registration events
                </Text>
                <Text className="text-sm text-red-600/90 dark:text-red-400/80 mt-0.5">
                  {loadError}
                </Text>
                <Pressable
                  onPress={() => void load()}
                  className="self-start mt-2.5 px-3 py-1.5 rounded-lg bg-white dark:bg-neutral-900 border border-red-200 dark:border-red-900/50 active:opacity-70"
                  accessibilityRole="button"
                >
                  <Text className="text-xs font-semibold text-red-700 dark:text-red-400">
                    Try again
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Scope + year — the year drives the totals and the list below. */}
          <View className="mb-4 gap-2">
            <View className="flex-row items-center gap-1.5">
              <Feather name="calendar" size={13} color="#9CA3AF" />
              <Text
                numberOfLines={1}
                className="flex-1 text-xs font-medium text-gray-500 dark:text-gray-400"
              >
                All events · {scopeLabel}
              </Text>
            </View>
            <SelectField
              value={year}
              options={years.map((option) => ({ label: String(option), value: option }))}
              onSelect={(value) => setYear(Number(value))}
            />
          </View>

          {/* Summary — one panel, four counts, divided by hairlines. */}
          <RegistrationSummary
            tiles={[
              {
                icon: "file-text",
                label: "Total entries",
                value: totals?.totalEntries ?? null,
                hint: "Every form submitted, including repeats.",
              },
              {
                icon: "user-check",
                label: "Unique registrations",
                value: totals?.uniqueRegistrations ?? null,
                hint: "Entries with the same phone and email count once.",
              },
              {
                icon: "calendar",
                label: "Events",
                value: totals?.events ?? null,
                hint: `Total events in ${year}.`,
              },
              {
                icon: "map-pin",
                label: "Location forms",
                value: totals?.locationForms ?? null,
                hint: "Total location forms across all events.",
              },
            ]}
          />
          <Text className="text-xs text-gray-400 dark:text-gray-500 mt-2 mb-5">
            Totals include all {year} events and their location forms{where}.
            They count registrations only, not who attended.
          </Text>

          {/* List header — title + count, and the sort order. */}
          {!loadError && (
            <View className="flex-row items-center justify-between gap-2 mb-3">
              <View className="flex-row items-baseline gap-2 shrink">
                <Text
                  numberOfLines={1}
                  className="shrink text-base font-semibold text-gray-900 dark:text-white"
                >
                  {year} events
                </Text>
                {!!shown && !resolving && (
                  <Text className="text-sm text-gray-400 dark:text-gray-500">
                    {groups.length}
                  </Text>
                )}
              </View>
              <Text className="text-xs text-gray-400 dark:text-gray-500">
                Newest event first
              </Text>
            </View>
          )}

          {/* List / states. Distinct keys per state so css-interop never
              upgrades one container into another in place. */}
          {loadError ? null : resolving || !shown ? (
            <View key="events-loading">
              <AttractionsListSkeleton />
            </View>
          ) : groups.length === 0 ? (
            <View
              key="events-empty"
              className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 px-6 py-10 items-center"
            >
              <View className="w-12 h-12 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center mb-3">
                <Feather name="calendar" size={20} color="#9CA3AF" />
              </View>
              <Text className="text-base font-semibold text-gray-900 dark:text-white text-center">
                No events in {year}{where} yet
              </Text>
              <Text className="text-sm text-gray-500 dark:text-gray-400 text-center mt-1 max-w-xs">
                Create an event like Trunk or Treat, pick the locations
                running it, and each one gets its own sign-up form, QR code
                and registration list.
              </Text>
              <Pressable
                onPress={openNewEvent}
                className="flex-row items-center gap-1.5 mt-4 px-4 py-2.5 rounded-xl bg-[#0644C7] active:opacity-90"
                accessibilityRole="button"
              >
                <Feather name="plus" size={15} color="#FFFFFF" />
                <Text className="text-sm font-semibold text-white">
                  New event
                </Text>
              </Pressable>
            </View>
          ) : (
            <View key="events-list" style={{ opacity: loading ? 0.6 : 1 }}>
              {groups.map((group) => (
                <EventCard key={group.id} group={group} />
              ))}
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

export default RegistrationForms;
