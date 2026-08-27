import { Feather } from "@expo/vector-icons";
import { useEffect, useMemo, useState, type ComponentProps } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { getToken } from "../../lib/session";
import {
  fetchTargetingOptions,
  type TargetingItem,
  type TargetingOptions,
} from "../../services/targetingOptionsService";
import type { TargetingValue } from "./TargetingSelector";

const PRIMARY = "#0644C7";

/** Which axis of the value a section writes to. */
type ItemAxis = "packageIds" | "attractionIds" | "eventIds";

type Group = {
  axis: ItemAxis;
  key: "packages" | "attractions" | "events";
  label: string;
  one: string;
  icon: ComponentProps<typeof Feather>["name"];
};

const GROUPS: Group[] = [
  { axis: "packageIds", key: "packages", label: "packages", one: "package", icon: "package" },
  { axis: "attractionIds", key: "attractions", label: "attractions", one: "attraction", icon: "zap" },
  { axis: "eventIds", key: "events", label: "events", one: "event", icon: "calendar" },
];

/** One tappable checkbox row: box + name, with an optional second line. */
const CheckRow = ({
  checked,
  name,
  subtitle,
  disabled,
  onPress,
}: {
  checked: boolean;
  name: string;
  subtitle?: string;
  disabled?: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="checkbox"
    accessibilityState={{ checked }}
    accessibilityLabel={name}
    className={`flex-row items-start gap-2.5 px-3 py-2.5 rounded-lg ${
      checked ? "bg-blue-50 dark:bg-blue-900/20" : ""
    }`}
  >
    <View
      className={`w-5 h-5 rounded items-center justify-center border mt-0.5 ${
        checked
          ? "bg-[#0644C7] border-[#0644C7]"
          : "bg-white dark:bg-neutral-900 border-gray-300 dark:border-neutral-600"
      }`}
    >
      {checked && <Feather name="check" size={13} color="#FFFFFF" />}
    </View>
    <View className="flex-1">
      <Text
        numberOfLines={1}
        className="text-sm text-gray-800 dark:text-gray-100"
      >
        {name}
      </Text>
      {!!subtitle && (
        <Text
          numberOfLines={1}
          className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5"
        >
          {subtitle}
        </Text>
      )}
    </View>
  </Pressable>
);

/** A section's grey header: icon, title, the "all N …" line, and its actions. */
const SectionHeader = ({
  icon,
  title,
  note,
  children,
}: {
  icon: ComponentProps<typeof Feather>["name"];
  title: string;
  note: string;
  children?: React.ReactNode;
}) => (
  <View className="flex-row items-center gap-2 px-3 py-2.5 bg-gray-50 dark:bg-neutral-800/60 border-b border-gray-100 dark:border-neutral-700">
    <Feather name={icon} size={14} color="#9CA3AF" />
    <Text className="text-sm font-semibold text-gray-800 dark:text-gray-100">
      {title}
    </Text>
    <Text
      numberOfLines={1}
      className="shrink text-xs text-gray-500 dark:text-gray-400"
    >
      {note}
    </Text>
    {children ? <View className="ml-auto flex-row items-center gap-2">{children}</View> : null}
  </View>
);

/** A header action, styled as the web's blue text button. */
const LinkAction = ({
  label,
  muted,
  disabled,
  onPress,
}: {
  label: string;
  muted?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) => (
  <Pressable onPress={onPress} disabled={disabled} hitSlop={6} accessibilityRole="button">
    <Text
      numberOfLines={1}
      className={`shrink-0 text-xs font-semibold ${
        disabled
          ? "text-gray-300 dark:text-neutral-600"
          : muted
            ? "text-gray-500 dark:text-gray-400"
            : "text-[#0644C7] dark:text-blue-400"
      }`}
    >
      {label}
    </Text>
  </Pressable>
);

/**
 * Picks what something applies to — the mobile twin of the web admin's
 * TargetingPicker, reading the same `/api/targeting-options` catalog.
 *
 * One venue control, not two: the venues ticked here both scope the question and
 * narrow the item lists below, so the same venue names never appear twice
 * meaning different things. An empty list is stated as "all", never as
 * "everything" — what matters is that "all" keeps covering items added later,
 * while naming items does not.
 *
 * Speaks the same {@link TargetingValue} as the simpler TargetingSelector, so a
 * caller can swap one for the other and keep using `targetingPayload`.
 */
export function TargetingPicker({
  value,
  onChange,
  disabled,
}: {
  value: TargetingValue;
  onChange: (next: TargetingValue) => void;
  disabled?: boolean;
}) {
  const [options, setOptions] = useState<TargetingOptions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const token = getToken();
    if (!token) {
      setError("Not authenticated");
      return;
    }
    fetchTargetingOptions(token, controller.signal)
      .then((data) => {
        if (active) setOptions(data);
      })
      .catch((err) => {
        if (active)
          setError(err instanceof Error ? err.message : "Could not load the catalog");
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const venueName = useMemo(() => {
    const map: Record<number, string> = {};
    (options?.venues ?? []).forEach((v) => {
      map[v.id] = v.name;
    });
    return map;
  }, [options]);

  const categories = useMemo(() => {
    const all = new Set<string>();
    GROUPS.forEach((g) =>
      (options?.[g.key] ?? []).forEach((item) => {
        if (item.category) all.add(item.category);
      }),
    );
    return [...all].sort();
  }, [options]);

  const venueScope = value.locationIds;
  const venueCount = options?.venues.length ?? 0;

  /** The ticked venues double as the filter for the item lists below. */
  const visibleItems = (items: TargetingItem[]): TargetingItem[] => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      if (venueScope.length && !venueScope.includes(item.locationId)) return false;
      if (categoryFilter.length && !categoryFilter.includes(item.category))
        return false;
      if (
        term &&
        !`${item.name} ${venueName[item.locationId] ?? ""} ${item.category}`
          .toLowerCase()
          .includes(term)
      )
        return false;
      return true;
    });
  };

  const setAxis = (axis: keyof TargetingValue, ids: number[]) =>
    onChange({ ...value, [axis]: ids });

  const toggle = (axis: keyof TargetingValue, id: number) => {
    const current = value[axis];
    setAxis(
      axis,
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  };

  const count = (axis: keyof TargetingValue) => value[axis].length;
  const namedAnyItem = GROUPS.some((g) => count(g.axis) > 0);

  const summary = useMemo(() => {
    if (!options) return "";
    const items = namedAnyItem
      ? GROUPS.filter((g) => count(g.axis) > 0)
          .map(
            (g) =>
              `${count(g.axis)} of ${options[g.key].length} ${
                count(g.axis) === 1 ? g.one : g.label
              }`,
          )
          .join(" and ")
      : "every package, attraction and event";
    const venues = venueScope.length
      ? `${venueScope.length} of ${venueCount} venues`
      : `all ${venueCount} venues`;
    return `${items}, at ${venues}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, options]);

  if (error) {
    return (
      <View className="rounded-xl border border-red-100 bg-red-50 px-3 py-2.5">
        <Text className="text-xs text-red-600">{error}</Text>
      </View>
    );
  }

  if (!options) {
    return (
      <View className="py-8 items-center">
        <ActivityIndicator color={PRIMARY} />
      </View>
    );
  }

  return (
    <View className="gap-3">
      {/* What this currently applies to, in words. */}
      <View className="rounded-lg border border-blue-100 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-900/20 px-3 py-2">
        <Text className="text-xs text-blue-900 dark:text-blue-200">
          Shown on <Text className="font-semibold">{summary}</Text>.
        </Text>
        <Text className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
          A list left on “all” keeps covering items you add later. Naming items
          covers only those.
        </Text>
      </View>

      {/* Search across every item list below. */}
      <View className="flex-row items-center gap-2 rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2.5">
        <Feather name="search" size={15} color="#9CA3AF" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          editable={!disabled}
          placeholder="Search packages, attractions, events…"
          placeholderTextColor="#9CA3AF"
          className="flex-1 text-sm text-gray-900 dark:text-white"
          style={{ paddingVertical: 0 }}
        />
        {search.length > 0 && (
          <Pressable
            onPress={() => setSearch("")}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Feather name="x" size={14} color="#9CA3AF" />
          </Pressable>
        )}
      </View>

      {/* Category chips — scrolled sideways, since a phone can't wrap eight. */}
      {categories.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, alignItems: "center" }}
        >
          <Text className="text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mr-1">
            Category
          </Text>
          {categories.map((category) => {
            const on = categoryFilter.includes(category);
            return (
              <Pressable
                key={category}
                disabled={disabled}
                onPress={() =>
                  setCategoryFilter((prev) =>
                    prev.includes(category)
                      ? prev.filter((x) => x !== category)
                      : [...prev, category],
                  )
                }
                className={`px-2.5 py-1 rounded-full border ${
                  on
                    ? "bg-[#0644C7] border-[#0644C7]"
                    : "bg-white dark:bg-neutral-900 border-gray-300 dark:border-neutral-700"
                }`}
              >
                <Text
                  className={`text-xs font-medium ${
                    on ? "text-white" : "text-gray-600 dark:text-gray-300"
                  }`}
                >
                  {category}
                </Text>
              </Pressable>
            );
          })}
          {categoryFilter.length > 0 && (
            <Pressable onPress={() => setCategoryFilter([])} className="ml-1">
              <Text className="text-xs text-gray-500 dark:text-gray-400 underline">
                show all categories
              </Text>
            </Pressable>
          )}
        </ScrollView>
      )}

      {/* Venues — the scope, and the filter for every list below it. */}
      <View className="rounded-lg border border-gray-200 dark:border-neutral-700 overflow-hidden">
        <SectionHeader
          icon="map-pin"
          title="Venues"
          note={
            venueScope.length
              ? `${venueScope.length} of ${venueCount} chosen`
              : `all ${venueCount} venues`
          }
        >
          {venueScope.length > 0 && (
            <LinkAction
              label={`Apply to all ${venueCount} venues`}
              disabled={disabled}
              onPress={() => setAxis("locationIds", [])}
            />
          )}
        </SectionHeader>

        {options.venues.length === 0 ? (
          <Text className="px-3 py-3 text-xs text-gray-500 dark:text-gray-400">
            No venues available.
          </Text>
        ) : (
          <ScrollView
            style={{ maxHeight: 176 }}
            nestedScrollEnabled
            className="p-1.5"
          >
            {options.venues.map((venue) => (
              <CheckRow
                key={venue.id}
                checked={venueScope.includes(venue.id)}
                name={venue.name}
                disabled={disabled}
                onPress={() => toggle("locationIds", venue.id)}
              />
            ))}
          </ScrollView>
        )}

        {venueScope.length > 0 && (
          <Text className="px-3 py-2 text-[11px] text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-neutral-700">
            The lists below now show only what{" "}
            {venueScope.length === 1 ? "this venue sells" : "these venues sell"}.
          </Text>
        )}
      </View>

      {/* Packages · Attractions · Events */}
      {GROUPS.map((group) => {
        const items = visibleItems(options[group.key]);
        const chosen = count(group.axis);
        const total = options[group.key].length;
        const shownIds = items.map((i) => i.id);
        const allShownChosen =
          items.length > 0 && shownIds.every((id) => value[group.axis].includes(id));

        const note = chosen
          ? `${chosen} of ${total} chosen`
          : namedAnyItem
            ? `not shown on any ${group.one}`
            : items.length === total
              ? `all ${total} ${group.label}`
              : `all ${total} ${group.label} · ${items.length} shown here`;

        return (
          <View
            key={group.axis}
            className="rounded-lg border border-gray-200 dark:border-neutral-700 overflow-hidden"
          >
            <SectionHeader
              icon={group.icon}
              title={group.label.charAt(0).toUpperCase() + group.label.slice(1)}
              note={note}
            >
              <LinkAction
                label={
                  allShownChosen
                    ? `Remove these ${items.length}`
                    : `Choose these ${items.length}`
                }
                disabled={disabled || items.length === 0}
                onPress={() => {
                  const current = value[group.axis];
                  setAxis(
                    group.axis,
                    allShownChosen
                      ? current.filter((id) => !shownIds.includes(id))
                      : [...new Set([...current, ...shownIds])],
                  );
                }}
              />
              {chosen > 0 && (
                <LinkAction
                  label={`Apply to all ${group.label}`}
                  muted
                  disabled={disabled}
                  onPress={() => setAxis(group.axis, [])}
                />
              )}
            </SectionHeader>

            {items.length === 0 ? (
              <Text className="px-3 py-3 text-xs text-gray-500 dark:text-gray-400">
                {total === 0
                  ? `No ${group.label} exist yet.`
                  : `No ${group.label} match this search, category or venue.`}
              </Text>
            ) : (
              <ScrollView
                style={{ maxHeight: 232 }}
                nestedScrollEnabled
                className="p-1.5"
              >
                {items.map((item) => (
                  <CheckRow
                    key={item.id}
                    checked={value[group.axis].includes(item.id)}
                    name={item.name}
                    subtitle={
                      `${venueName[item.locationId] ?? `Venue ${item.locationId}`}` +
                      (item.category ? ` · ${item.category}` : "")
                    }
                    disabled={disabled}
                    onPress={() => toggle(group.axis, item.id)}
                  />
                ))}
              </ScrollView>
            )}
          </View>
        );
      })}

      {/* Everything named so far, each chip tappable to remove. */}
      {namedAnyItem && (
        <View className="flex-row items-start gap-2 rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/60 px-3 py-2">
          <Feather name="check" size={14} color="#16A34A" style={{ marginTop: 3 }} />
          <View className="flex-1 flex-row flex-wrap gap-1.5">
            {GROUPS.flatMap((g) =>
              value[g.axis].map((id) => {
                const item = options[g.key].find((i) => i.id === id);
                return (
                  <Pressable
                    key={`${g.axis}-${id}`}
                    disabled={disabled}
                    onPress={() => toggle(g.axis, id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${item?.name ?? id}`}
                    className="flex-row items-center gap-1 px-2 py-0.5 rounded-full border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-900"
                  >
                    <Text className="text-xs text-gray-700 dark:text-gray-200">
                      {item?.name ?? `#${id}`}
                    </Text>
                    <Feather name="x" size={11} color="#9CA3AF" />
                  </Pressable>
                );
              }),
            )}
          </View>
        </View>
      )}
    </View>
  );
}
