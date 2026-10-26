import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import {
  formLocation,
  MAX_EVENT_FORMS_MESSAGE,
  peopleLabel,
  pickerLocations,
  pickerSummary,
  toggleForms,
  visiblePickerEvents,
} from "../../lib/email/eventRecipients";
import { describeFailure, STATUS_LABELS } from "../../lib/registrationForms/registrationForms";
import { getToken } from "../../lib/session";
import { formatDateLong } from "../../lib/waivers/returningCustomers";
import {
  fetchRegistrationForms,
  type RegistrationFormRow,
  type RegistrationFormStatus,
} from "../../services/registrationFormsService";
import { SelectField } from "./FormControls";

const PRIMARY = "#0644C7";

/** A checkbox that can also show "some of these" (the web's indeterminate box). */
function Box({ state }: { state: "on" | "off" | "some" }) {
  const filled = state !== "off";
  return (
    <View
      className={`mt-0.5 w-5 h-5 rounded border items-center justify-center ${
        filled
          ? "bg-[#0644C7] border-[#0644C7]"
          : "bg-white dark:bg-neutral-900 border-gray-300 dark:border-neutral-700"
      }`}
    >
      {state === "on" && <Feather name="check" size={13} color="#FFFFFF" />}
      {state === "some" && <Feather name="minus" size={13} color="#FFFFFF" />}
    </View>
  );
}

function StatusChip({ status }: { status: RegistrationFormStatus }) {
  const open = status === "open";
  return (
    <View
      className={`px-2 py-0.5 rounded-full ${
        open ? "bg-green-100 dark:bg-green-900/40" : "bg-gray-100 dark:bg-neutral-800"
      }`}
    >
      <Text
        className={`text-[11px] font-medium ${
          open ? "text-green-800 dark:text-green-300" : "text-gray-700 dark:text-gray-300"
        }`}
      >
        {STATUS_LABELS[status]}
      </Text>
    </View>
  );
}

/**
 * Pick the events whose registrants a campaign goes to (web:
 * EventRecipientPicker). Picks location forms: an event across several
 * locations is ticked whole or one location at a time.
 */
