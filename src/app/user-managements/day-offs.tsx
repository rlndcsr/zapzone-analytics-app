import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";
import { type ComponentProps, useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "../../components/ui/BottomSheet";
import { DatePickerSheet } from "../../components/ui/DatePickerSheet";
import { FilterPill, PillSegment } from "../../components/ui/FilterPill";
import { SelectField, type SelectOption } from "../../components/ui/FormControls";
import { Pagination } from "../../components/ui/Pagination";
import { TimePickerSheet } from "../../components/ui/TimePickerSheet";
import { DayOffHistoryList } from "../../components/dayOffs/DayOffHistoryList";
import {
  describeBlockedPeriod,
  describeOperatingWindow,
  operatingWindowError,
} from "../../lib/dayOffClosure";
import {
  blockFormError,
  blockPayload,
  type BlockFormInput,
  type WindowChoice,
} from "../../lib/dayOffs/blockForm";
import { useDayOffs } from "../../lib/hooks/useDayOffs";
import { useLocationOptions } from "../../lib/hooks/useLocationOptions";
import { getCurrentUser, getToken } from "../../lib/session";
import { fetchAttractions } from "../../services/attractionsService";
import { fetchRooms } from "../../services/bookingsService";
import { fetchEvents } from "../../services/eventsService";
import { fetchPackages } from "../../services/packagesService";
import {
  bulkDeleteDayOffs,
  createDayOff,
  deleteDayOff,
  updateDayOff,
  type BlockScope,
  type DayOff,
  type DayOffFilters,
} from "../../services/dayOffsService";

const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const PER_PAGE_OPTIONS = [5, 10, 25, 50];

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/* ----------------------------------------------------------- filter options -- */

type DateRange = "upcoming" | "all";
type TypeFilter = "all" | "recurring" | "one-time";
type SortBy = "date" | "created_at";
type SortOrder = "asc" | "desc";

const DATE_RANGE_OPTIONS: { label: string; value: DateRange }[] = [
  { label: "Upcoming Only", value: "upcoming" },
  { label: "All Dates", value: "all" },
];
const TYPE_OPTIONS: { label: string; value: TypeFilter }[] = [
  { label: "All Types", value: "all" },
  { label: "Recurring Only", value: "recurring" },
  { label: "One-time Only", value: "one-time" },
];
const SORT_BY_OPTIONS: { label: string; value: SortBy }[] = [
  { label: "Date", value: "date" },
  { label: "Created", value: "created_at" },
];
const SORT_ORDER_OPTIONS: { label: string; value: SortOrder }[] = [
  { label: "Ascending", value: "asc" },
  { label: "Descending", value: "desc" },
];

/** What a block applies to — one kind of item per block (web BlockingScope). */
type BlockingScope = BlockScope;
type ResourceOption = { id: number; name: string; locationName?: string };

/** Same five tiles, order and copy as the web block form's scope grid. */
const SCOPE_OPTIONS: {
  value: BlockingScope;
  title: string;
  sub: string;
  icon: ComponentProps<typeof Feather>["name"];
}[] = [
  { value: "location", title: "Entire location", sub: "Everything at this location", icon: "home" },
  { value: "packages", title: "Birthday packages", sub: "Choose packages", icon: "package" },
  { value: "rooms", title: "Rooms", sub: "Choose rooms / spaces", icon: "columns" },
  { value: "attractions", title: "Attractions", sub: "Choose one or more", icon: "grid" },
  { value: "events", title: "Events", sub: "Choose events", icon: "calendar" },
];

/** Which id list each scope requires the user to fill in. */
const SCOPE_REQUIRES: Record<
  BlockingScope,
  ("packages" | "rooms" | "attractions" | "events")[]
> = {
  location: [],
  packages: ["packages"],
  rooms: ["rooms"],
  attractions: ["attractions"],
  events: ["events"],
};

const RESOURCE_LABEL = {
  packages: { title: "Select Packages", loading: "Loading packages...", empty: "No active packages found", error: "Please select at least one package." },
  rooms: { title: "Select Spaces", loading: "Loading spaces...", empty: "No available spaces found", error: "Please select at least one space." },
  attractions: { title: "Select Attractions", loading: "Loading attractions...", empty: "No active attractions found", error: "Please select at least one attraction." },
  events: { title: "Select Events", loading: "Loading events...", empty: "No active events found", error: "Please select at least one event." },
} as const;

/* ------------------------------------------------------------------ dates -- */

/** Local date as YYYY-MM-DD. */
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function prettyDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "14:30" → "2:30 PM"; empty stays empty so the field shows its placeholder. */
function prettyTime(time: string): string {
  if (!time) return "";
  const [hStr, mStr] = time.split(":");
  const h = Number(hStr);
  const m = Number(mStr ?? 0);
  if (Number.isNaN(h) || Number.isNaN(m)) return time;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/** Grid cells for a month: leading nulls + YYYY-MM-DD day keys. */
function monthGridCells(viewMonth: Date): (string | null)[] {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const leading = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array.from({ length: leading }, () => null);
  for (let d = 1; d <= days; d += 1) cells.push(ymd(new Date(year, month, d)));
  return cells;
}

function isPastYmd(dateStr: string): boolean {
  return dateStr < ymd(new Date());
}

/* ------------------------------------------------------------- components -- */

/** Field label with the web's red required asterisk. */
function FieldLabel({
  children,
  required = false,
}: {
  children: string;
  required?: boolean;
}) {
  return (
    <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
      {children}
      {required && <Text className="text-red-500"> *</Text>}
    </Text>
  );
}

/** An amber heads-up above the form (older-format or mixed-scope blocks). */
function Notice({ children }: { children: string }) {
  return (
    <View className="flex-row gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 mb-3 dark:border-amber-900/40 dark:bg-amber-900/20">
      <Feather name="alert-triangle" size={14} color="#B45309" style={{ marginTop: 2 }} />
      <Text className="flex-1 text-sm text-amber-900 dark:text-amber-200">{children}</Text>
    </View>
  );
}

/** The web's grey bordered panel that wraps a group of related fields. */
function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <View className="rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/40 p-4 mb-4">
      {children}
    </View>
  );
}

/**
 * The web's LocationSelector rendered as a two-column card grid — the picker is
 * inline in the form (not a separate sheet) so it matches the web modal.
 */
