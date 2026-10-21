import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RegistrationStatusPill } from "../../components/events/RegistrationStatusPill";
import { LocationWorkspaceSelector } from "../../components/ui/LocationWorkspaceSelector";
import { Toast, type ToastType } from "../../components/ui/Toast";
import { useAsyncList } from "../../lib/hooks/useAsyncList";
import { useTransientAlert } from "../../lib/hooks/useTransientAlert";
import { useActiveLocation } from "../../lib/location/activeLocationStore";
import {
  DELETE_WARNING,
  EVENT_NOT_FOUND,
  consumeRegistrationFormsStale,
  describeFailure,
  formTally,
  formatEventDates,
  fromEventOutcome,
  locationDisplayName,
  takeRegistrationFormsNotice,
} from "../../lib/registrationForms/registrationForms";
import { getCurrentUser, getToken } from "../../lib/session";
import { formatDateLong } from "../../lib/waivers/returningCustomers";
import {
  deleteRegistrationForm,
  fetchEventOptions,
  fetchRegistrationForms,
  type RegistrationEventOption,
  type RegistrationFormRow,
} from "../../services/registrationFormsService";

/** The Manage Events event whose forms the list is narrowed to. */
type EventFilter = {
  id: number;
  name: string;
  dates: string;
  locationId: number;
  venue: string | null;
};

const filterFrom = (option: RegistrationEventOption): EventFilter => ({
  id: option.id,
  name: option.name.trim(),
  dates: formatEventDates(option),
  locationId: option.locationId,
  venue: option.locationName ? locationDisplayName(option.locationName) : null,
});

const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const openDetails = (id: number) =>
  router.push({
    pathname: "/events/registration-form-details",
    params: { id: String(id) },
  } as never);

const openEditor = (id?: number) =>
  router.push({
    pathname: "/events/registration-form-editor",
    params: id != null ? { id: String(id) } : {},
  } as never);

const newFormForEvent = (eventId: number) =>
  router.push({
    pathname: "/events/registration-form-editor",
    params: { fromEvent: String(eventId) },
  } as never);

const FormRow = ({
  form,
  showVenue,
  busy,
  onDelete,
}: {
  form: RegistrationFormRow;
  showVenue: boolean;
  busy: boolean;
  onDelete: () => void;
}) => (
  <View className="px-4 py-4 border-b border-gray-100 dark:border-neutral-800">
    <Pressable
      onPress={() => openDetails(form.id)}
      accessibilityRole="button"
      accessibilityLabel={`View ${form.name}`}
      className="gap-1.5 active:opacity-70"
    >
      <View className="flex-row flex-wrap items-center gap-2">
        <Text className="text-sm font-semibold text-gray-900 dark:text-white">
          {form.name}
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
        {showVenue && !!form.locationName && (
          <View className="flex-row items-center gap-1.5">
            <Feather name="map-pin" size={13} color="#9CA3AF" />
            <Text className="text-sm text-gray-600 dark:text-gray-400">
              {locationDisplayName(form.locationName)}
            </Text>
          </View>
        )}
        <View className="flex-row items-center gap-1.5">
          <Feather name="users" size={13} color="#9CA3AF" />
          <Text className="text-sm text-gray-600 dark:text-gray-400">
            {formTally(form)}
          </Text>
        </View>
      </View>
      {form.event && (
        <View className="flex-row items-center gap-1">
          <Feather name="check-square" size={12} color="#9CA3AF" />
          <Text className="flex-1 text-xs text-gray-500 dark:text-gray-400">
            Event: {form.event.name} · {formatEventDates(form.event)}
          </Text>
        </View>
      )}
      {form.previousEdition && (
        <Text className="text-xs text-gray-500 dark:text-gray-400">
          Last year: {form.previousEdition.name}
        </Text>
      )}
    </Pressable>

    <View className="flex-row items-center gap-2 mt-3">
      <Pressable
        onPress={() => openDetails(form.id)}
        accessibilityRole="button"
        className="px-4 py-2 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 active:opacity-70"
      >
        <Text className="text-xs font-semibold text-gray-700 dark:text-gray-200">
          View
        </Text>
      </Pressable>
      <Pressable
        onPress={() => openEditor(form.id)}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${form.name}`}
        className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-neutral-800 items-center justify-center active:opacity-70"
      >
        <Feather name="edit-2" size={15} color="#6B7280" />
      </Pressable>
      <Pressable
        onPress={onDelete}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${form.name}`}
        className={`w-8 h-8 rounded-lg bg-red-50 dark:bg-red-900/30 items-center justify-center active:opacity-70 ${
          busy ? "opacity-50" : ""
        }`}
      >
        {busy ? (
          <ActivityIndicator size="small" color="#EF4444" />
        ) : (
          <Feather name="trash-2" size={15} color="#EF4444" />
        )}
      </Pressable>
    </View>
  </View>
);