export function EventRecipientPicker({
  selectedIds,
  onChange,
  disabled = false,
}: {
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
}) {
  const [forms, setForms] = useState<RegistrationFormRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState<number | null>(null);
  const [limitMessage, setLimitMessage] = useState<string | null>(null);
  const latest = useRef({ selectedIds, onChange });
  latest.current = { selectedIds, onChange };

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setLoadError(null);
    try {
      const list = await fetchRegistrationForms(token);
      setForms(list);
      // a picked form that's gone (deleted, or moved out of reach) is dropped
      const known = new Set(list.map((form) => form.id));
      const { selectedIds: current, onChange: notify } = latest.current;
      const kept = current.filter((id) => known.has(id));
      if (kept.length !== current.length) notify(kept);
    } catch (error) {
      setLoadError(describeFailure(error, "Could not load your events. Please try again.").message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const locations = useMemo(() => pickerLocations(forms ?? []), [forms]);
  const multiLocation = locations.length > 1;
  const visible = useMemo(
    () => visiblePickerEvents(forms ?? [], search, multiLocation ? locationFilter : null),
    [forms, search, locationFilter, multiLocation],
  );
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const shownIds = useMemo(() => visible.flatMap((event) => event.forms.map((form) => form.id)), [visible]);
  const allShownChosen = shownIds.length > 0 && shownIds.every((id) => selected.has(id));

  const apply = (ids: number[], on: boolean) => {
    const next = toggleForms(selectedIds, ids, on);
    if (next === null) {
      setLimitMessage(MAX_EVENT_FORMS_MESSAGE);
      return;
    }
    setLimitMessage(null);
    onChange(next);
  };

  if (loading && forms === null) {
    return (
      <View className="py-6 items-center">
        <ActivityIndicator color={PRIMARY} />
      </View>
    );
  }

  if (loadError && forms === null) {
    return (
      <View className="rounded-xl border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-900/20 px-3 py-3 gap-2">
        <Text className="text-sm text-red-700 dark:text-red-300">{loadError}</Text>
        <Pressable onPress={() => void load()} className="flex-row items-center gap-1 self-start">
          <Feather name="refresh-ccw" size={13} color="#B91C1C" />
          <Text className="text-sm font-medium text-red-700 dark:text-red-300">Try again</Text>
        </Pressable>
      </View>
    );
  }

  if ((forms ?? []).length === 0) {
    return (
      <View className="rounded-xl border border-dashed border-gray-300 dark:border-neutral-700 px-4 py-5 items-center">
        <Feather name="calendar" size={22} color="#D1D5DB" />
        <Text className="text-sm text-gray-600 dark:text-gray-300 mt-2">
          There are no registration forms yet.
        </Text>
        <Text className="text-xs text-gray-500 dark:text-gray-400 mt-1 text-center">
          {"Create one under "}
          <Text
            className="font-medium text-[#0644C7] dark:text-blue-400"
            onPress={() => router.push("/events/registration-forms" as never)}
          >
            Events, Registration Forms
          </Text>
          .
        </Text>
      </View>
    );
  }

  return (
    <View className="gap-3" style={disabled ? { opacity: 0.6 } : undefined} pointerEvents={disabled ? "none" : "auto"}>
      <View className="flex-row items-center justify-between gap-2">
        <Text className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-100">
          {pickerSummary(forms ?? [], selectedIds, multiLocation)}
        </Text>
        {selectedIds.length > 0 && (
          <Pressable onPress={() => apply(selectedIds, false)} hitSlop={6}>
            <Text className="text-xs font-medium text-gray-500 dark:text-gray-400">Clear</Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => void load()}
          disabled={loading}
          hitSlop={6}
          className="flex-row items-center gap-1"
          accessibilityLabel="Reload the list of events"
        >
          {loading ? (
            <ActivityIndicator size="small" color="#6B7280" />
          ) : (
            <Feather name="refresh-ccw" size={12} color="#6B7280" />
          )}
          <Text className="text-xs font-medium text-gray-500 dark:text-gray-400">Refresh</Text>
        </Pressable>
      </View>

      <View className="flex-row items-center gap-2 rounded-xl px-3 py-2.5 border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800">
        <Feather name="search" size={15} color="#9CA3AF" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={multiLocation ? "Search events or locations…" : "Search events…"}
          placeholderTextColor="#9CA3AF"
          className="flex-1 text-sm text-gray-900 dark:text-white"
          style={{ paddingVertical: 0 }}
        />
        {!!search && (
          <Pressable onPress={() => setSearch("")} hitSlop={6} accessibilityLabel="Clear search">
            <Feather name="x" size={14} color="#9CA3AF" />
          </Pressable>
        )}
      </View>

      {multiLocation && (
        <SelectField
          value={locationFilter ?? 0}
          options={[
            { label: "All locations", value: 0 },
            ...locations.map((location) => ({ label: location.name, value: location.id })),
          ]}
          onSelect={(v) => setLocationFilter(Number(v) || null)}
        />
      )}

      <View className="rounded-xl border border-gray-200 dark:border-neutral-700 overflow-hidden">
        <View className="flex-row items-center justify-between gap-2 px-3 py-2 bg-gray-50 dark:bg-neutral-800 border-b border-gray-200 dark:border-neutral-700">
          <Text className="flex-1 text-xs text-gray-500 dark:text-gray-400">
            {`${visible.length} event${visible.length === 1 ? "" : "s"} shown${
              multiLocation && locationFilter !== null
                ? ` at ${locations.find((l) => l.id === locationFilter)?.name ?? "this location"}`
                : ""
            }`}
          </Text>
          <Pressable onPress={() => apply(shownIds, !allShownChosen)} disabled={shownIds.length === 0} hitSlop={6}>
            <Text
              className={`text-xs font-semibold ${
                shownIds.length === 0 ? "text-gray-300 dark:text-neutral-600" : "text-[#0644C7] dark:text-blue-400"
              }`}
            >
              {allShownChosen ? "Remove all shown" : "Choose all shown"}
            </Text>
          </Pressable>
        </View>

        {visible.length === 0 ? (
          <Text className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
            {`No events match this search${multiLocation && locationFilter !== null ? " at this location" : ""}.`}
          </Text>
        ) : (
          <ScrollView style={{ maxHeight: 360 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {visible.map((event, index) => {
              const ids = event.forms.map((form) => form.id);
              const chosen = ids.filter((id) => selected.has(id)).length;
              const allChosen = chosen === ids.length;
              const divider = index > 0 ? "border-t border-gray-100 dark:border-neutral-800" : "";

              if (event.forms.length === 1) {
                const form = event.forms[0];
                return (
                  <Pressable
                    key={event.key}
                    onPress={() => apply([form.id], !selected.has(form.id))}
                    className={`flex-row items-start gap-3 px-3 py-2.5 ${divider}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected.has(form.id) }}
                  >
                    <Box state={selected.has(form.id) ? "on" : "off"} />
                    <View className="flex-1">
                      <View className="flex-row flex-wrap items-center gap-2">
                        <Text className="text-sm font-medium text-gray-900 dark:text-white">{event.name}</Text>
                        <StatusChip status={form.status} />
                      </View>
                      <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {`${formatDateLong(form.eventDate)}${multiLocation ? ` · ${formLocation(form)}` : ""} · ${peopleLabel(form.uniqueRegistrations)}`}
                      </Text>
                    </View>
                  </Pressable>
                );
              }

              const people = event.forms.reduce((sum, form) => sum + form.uniqueRegistrations, 0);
              return (
                <View key={event.key} className={`py-1 ${divider}`}>
                  <Pressable
                    onPress={() => apply(ids, !allChosen)}
                    className="flex-row items-start gap-3 px-3 py-2"
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: allChosen ? true : chosen > 0 ? "mixed" : false }}
                  >
                    <Box state={allChosen ? "on" : chosen > 0 ? "some" : "off"} />
                    <View className="flex-1">
                      <View className="flex-row flex-wrap items-center gap-2">
                        <Text className="text-sm font-medium text-gray-900 dark:text-white">{event.name}</Text>
                        <StatusChip status={event.status} />
                      </View>
                      <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {`${formatDateLong(event.eventDate)} · ${event.forms.length} locations · ${peopleLabel(people)}${
                          chosen > 0 && !allChosen ? ` · ${chosen} of ${ids.length} picked` : ""
                        }`}
                      </Text>
                    </View>
                  </Pressable>
                  <View className="pl-11 pr-3 pb-1">
                    {event.forms.map((form) => (
                      <Pressable
                        key={form.id}
                        onPress={() => apply([form.id], !selected.has(form.id))}
                        className="flex-row items-center gap-2 py-1.5"
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selected.has(form.id) }}
                      >
                        <Box state={selected.has(form.id) ? "on" : "off"} />
                        <Feather name="map-pin" size={12} color="#9CA3AF" />
                        <Text className="flex-1 text-sm text-gray-700 dark:text-gray-200" numberOfLines={1}>
                          {formLocation(form)}
                        </Text>
                        <Text className="text-xs text-gray-500 dark:text-gray-400">
                          {peopleLabel(form.uniqueRegistrations)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>

      {!!limitMessage && <Text className="text-xs text-red-600">{limitMessage}</Text>}
      {!!loadError && forms !== null && <Text className="text-xs text-red-600">{loadError}</Text>}
    </View>
  );
}