function LocationGrid({
  locations,
  selectedId,
  onSelect,
}: {
  locations: { id: number; name: string }[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <>
      <View className="flex-row items-center gap-1.5 mb-2">
        <Feather name="map-pin" size={13} color="#6B7280" />
        <Text className="text-xs font-medium text-gray-500 dark:text-gray-400">
          Select Location
        </Text>
      </View>
      <View className="flex-row flex-wrap -mx-1">
        {locations.map((loc) => {
          const active = selectedId === loc.id;
          return (
            <View key={loc.id} className="w-1/2 px-1 mb-2">
              <Pressable
                onPress={() => onSelect(loc.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                className={`flex-row items-center gap-2 rounded-xl border p-2.5 ${
                  active
                    ? "border-[#0644C7] bg-blue-50 dark:bg-blue-900/20"
                    : "border-gray-200 dark:border-neutral-700"
                }`}
              >
                <View
                  className={`w-8 h-8 rounded-lg items-center justify-center ${
                    active ? "bg-[#0644C7]" : "bg-blue-50 dark:bg-blue-900/20"
                  }`}
                >
                  <Feather
                    name="user"
                    size={15}
                    color={active ? "#FFFFFF" : PRIMARY}
                  />
                </View>
                <Text
                  className={`flex-1 text-xs font-semibold ${
                    active
                      ? "text-[#0644C7]"
                      : "text-gray-800 dark:text-gray-100"
                  }`}
                  numberOfLines={1}
                >
                  {loc.name}
                </Text>
                {active && (
                  <Feather name="check-circle" size={14} color={PRIMARY} />
                )}
              </Pressable>
            </View>
          );
        })}
      </View>
    </>
  );
}

/** Scrollable checkbox list of packages / spaces / attractions / events. */
function ResourceChecklist({
  kind,
  options,
  selectedIds,
  loading,
  showLocation,
  onToggle,
}: {
  kind: keyof typeof RESOURCE_LABEL;
  options: ResourceOption[];
  selectedIds: Set<number>;
  loading: boolean;
  showLocation: boolean;
  onToggle: (id: number) => void;
}) {
  const label = RESOURCE_LABEL[kind];
  return (
    <View className="mb-3">
      <Text className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
        {label.title}
        <Text className="text-red-500"> *</Text>
      </Text>
      {loading ? (
        <Text className="text-sm text-gray-500 dark:text-gray-400 py-2">
          {label.loading}
        </Text>
      ) : options.length === 0 ? (
        <Text className="text-sm text-gray-500 dark:text-gray-400 py-2">
          {label.empty}
        </Text>
      ) : (
        // max-h mirrors the web's `max-h-32 overflow-y-auto` scroll box.
        <View className="rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 overflow-hidden">
          <ScrollView
            style={{ maxHeight: 168 }}
            nestedScrollEnabled
            showsVerticalScrollIndicator
          >
            {options.map((option, idx) => {
              const checked = selectedIds.has(option.id);
              return (
                <Pressable
                  key={option.id}
                  onPress={() => onToggle(option.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  className={`flex-row items-center gap-2.5 px-3.5 py-2.5 active:bg-gray-50 dark:active:bg-neutral-800 ${
                    idx > 0
                      ? "border-t border-gray-100 dark:border-neutral-800"
                      : ""
                  }`}
                >
                  <Feather
                    name={checked ? "check-square" : "square"}
                    size={18}
                    color={checked ? PRIMARY : "#9CA3AF"}
                  />
                  <View className="flex-1">
                    <Text
                      className="text-sm text-gray-700 dark:text-gray-100"
                      numberOfLines={1}
                    >
                      {option.name}
                    </Text>
                    {showLocation && !!option.locationName && (
                      <Text
                        className="text-xs text-gray-400 dark:text-gray-500"
                        numberOfLines={1}
                      >
                        {option.locationName}
                      </Text>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

/** Tappable read-only field that opens a picker sheet, with an optional clear. */
function PickerField({
  icon,
  value,
  placeholder,
  onPress,
  onClear,
}: {
  icon: ComponentProps<typeof Feather>["name"];
  value: string;
  placeholder: string;
  onPress: () => void;
  onClear?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-3.5 py-3 rounded-xl border border-gray-200 dark:border-neutral-700"
    >
      <Text
        className={`flex-1 text-sm ${
          value
            ? "text-gray-900 dark:text-white"
            : "text-gray-400 dark:text-gray-500"
        }`}
        numberOfLines={1}
      >
        {value || placeholder}
      </Text>
      {value && onClear ? (
        <Pressable onPress={onClear} hitSlop={10} accessibilityLabel="Clear">
          <Feather name="x" size={16} color="#9CA3AF" />
        </Pressable>
      ) : (
        <Feather name={icon} size={16} color="#9CA3AF" />
      )}
    </Pressable>
  );
}

const WINDOW_OPTIONS: {
  value: WindowChoice;
  title: string;
  sub: string;
  icon: ComponentProps<typeof Feather>["name"];
}[] = [
  { value: "full_day", title: "Closed all day", sub: "Full-day closure", icon: "sun" },
  {
    value: "operating_window",
    title: "Open for set hours",
    sub: "One continuous window; blocked outside it",
    icon: "clock",
  },
];

/**
 * "When" (web AvailabilityBlockForm): closed all day, or open only between
 * Opens at and Closes at — one window, blocked outside it — with the hours and
 * what they leave blocked in plain English beneath, or why it cannot be saved.
 */
function WindowFields({
  choice,
  opensAt,
  closesAt,
  onChoose,
  onPickOpens,
  onPickCloses,
  onClearOpens,
  onClearCloses,
}: {
  choice: WindowChoice | null;
  opensAt: string;
  closesAt: string;
  onChoose: (choice: WindowChoice) => void;
  onPickOpens: () => void;
  onPickCloses: () => void;
  onClearOpens: () => void;
  onClearCloses: () => void;
}) {
  const problem = choice === "operating_window" ? operatingWindowError(opensAt, closesAt) : null;
  return (
    <>
      <View className="gap-2 mb-1">
        {WINDOW_OPTIONS.map((opt) => {
          const active = choice === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChoose(opt.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              className={`flex-row items-start gap-2 rounded-xl border-2 p-3 ${
                active
                  ? "border-[#0644C7] bg-blue-50 dark:bg-blue-900/20"
                  : "border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
              }`}
            >
              <Feather name={opt.icon} size={16} color={active ? PRIMARY : "#6B7280"} />
              <View className="flex-1">
                <Text className="text-sm font-medium text-gray-900 dark:text-white">{opt.title}</Text>
                <Text className="text-[11px] text-gray-500 dark:text-gray-400">{opt.sub}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {choice === "operating_window" && (
        <View className="flex-row gap-3 mt-2">
          <View className="flex-1">
            <Text className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Opens at
            </Text>
            <PickerField
              icon="clock"
              value={prettyTime(opensAt)}
              placeholder="--:-- --"
              onPress={onPickOpens}
              onClear={onClearOpens}
            />
            <Text className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
              Leave blank to open at the usual time.
            </Text>
          </View>
          <View className="flex-1">
            <Text className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Closes at
            </Text>
            <PickerField
              icon="clock"
              value={prettyTime(closesAt)}
              placeholder="--:-- --"
              onPress={onPickCloses}
              onClear={onClearCloses}
            />
            <Text className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
              Leave blank to close at the usual time. 12:00 AM means midnight.
            </Text>
          </View>
        </View>
      )}
      {choice === "operating_window" && problem && (opensAt || closesAt) ? (
        <Text className="text-xs text-red-600 dark:text-red-400 mt-2">{problem}</Text>
      ) : choice === "operating_window" && !problem ? (
        <Text className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          {`${describeOperatingWindow(opensAt, closesAt)} · ${describeBlockedPeriod(opensAt, closesAt)}`}
        </Text>
      ) : choice === "full_day" ? (
        <Text className="text-xs text-gray-500 dark:text-gray-400 mt-2">Closed all day</Text>
      ) : null}
    </>
  );
}

/** Required group/event name and reason (web block form). */
function GroupAndReasonFields({
  groupName,
  reason,
  onGroupName,
  onReason,
}: {
  groupName: string;
  reason: string;
  onGroupName: (text: string) => void;
  onReason: (text: string) => void;
}) {
  const input =
    "rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-3 text-sm text-gray-900 dark:text-white";
  return (
    <>
      <FieldLabel required>Group or event name</FieldLabel>
      <TextInput
        value={groupName}
        onChangeText={onGroupName}
        maxLength={150}
        placeholder="e.g. Acme Corp holiday party"
        placeholderTextColor="#9CA3AF"
        className={`${input} mb-4`}
      />
      <FieldLabel required>Reason</FieldLabel>
      <TextInput
        value={reason}
        onChangeText={onReason}
        maxLength={255}
        placeholder="e.g. Private buyout, maintenance, holiday"
        placeholderTextColor="#9CA3AF"
        className={input}
      />
    </>
  );
}

/** The web's six-tile "What should be blocked?" grid. */
function ScopeGrid({
  scope,
  onChange,
}: {
  scope: BlockingScope | null;
  onChange: (scope: BlockingScope) => void;
}) {
  return (
    <View className="flex-row flex-wrap -mx-1 mb-1">
      {SCOPE_OPTIONS.map((opt) => {
        const active = scope === opt.value;
        return (
          <View key={opt.value} className="w-1/2 px-1 mb-2">
            <Pressable
              onPress={() => onChange(opt.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              className={`flex-row items-start gap-2 rounded-xl border-2 p-3 ${
                active
                  ? "border-[#0644C7] bg-blue-50 dark:bg-blue-900/20"
                  : "border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
              }`}
            >
              <Feather
                name={opt.icon}
                size={18}
                color={active ? PRIMARY : "#6B7280"}
              />
              <View className="flex-1">
                <Text
                  className={`text-sm font-medium ${
                    active ? "text-[#0644C7]" : "text-gray-900 dark:text-white"
                  }`}
                >
                  {opt.title}
                </Text>
                <Text className="text-[11px] text-gray-500 dark:text-gray-400">
                  {opt.sub}
                </Text>
              </View>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const DayOffCard = ({
  dayOff,
  showLocation,
  canManage,
  selectionMode,
  selected,
  onEdit,
  onDelete,
  onHistory,
  onToggleSelect,
}: {
  dayOff: DayOff;
  showLocation: boolean;
  canManage: boolean;
  selectionMode: boolean;
  selected: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onHistory: () => void;
  onToggleSelect: () => void;
}) => (
  <Pressable
    onPress={selectionMode ? onToggleSelect : undefined}
    className={`bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3 shadow-sm ${
      selectionMode && selected
        ? "border-2 border-[#0644C7]"
        : "border-2 border-transparent"
    }`}
    style={CARD_SHADOW}
  >
    <View className="flex-row items-start justify-between">
      <View className="flex-row items-center gap-2.5 flex-1">
        <View
          className={`w-9 h-9 rounded-xl items-center justify-center ${
            selectionMode
              ? selected
                ? "bg-[#0644C7]"
                : "bg-gray-100 dark:bg-neutral-800"
              : "bg-blue-50 dark:bg-blue-900/20"
          }`}
        >
          <Feather
            name={
              selectionMode
                ? selected
                  ? "check"
                  : "square"
                : "calendar"
            }
            size={18}
            color={selectionMode && selected ? "#FFFFFF" : PRIMARY}
          />
        </View>
        <Text
          className="text-base font-bold text-gray-900 dark:text-white flex-1"
          numberOfLines={1}
        >
          {prettyDate(dayOff.date)}
        </Text>
      </View>
      {canManage && !selectionMode && (
        <View className="flex-row items-center gap-1">
          <Pressable
            onPress={onHistory}
            hitSlop={8}
            className="p-2 rounded-full active:bg-gray-100 dark:active:bg-neutral-800"
            accessibilityLabel="Block history"
          >
            <Feather name="clock" size={16} color="#6B7280" />
          </Pressable>
          <Pressable
            onPress={onEdit}
            hitSlop={8}
            className="p-2 rounded-full active:bg-gray-100 dark:active:bg-neutral-800"
            accessibilityLabel="Edit day off"
          >
            <Feather name="edit-2" size={16} color="#6B7280" />
          </Pressable>
          <Pressable
            onPress={onDelete}
            hitSlop={8}
            className="p-2 rounded-full active:bg-red-50 dark:active:bg-red-900/20"
            accessibilityLabel="Delete day off"
          >
            <Feather name="trash-2" size={16} color="#EF4444" />
          </Pressable>
        </View>
      )}
    </View>

    <Text
      className={`mt-2 text-sm ${
        dayOff.groupName
          ? "font-semibold text-gray-900 dark:text-white"
          : "italic text-gray-400 dark:text-gray-500"
      }`}
      numberOfLines={2}
    >
      {dayOff.groupName ?? "No group or event name"}
    </Text>

    <View className="flex-row items-center flex-wrap gap-1.5 mt-3">
      <View
        className={`px-2 py-1 rounded-full ${
          dayOff.isLocationWide
            ? "bg-rose-100 dark:bg-rose-900/30"
            : "bg-indigo-100 dark:bg-indigo-900/30"
        }`}
      >
        <View className="flex-row items-center gap-1">
          <Feather
            name={dayOff.isLocationWide ? "lock" : "layers"}
            size={10}
            color={dayOff.isLocationWide ? "#E11D48" : "#6366F1"}
          />
          <Text
            className={`text-[10px] font-semibold ${
              dayOff.isLocationWide
                ? "text-rose-700 dark:text-rose-400"
                : "text-indigo-700 dark:text-indigo-400"
            }`}
          >
            {dayOff.scopeLabel}
          </Text>
        </View>
      </View>
      <View className="px-2 py-1 rounded-full bg-gray-100 dark:bg-neutral-800">
        <Text className="text-[10px] font-medium text-gray-600 dark:text-gray-300">
          {dayOff.durationLabel}
        </Text>
      </View>
      {dayOff.isRecurring && (
        <View className="px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30">
          <Text className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
            Recurring
          </Text>
        </View>
      )}
    </View>

    {(!!dayOff.reason || (showLocation && !!dayOff.locationName)) && (
      <View className="mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
        {!!dayOff.reason && (
          <Text className="text-sm text-gray-700 dark:text-gray-200">
            {dayOff.reason}
          </Text>
        )}
        {showLocation && !!dayOff.locationName && (
          <View className="flex-row items-center gap-1.5 mt-1">
            <Feather name="map-pin" size={12} color="#9CA3AF" />
            <Text className="text-xs text-gray-500 dark:text-gray-400" numberOfLines={1}>
              {dayOff.locationName}
            </Text>
          </View>
        )}
      </View>
    )}
    <View className="flex-row items-center gap-1.5 mt-2">
      <Feather name="user" size={12} color="#9CA3AF" />
      <Text className="flex-1 text-xs text-gray-500 dark:text-gray-400" numberOfLines={1}>
        Set by {dayOff.setByName ?? "not recorded"}
        {dayOff.lastChangedByName && dayOff.lastChangedByName !== dayOff.setByName
          ? ` · changed by ${dayOff.lastChangedByName}`
          : ""}
      </Text>
    </View>
  </Pressable>
);

/* --------------------------------------------------------------- form types -- */

/** The four selectable resource kinds, keyed the same way in state and payload. */
type ResourceKind = "packages" | "rooms" | "attractions" | "events";

type SelectionState = Record<ResourceKind, Set<number>>;

const emptySelection = (): SelectionState => ({
  packages: new Set<number>(),
  rooms: new Set<number>(),
  attractions: new Set<number>(),
  events: new Set<number>(),
});

type FormState = {
  id: number | null;
  /** YYYY-MM-DD; empty until the user picks one (required, like the web). */
  date: string;
  reason: string;
  groupName: string;
  locationId: number | null;
  isRecurring: boolean;
  /** Closed all day, or open only between opensAt and closesAt; null until chosen. */
  windowChoice: WindowChoice | null;
  opensAt: string;
  closesAt: string;
  /** Null until chosen, or for an older block that covered more than one kind. */
  scope: BlockingScope | null;
  selection: SelectionState;
  /** The block being edited, for the older-format and mixed-scope notices. */
  source: DayOff | null;
};

const emptyForm = (locationId: number | null): FormState => ({
  id: null,
  date: "",
  reason: "",
  groupName: "",
  locationId,
  isRecurring: false,
  windowChoice: null,
  opensAt: "",
  closesAt: "",
  scope: "location",
  selection: emptySelection(),
  source: null,
});

/** The form in the shape the shared block rules check and send (lib/dayOffs/blockForm). */
const blockInput = (
  f: Pick<FormState, "locationId" | "windowChoice" | "opensAt" | "closesAt" | "scope" | "selection" | "groupName" | "reason" | "isRecurring">,
): BlockFormInput => ({
  locationId: f.locationId,
  windowChoice: f.windowChoice,
  opensAt: f.opensAt,
  closesAt: f.closesAt,
  scope: f.scope,
  selected: {
    packages: [...f.selection.packages],
    rooms: [...f.selection.rooms],
    attractions: [...f.selection.attractions],
    events: [...f.selection.events],
  },
  groupName: f.groupName,
  reason: f.reason,
  isRecurring: f.isRecurring,
});

/* ------------------------------------------------------------------ screen -- */

const DayOffs = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  const currentUser = getCurrentUser();
  const role = currentUser?.role;
  const isCompanyAdmin = role === "company_admin";
  const canManage = isCompanyAdmin || role === "location_manager";
  const ownLocationId = currentUser?.location_id ?? null;

  // Filters
  const [locationFilter, setLocationFilter] = useState<number | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>("upcoming");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [sheet, setSheet] = useState<
    | null
    | "filters"
    | "form"
    | "formDate"
    | "formCloses"
    | "formOpens"
    | "bulk"
    | "bulkCloses"
    | "bulkOpens"
    | "history"
  >(null);
  // The block whose history is open; null shows every block's changes.
  const [historyFor, setHistoryFor] = useState<DayOff | null>(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState<FormState>(() => emptyForm(ownLocationId));
  const [saving, setSaving] = useState(false);

  // Selection mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Bulk add
  const [bulkDates, setBulkDates] = useState<Set<string>>(new Set());
  const [bulkMonth, setBulkMonth] = useState<Date>(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [bulkReason, setBulkReason] = useState("");
  const [bulkGroupName, setBulkGroupName] = useState("");
  const [bulkIsRecurring, setBulkIsRecurring] = useState(false);
  const [bulkWindowChoice, setBulkWindowChoice] = useState<WindowChoice | null>(null);
  const [bulkOpensAt, setBulkOpensAt] = useState("");
  const [bulkClosesAt, setBulkClosesAt] = useState("");
  const [bulkLocationId, setBulkLocationId] = useState<number | null>(
    ownLocationId,
  );
  const [bulkCreating, setBulkCreating] = useState(false);
  // "What should be blocked?" scope + selectable resources for the location.
  const [bulkScope, setBulkScope] = useState<BlockingScope | null>("location");
  const [bulkSelection, setBulkSelection] =
    useState<SelectionState>(emptySelection);
  const [resources, setResources] = useState<
    Record<ResourceKind, ResourceOption[]>
  >({ packages: [], rooms: [], attractions: [], events: [] });
  const [loadingResources, setLoadingResources] = useState(false);

  const { locations } = useLocationOptions();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [
    locationFilter,
    dateRange,
    typeFilter,
    sortBy,
    sortOrder,
    debouncedSearch,
    perPage,
  ]);

  const filters = useMemo<DayOffFilters>(
    () => ({
      search: debouncedSearch || undefined,
      locationId:
        isCompanyAdmin && locationFilter != null ? locationFilter : undefined,
      upcomingOnly: dateRange === "upcoming",
      isRecurring: typeFilter === "all" ? undefined : typeFilter === "recurring",
      sortBy,
      sortOrder,
    }),
    [
      debouncedSearch,
      isCompanyAdmin,
      locationFilter,
      dateRange,
      typeFilter,
      sortBy,
      sortOrder,
    ],
  );

  const { dayOffs, total, loading, error, refetch } = useDayOffs({
    filters,
    page,
    perPage,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  /* ---- single create / edit ---- */

  const openCreate = useCallback(() => {
    // Company admins start on the filtered location (or the first one), the
    // same default the web modal opens with — so the resource lists load
    // straight away instead of waiting on a location tap.
    setForm(
      emptyForm(
        isCompanyAdmin
          ? (locationFilter ?? locations[0]?.id ?? null)
          : ownLocationId,
      ),
    );
    setSheet("form");
  }, [isCompanyAdmin, ownLocationId, locationFilter, locations]);

  const openEdit = useCallback((d: DayOff) => {
    // An older closed-hours block has to be re-chosen as a full day or one window (web form).
    const windowChoice: WindowChoice | null =
      d.blockType === "legacy_closure" ? null : d.blockType;
    setForm({
      id: d.id,
      date: d.date || ymd(new Date()),
      reason: d.reason ?? "",
      groupName: d.groupName ?? "",
      locationId: d.locationId,
      isRecurring: d.isRecurring,
      windowChoice,
      opensAt: d.opensAt ?? "",
      closesAt: d.closesAt ?? "",
      // A block that covered more than one kind keeps only the kind chosen now.
      scope: d.scope === "mixed" ? null : d.scope,
      source: d,
      selection: {
        packages: new Set(d.packageIds),
        rooms: new Set(d.roomIds),
        attractions: new Set(d.attractionIds),
        events: new Set(d.eventIds),
      },
    });
    setSheet("form");
  }, []);

  const confirmDelete = useCallback(
    (d: DayOff) => {
      Alert.alert(
        "Delete day off",
        `Remove the block on ${prettyDate(d.date)}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                await deleteDayOff(getToken() ?? "", d.id);
                refetch();
              } catch (err) {
                Alert.alert(
                  "Delete failed",
                  err instanceof Error ? err.message : "Could not delete this day off.",
                );
              }
            },
          },
        ],
      );
    },
    [refetch],
  );

  const saveForm = useCallback(async () => {
    if (saving) return;
    const input = blockInput(form);
    const problem = blockFormError(input, form.date ? [form.date] : []);
    if (problem) {
      Alert.alert("Check the block", problem);
      return;
    }
    // An edit sends the whole block, as the web form does.
    const payload = blockPayload(input, form.date);

    setSaving(true);
    try {
      if (form.id != null) {
        await updateDayOff(getToken() ?? "", form.id, payload);
      } else {
        await createDayOff(getToken() ?? "", payload);
      }
      setSheet(null);
      refetch();
    } catch (err) {
      Alert.alert(
        "Save failed",
        err instanceof Error ? err.message : "Could not save this block.",
      );
    } finally {
      setSaving(false);
    }
  }, [form, saving, refetch]);

  /* ---- selection mode ---- */

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode((m) => !m);
    setSelectedIds(new Set());
  }, []);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allSelected = dayOffs.length > 0 && selectedIds.size === dayOffs.length;
  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.size === dayOffs.length ? new Set() : new Set(dayOffs.map((d) => d.id)),
    );
  }, [dayOffs]);

  const confirmBulkDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    const ids = [...selectedIds];
    Alert.alert(
      "Delete day offs",
      `Delete ${ids.length} day off${ids.length === 1 ? "" : "s"}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await bulkDeleteDayOffs(getToken() ?? "", ids);
              setSelectionMode(false);
              setSelectedIds(new Set());
              refetch();
            } catch (err) {
              Alert.alert(
                "Delete failed",
                err instanceof Error ? err.message : "Could not delete the selected day offs.",
              );
            }
          },
        },
      ],
    );
  }, [selectedIds, refetch]);

  /* ---- bulk add ---- */

  const openBulk = useCallback(() => {
    const n = new Date();
    setBulkMonth(new Date(n.getFullYear(), n.getMonth(), 1));
    setBulkDates(new Set());
    setBulkReason("");
    setBulkGroupName("");
    setBulkIsRecurring(false);
    setBulkWindowChoice(null);
    setBulkOpensAt("");
    setBulkClosesAt("");
    setBulkScope("location");
    setBulkSelection(emptySelection());
    setBulkLocationId(isCompanyAdmin ? (locations[0]?.id ?? null) : ownLocationId);
    setSheet("bulk");
  }, [isCompanyAdmin, ownLocationId, locations]);

  // Load packages, spaces, attractions and events for the "What should be
  // blocked?" scope selector whenever the create/edit form OR the bulk sheet is
  // open (and on location change). Mirrors the web's four-way Promise.all;
  // reuses the existing mobile services — no backend change. Selections are
  // cleared by the location pickers (not here) so an edit's pre-selected ids
  // survive the initial load. Nested picker sheets ("formDate", "formTimeStart",
  // …) keep the form's location so the lists aren't dropped and refetched.
  const inFormFlow = sheet != null && sheet.startsWith("form");
  const inBulkFlow = sheet != null && sheet.startsWith("bulk");
  const resourceLocationId = inFormFlow
    ? form.locationId
    : inBulkFlow
      ? bulkLocationId
      : null;
  const userId = currentUser?.id;
  useEffect(() => {
    if (resourceLocationId == null) return;
    const token = getToken();
    if (!token) return;
    const controller = new AbortController();
    setLoadingResources(true);
    Promise.all([
      fetchPackages({
        token,
        userId,
        locationId: resourceLocationId,
        signal: controller.signal,
      }).catch(() => []),
      fetchRooms(token, resourceLocationId).catch(() => []),
      // The attractions/events endpoints scope by user, so they need an id.
      userId == null
        ? Promise.resolve([])
        : fetchAttractions({
            token,
            userId,
            locationId: resourceLocationId,
            isActive: true,
            signal: controller.signal,
          }).catch(() => []),
      userId == null
        ? Promise.resolve([])
        : fetchEvents({
            token,
            userId,
            locationId: resourceLocationId,
            signal: controller.signal,
          }).catch(() => []),
    ])
      .then(([pkgs, rooms, attractions, events]) => {
        if (controller.signal.aborted) return;
        setResources({
          // The mobile packages endpoint has no is_active filter, so drop
          // inactive rows here to match the web's `is_active: true` query.
          packages: pkgs
            .filter((p) => p.status === "active")
            .map((p) => ({
              id: p.id,
              name: p.name,
              locationName: p.locationName,
            })),
          rooms: rooms.map((r) => ({ id: r.id, name: r.name })),
          attractions: attractions.map((a) => ({
            id: a.id,
            name: a.name,
            locationName: a.locationName,
          })),
          events: events
            .filter((e) => e.status === "active")
            .map((e) => ({
              id: e.id,
              name: e.name,
              locationName: e.locationName,
            })),
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingResources(false);
      });
    return () => controller.abort();
  }, [resourceLocationId, userId]);

  const toggleBulkDate = useCallback((key: string) => {
    setBulkDates((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const bulkCells = useMemo(() => monthGridCells(bulkMonth), [bulkMonth]);

  /** Flip one id inside one resource kind of a SelectionState. */
  const toggleIn = (
    selection: SelectionState,
    kind: ResourceKind,
    id: number,
  ): SelectionState => {
    const next = new Set(selection[kind]);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return { ...selection, [kind]: next };
  };

  const toggleFormResource = useCallback((kind: ResourceKind, id: number) => {
    setForm((f) => ({ ...f, selection: toggleIn(f.selection, kind, id) }));
  }, []);

  const toggleBulkResource = useCallback((kind: ResourceKind, id: number) => {
    setBulkSelection((prev) => toggleIn(prev, kind, id));
  }, []);

  const bulkCreate = useCallback(async () => {
    if (bulkCreating) return;
    const input = blockInput({
      locationId: bulkLocationId,
      windowChoice: bulkWindowChoice,
      opensAt: bulkOpensAt,
      closesAt: bulkClosesAt,
      scope: bulkScope,
      selection: bulkSelection,
      groupName: bulkGroupName,
      reason: bulkReason,
      isRecurring: bulkIsRecurring,
    });
    const dates = [...bulkDates].sort();
    const problem = blockFormError(input, dates);
    if (problem) {
      Alert.alert("Check the block", problem);
      return;
    }

    setBulkCreating(true);
    const failures: { date: string; message: string }[] = [];
    // The web bulk-add loops createDayOff per selected date (no batch endpoint)
    // and tolerates partial failures — mirror that exactly.
    for (const date of dates) {
      try {
        await createDayOff(getToken() ?? "", blockPayload(input, date));
      } catch (err) {
        failures.push({
          date,
          message: err instanceof Error && err.message ? err.message : "Could not save this date.",
        });
      }
    }
    setBulkCreating(false);
    refetch();
    const created = dates.length - failures.length;
    if (failures.length === 0) {
      setSheet(null);
      Alert.alert("Bulk add complete", `Blocked ${created} date${created === 1 ? "" : "s"}.`);
      return;
    }
    // Web parity: the dates that did not save stay selected, with why.
    setBulkDates(new Set(failures.map((f) => f.date)));
    Alert.alert(
      created > 0 ? "Some dates were not saved" : "None of the dates were saved",
      `${created > 0 ? `Blocked ${created} date${created === 1 ? "" : "s"}. The dates still selected were not saved.\n\n` : ""}${failures
        .map((f) => `${prettyDate(f.date)}: ${f.message}`)
        .join("\n")}`,
    );
  }, [
    bulkCreating,
    bulkLocationId,
    bulkDates,
    bulkScope,
    bulkSelection,
    bulkWindowChoice,
    bulkOpensAt,
    bulkClosesAt,
    bulkGroupName,
    bulkReason,
    bulkIsRecurring,
    refetch,
  ]);

  /* ---- filters ---- */

  const clearFilters = useCallback(() => {
    setDateRange("upcoming");
    setTypeFilter("all");
    setSortBy("date");
    setSortOrder("asc");
    setLocationFilter(null);
    setSearch("");
    setDebouncedSearch("");
    setPage(1);
  }, []);

  const hasActiveFilters =
    dateRange !== "upcoming" ||
    typeFilter !== "all" ||
    sortBy !== "date" ||
    sortOrder !== "asc" ||
    locationFilter != null ||
    search.trim() !== "";

  /** Non-default filters — drives the "Filters (N)" pill badge. Search isn't
   *  counted: it has its own visible field above the pill. */
  const activeFilterCount =
    (dateRange !== "upcoming" ? 1 : 0) +
    (typeFilter !== "all" ? 1 : 0) +
    (sortBy !== "date" ? 1 : 0) +
    (sortOrder !== "asc" ? 1 : 0) +
    (locationFilter != null ? 1 : 0);

  /** Location options for the filter panel ("All Locations" + each location). */
  const locationFilterOptions: SelectOption[] = [
    { label: "All Locations", value: 0 },
    ...locations.map((l) => ({ label: l.name, value: l.id })),
  ];

  /** Which resource checklists the current scope needs, in the web's order. */
  const formResourceKinds = form.scope ? SCOPE_REQUIRES[form.scope] : [];
  const bulkResourceKinds = bulkScope ? SCOPE_REQUIRES[bulkScope] : [];
  // Saves are recorded against the signed-in employee (web "Recorded as").
  const recordedAs =
    [currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(" ") ||
    currentUser?.email ||
    "you";

  // Editing an existing past-dated day off must keep that date reachable, so the
  // calendar's floor is the earlier of today and the date already on the record.
  const formMinDate =
    form.date && form.date < ymd(new Date()) ? form.date : ymd(new Date());

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header */}
      <View className="bg-white dark:bg-neutral-900 pt-12 pb-5 px-5 w-full relative overflow-hidden z-10 border-b border-gray-100 dark:border-neutral-800">
        <View className="flex-row items-center justify-between relative z-10">
          <Pressable
            onPress={() => router.back()}
            className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Feather name="chevron-left" size={20} color={headerIcon} />
          </Pressable>
          <Text className="text-gray-900 dark:text-white text-lg font-bold">
            Day Offs
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
            progressBackgroundColor="#FFFFFF"
          />
        }
      >
        <View className="px-5">
          {/* Intro */}
          <View className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mt-6 mb-5 shadow-sm">
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Day Offs
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Manage blocked dates and holidays for your locations
            </Text>
          </View>

          {/* Top actions — Select, Bulk Add, Add Day Off (mirrors the web toolbar) */}
          {canManage && (
            <View className="mb-5">
              <View className="flex-row gap-3 mb-3">
                {dayOffs.length > 0 && (
                  <Pressable
                    onPress={toggleSelectionMode}
                    className={`flex-1 h-12 rounded-xl items-center justify-center flex-row gap-2 border ${
                      selectionMode
                        ? "border-[#0644C7] bg-blue-50 dark:bg-blue-900/20"
                        : "border-gray-200 dark:border-neutral-700"
                    }`}
                  >
                    <Feather
                      name={selectionMode ? "x" : "check-square"}
                      size={16}
                      color={PRIMARY}
                    />
                    <Text
                      numberOfLines={1}
                      className="text-gray-700 dark:text-gray-200 font-semibold text-sm"
                    >
                      {selectionMode ? "Cancel" : "Select"}
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={openBulk}
                  className="flex-1 h-12 rounded-xl items-center justify-center flex-row gap-2 border border-gray-200 dark:border-neutral-700"
                >
                  <Feather name="calendar" size={16} color={PRIMARY} />
                  <Text
                    numberOfLines={1}
                    className="text-gray-700 dark:text-gray-200 font-semibold text-sm"
                  >
                    Bulk Add
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setHistoryFor(null);
                    setSheet("history");
                  }}
                  className="flex-1 h-12 rounded-xl items-center justify-center flex-row gap-2 border border-gray-200 dark:border-neutral-700"
                  accessibilityRole="button"
                  accessibilityLabel="Change history"
                >
                  <Feather name="clock" size={16} color={PRIMARY} />
                  <Text
                    numberOfLines={1}
                    className="text-gray-700 dark:text-gray-200 font-semibold text-sm"
                  >
                    History
                  </Text>
                </Pressable>
              </View>
              <Pressable
                onPress={openCreate}
                className="h-12 rounded-xl items-center justify-center flex-row gap-2 bg-[#0644C7]"
                accessibilityRole="button"
                accessibilityLabel="Add Day Off"
              >
                <Feather name="plus" size={18} color="#FFFFFF" />
                <Text
                  numberOfLines={1}
                  className="text-white font-semibold text-base"
                >
                  Add Day Off
                </Text>
              </Pressable>
            </View>
          )}

          {/* Error state */}
          {!loading && error && (
            <View className="bg-red-50 border border-red-100 rounded-2xl p-5 mb-5">
              <Text className="text-red-600 font-semibold">Something went wrong</Text>
              <Text className="text-red-500 text-sm mt-1">{error}</Text>
            </View>
          )}

          {/* Search */}
          <View className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3 rounded-xl border border-gray-100 dark:border-neutral-800 mb-3">
            <Feather name="search" size={16} color="#9CA3AF" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search by date or reason..."
              placeholderTextColor="#9CA3AF"
              className="flex-1 text-sm text-gray-900 dark:text-white"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <Feather name="x" size={16} color="#9CA3AF" />
              </Pressable>
            )}
          </View>

          {/* Filters — one pill opening the full panel (same as the catalog
              screens); every filter lives inside the sheet. */}
          <FilterPill>
            <PillSegment
              label={
                activeFilterCount > 0
                  ? `Filters (${activeFilterCount})`
                  : "Filters"
              }
              active={sheet === "filters" || activeFilterCount > 0}
              onPress={() => setSheet("filters")}
              renderIcon={(c) => <Feather name="sliders" size={15} color={c} />}
            />
          </FilterPill>

          {/* Selection bulk-action bar */}
          {selectionMode && dayOffs.length > 0 && (
            <View
              className="flex-row items-center justify-between bg-white dark:bg-neutral-900 rounded-xl px-4 py-3 border border-gray-100 dark:border-neutral-800 mb-4"
              style={CARD_SHADOW}
            >
              <Pressable
                onPress={toggleSelectAll}
                className="flex-row items-center gap-2"
                hitSlop={8}
              >
                <Feather
                  name={allSelected ? "check-square" : "square"}
                  size={18}
                  color={PRIMARY}
                />
                <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  Select All
                </Text>
              </Pressable>
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                {selectedIds.size} selected
              </Text>
              <Pressable
                onPress={confirmBulkDelete}
                disabled={selectedIds.size === 0}
                className={`flex-row items-center gap-1.5 px-3 py-2 rounded-lg ${
                  selectedIds.size === 0
                    ? "opacity-40"
                    : "bg-red-50 dark:bg-red-900/20"
                }`}
              >
                <Feather name="trash-2" size={15} color="#EF4444" />
                <Text className="text-sm font-semibold text-red-600">
                  Delete {selectedIds.size}
                </Text>
              </Pressable>
            </View>
          )}

          {/* List header */}
          {!loading && !error && !selectionMode && (
            <View className="flex-row items-center gap-2 mb-4">
              <Text
                numberOfLines={1}
                className="shrink text-lg font-bold text-gray-900 dark:text-white"
              >
                Day Offs
              </Text>
              <View className="shrink-0 bg-gray-100 dark:bg-neutral-800 px-2.5 py-0.5 rounded-full">
                <Text className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  {total}
                </Text>
              </View>
            </View>
          )}

          {/* List / states */}
          {loading ? (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl p-10 items-center shadow-sm">
              <ActivityIndicator color={PRIMARY} />
            </View>
          ) : !error && dayOffs.length === 0 ? (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl p-8 items-center shadow-sm">
              <View className="w-16 h-16 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center mb-3">
                <Feather name="calendar" size={26} color="#9CA3AF" />
              </View>
              <Text className="text-gray-700 dark:text-gray-200 font-semibold text-lg">
                No Day Offs found
              </Text>
              <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1 max-w-xs">
                {hasActiveFilters
                  ? "No day offs match your search criteria. Try adjusting your filters."
                  : canManage
                    ? "Get started by adding blocked dates or holidays for your location."
                    : "There are no blocked dates for your location yet."}
              </Text>
            </View>
          ) : (
            !error && (
              <>
                {dayOffs.map((d) => (
                  <DayOffCard
                    key={d.id}
                    dayOff={d}
                    showLocation={isCompanyAdmin}
                    canManage={canManage}
                    selectionMode={selectionMode}
                    selected={selectedIds.has(d.id)}
                    onEdit={() => openEdit(d)}
                    onHistory={() => {
                      setHistoryFor(d);
                      setSheet("history");
                    }}
                    onDelete={() => confirmDelete(d)}
                    onToggleSelect={() => toggleSelect(d.id)}
                  />
                ))}

                {!selectionMode && (
                  <Pagination
                    page={page}
                    perPage={perPage}
                    total={total}
                    options={PER_PAGE_OPTIONS}
                    onPageChange={setPage}
                    onPerPageChange={setPerPage}
                  />
                )}
              </>
            )
          )}
        </View>
      </ScrollView>

      {/* Filters — one panel holding every filter (same shape as the catalog
          screens' FiltersSheet). Values apply live to the list behind it. */}
      <BottomSheet
        visible={sheet === "filters"}
        onClose={() => setSheet(null)}
        title="Filters"
      >
        <ScrollView
          className="px-5"
          contentContainerStyle={{ paddingBottom: 28 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-4 pt-1">
            {isCompanyAdmin && (
              <SelectField
                label="Location"
                value={locationFilter ?? 0}
                options={locationFilterOptions}
                onSelect={(v) => setLocationFilter(Number(v) || null)}
              />
            )}
            <SelectField
              label="Date Range"
              value={dateRange}
              options={DATE_RANGE_OPTIONS as SelectOption[]}
              onSelect={(v) => setDateRange(String(v) as DateRange)}
            />
            <SelectField
              label="Type"
              value={typeFilter}
              options={TYPE_OPTIONS as SelectOption[]}
              onSelect={(v) => setTypeFilter(String(v) as TypeFilter)}
            />
            <SelectField
              label="Sort By"
              value={sortBy}
              options={SORT_BY_OPTIONS as SelectOption[]}
              onSelect={(v) => setSortBy(String(v) as SortBy)}
            />
            <SelectField
              label="Sort Order"
              value={sortOrder}
              options={SORT_ORDER_OPTIONS as SelectOption[]}
              onSelect={(v) => setSortOrder(String(v) as SortOrder)}
            />

            {/* Footer: Clear Filters (secondary) + Done (primary) */}
            <View className="flex-row gap-3 mt-2">
              <Pressable
                onPress={clearFilters}
                className="flex-1 h-12 rounded-xl items-center justify-center border border-gray-200 dark:border-neutral-700 active:opacity-70"
              >
                <Text className="text-gray-700 dark:text-gray-200 font-semibold text-base">
                  Clear Filters
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setSheet(null)}
                className="flex-1 h-12 rounded-xl items-center justify-center bg-[#0644C7] active:opacity-90"
              >
                <Text className="text-white font-semibold text-base">Done</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </BottomSheet>

      {/* Create / edit form */}
      <BottomSheet
        visible={sheet === "form"}
        onClose={() => (saving ? undefined : setSheet(null))}
        title={form.id != null ? "Edit Day Off" : "Add Day Off"}
      >
        <ScrollView className="px-5 pb-8" showsVerticalScrollIndicator={false}>
          {/* Location (company admin) — inline card grid, as on the web */}
          {isCompanyAdmin && (
            <>
              <FieldLabel required>Location</FieldLabel>
              <LocationGrid
                locations={locations}
                selectedId={form.locationId}
                onSelect={(id) =>
                  setForm((f) => ({
                    ...f,
                    locationId: id,
                    // Selections belong to the previous location's resources.
                    selection:
                      f.locationId === id ? f.selection : emptySelection(),
                  }))
                }
              />
              <View className="mb-2" />
            </>
          )}

          {/* Date */}
          <FieldLabel required>Date</FieldLabel>
          <View className="mb-4">
            <PickerField
              icon="calendar"
              value={form.date ? prettyDate(form.date) : ""}
              placeholder="Select a date"
              onPress={() => setSheet("formDate")}
            />
          </View>

          {/* Older blocks have to be re-chosen in the current format (web form notices). */}
          {form.source?.blockType === "legacy_closure" && (
            <Notice>
              {`This block was saved in the older format (${form.source.durationLabel}). Choose a full-day closure or the hours it stays open; a day can no longer be split into two separate windows.`}
            </Notice>
          )}
          {form.source?.scope === "mixed" && (
            <Notice>
              {`This block covered more than one kind of item (${form.source.scopeLabel}). Choose one kind to keep it on.`}
            </Notice>
          )}
          <Text className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Recorded as{" "}
            <Text className="font-semibold text-gray-700 dark:text-gray-200">
              {recordedAs}
            </Text>
            {form.source?.setByName && form.source.setByName !== recordedAs
              ? ` · originally set by ${form.source.setByName}`
              : ""}
          </Text>

          {/* What should be blocked? (scope) */}
          <SectionCard>
            <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">
              What should be blocked? <Text className="text-red-500">*</Text>
            </Text>
            <ScopeGrid
              scope={form.scope}
              onChange={(scope) => setForm((f) => ({ ...f, scope }))}
            />
            {formResourceKinds.map((kind) => (
              <ResourceChecklist
                key={kind}
                kind={kind}
                options={resources[kind]}
                selectedIds={form.selection[kind]}
                loading={loadingResources}
                showLocation={isCompanyAdmin}
                onToggle={(id) => toggleFormResource(kind, id)}
              />
            ))}
          </SectionCard>

          {/* When: closed all day, or open only for set hours */}
          <SectionCard>
            <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">
              When <Text className="text-red-500">*</Text>
            </Text>
            <WindowFields
              choice={form.windowChoice}
              opensAt={form.opensAt}
              closesAt={form.closesAt}
              onChoose={(windowChoice) => setForm((f) => ({ ...f, windowChoice }))}
              onPickOpens={() => setSheet("formOpens")}
              onPickCloses={() => setSheet("formCloses")}
              onClearOpens={() => setForm((f) => ({ ...f, opensAt: "" }))}
              onClearCloses={() => setForm((f) => ({ ...f, closesAt: "" }))}
            />
          </SectionCard>

          <View className="mb-4">
            <GroupAndReasonFields
              groupName={form.groupName}
              reason={form.reason}
              onGroupName={(t) => setForm((f) => ({ ...f, groupName: t }))}
              onReason={(t) => setForm((f) => ({ ...f, reason: t }))}
            />
          </View>

          {/* Recurring */}
          <Pressable
            onPress={() => setForm((f) => ({ ...f, isRecurring: !f.isRecurring }))}
            className="flex-row items-center gap-2 mb-6"
          >
            <Feather
              name={form.isRecurring ? "check-square" : "square"}
              size={18}
              color={PRIMARY}
            />
            <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Repeat every year on this date
            </Text>
          </Pressable>

          <Pressable
            onPress={saveForm}
            disabled={saving}
            className={`h-12 flex-row items-center justify-center gap-2 rounded-xl bg-[#0644C7] active:opacity-90 ${
              saving ? "opacity-60" : ""
            }`}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Feather
                  name={form.id != null ? "check" : "plus"}
                  size={18}
                  color="#FFFFFF"
                />
                <Text
                  numberOfLines={1}
                  className="text-base font-semibold text-white"
                >
                  {form.id != null ? "Save Changes" : "Add Day Off"}
                </Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </BottomSheet>

      {/* Form date + time pickers. Each swaps the form sheet out and back so
          only one Modal is ever presented at a time. */}
      <DatePickerSheet
        visible={sheet === "formDate"}
        value={form.date || null}
        minDate={formMinDate}
        title="Select Date"
        onClose={() => setSheet("form")}
        onSelect={(date) => {
          setForm((f) => ({ ...f, date }));
          setSheet("form");
        }}
      />
      <TimePickerSheet
        visible={sheet === "formCloses"}
        value={form.closesAt}
        title="Closes at"
        onClose={() => setSheet("form")}
        onSelect={(time) => {
          setForm((f) => ({ ...f, closesAt: time }));
          setSheet("form");
        }}
      />
      <TimePickerSheet
        visible={sheet === "formOpens"}
        value={form.opensAt}
        title="Opens at"
        onClose={() => setSheet("form")}
        onSelect={(time) => {
          setForm((f) => ({ ...f, opensAt: time }));
          setSheet("form");
        }}
      />

      {/* Bulk Add */}
      <BottomSheet
        visible={sheet === "bulk"}
        onClose={() => (bulkCreating ? undefined : setSheet(null))}
        title="Bulk Add Day Offs"
      >
        <ScrollView className="px-5 pb-8" showsVerticalScrollIndicator={false}>
          {/* Month navigation */}
          <View className="flex-row items-center justify-between mb-3">
            <Pressable
              onPress={() =>
                setBulkMonth(
                  (m) => new Date(m.getFullYear(), m.getMonth() - 1, 1),
                )
              }
              hitSlop={8}
              className="w-9 h-9 rounded-full items-center justify-center bg-gray-100 dark:bg-neutral-800 active:opacity-70"
            >
              <Feather name="chevron-left" size={20} color={PRIMARY} />
            </Pressable>
            <Text className="text-base font-bold text-gray-900 dark:text-white">
              {MONTHS[bulkMonth.getMonth()]} {bulkMonth.getFullYear()}
            </Text>
            <Pressable
              onPress={() =>
                setBulkMonth(
                  (m) => new Date(m.getFullYear(), m.getMonth() + 1, 1),
                )
              }
              hitSlop={8}
              className="w-9 h-9 rounded-full items-center justify-center bg-gray-100 dark:bg-neutral-800 active:opacity-70"
            >
              <Feather name="chevron-right" size={20} color={PRIMARY} />
            </Pressable>
          </View>

          {/* Weekday header */}
          <View className="flex-row mb-1">
            {WEEKDAYS.map((w, i) => (
              <View key={i} style={{ width: `${100 / 7}%` }} className="items-center py-1">
                <Text className="text-[11px] font-medium text-gray-400">{w}</Text>
              </View>
            ))}
          </View>

          {/* Day grid (multi-select) */}
          <View className="flex-row flex-wrap">
            {bulkCells.map((key, i) => {
              if (!key) {
                return (
                  <View key={`b${i}`} style={{ width: `${100 / 7}%` }} className="h-11" />
                );
              }
              const isSelected = bulkDates.has(key);
              const past = isPastYmd(key);
              return (
                <View
                  key={key}
                  style={{ width: `${100 / 7}%` }}
                  className="h-11 items-center justify-center"
                >
                  <Pressable
                    onPress={() => !past && toggleBulkDate(key)}
                    disabled={past}
                    className={`w-9 h-9 rounded-full items-center justify-center ${
                      isSelected
                        ? "bg-[#0644C7]"
                        : past
                          ? ""
                          : "active:bg-gray-100 dark:active:bg-neutral-800"
                    }`}
                  >
                    <Text
                      className={`text-sm ${
                        isSelected
                          ? "text-white font-bold"
                          : past
                            ? "text-gray-300 dark:text-neutral-700"
                            : "text-gray-800 dark:text-gray-100"
                      }`}
                    >
                      {Number(key.substring(8, 10))}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>

          {/* Selected count + clear */}
          <View className="flex-row items-center justify-between mt-3 mb-4">
            <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
              {bulkDates.size} date{bulkDates.size === 1 ? "" : "s"} selected
            </Text>
            {bulkDates.size > 0 && (
              <Pressable onPress={() => setBulkDates(new Set())} hitSlop={8}>
                <Text className="text-xs font-medium text-blue-600 dark:text-blue-400">
                  Clear all
                </Text>
              </Pressable>
            )}
          </View>

          {/* Location (company admin) — inline card grid, as on the web */}
          {isCompanyAdmin && (
            <>
              <FieldLabel required>Location</FieldLabel>
              <LocationGrid
                locations={locations}
                selectedId={bulkLocationId}
                onSelect={(id) => {
                  // Selections belong to the previous location's resources.
                  if (id !== bulkLocationId) setBulkSelection(emptySelection());
                  setBulkLocationId(id);
                }}
              />
              <View className="mb-2" />
            </>
          )}

          <Text className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Recorded as{" "}
            <Text className="font-semibold text-gray-700 dark:text-gray-200">
              {recordedAs}
            </Text>
            . The same block is added on every selected date.
          </Text>

          {/* What should be blocked? (scope) */}
          <SectionCard>
            <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">
              What should be blocked? <Text className="text-red-500">*</Text>
            </Text>
            <ScopeGrid scope={bulkScope} onChange={setBulkScope} />
            {bulkResourceKinds.map((kind) => (
              <ResourceChecklist
                key={kind}
                kind={kind}
                options={resources[kind]}
                selectedIds={bulkSelection[kind]}
                loading={loadingResources}
                showLocation={isCompanyAdmin}
                onToggle={(id) => toggleBulkResource(kind, id)}
              />
            ))}
          </SectionCard>

          {/* When: closed all day, or open only for set hours */}
          <SectionCard>
            <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">
              When <Text className="text-red-500">*</Text>
            </Text>
            <WindowFields
              choice={bulkWindowChoice}
              opensAt={bulkOpensAt}
              closesAt={bulkClosesAt}
              onChoose={setBulkWindowChoice}
              onPickOpens={() => setSheet("bulkOpens")}
              onPickCloses={() => setSheet("bulkCloses")}
              onClearOpens={() => setBulkOpensAt("")}
              onClearCloses={() => setBulkClosesAt("")}
            />
          </SectionCard>

          <View className="mb-4">
            <GroupAndReasonFields
              groupName={bulkGroupName}
              reason={bulkReason}
              onGroupName={setBulkGroupName}
              onReason={setBulkReason}
            />
          </View>

          {/* Recurring */}
          <Pressable
            onPress={() => setBulkIsRecurring((v) => !v)}
            className="flex-row items-center gap-2 mb-6"
          >
            <Feather
              name={bulkIsRecurring ? "check-square" : "square"}
              size={18}
              color={PRIMARY}
            />
            <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Repeat every year on this date
            </Text>
          </Pressable>

          <Pressable
            onPress={bulkCreate}
            disabled={bulkCreating || bulkDates.size === 0}
            className={`h-14 flex-row items-center justify-center rounded-full bg-[#0644C7] active:opacity-90 ${
              bulkCreating || bulkDates.size === 0 ? "opacity-60" : ""
            }`}
          >
            {bulkCreating ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text className="text-base font-semibold text-white">
                Create {bulkDates.size} Day Off{bulkDates.size === 1 ? "" : "s"}
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </BottomSheet>

      {/* Bulk time pickers */}
      <TimePickerSheet
        visible={sheet === "bulkCloses"}
        value={bulkClosesAt}
        title="Closes at"
        onClose={() => setSheet("bulk")}
        onSelect={(time) => {
          setBulkClosesAt(time);
          setSheet("bulk");
        }}
      />
      <TimePickerSheet
        visible={sheet === "bulkOpens"}
        value={bulkOpensAt}
        title="Opens at"
        onClose={() => setSheet("bulk")}
        onSelect={(time) => {
          setBulkOpensAt(time);
          setSheet("bulk");
        }}
      />

      {/* Change history — one block's, or every block's (web "Change history"). */}
      <BottomSheet
        visible={sheet === "history"}
        onClose={() => {
          setSheet(null);
          setHistoryFor(null);
        }}
        title={historyFor ? "History" : "Change history"}
        subtitle={
          historyFor
            ? `${prettyDate(historyFor.date)} · ${historyFor.groupName ?? historyFor.scopeLabel}`
            : undefined
        }
      >
        <ScrollView className="px-5 pb-8" showsVerticalScrollIndicator={false}>
          {sheet === "history" && (
            <DayOffHistoryList
              dayOffId={historyFor?.id}
              locationId={historyFor ? null : isCompanyAdmin ? locationFilter : null}
              showLocation={isCompanyAdmin}
            />
          )}
        </ScrollView>
      </BottomSheet>
    </View>
  );
};

export default DayOffs;
