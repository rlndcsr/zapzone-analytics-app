import { Feather } from "@expo/vector-icons";
import { type ComponentProps, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { useActiveLocation } from "../../lib/location/activeLocationStore";
import { getCurrentUser, getToken } from "../../lib/session";
import { fetchAttractions } from "../../services/attractionsService";
import { fetchPackages } from "../../services/bookingsService";
import { fetchEvents } from "../../services/eventsService";
import { fetchLocations } from "../../services/locationsService";

const PRIMARY = "#0644C7";

/**
 * Where a promo / gift card applies. An empty list means "all" for that
 * dimension — the same convention the backend uses (a null column is
 * unrestricted, see App\Traits\HasTargeting).
 */
export type TargetingValue = {
  locationIds: number[];
  packageIds: number[];
  attractionIds: number[];
  eventIds: number[];
};

export const EMPTY_TARGETING: TargetingValue = {
  locationIds: [],
  packageIds: [],
  attractionIds: [],
  eventIds: [],
};

/** Request body fields for the targeting columns; "all" dimensions are omitted. */
export function targetingPayload(value: TargetingValue): {
  location_ids?: number[];
  package_ids?: number[];
  attraction_ids?: number[];
  event_ids?: number[];
} {
  return {
    ...(value.locationIds.length ? { location_ids: value.locationIds } : null),
    ...(value.packageIds.length ? { package_ids: value.packageIds } : null),
    ...(value.attractionIds.length
      ? { attraction_ids: value.attractionIds }
      : null),
    ...(value.eventIds.length ? { event_ids: value.eventIds } : null),
  };
}

type Option = { id: number; name: string };

type GroupKey = keyof TargetingValue;

const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

/** One-line scope description, e.g. "2 packages · all locations". */
export function targetingSummary(value: TargetingValue): string {
  const items: string[] = [];
  if (value.packageIds.length)
    items.push(plural(value.packageIds.length, "package"));
  if (value.attractionIds.length)
    items.push(plural(value.attractionIds.length, "attraction"));
  if (value.eventIds.length) items.push(plural(value.eventIds.length, "event"));
  const itemText = items.length
    ? items.join(", ")
    : "all packages, attractions & events";
  const locationText = value.locationIds.length
    ? plural(value.locationIds.length, "location")
    : "all locations";
  return `${itemText} · ${locationText}`;
}

/** One "All … / Specific" group with its checkbox list. */
function Group({
  icon,
  title,
  allLabel,
  options,
  loading,
  selected,
  onToggle,
  onSelectAll,
  onClear,
  onModeChange,
  isSpecific,
  disabled,
}: {
  icon: ComponentProps<typeof Feather>["name"];
  title: string;
  allLabel: string;
  options: Option[];
  loading: boolean;
  selected: number[];
  onToggle: (id: number) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onModeChange: (specific: boolean) => void;
  isSpecific: boolean;
  disabled?: boolean;
}) {
  const allSelected = options.length > 0 && selected.length === options.length;

  const pill = (active: boolean) =>
    `px-3 py-2 rounded-xl border ${
      active
        ? "bg-[#0644C7] border-[#0644C7]"
        : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
    }`;
  const pillText = (active: boolean) =>
    `text-xs font-semibold ${
      active ? "text-white" : "text-gray-700 dark:text-gray-200"
    }`;

  return (
    <View className="rounded-xl border border-gray-200 dark:border-neutral-700 p-3 mb-3">
      <View className="flex-row items-center gap-2 mb-2">
        <Feather name={icon} size={14} color="#6B7280" />
        <Text className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          {title}
        </Text>
        {isSpecific && selected.length > 0 && (
          <Text className="text-[11px] text-blue-600 dark:text-blue-400">
            {selected.length} selected
          </Text>
        )}
      </View>

      <View className="flex-row gap-2">
        <Pressable
          disabled={disabled}
          onPress={() => onModeChange(false)}
          className={pill(!isSpecific)}
        >
          <Text className={pillText(!isSpecific)}>{allLabel}</Text>
        </Pressable>
        <Pressable
          disabled={disabled}
          onPress={() => onModeChange(true)}
          className={pill(isSpecific)}
        >
          <Text className={pillText(isSpecific)}>Specific</Text>
        </Pressable>
      </View>

      {isSpecific && (
        <>
          <View className="flex-row items-center justify-between mt-3 mb-1.5">
            <Text className="text-[11px] text-gray-400 dark:text-gray-500">
              Empty = all
            </Text>
            {options.length > 0 && (
              <Pressable onPress={allSelected ? onClear : onSelectAll}>
                <Text className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                  {allSelected ? "Clear All" : "Select All"}
                </Text>
              </Pressable>
            )}
          </View>

          <View className="bg-gray-50 dark:bg-neutral-800 rounded-xl border border-gray-200 dark:border-neutral-700 max-h-48">
            {loading ? (
              <View className="py-6 items-center">
                <ActivityIndicator color={PRIMARY} />
              </View>
            ) : options.length === 0 ? (
              <View className="py-6 items-center">
                <Text className="text-sm text-gray-400 dark:text-gray-500">
                  No {title.toLowerCase()} available.
                </Text>
              </View>
            ) : (
              <ScrollView nestedScrollEnabled showsVerticalScrollIndicator>
                {options.map((option) => {
                  const checked = selected.includes(option.id);
                  return (
                    <Pressable
                      key={option.id}
                      disabled={disabled}
                      onPress={() => onToggle(option.id)}
                      className="flex-row items-center gap-3 px-3.5 py-3 border-b border-gray-100 dark:border-neutral-700"
                    >
                      <View
                        className={`w-5 h-5 rounded-md items-center justify-center border ${
                          checked
                            ? "bg-[#0644C7] border-[#0644C7]"
                            : "border-gray-300 dark:border-neutral-600"
                        }`}
                      >
                        {checked && (
                          <Feather name="check" size={13} color="#FFFFFF" />
                        )}
                      </View>
                      <Text
                        className="text-sm text-gray-800 dark:text-gray-100 flex-1"
                        numberOfLines={1}
                      >
                        {option.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </>
      )}
    </View>
  );
}

/**
 * "Where this applies" scope picker for the Create Promo Code / Create Gift Card
 * sheets: locations, packages, attractions and events, each either everything or
 * a specific set. Loads its own option lists when mounted (the sheets unmount
 * their contents when closed).
 */
export function TargetingSelector({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: TargetingValue;
  onChange: (value: TargetingValue) => void;
  disabled?: boolean;
}) {
  const activeLocation = useActiveLocation();
  const scopeLocationId =
    activeLocation.id === "all" ? undefined : activeLocation.id;
  const isCompanyAdmin = getCurrentUser()?.role === "company_admin";

  const [locations, setLocations] = useState<Option[]>([]);
  const [packages, setPackages] = useState<Option[]>([]);
  const [attractions, setAttractions] = useState<Option[]>([]);
  const [events, setEvents] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);

  // "All" vs "Specific" is presentation only: an empty selection under
  // "Specific" still means unrestricted, so the summary stays accurate.
  const [specific, setSpecific] = useState<Record<GroupKey, boolean>>({
    locationIds: value.locationIds.length > 0,
    packageIds: value.packageIds.length > 0,
    attractionIds: value.attractionIds.length > 0,
    eventIds: value.eventIds.length > 0,
  });

  useEffect(() => {
    let active = true;
    const token = getToken();
    const user = getCurrentUser();
    if (!token || !user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      isCompanyAdmin ? fetchLocations(token).catch(() => []) : [],
      fetchPackages(token, scopeLocationId).catch(() => []),
      fetchAttractions({
        token,
        userId: user.id,
        locationId: scopeLocationId,
      }).catch(() => []),
      fetchEvents({
        token,
        userId: user.id,
        locationId: scopeLocationId,
      }).catch(() => []),
    ])
      .then(([locs, pkgs, atts, evts]) => {
        if (!active) return;
        setLocations(locs.map((l) => ({ id: l.id, name: l.name })));
        setPackages(pkgs.map((p) => ({ id: p.id, name: p.name })));
        setAttractions(atts.map((a) => ({ id: a.id, name: a.name })));
        setEvents(evts.map((e) => ({ id: e.id, name: e.name })));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isCompanyAdmin, scopeLocationId]);

  const summary = useMemo(() => targetingSummary(value), [value]);

  const setMode = (key: GroupKey, isSpecific: boolean) => {
    setSpecific((prev) => ({ ...prev, [key]: isSpecific }));
    // Going back to "All" drops the selection so the payload matches the label.
    if (!isSpecific && value[key].length) onChange({ ...value, [key]: [] });
  };

  const toggle = (key: GroupKey, id: number) => {
    const current = value[key];
    onChange({
      ...value,
      [key]: current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id],
    });
  };

  const group = (
    key: GroupKey,
    icon: ComponentProps<typeof Feather>["name"],
    title: string,
    allLabel: string,
    options: Option[],
  ) => (
    <Group
      icon={icon}
      title={title}
      allLabel={allLabel}
      options={options}
      loading={loading}
      selected={value[key]}
      isSpecific={specific[key]}
      disabled={disabled}
      onToggle={(id) => toggle(key, id)}
      onSelectAll={() => onChange({ ...value, [key]: options.map((o) => o.id) })}
      onClear={() => onChange({ ...value, [key]: [] })}
      onModeChange={(isSpecific) => setMode(key, isSpecific)}
    />
  );

  return (
    <View className="mb-4">
      <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
        {label}
      </Text>
      <View className="bg-blue-50 dark:bg-blue-900/20 rounded-xl px-3.5 py-2.5 mb-3">
        <Text className="text-[11px] text-gray-600 dark:text-gray-300">
          <Text className="font-semibold text-blue-700 dark:text-blue-300">
            Applies to:{" "}
          </Text>
          {summary}
        </Text>
      </View>

      {isCompanyAdmin &&
        group("locationIds", "map-pin", "Locations", "All locations", locations)}
      {group("packageIds", "package", "Packages", "All packages", packages)}
      {group(
        "attractionIds",
        "activity",
        "Attractions",
        "All attractions",
        attractions,
      )}
      {group("eventIds", "calendar", "Events", "All events", events)}
    </View>
  );
}
