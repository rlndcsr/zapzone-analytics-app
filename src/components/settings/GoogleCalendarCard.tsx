import { Feather } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { formatDateTimeET } from "../../lib/date/venueTime";
import { getToken } from "../../lib/session";
import {
  disconnectGoogleCalendar,
  fetchGoogleCalendarAuthUrl,
  fetchGoogleCalendarConnections,
  fetchGoogleCalendarStatus,
  type GoogleCalendarConnection,
  type GoogleCalendarStatus,
} from "../../services/googleCalendarService";
import { fetchLocations, type LocationOption } from "../../services/locationsService";
import { BottomSheet } from "../ui/BottomSheet";
import { SelectField, type SelectOption } from "../ui/FormControls";

const PRIMARY = "#0644C7";

function ConnectionRow({
  row,
  busy,
  onDisconnect,
}: {
  row: GoogleCalendarConnection;
  busy: boolean;
  onDisconnect: () => void;
}) {
  const place = [row.location.city, row.location.state]
    .filter((p): p is string => !!p)
    .join(", ");

  return (
    <View className="rounded-xl border border-gray-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3.5 mb-2.5">
      <View className="flex-row items-start">
        <View className="flex-1 pr-2">
          <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
            <Feather name="map-pin" size={13} color={PRIMARY} />
            <Text className="text-sm font-bold text-gray-900 dark:text-white">
              {row.location.name}
            </Text>
            {place ? (
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                {place}
              </Text>
            ) : null}
          </View>
          {row.status.googleAccountEmail ? (
            <Text
              className="text-xs text-gray-500 dark:text-gray-400 mt-1.5"
              numberOfLines={1}
            >
              {row.status.googleAccountEmail}
            </Text>
          ) : null}
          <Text className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
            Last synced{" "}
            {formatDateTimeET(row.status.lastSyncedAt, {
              month: "short",
              fallback: "never",
            })}
          </Text>
        </View>
        <View className="h-2.5 w-2.5 rounded-full bg-emerald-500 mt-1" />
      </View>

      <View className="flex-row justify-end mt-3">
        <Pressable
          onPress={onDisconnect}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Disconnect ${row.location.name}`}
          className={`flex-row items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 ${
            busy ? "opacity-60" : "active:opacity-90"
          }`}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Feather name="trash-2" size={13} color="#FFFFFF" />
          )}
          <Text className="text-xs font-semibold text-white">Disconnect</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function GoogleCalendarCard() {
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [status, setStatus] = useState<GoogleCalendarStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [connections, setConnections] = useState<GoogleCalendarConnection[] | null>(
    null,
  );

  useEffect(() => {
    const controller = new AbortController();
    const token = getToken();
    if (!token) return;
    void fetchLocations(token, controller.signal)
      .then(setLocations)
      .catch(() => setLocations([]));
    return () => controller.abort();
  }, []);

  const loadStatus = useCallback(
    async (id: number, signal?: AbortSignal) => {
      const token = getToken();
      if (!token) return;
      setStatusLoading(true);
      setError(null);
      try {
        setStatus(await fetchGoogleCalendarStatus(token, id, signal));
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not read calendar status.",
        );
        setStatus(null);
      } finally {
        setStatusLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (locationId == null) {
      setStatus(null);
      return;
    }
    const controller = new AbortController();
    void loadStatus(locationId, controller.signal);
    return () => controller.abort();
  }, [locationId, loadStatus]);

  const locationOptions = useMemo<SelectOption[]>(
    () => locations.map((l) => ({ label: l.name, value: l.id })),
    [locations],
  );

  const rowValue = useMemo(() => {
    if (locationId == null) return "Select a location to manage calendar sync";
    if (statusLoading) return "Checking…";
    if (error) return "Unavailable";
    if (!status) return "—";
    if (!status.credentialsConfigured)
      return "Google credentials are not configured on the server";
    if (!status.isConnected) return "Not connected";
    return status.googleAccountEmail ?? "Connected";
  }, [locationId, statusLoading, error, status]);

  const connect = useCallback(async () => {
    const token = getToken();
    if (!token || locationId == null) return;
    setBusy(true);
    try {
      const url = await fetchGoogleCalendarAuthUrl(token, locationId);
      if (!url) {
        Alert.alert(
          "Unavailable",
          "The server did not return a Google sign-in link. Check that Google credentials are configured.",
        );
        return;
      }
      // The consent redirect lands on the backend callback, which stores the
      // tokens — so once the browser closes we just re-read the status.
      await WebBrowser.openBrowserAsync(url);
      await loadStatus(locationId);
    } catch (err) {
      Alert.alert(
        "Could not start sign-in",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }, [locationId, loadStatus]);

  const runDisconnect = useCallback(
    async (id: number, name: string, after?: () => Promise<void>) => {
      const token = getToken();
      if (!token) return;
      setBusy(true);
      try {
        await disconnectGoogleCalendar(token, id);
        if (locationId != null) await loadStatus(locationId);
        await after?.();
      } catch (err) {
        Alert.alert(
          "Could not disconnect",
          err instanceof Error ? err.message : `Failed to disconnect ${name}.`,
        );
      } finally {
        setBusy(false);
      }
    },
    [locationId, loadStatus],
  );

  const confirmDisconnect = useCallback(
    (id: number, name: string, after?: () => Promise<void>) => {
      Alert.alert(
        "Disconnect Google Calendar?",
        `Bookings for ${name} will stop syncing to Google Calendar.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Disconnect",
            style: "destructive",
            onPress: () => void runDisconnect(id, name, after),
          },
        ],
      );
    },
    [runDisconnect],
  );

  const loadConnections = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setConnections(null);
    try {
      setConnections(await fetchGoogleCalendarConnections(token));
    } catch {
      setConnections([]);
    }
  }, []);

  const openAll = useCallback(() => {
    setSheetOpen(true);
    void loadConnections();
  }, [loadConnections]);

  return (
    <>
      <View className="overflow-hidden rounded-2xl bg-white dark:bg-neutral-900 shadow-sm border border-gray-100 dark:border-neutral-800 p-4">
        <View className="flex-row items-start justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-base font-bold text-gray-900 dark:text-white">
              Google Calendar
            </Text>
            <Text className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Sync your bookings to Google Calendar automatically.
            </Text>
          </View>
          <Pressable
            onPress={openAll}
            accessibilityRole="button"
            accessibilityLabel="View all Google Calendar connections"
            className="flex-row items-center gap-1.5 active:opacity-60 pt-0.5"
          >
            <Feather name="list" size={13} color={PRIMARY} />
            <Text className="text-xs font-medium text-[#0644C7]">View All</Text>
          </Pressable>
        </View>

        <View className="mt-3">
          <SelectField
            placeholder="Select a location..."
            value={locationId}
            options={locationOptions}
            onSelect={(v) => setLocationId(Number(v))}
          />
        </View>

        <View className="mt-3 rounded-xl bg-gray-50 dark:bg-neutral-800/50 p-3">
          <View className="flex-row items-center">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-gray-100 dark:bg-neutral-800">
              <Feather name="calendar" size={17} color="#6B7280" />
            </View>
            <View className="ml-3 flex-1">
              <Text className="text-sm font-medium text-gray-800 dark:text-gray-100">
                Google Calendar
              </Text>
              <Text
                className="text-xs text-gray-500 dark:text-gray-400 mt-0.5"
                numberOfLines={1}
              >
                {rowValue}
              </Text>
            </View>
            {statusLoading ? (
              <ActivityIndicator size="small" color={PRIMARY} />
            ) : null}
          </View>

          {locationId != null && status && !statusLoading ? (
            <View className="flex-row items-center justify-end gap-4 mt-3">
              {status.isConnected ? (
                <Pressable
                  onPress={() =>
                    confirmDisconnect(
                      locationId,
                      locations.find((l) => l.id === locationId)?.name ??
                        "this location",
                    )
                  }
                  disabled={busy}
                  accessibilityRole="button"
                  className={busy ? "opacity-50" : "active:opacity-60"}
                >
                  <Text className="text-xs font-medium text-red-600">
                    Disconnect
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={connect}
                  disabled={busy || !status.credentialsConfigured}
                  accessibilityRole="button"
                  className={
                    busy || !status.credentialsConfigured
                      ? "opacity-50"
                      : "active:opacity-60"
                  }
                >
                  <Text className="text-xs font-medium text-[#0644C7]">
                    {busy ? "Opening…" : "Connect Account"}
                  </Text>
                </Pressable>
              )}
            </View>
          ) : null}
        </View>

        {error ? (
          <Text className="text-xs text-red-500 mt-2">{error}</Text>
        ) : null}
      </View>

      {/* All connections — the web's "All Google Calendar Connections" modal. */}
      <BottomSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="All Google Calendar Connections"
        subtitle="Connections across all locations"
      >
        <ScrollView
          className="px-5"
          contentContainerStyle={{ paddingBottom: 12 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="pt-1">
            {connections === null ? (
              <View className="items-center py-10">
                <ActivityIndicator color={PRIMARY} />
              </View>
            ) : connections.length === 0 ? (
              <View className="items-center py-10">
                <View className="h-14 w-14 items-center justify-center rounded-full bg-gray-100 dark:bg-neutral-800 mb-3">
                  <Feather name="calendar" size={24} color="#9CA3AF" />
                </View>
                <Text className="text-base font-semibold text-gray-700 dark:text-gray-200">
                  No connections yet
                </Text>
                <Text className="text-xs text-gray-400 dark:text-gray-500 mt-1 text-center">
                  No locations have connected Google Calendar.
                </Text>
              </View>
            ) : (
              connections.map((row) => (
                <ConnectionRow
                  key={row.location.id}
                  row={row}
                  busy={busy}
                  onDisconnect={() =>
                    confirmDisconnect(
                      row.location.id,
                      row.location.name,
                      loadConnections,
                    )
                  }
                />
              ))
            )}
          </View>
        </ScrollView>

        <View className="px-5 pt-3 pb-6 border-t border-gray-100 dark:border-neutral-800">
          <Pressable
            onPress={() => setSheetOpen(false)}
            className="items-center rounded-xl border border-gray-200 dark:border-neutral-700 py-3.5 active:opacity-70"
            accessibilityRole="button"
          >
            <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Close
            </Text>
          </Pressable>
        </View>
      </BottomSheet>
    </>
  );
}