const RegistrationForms = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  const params = useLocalSearchParams<{ fromEvent?: string }>();
  const fromEvent = Number(params.fromEvent ?? 0);

  const activeLocation = useActiveLocation();
  const activeLocationId =
    activeLocation.id === "all" ? undefined : activeLocation.id;
  const showVenue =
    getCurrentUser()?.role === "company_admin" && activeLocationId == null;

  const [eventFilter, setEventFilter] = useState<EventFilter | null>(null);
  // Manage Events' button lands here first; the list waits until its event resolves.
  const [resolving, setResolving] = useState(fromEvent > 0);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [toast, showToast] = useTransientAlert<{
    message: string;
    type: ToastType;
  }>();
  const resolvedEvent = useRef(false);
  const lastLocation = useRef(activeLocationId);

  const loader = useCallback(
    async ({ token }: { token: string }) => {
      if (resolving) return [];
      try {
        const rows = await fetchRegistrationForms(
          token,
          eventFilter ? eventFilter.locationId : activeLocationId,
        );
        return eventFilter
          ? rows.filter((form) => form.event?.id === eventFilter.id)
          : rows;
      } catch (err) {
        throw new Error(
          describeFailure(err, "Registration forms could not be loaded.")
            .message,
        );
      }
    },
    [activeLocationId, eventFilter, resolving],
  );
  const { data: forms, loading, error, refetch } = useAsyncList(loader);

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
            pathname: "/events/registration-form-editor",
            params: { fromEvent: String(fromEvent) },
          } as never);
        } else {
          if (outcome.kind === "list") setEventFilter(filterFrom(options[0]));
          else showToast({ message: EVENT_NOT_FOUND, type: "info" });
          setResolving(false);
        }
      })
      .catch((err: unknown) => {
        const failure = describeFailure(
          err,
          "That event's registration forms couldn't be opened. Please try again.",
        );
        if (failure.status !== 401 && failure.status !== 403)
          showToast({ message: failure.message, type: "error" });
        setResolving(false);
      });
  }, [fromEvent, showToast]);

  // Switching the workspace location drops the event filter, as on the web.
  useEffect(() => {
    if (lastLocation.current === activeLocationId) return;
    lastLocation.current = activeLocationId;
    setEventFilter(null);
  }, [activeLocationId]);

  // A save, toggle or delete elsewhere marks the list stale.
  useFocusEffect(
    useCallback(() => {
      if (consumeRegistrationFormsStale()) void refetch();
      const notice = takeRegistrationFormsNotice();
      if (notice) showToast({ message: notice, type: "success" });
    }, [refetch, showToast]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const confirmDelete = (form: RegistrationFormRow) => {
    Alert.alert("Delete registration form", DELETE_WARNING(form.name), [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const token = getToken();
          if (!token) return;
          setDeletingId(form.id);
          try {
            await deleteRegistrationForm(token, form.id);
            showToast({
              message: "Registration form deleted",
              type: "success",
            });
            void refetch();
          } catch (err) {
            showToast({
              message: describeFailure(err, "The form could not be deleted.")
                .message,
              type: "error",
            });
          } finally {
            setDeletingId(null);
          }
        },
      },
    ]);
  };

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
              A separate sign-up form and QR code for each event. Forms close
              automatically after the event date.
            </Text>
            <Pressable
              onPress={() => openEditor()}
              className="flex-row items-center justify-center gap-2 mt-4 bg-[#0644C7] px-4 py-3.5 rounded-xl active:opacity-90"
              accessibilityRole="button"
              accessibilityLabel="New Registration Form"
            >
              <Feather name="plus" size={16} color="#FFFFFF" />
              <Text
                numberOfLines={1}
                className="shrink-0 text-sm font-semibold text-white"
              >
                New Registration Form
              </Text>
            </Pressable>
          </View>

          {eventFilter && (
            <View className="mb-4 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-900/20 px-4 py-3 gap-2">
              <Text className="text-sm text-gray-800 dark:text-gray-100">
                Forms for{" "}
                <Text className="font-semibold">{eventFilter.name}</Text> ·{" "}
                {eventFilter.dates}
                {eventFilter.venue ? ` · ${eventFilter.venue}` : ""}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                <Pressable
                  onPress={() => newFormForEvent(eventFilter.id)}
                  accessibilityRole="button"
                  className="flex-row items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 active:opacity-70"
                >
                  <Feather name="plus" size={14} color={PRIMARY} />
                  <Text className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                    New form for this event
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setEventFilter(null)}
                  accessibilityRole="button"
                  className="px-3 py-2 rounded-lg active:opacity-70"
                >
                  <Text className="text-xs font-semibold text-[#0644C7] dark:text-blue-400">
                    Show all forms
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          <View
            className="bg-white dark:bg-neutral-900 rounded-2xl overflow-hidden border border-gray-100 dark:border-neutral-800 shadow-sm"
            style={CARD_SHADOW}
          >
            <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-neutral-800">
              <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                {forms.length} form{forms.length === 1 ? "" : "s"}
              </Text>
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                Newest event first
              </Text>
            </View>

            {resolving || (loading && forms.length === 0) ? (
              <View className="py-16 items-center">
                <ActivityIndicator color={PRIMARY} />
              </View>
            ) : error ? (
              <View className="p-6 items-center gap-3">
                <Text className="text-sm text-red-600 text-center">
                  {error}
                </Text>
                <Pressable
                  onPress={() => void refetch()}
                  className="px-4 py-2 rounded-lg border border-gray-200 dark:border-neutral-700 active:opacity-70"
                  accessibilityRole="button"
                >
                  <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Try again
                  </Text>
                </Pressable>
              </View>
            ) : forms.length === 0 ? (
              <View className="px-6 py-12 items-center">
                <Feather name="clipboard" size={34} color="#D1D5DB" />
                <Text className="text-gray-700 dark:text-gray-200 font-semibold mt-3">
                  No registration forms yet
                </Text>
                <Text className="text-sm text-gray-500 dark:text-gray-400 text-center mt-1">
                  Create a form for an event like Halloween or Christmas. Guests
                  scan its QR code, enter their name, phone and email, and you
                  see every registration here. To try it end to end, make a test
                  form, register, then delete it.
                </Text>
              </View>
            ) : (
              forms.map((form) => (
                <FormRow
                  key={form.id}
                  form={form}
                  showVenue={showVenue}
                  busy={deletingId === form.id}
                  onDelete={() => confirmDelete(form)}
                />
              ))
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
