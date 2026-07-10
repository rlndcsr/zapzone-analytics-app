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
import { KpiCard } from "../../components/ui/KpiCard";
import { Pagination } from "../../components/ui/Pagination";
import { useActivityLogs, useActivityStats } from "../../lib/hooks/useActivityLogs";
import { useLocationOptions } from "../../lib/hooks/useLocationOptions";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  CATEGORY_TONE,
  fetchAllActivityLogs,
  type ActivityFilters,
  type ActivityLogEntry,
} from "../../services/activityLogsService";

const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const PER_PAGE_OPTIONS = [15, 25, 50];

// Category badge → Tailwind classes (mirrors CATEGORY_TONE slugs).
const TONE_CLASS: Record<string, string> = {
  emerald: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
  blue: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
  rose: "bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400",
  indigo: "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400",
  amber: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
  gray: "bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-gray-300",
};

function toneClass(category: string): string {
  return TONE_CLASS[CATEGORY_TONE[category] ?? "gray"] ?? TONE_CLASS.gray;
}

function timeAgo(value: string | null): string {
  if (!value) return "—";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fullTimestamp(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type Severity = "info" | "success" | "warning" | "error";

/**
 * Client-computed severity from the action string — mirrors the web admin's
 * `determineSeverity` (delete/reject→error, create/approve/purchase→success,
 * update/edit→warning, else info). The backend does not send a severity field;
 * the web derives it the same way, so this is parity without a backend change.
 */
function determineSeverity(action: string): Severity {
  const a = action.toLowerCase();
  if (a.includes("delete") || a.includes("reject")) return "error";
  if (a.includes("create") || a.includes("approve") || a.includes("purchase"))
    return "success";
  if (a.includes("update") || a.includes("edit")) return "warning";
  return "info";
}

// Severity → icon-box tint (hex, for the left action-icon chip).
const SEVERITY_ICON_TONE: Record<Severity, { bg: string; tint: string }> = {
  info: { bg: "#3B82F620", tint: "#3B82F6" },
  success: { bg: "#10B98120", tint: "#10B981" },
  warning: { bg: "#F59E0B20", tint: "#F59E0B" },
  error: { bg: "#EF444420", tint: "#EF4444" },
};

// Severity → badge classes (mirrors the web severity colors).
const SEVERITY_BADGE_CLASS: Record<Severity, string> = {
  info: TONE_CLASS.blue,
  success: TONE_CLASS.emerald,
  warning: TONE_CLASS.amber,
  error: TONE_CLASS.rose,
};

// Role/user-type → badge classes (mirrors the web getUserTypeColors).
const ROLE_BADGE_CLASS: Record<string, string> = {
  company_admin:
    "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300",
  location_manager:
    "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
  attendant:
    "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
  system: "bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-gray-300",
};

type FeatherName = ComponentProps<typeof Feather>["name"];

/** Action → Feather icon (mirrors the web actionIcons map, keyword-based). */
function actionIcon(action: string): FeatherName {
  const a = action.toLowerCase();
  if (a.includes("create") || a.includes("add")) return "plus-circle";
  if (a.includes("delete") || a.includes("remove")) return "trash-2";
  if (a.includes("update") || a.includes("edit") || a.includes("change"))
    return "edit-2";
  if (a.includes("view")) return "eye";
  if (a.includes("check") && a.includes("in")) return "log-in";
  if (a.includes("check") && a.includes("out")) return "log-out";
  if (a.includes("logout") || a.includes("log out") || a.includes("signed out"))
    return "log-out";
  if (a.includes("login") || a.includes("log in") || a.includes("signed in"))
    return "log-in";
  if (a.includes("purchase") || a.includes("payment") || a.includes("paid"))
    return "shopping-cart";
  return "clock";
}

/** Flatten a metadata object into label/value pairs (mirrors the web panel). */
function formatMetadataItems(
  metadata: Record<string, unknown> | null,
): { key: string; value: string }[] {
  if (!metadata) return [];
  const items: { key: string; value: string }[] = [];
  for (const [rawKey, rawVal] of Object.entries(metadata)) {
    if (rawVal === null || rawVal === undefined || rawVal === "") continue;
    let value: string;
    if (Array.isArray(rawVal)) value = rawVal.join(", ");
    else if (typeof rawVal === "object") value = JSON.stringify(rawVal);
    else value = String(rawVal);
    if (!value.trim()) continue;
    const key = rawKey
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    items.push({ key, value });
  }
  return items;
}

/* --------------------------------------------------- filter label helpers -- */

// Action option label — mirrors the web (`charAt(0).toUpperCase() + slice(1).replace('_',' ')`).
function formatActionLabel(action: string): string {
  if (!action) return action;
  return action.charAt(0).toUpperCase() + action.slice(1).replace("_", " ");
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/**
 * Date-range option → `date_from`/`date_to` (the mobile service's supported
 * params), reproducing the web's windows: today, yesterday (single day),
 * last 7 days, last 30 days.
 */
function dateRangeToFilter(range: string): {
  dateFrom?: string;
  dateTo?: string;
} {
  const now = new Date();
  switch (range) {
    case "today":
      return { dateFrom: ymd(now) };
    case "yesterday": {
      const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      return { dateFrom: ymd(y), dateTo: ymd(y) };
    }
    case "week": {
      const s = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      return { dateFrom: ymd(s) };
    }
    case "month": {
      const s = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
      return { dateFrom: ymd(s) };
    }
    default:
      return {};
  }
}

const DATE_RANGE_OPTIONS: { label: string; value: string }[] = [
  { label: "All Time", value: "all" },
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "Last 7 Days", value: "week" },
  { label: "Last 30 Days", value: "month" },
];

/* ------------------------------------------------------------- CSV export -- */

/** Quote a CSV field if it contains a comma, quote, or newline (web escapeCSV). */
function escapeCsv(value: string): string {
  const s = value ?? "";
  if (s === "") return "";
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

type ExportMeta = {
  guest_name: string;
  email: string;
  reference: string;
  amount: string;
  participants: string;
  date: string;
  time: string;
  status: string;
  package: string;
  location: string;
  room: string;
  payment_method: string;
  promo_code: string;
  discount: string;
  notes: string;
  changes: string;
  extra_metadata: string;
};

const EMPTY_EXPORT_META: ExportMeta = {
  guest_name: "", email: "", reference: "", amount: "", participants: "",
  date: "", time: "", status: "", package: "", location: "", room: "",
  payment_method: "", promo_code: "", discount: "", notes: "", changes: "",
  extra_metadata: "",
};

// Keys already surfaced in named columns — excluded from Extra Metadata.
const KNOWN_META_KEYS = new Set([
  "guest_name", "customer_name", "customer_email", "email", "reference_number",
  "reference", "booking_reference", "amount", "price", "total_price",
  "participants", "num_participants", "booking_date", "date", "time",
  "booking_time", "time_slot", "status", "booking_status", "package_name",
  "location_name", "location", "room_name", "room", "payment_method",
  "promo_code", "discount_code", "discount_amount", "notes", "special_requests",
  "changes", "resource_name",
]);

/** Derive the 17 metadata columns (mirrors the web `formatMetadataForExport`). */
function formatMetadataForExport(
  metadata: Record<string, unknown> | null,
): ExportMeta {
  if (!metadata || Object.keys(metadata).length === 0) {
    return { ...EMPTY_EXPORT_META };
  }
  const m = metadata as Record<string, unknown>;
  const str = (v: unknown) => (v == null ? "" : String(v));
  const money = (v: unknown) => `$${parseFloat(String(v)).toFixed(2)}`;
  const amountRaw = m.amount ?? m.price ?? m.total_price;

  const result: ExportMeta = {
    guest_name: str(m.guest_name || m.customer_name),
    email: str(m.customer_email || m.email),
    reference: str(m.reference_number || m.reference || m.booking_reference),
    amount: amountRaw ? money(amountRaw) : "",
    participants: str(m.participants || m.num_participants),
    date: str(m.booking_date || m.date),
    time: str(m.time || m.booking_time || m.time_slot),
    status: str(m.status || m.booking_status),
    package: str(m.package_name),
    location: str(m.location_name || m.location),
    room: str(m.room_name || m.room),
    payment_method: str(m.payment_method),
    promo_code: str(m.promo_code || m.discount_code),
    discount: m.discount_amount ? money(m.discount_amount) : "",
    notes: str(m.notes || m.special_requests),
    changes: "",
    extra_metadata: "",
  };

  if (m.changes) {
    try {
      const changes =
        typeof m.changes === "string" ? JSON.parse(m.changes) : m.changes;
      if (changes && typeof changes === "object") {
        const parts: string[] = [];
        for (const [field, val] of Object.entries(
          changes as Record<string, unknown>,
        )) {
          if (val && typeof val === "object" && "old" in val && "new" in val) {
            const o = (val as Record<string, unknown>).old;
            const n = (val as Record<string, unknown>).new;
            parts.push(`${field}: ${o} → ${n}`);
          } else {
            parts.push(`${field}: ${val}`);
          }
        }
        result.changes = parts.join("; ");
      }
    } catch {
      result.changes = String(m.changes);
    }
  }

  const extras: string[] = [];
  for (const [key, val] of Object.entries(m)) {
    if (KNOWN_META_KEYS.has(key)) continue;
    if (val === null || val === undefined || val === "") continue;
    const v = typeof val === "object" ? JSON.stringify(val) : String(val);
    if (v) extras.push(`${key}: ${v}`);
  }
  result.extra_metadata = extras.join("; ");
  return result;
}

const CSV_HEADERS = [
  "Timestamp", "Attendant", "User Type", "Action", "Resource Type",
  "Resource Name", "Details", "Severity", "Guest Name", "Email", "Reference",
  "Amount", "Participants", "Date", "Time", "Status", "Package", "Location",
  "Room", "Payment Method", "Promo Code", "Discount", "Notes", "Changes",
  "Extra Metadata",
];

/** Build the 25-column activity-log CSV exactly as the web export does. */
function buildActivityCsv(logs: ActivityLogEntry[]): string {
  const rows = logs.map((log) => {
    const md = formatMetadataForExport(log.metadata);
    const resourceType = log.category || log.entityType || "general";
    const resourceName =
      (log.metadata?.resource_name as string) || log.entityType || "";
    const timestamp = log.createdAt
      ? new Date(log.createdAt).toLocaleString()
      : "";
    return [
      timestamp,
      log.actor.name,
      log.actor.role || "system",
      log.action,
      resourceType,
      resourceName,
      log.description,
      determineSeverity(log.action),
      md.guest_name, md.email, md.reference, md.amount, md.participants,
      md.date, md.time, md.status, md.package, md.location, md.room,
      md.payment_method, md.promo_code, md.discount, md.notes, md.changes,
      md.extra_metadata,
    ]
      .map((v) => escapeCsv(String(v ?? "")))
      .join(",");
  });
  return [CSV_HEADERS.join(","), ...rows].join("\n");
}

/* ---------------------------------------------------------------- filters -- */

/** Single-select filter sheet reused by every activity filter. */
function FilterOptionSheet({
  visible,
  onClose,
  title,
  options,
  value,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  options: { label: string; value: string }[];
  value: string;
  onSelect: (value: string) => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
        {options.map((option) => {
          const isSelected = value === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => {
                onSelect(option.value);
                onClose();
              }}
              className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
                isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
              }`}
            >
              <Text
                className={`text-base font-medium ${
                  isSelected
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-gray-700 dark:text-gray-200"
                }`}
              >
                {option.label}
              </Text>
              {isSelected && (
                <View className="w-6 h-6 rounded-full bg-blue-500 items-center justify-center">
                  <Feather name="check" size={14} color="#FFFFFF" />
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </BottomSheet>
  );
}

/** A bordered filter pill that opens a filter sheet. */
function FilterChip({
  icon,
  label,
  onPress,
}: {
  icon: FeatherName;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800"
    >
      <Feather name={icon} size={16} color={PRIMARY} />
      <Text
        className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1"
        numberOfLines={1}
      >
        {label}
      </Text>
      <Feather name="chevron-down" size={14} color="#9CA3AF" />
    </Pressable>
  );
}

const CategoryBadge = ({ category }: { category: string }) => {
  const cls = toneClass(category);
  return (
    <View className={`px-2 py-1 rounded-full ${cls}`}>
      <Text className={`text-[10px] font-semibold capitalize ${cls}`}>{category}</Text>
    </View>
  );
};

const SeverityBadge = ({ severity }: { severity: Severity }) => {
  const cls = SEVERITY_BADGE_CLASS[severity];
  return (
    <View className={`px-2 py-1 rounded-full ${cls}`}>
      <Text className={`text-[10px] font-semibold capitalize ${cls}`}>
        {severity}
      </Text>
    </View>
  );
};

const RoleBadge = ({
  role,
  label,
}: {
  role: string | null;
  label: string;
}) => {
  const cls = ROLE_BADGE_CLASS[role ?? "system"] ?? ROLE_BADGE_CLASS.system;
  return (
    <View className={`px-2 py-1 rounded-full ${cls}`}>
      <Text className={`text-[10px] font-semibold ${cls}`}>
        {role ? label : "System"}
      </Text>
    </View>
  );
};

const LogCard = ({
  log,
  showLocation,
  onPress,
}: {
  log: ActivityLogEntry;
  showLocation: boolean;
  onPress: () => void;
}) => {
  const severity = determineSeverity(log.action);
  const iconTone = SEVERITY_ICON_TONE[severity];
  return (
    <Pressable
      onPress={onPress}
      className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3 shadow-sm active:opacity-90"
      style={CARD_SHADOW}
      accessibilityRole="button"
      accessibilityLabel={`Activity: ${log.action}`}
    >
      <View className="flex-row items-start gap-3">
        {/* Severity-tinted action icon */}
        <View
          className="w-10 h-10 rounded-xl items-center justify-center"
          style={{ backgroundColor: iconTone.bg }}
        >
          <Feather name={actionIcon(log.action)} size={18} color={iconTone.tint} />
        </View>

        <View className="flex-1 min-w-0">
          {/* Row 1: actor name + role/user-type badge */}
          <View className="flex-row items-center gap-2 flex-wrap">
            <Text
              className="text-base font-bold text-gray-900 dark:text-white shrink"
              numberOfLines={1}
            >
              {log.actor.name}
            </Text>
            <RoleBadge role={log.actor.role} label={log.actor.roleLabel} />
          </View>

          {/* Row 2: description */}
          <Text
            className="text-sm text-gray-700 dark:text-gray-200 mt-1 leading-relaxed"
            numberOfLines={2}
          >
            {log.description || log.action}
          </Text>

          {/* Row 3: type + severity + entity id chips */}
          <View className="flex-row items-center gap-2 flex-wrap mt-2">
            <CategoryBadge category={log.category} />
            <SeverityBadge severity={severity} />
            {log.entityId != null && (
              <Text className="text-[10px] font-mono text-gray-500 dark:text-gray-400">
                ID: {log.entityId}
              </Text>
            )}
          </View>

          {/* Location (company admin only) */}
          {showLocation && !!log.locationName && (
            <View className="flex-row items-center gap-1.5 mt-2">
              <Feather name="map-pin" size={12} color="#9CA3AF" />
              <Text
                className="text-xs text-gray-500 dark:text-gray-400"
                numberOfLines={1}
              >
                {log.locationName}
              </Text>
            </View>
          )}

          {/* Footer: relative time + view-details affordance */}
          <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
            <View className="flex-row items-center gap-1.5">
              <Feather name="clock" size={12} color="#9CA3AF" />
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                {timeAgo(log.createdAt)}
              </Text>
            </View>
            <View className="flex-row items-center gap-1">
              <Text className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
                View details
              </Text>
              <Feather name="chevron-right" size={12} color="#2563EB" />
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
};

const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <View className="flex-row items-start justify-between py-2 border-b border-gray-100 dark:border-neutral-800">
    <Text className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
      {label}
    </Text>
    <Text
      className="text-sm text-gray-800 dark:text-gray-100 flex-1 text-right ml-4"
      selectable
    >
      {value}
    </Text>
  </View>
);

const ActivityLogs = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  const currentUser = getCurrentUser();
  const isCompanyAdmin = currentUser?.role === "company_admin";

  // Filters mirror the web page: Action, Resource Type, Attendant, Date Range,
  // Search (+ a mobile-only Location filter for company admins).
  const [actionFilter, setActionFilter] = useState("all");
  const [resourceTypeFilter, setResourceTypeFilter] = useState("all");
  const [attendantFilter, setAttendantFilter] = useState("all");
  const [dateRange, setDateRange] = useState("all");
  const [locationFilter, setLocationFilter] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sheet, setSheet] = useState<
    null | "action" | "resource" | "attendant" | "daterange"
  >(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(15);
  const [refreshing, setRefreshing] = useState(false);
  const [statsNonce, setStatsNonce] = useState(0);
  const [selected, setSelected] = useState<ActivityLogEntry | null>(null);
  const [exporting, setExporting] = useState(false);

  const { locations } = useLocationOptions();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [
    actionFilter,
    resourceTypeFilter,
    attendantFilter,
    dateRange,
    locationFilter,
    debouncedSearch,
    perPage,
  ]);

  const activeLocationId =
    isCompanyAdmin && locationFilter != null ? locationFilter : undefined;

  const dateFilter = useMemo(() => dateRangeToFilter(dateRange), [dateRange]);

  const filters = useMemo<ActivityFilters>(
    () => ({
      search: debouncedSearch || undefined,
      action: actionFilter === "all" ? undefined : actionFilter,
      category: resourceTypeFilter === "all" ? undefined : resourceTypeFilter,
      userId: attendantFilter === "all" ? undefined : Number(attendantFilter),
      locationId: activeLocationId,
      dateFrom: dateFilter.dateFrom,
      dateTo: dateFilter.dateTo,
    }),
    [
      debouncedSearch,
      actionFilter,
      resourceTypeFilter,
      attendantFilter,
      activeLocationId,
      dateFilter,
    ],
  );

  const { logs, total, loading, error, refetch } = useActivityLogs({
    filters,
    page,
    perPage,
  });
  const { stats } = useActivityStats(activeLocationId, statsNonce);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
      setStatsNonce((n) => n + 1);
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  // Filter options derived from the loaded page (mirrors the web's
  // getUniqueActions / getUniqueResourceTypes / getUniqueAttendants).
  const actionOptions = useMemo<{ label: string; value: string }[]>(() => {
    const set = new Set<string>();
    for (const l of logs) if (l.action) set.add(l.action);
    return [
      { label: "All Actions", value: "all" },
      ...[...set].map((a) => ({ label: formatActionLabel(a), value: a })),
    ];
  }, [logs]);

  const resourceTypeOptions = useMemo<{ label: string; value: string }[]>(() => {
    const set = new Set<string>();
    for (const l of logs) {
      const rt = l.category || l.entityType;
      if (rt) set.add(rt);
    }
    return [
      { label: "All Types", value: "all" },
      ...[...set].map((t) => ({ label: capitalize(t), value: t })),
    ];
  }, [logs]);

  const attendantOptions = useMemo<{ label: string; value: string }[]>(() => {
    const map = new Map<string, string>();
    for (const l of logs) {
      if (l.actor.id != null) map.set(String(l.actor.id), l.actor.name);
    }
    return [
      { label: "All Attendants", value: "all" },
      ...[...map].map(([id, name]) => ({ label: name, value: id })),
    ];
  }, [logs]);

  const exportCsv = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setExporting(true);
    try {
      const all = await fetchAllActivityLogs(token, filters);
      if (all.length === 0) {
        Alert.alert(
          "Nothing to export",
          "No activity matches the current filters.",
        );
        return;
      }
      const csv = buildActivityCsv(all);
      // Loaded lazily so these native modules never run at app startup.
      const FileSystem = await import("expo-file-system/legacy");
      const Sharing = await import("expo-sharing");
      const stamp = new Date().toISOString().split("T")[0];
      const dest = `${FileSystem.cacheDirectory}attendant-activity-logs-${stamp}.csv`;
      await FileSystem.writeAsStringAsync(dest, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(dest, {
          mimeType: "text/csv",
          dialogTitle: "Export activity logs",
          UTI: "public.comma-separated-values-text",
        });
      } else {
        Alert.alert("Export ready", `Saved to ${dest}`);
      }
    } catch (err) {
      Alert.alert(
        "Export failed",
        err instanceof Error ? err.message : "Could not export the CSV.",
      );
    } finally {
      setExporting(false);
    }
  }, [filters]);

  // Reset every filter to its default (mirrors the web `clearFilters`). The
  // filter-state changes drive useActivityLogs to refetch and reset the page.
  const clearFilters = useCallback(() => {
    setActionFilter("all");
    setResourceTypeFilter("all");
    setAttendantFilter("all");
    setDateRange("all");
    setSearch("");
    setDebouncedSearch("");
    setPage(1);
  }, []);

  const hasActiveFilters =
    actionFilter !== "all" ||
    resourceTypeFilter !== "all" ||
    attendantFilter !== "all" ||
    dateRange !== "all" ||
    search.trim() !== "";

  const actionLabel =
    actionFilter === "all" ? "All Actions" : formatActionLabel(actionFilter);
  const resourceLabel =
    resourceTypeFilter === "all" ? "All Types" : capitalize(resourceTypeFilter);
  const attendantLabel =
    attendantFilter === "all"
      ? "All Attendants"
      : (attendantOptions.find((o) => o.value === attendantFilter)?.label ??
        "Attendant");
  const dateRangeLabel =
    DATE_RANGE_OPTIONS.find((o) => o.value === dateRange)?.label ?? "All Time";

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
            Activity Log
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
              Activity Log
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Track activities across managers and attendants
            </Text>
          </View>

          {/* Location filter (company admin) — below the header, above the KPIs */}
          {isCompanyAdmin && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mb-5 -mx-5 px-5"
              contentContainerStyle={{ gap: 8 }}
            >
              <Pressable
                onPress={() => setLocationFilter(null)}
                className={`flex-row items-center gap-1.5 px-4 py-2 rounded-lg ${
                  locationFilter == null
                    ? "bg-[#0644C7]"
                    : "bg-gray-100 dark:bg-neutral-800"
                }`}
              >
                <Feather
                  name="map-pin"
                  size={14}
                  color={locationFilter == null ? "#FFFFFF" : "#6B7280"}
                />
                <Text
                  className={`text-sm font-medium ${
                    locationFilter == null
                      ? "text-white"
                      : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  All Locations
                </Text>
              </Pressable>
              {locations.map((l) => {
                const active = locationFilter === l.id;
                return (
                  <Pressable
                    key={l.id}
                    onPress={() => setLocationFilter(l.id)}
                    className={`px-4 py-2 rounded-lg ${
                      active ? "bg-[#0644C7]" : "bg-gray-100 dark:bg-neutral-800"
                    }`}
                  >
                    <Text
                      className={`text-sm font-medium ${
                        active
                          ? "text-white"
                          : "text-gray-700 dark:text-gray-200"
                      }`}
                      numberOfLines={1}
                    >
                      {l.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {/* Error state */}
          {!loading && error && (
            <View className="bg-red-50 border border-red-100 rounded-2xl p-5 mb-5">
              <Text className="text-red-600 font-semibold">Something went wrong</Text>
              <Text className="text-red-500 text-sm mt-1">{error}</Text>
            </View>
          )}

          {/* KPI cards — mirror the web getLocationMetrics summary */}
          <View className="flex-row flex-wrap -mx-1.5 mb-3">
            <View className="w-1/2">
              <KpiCard
                icon="clock"
                tone={{ bg: "#0644C720", tint: PRIMARY }}
                title="Total Activities"
                value={String(stats.total)}
                hint="All activities"
              />
            </View>
            <View className="w-1/2">
              <KpiCard
                icon="zap"
                tone={{ bg: "#10B98120", tint: "#10B981" }}
                title="Today's Activities"
                value={String(stats.today)}
                hint="Last 24 hours"
              />
            </View>
            {isCompanyAdmin ? (
              <>
                <View className="w-1/2">
                  <KpiCard
                    icon="user"
                    tone={{ bg: "#3B82F620", tint: "#3B82F6" }}
                    title="Manager Actions"
                    value={String(stats.managerActions)}
                    hint="Manager activities"
                  />
                </View>
                <View className="w-1/2">
                  <KpiCard
                    icon="users"
                    tone={{ bg: "#F59E0B20", tint: "#F59E0B" }}
                    title="Attendant Actions"
                    value={String(stats.attendantActions)}
                    hint="Staff activities"
                  />
                </View>
              </>
            ) : (
              <>
                <View className="w-1/2">
                  <KpiCard
                    icon="shopping-cart"
                    tone={{ bg: "#F59E0B20", tint: "#F59E0B" }}
                    title="Purchases Made"
                    value={String(stats.purchases)}
                    hint="Total sales"
                  />
                </View>
                <View className="w-1/2">
                  <KpiCard
                    icon="users"
                    tone={{ bg: "#8B5CF620", tint: "#8B5CF6" }}
                    title="Active Attendants"
                    value={String(stats.activeAttendants)}
                    hint="Logged in today"
                  />
                </View>
              </>
            )}
          </View>

          {/* Search */}
          <View className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3 rounded-xl border border-gray-100 dark:border-neutral-800 mt-2 mb-3">
            <Feather name="search" size={16} color="#9CA3AF" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search activities..."
              placeholderTextColor="#9CA3AF"
              className="flex-1 text-sm text-gray-900 dark:text-white"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <Feather name="x" size={16} color="#9CA3AF" />
              </Pressable>
            )}
          </View>

          {/* Filters — Action, Resource Type, Attendant, Date Range (mirrors web) */}
          <View className="flex-row gap-3 mb-3">
            <FilterChip
              icon="zap"
              label={actionLabel}
              onPress={() => setSheet("action")}
            />
            <FilterChip
              icon="layers"
              label={resourceLabel}
              onPress={() => setSheet("resource")}
            />
          </View>
          <View className="flex-row gap-3 mb-3">
            <FilterChip
              icon="user"
              label={attendantLabel}
              onPress={() => setSheet("attendant")}
            />
            <FilterChip
              icon="calendar"
              label={dateRangeLabel}
              onPress={() => setSheet("daterange")}
            />
          </View>

          {/* Actions — Clear Filters + Export CSV (mirrors the web toolbar) */}
          <View className="flex-row gap-3 mb-5">
            <Pressable
              onPress={clearFilters}
              disabled={!hasActiveFilters}
              className={`flex-1 h-12 rounded-xl items-center justify-center flex-row gap-2 border ${
                hasActiveFilters
                  ? "border-gray-200 dark:border-neutral-700"
                  : "border-gray-100 dark:border-neutral-800 opacity-50"
              }`}
              accessibilityRole="button"
              accessibilityLabel="Clear Filters"
            >
              <Feather name="x-circle" size={16} color="#6B7280" />
              <Text className="text-gray-700 dark:text-gray-200 font-semibold text-sm">
                Clear Filters
              </Text>
            </Pressable>

            <Pressable
              onPress={exportCsv}
              disabled={exporting}
              className={`flex-1 h-12 rounded-xl items-center justify-center flex-row gap-2 ${
                exporting ? "bg-[#0644C7]/60" : "bg-[#0644C7]"
              }`}
              accessibilityRole="button"
              accessibilityLabel="Export CSV"
            >
              {exporting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Feather name="download" size={16} color="#FFFFFF" />
              )}
              <Text className="text-white font-semibold text-sm">Export CSV</Text>
            </Pressable>
          </View>

          {/* List header */}
          {!loading && !error && (
            <View className="flex-row items-center gap-2 mb-4">
              <Text
                numberOfLines={1}
                className="shrink text-lg font-bold text-gray-900 dark:text-white"
              >
                Activities
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
          ) : !error && logs.length === 0 ? (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl p-8 items-center shadow-sm">
              <View className="w-16 h-16 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center mb-3">
                <Feather name="activity" size={26} color="#9CA3AF" />
              </View>
              <Text className="text-gray-700 dark:text-gray-200 font-semibold text-lg">
                No activity found
              </Text>
              <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1 max-w-xs">
                Try a different action type, location, or search term.
              </Text>
            </View>
          ) : (
            !error && (
              <>
                {logs.map((log) => (
                  <LogCard
                    key={log.id}
                    log={log}
                    showLocation={isCompanyAdmin}
                    onPress={() => setSelected(log)}
                  />
                ))}

                <Pagination
                  page={page}
                  perPage={perPage}
                  total={total}
                  options={PER_PAGE_OPTIONS}
                  onPageChange={setPage}
                  onPerPageChange={setPerPage}
                />
              </>
            )
          )}
        </View>
      </ScrollView>

      {/* Action filter */}
      <FilterOptionSheet
        visible={sheet === "action"}
        onClose={() => setSheet(null)}
        title="Filter by Action"
        options={actionOptions}
        value={actionFilter}
        onSelect={setActionFilter}
      />

      {/* Resource Type filter */}
      <FilterOptionSheet
        visible={sheet === "resource"}
        onClose={() => setSheet(null)}
        title="Filter by Resource Type"
        options={resourceTypeOptions}
        value={resourceTypeFilter}
        onSelect={setResourceTypeFilter}
      />

      {/* Attendant filter */}
      <FilterOptionSheet
        visible={sheet === "attendant"}
        onClose={() => setSheet(null)}
        title="Filter by Attendant"
        options={attendantOptions}
        value={attendantFilter}
        onSelect={setAttendantFilter}
      />

      {/* Date range filter */}
      <FilterOptionSheet
        visible={sheet === "daterange"}
        onClose={() => setSheet(null)}
        title="Filter by Date Range"
        options={DATE_RANGE_OPTIONS}
        value={dateRange}
        onSelect={setDateRange}
      />

      {/* Activity detail */}
      <BottomSheet
        visible={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.action ?? "Activity"}
      >
        <ScrollView className="px-5 pb-8" showsVerticalScrollIndicator={false}>
          {selected && (
            <>
              <View className="flex-row items-center gap-2 mb-3">
                <CategoryBadge category={selected.category} />
                <SeverityBadge severity={determineSeverity(selected.action)} />
                <Text className="text-xs text-gray-400 dark:text-gray-500 flex-1 text-right">
                  {timeAgo(selected.createdAt)}
                </Text>
              </View>
              <Text className="text-sm text-gray-700 dark:text-gray-200 mb-4">
                {selected.description || selected.action}
              </Text>

              <DetailRow label="Action" value={selected.action} />
              <DetailRow label="User" value={selected.actor.name} />
              <DetailRow label="Role" value={selected.actor.roleLabel} />
              {!!selected.actor.email && (
                <DetailRow label="Email" value={selected.actor.email} />
              )}
              {!!selected.locationName && (
                <DetailRow label="Location" value={selected.locationName} />
              )}
              {!!selected.entityType && (
                <DetailRow
                  label="Entity"
                  value={`${selected.entityType}${
                    selected.entityId != null ? ` #${selected.entityId}` : ""
                  }`}
                />
              )}
              {!!selected.ipAddress && (
                <DetailRow label="IP Address" value={selected.ipAddress} />
              )}
              <DetailRow label="When" value={fullTimestamp(selected.createdAt)} />
              {!!selected.userAgent && (
                <DetailRow label="Device" value={selected.userAgent} />
              )}

              {/* Metadata (previously unused) — mirrors the web metadata panel. */}
              {(() => {
                const items = formatMetadataItems(selected.metadata);
                if (items.length === 0) return null;
                return (
                  <>
                    <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mt-5 mb-1">
                      Metadata
                    </Text>
                    {items.map((item) => (
                      <DetailRow
                        key={item.key}
                        label={item.key}
                        value={item.value}
                      />
                    ))}
                  </>
                );
              })()}
            </>
          )}
        </ScrollView>
      </BottomSheet>
    </View>
  );
};

export default ActivityLogs;
