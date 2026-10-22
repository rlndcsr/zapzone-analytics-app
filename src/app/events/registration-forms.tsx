import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RegistrationStatusPill } from "../../components/events/RegistrationStatusPill";
import { RegistrationTile } from "../../components/events/RegistrationTile";
import { SelectField } from "../../components/ui/FormControls";
import { LocationWorkspaceSelector } from "../../components/ui/LocationWorkspaceSelector";
import { Toast, type ToastType } from "../../components/ui/Toast";
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

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const openEvent = (id: number) =>
  router.push({
    pathname: "/events/registration-event",
    params: { id: String(id) },
  } as never);

const openNewEvent = () =>
  router.push("/events/registration-event-editor" as never);

const EventRow = ({ group }: { group: RegistrationEventGroupSummary }) => (
  <Pressable
    onPress={() => openEvent(group.id)}
    accessibilityRole="button"
    accessibilityLabel={`View ${group.name}`}
    className="px-4 py-4 border-b border-gray-100 dark:border-neutral-800 flex-row items-center gap-3 active:opacity-70"
  >
    <View className="flex-1 gap-1.5">
      <View className="flex-row flex-wrap items-center gap-2">
        <Text className="text-sm font-semibold text-gray-900 dark:text-white">
          {group.name}
        </Text>
        <RegistrationStatusPill status={group.status} />
      </View>
      <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
        <View className="flex-row items-center gap-1.5">
          <Feather name="calendar" size={13} color="#9CA3AF" />
          <Text className="text-sm text-gray-600 dark:text-gray-400">
            {formatDateLong(group.eventDate)}
          </Text>
        </View>
        <View className="flex-row items-center gap-1.5 shrink">
          <Feather name="map-pin" size={13} color="#9CA3AF" />
          <Text numberOfLines={1} className="shrink text-sm text-gray-600 dark:text-gray-400">
            {venueSummary(group.locationNames, group.locationForms)}
          </Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <Feather name="users" size={13} color="#9CA3AF" />
          <Text className="text-sm text-gray-600 dark:text-gray-400">
            {group.totalEntries} {entryWord(group.totalEntries)}
          </Text>
        </View>
      </View>
    </View>
    <Feather name="chevron-right" size={18} color="#9CA3AF" />
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
            Registration Forms
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
          />
        }
      >
        <View className="px-5">
          <View className="mt-5">
            <LocationWorkspaceSelector />
          </View>

          <View className="mt-6 mb-4">
            <Text className="text-2xl font-bold text-gray-900 dark:text-white">
              Registration Forms
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Manage events and their participating location forms.
            </Text>
            <Pressable
              onPress={openNewEvent}
              className="flex-row items-center justify-center gap-2 mt-4 bg-[#0644C7] px-4 py-3.5 rounded-xl active:opacity-90"
              accessibilityRole="button"
              accessibilityLabel="New event"
            >
              <Feather name="plus" size={16} color="#FFFFFF" />
              <Text numberOfLines={1} className="shrink-0 text-sm font-semibold text-white">
                New event
              </Text>
            </Pressable>
          </View>

          <View className="mb-4 rounded-2xl bg-white dark:bg-neutral-900 border border-gray-100 dark:border-neutral-800 px-4 py-3 gap-2">
            <View className="flex-row items-center gap-2">
              <Feather name="calendar" size={15} color={PRIMARY} />
              <Text numberOfLines={1} className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-100">
                All events · {scopeLabel}
              </Text>
            </View>
            <SelectField
              value={year}
              options={years.map((option) => ({ label: String(option), value: option }))}
              onSelect={(value) => setYear(Number(value))}
            />
          </View>

          <View className="flex-row flex-wrap -m-1.5">
            <RegistrationTile
              label="Total entries"
              value={totals?.totalEntries ?? null}
              hint="Every form submitted, including repeats."
            />
            <RegistrationTile
              label="Unique registrations"
              value={totals?.uniqueRegistrations ?? null}
              hint="Entries with the same phone and email count once."
            />
            <RegistrationTile
              label="Events"
              value={totals?.events ?? null}
              hint={`Total events in ${year}.`}
            />
            <RegistrationTile
              label="Location forms"
              value={totals?.locationForms ?? null}
              hint="Total location forms across all events."
            />
          </View>
          <Text className="text-xs text-gray-500 dark:text-gray-400 mt-2 mb-4">
            Totals include all {year} events and their location forms{where}.
            They count registrations only, not who attended.
          </Text>

          <View
            className="bg-white dark:bg-neutral-900 rounded-2xl overflow-hidden border border-gray-100 dark:border-neutral-800 shadow-sm"
            style={CARD_SHADOW}
          >
            <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-neutral-800">
              <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                {year} events
              </Text>
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                Newest event first
              </Text>
            </View>

            {loadError ? (
              <View className="p-6 items-center gap-3">
                <Text className="text-sm text-red-600 text-center">{loadError}</Text>
                <Pressable
                  onPress={() => void load()}
                  className="px-4 py-2 rounded-lg border border-gray-200 dark:border-neutral-700 active:opacity-70"
                  accessibilityRole="button"
                >
                  <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Try again
                  </Text>
                </Pressable>
              </View>
            ) : resolving || !shown ? (
              <View className="py-16 items-center">
                <ActivityIndicator color={PRIMARY} />
              </View>
            ) : groups.length === 0 ? (
              <View className="px-6 py-12 items-center">
                <Feather name="calendar" size={34} color="#D1D5DB" />
                <Text className="text-gray-700 dark:text-gray-200 font-semibold mt-3 text-center">
                  No events in {year}{where} yet
                </Text>
                <Text className="text-sm text-gray-500 dark:text-gray-400 text-center mt-1">
                  Create an event like Trunk or Treat, pick the locations
                  running it, and each one gets its own sign-up form, QR code
                  and registration list.
                </Text>
              </View>
            ) : (
              <View style={{ opacity: loading ? 0.6 : 1 }}>
                {groups.map((group) => (
                  <EventRow key={group.id} group={group} />
                ))}
              </View>
            )}
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

export default RegistrationForms;
