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
import { FilterPill, PillSegment } from "../../components/ui/FilterPill";
import { SelectField, type SelectOption } from "../../components/ui/FormControls";
import { KpiCard } from "../../components/ui/KpiCard";
import { LocationWorkspaceSelector } from "../../components/ui/LocationWorkspaceSelector";
import { Pagination } from "../../components/ui/Pagination";
import { formatDateET, formatDateTimeET } from "../../lib/date/venueTime";
import {
  useActivityFilterOptions,
  useActivityLogs,
  useActivityStats,
} from "../../lib/hooks/useActivityLogs";
import { useActiveLocation } from "../../lib/location/activeLocationStore";
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

const PER_PAGE_OPTIONS = [5, 15, 25, 50];

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
  // Older than a month: fall back to the venue's calendar date, so a log line
  // isn't dated a day off on a phone in another timezone.
  return formatDateET(value, { month: "short" });
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

/**
 * Compose the row's sentence the way the web's `formatActivityDescription`
 * does for a generic action: "<Action> <resourceType> \"<resourceName>\" #<id>",
 * then " • " for each recognised metadata detail, then the backend's own
 * description. The web resolves resourceType from `category` (falling back to
 * entity_type) and resourceName from `metadata.resource_name` (falling back to
 * entity_type) — mirrored here so the same log reads identically on both.
 *
 * The web additionally hand-writes ~50 action-specific sentences (Booking
 * Created, Payment Recorded, …). Those are NOT ported: this generic path is
 * what every unrecognised action falls through to there, and it is what the
 * screenshotted row renders.
 */
function activityDescription(log: ActivityLogEntry): string {
  const meta = log.metadata ?? {};
  const get = (key: string): unknown => meta[key];

  const action = log.action.replace(/_/g, " ");
  const resourceType = log.category || log.entityType || "general";
  const resourceName = (get("resource_name") as string) || log.entityType || "";
  const resourceId = log.entityId != null ? `#${log.entityId}` : "";

  let description: string;
  switch (log.action) {
    case "created":
      description = `Created ${resourceType} "${resourceName}" ${resourceId}`;
      break;
    case "updated":
      description = `Updated ${resourceType} "${resourceName}" ${resourceId}`;
      break;
    case "deleted":
      description = `Deleted ${resourceType} "${resourceName}" ${resourceId}`;
      break;
    case "viewed":
      description = `Viewed ${resourceType} "${resourceName}" ${resourceId}`;
      break;
    case "checked_in":
      description = `Checked in customer for ${resourceType} "${resourceName}" ${resourceId}`;
      break;
    case "checked_out":
      description = `Checked out customer from ${resourceType} "${resourceName}" ${resourceId}`;
      break;
    case "purchased":
      description = `Processed purchase of ${resourceType} "${resourceName}" ${resourceId}`;
      break;
    case "logged_in":
      description = "Logged into the system";
      break;
    case "logged_out":
      description = "Logged out of the system";
      break;
    case "approved":
      description = `Approved ${resourceType} "${resourceName}" ${resourceId}`;
      break;
    case "rejected":
      description = `Rejected ${resourceType} "${resourceName}" ${resourceId}`;
      break;
    case "managed":
      description = `Managed ${resourceType} "${resourceName}" ${resourceId}`;
      break;
    case "reported":
      description = `Generated report for ${resourceType} "${resourceName}" ${resourceId}`;
      break;
    default:
      description =
        `${action.charAt(0).toUpperCase()}${action.slice(1)} ${resourceType} "${resourceName}" ${resourceId}`.trim();
  }

  const details: string[] = [];
  if (log.action === "logged_in" && get("ip_address"))
    details.push(`IP: ${get("ip_address")}`);
  if (log.action === "rejected" && get("reason"))
    details.push(`Reason: ${get("reason")}`);
  if (get("reference_number")) details.push(`Ref: ${get("reference_number")}`);
  if (get("customer_name")) details.push(`Customer: ${get("customer_name")}`);
  if (get("amount"))
    details.push(`Amount: $${parseFloat(String(get("amount"))).toFixed(2)}`);
  if (get("quantity")) details.push(`Qty: ${get("quantity")}`);
  if (get("status")) details.push(`Status: ${get("status")}`);

  if (details.length > 0) description += ` • ${details.join(" • ")}`;
  if (log.description && !description.includes(log.description))
    description += ` • ${log.description}`;

  return description.trim();
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
      ? formatDateTimeET(log.createdAt, { month: "short", fallback: "" })
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

/** Faint separator dot the web puts between inline meta chips. */
const Dot = () => <Text className="text-gray-300 dark:text-neutral-600">•</Text>;

/**
 * One activity row — the mobile twin of the web LocationActivityLogs row:
 * severity-tinted action icon, actor + user-type badge, the composed
 * description, then a wrapped chip line (category · severity · ID · when ·
 * View Details). Details expand INLINE into the metadata panel + raw JSON
 * rather than opening a separate sheet, exactly as on the web.
 */
const LogCard = ({
  log,
  showLocation,
  expanded,
  onToggleExpanded,
}: {
  log: ActivityLogEntry;
  showLocation: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
}) => {
  const severity = determineSeverity(log.action);
  const iconTone = SEVERITY_ICON_TONE[severity];
  const metadataItems = formatMetadataItems(log.metadata);
  const hasMetadata = metadataItems.length > 0;
  return (
    <View
      className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3 shadow-sm"
      style={CARD_SHADOW}
    >
      <View className="flex-row items-start gap-3">
        {/* Severity-tinted action icon */}
        <View
          className="w-9 h-9 rounded-lg items-center justify-center"
          style={{ backgroundColor: iconTone.bg }}
        >
          <Feather name={actionIcon(log.action)} size={16} color={iconTone.tint} />
        </View>

        <View className="flex-1 min-w-0">
          {/* Row 1: actor name + user-type badge (+ location, as on the web) */}
          <View className="flex-row items-center gap-2 flex-wrap mb-1.5">
            <Text
              className="text-base font-bold text-gray-900 dark:text-white shrink"
              numberOfLines={1}
            >
              {log.actor.name}
            </Text>
            <RoleBadge role={log.actor.role} label={log.actor.roleLabel} />
            {showLocation && !!log.locationName && (
              <>
                <Dot />
                <View className="flex-row items-center gap-1 shrink">
                  <Feather name="map-pin" size={11} color="#9CA3AF" />
                  <Text
                    className="text-xs text-gray-500 dark:text-gray-400"
                    numberOfLines={1}
                  >
                    {log.locationName}
                  </Text>
                </View>
              </>
            )}
          </View>

          {/* Row 2: composed description */}
          <Text className="text-sm text-gray-700 dark:text-gray-200 mb-2 leading-relaxed">
            {activityDescription(log)}
          </Text>

          {/* Row 3: chips — category · severity · ID · when · View Details */}
          <View className="flex-row items-center gap-2 flex-wrap">
            <CategoryBadge category={log.category} />
            <SeverityBadge severity={severity} />
            {log.entityId != null && (
              <>
                <Dot />
                <Text className="text-[11px] font-mono text-gray-600 dark:text-gray-400">
                  ID: {log.entityId}
                </Text>
              </>
            )}
            <Dot />
            <Text className="text-[11px] text-gray-500 dark:text-gray-400">
              {timeAgo(log.createdAt)}
            </Text>
            {hasMetadata && (
              <>
                <Dot />
                <Pressable
                  onPress={onToggleExpanded}
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  className={`flex-row items-center gap-1 px-2 py-1 rounded-full ${
                    expanded
                      ? "bg-blue-100 dark:bg-blue-900/30"
                      : "bg-gray-100 dark:bg-neutral-800"
                  }`}
                >
                  <Feather
                    name="info"
                    size={11}
                    color={expanded ? PRIMARY : "#6B7280"}
                  />
                  <Text
                    className={`text-[11px] font-medium ${
                      expanded
                        ? "text-[#0644C7] dark:text-blue-300"
                        : "text-gray-600 dark:text-gray-300"
                    }`}
                  >
                    {expanded ? "Hide Details" : "View Details"}
                  </Text>
                  <Feather
                    name={expanded ? "chevron-up" : "chevron-down"}
                    size={11}
                    color={expanded ? PRIMARY : "#6B7280"}
                  />
                </Pressable>
              </>
            )}
          </View>

          {expanded && hasMetadata && (
            <MetadataPanel items={metadataItems} metadata={log.metadata} />
          )}
        </View>
      </View>
    </View>
  );
};

/** The web's expanded "Activity Metadata" block: a two-column key/value grid
 *  above a collapsible raw-JSON dump. */
const MetadataPanel = ({
  items,
  metadata,
}: {
  items: { key: string; value: string }[];
  metadata: Record<string, unknown> | null;
}) => {
  const [showRaw, setShowRaw] = useState(false);
  return (
    <View className="mt-4 p-4 rounded-xl bg-gray-50 dark:bg-neutral-800/40 border border-gray-200 dark:border-neutral-700">
      <View className="flex-row items-center gap-2 mb-3">
        <Feather name="info" size={13} color="#6B7280" />
        <Text className="text-sm font-semibold text-gray-900 dark:text-white">
          Activity Metadata
        </Text>
      </View>

      <View className="flex-row flex-wrap -mx-1.5">
        {items.map((item) => (
          <View key={item.key} className="w-1/2 px-1.5 mb-3">
            <Text className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              {item.key}
            </Text>
            <Text
              className="text-sm text-gray-800 dark:text-gray-100"
              selectable
            >
              {item.value}
            </Text>
          </View>
        ))}
      </View>

      <Pressable
        onPress={() => setShowRaw((s) => !s)}
        className="flex-row items-center gap-1 mt-1"
        accessibilityRole="button"
        accessibilityState={{ expanded: showRaw }}
      >
        <Feather
          name={showRaw ? "chevron-down" : "chevron-right"}
          size={12}
          color="#6B7280"
        />
        <Text className="text-xs text-gray-500 dark:text-gray-400">
          View Raw JSON
        </Text>
      </Pressable>
      {showRaw && (
        <ScrollView
          style={{ maxHeight: 240 }}
          nestedScrollEnabled
          className="mt-2 p-3 rounded-lg bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700"
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Text
              className="text-xs text-gray-800 dark:text-gray-100"
              style={{ fontFamily: "monospace" }}
              selectable
            >
              {JSON.stringify(metadata, null, 2)}
            </Text>
          </ScrollView>
        </ScrollView>
      )}
    </View>
  );
};

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
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sheet, setSheet] = useState<null | "filters" | "export">(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);
  const [refreshing, setRefreshing] = useState(false);
  const [statsNonce, setStatsNonce] = useState(0);
  // Rows whose metadata panel is expanded (the web's `expandedLogIds`).
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const toggleExpanded = useCallback((id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const [exporting, setExporting] = useState(false);
  // Export filters are independent of the list's own filters (as on the web).
  const [exportSearch, setExportSearch] = useState("");
  const [exportAction, setExportAction] = useState("all");
  const [exportResourceType, setExportResourceType] = useState("all");
  const [exportDateRange, setExportDateRange] = useState("all");
  const [exportUserIds, setExportUserIds] = useState<Set<number>>(new Set());
  const [exportUserSearch, setExportUserSearch] = useState("");

  // Location comes from the global workspace selector (shown below the header),
  // so Activity Log follows the active location like every other module.
  const globalLocation = useActiveLocation();
  const activeLocationId =
    isCompanyAdmin && globalLocation.id !== "all"
      ? globalLocation.id
      : undefined;

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
    activeLocationId,
    debouncedSearch,
    perPage,
  ]);

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
  const optionSample = useActivityFilterOptions(activeLocationId, statsNonce);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
      setStatsNonce((n) => n + 1);
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  // Options come from a fixed window, not the visible page, so a small
  // rows-per-page can't hide users/actions the web admin offers.
  const optionLogs = optionSample.length > 0 ? optionSample : logs;

  const actionOptions = useMemo<{ label: string; value: string }[]>(() => {
    const set = new Set<string>();
    for (const l of optionLogs) if (l.action) set.add(l.action);
    return [
      { label: "All Actions", value: "all" },
      ...[...set].map((a) => ({ label: formatActionLabel(a), value: a })),
    ];
  }, [optionLogs]);

  const resourceTypeOptions = useMemo<{ label: string; value: string }[]>(() => {
    const set = new Set<string>();
    for (const l of optionLogs) {
      const rt = l.category || l.entityType;
      if (rt) set.add(rt);
    }
    return [
      { label: "All Types", value: "all" },
      ...[...set].map((t) => ({ label: capitalize(t), value: t })),
    ];
  }, [optionLogs]);

  const attendantOptions = useMemo<{ label: string; value: string }[]>(() => {
    const map = new Map<string, string>();
    for (const l of optionLogs) {
      if (l.actor.id != null) map.set(String(l.actor.id), l.actor.name);
    }
    return [
      { label: "All Attendants", value: "all" },
      ...[...map].map(([id, name]) => ({ label: name, value: id })),
    ];
  }, [optionLogs]);

  // Export user picker — the attendant options minus the leading "All" entry,
  // narrowed by the sheet's own search box.
  const exportUserOptions = useMemo(() => {
    const q = exportUserSearch.trim().toLowerCase();
    return attendantOptions
      .filter((o) => o.value !== "all")
      .map((o) => ({ id: Number(o.value), name: o.label }))
      .filter((u) => !q || u.name.toLowerCase().includes(q));
  }, [attendantOptions, exportUserSearch]);

  const allExportUsersSelected =
    exportUserOptions.length > 0 &&
    exportUserOptions.every((u) => exportUserIds.has(u.id));

  const toggleExportUser = useCallback((id: number) => {
    setExportUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllExportUsers = useCallback(() => {
    setExportUserIds((prev) => {
      const all = exportUserOptions.every((u) => prev.has(u.id));
      return all ? new Set() : new Set(exportUserOptions.map((u) => u.id));
    });
  }, [exportUserOptions]);

  // Open with everything reset — the web's modal always starts at "all".
  const openExport = useCallback(() => {
    setExportSearch("");
    setExportAction("all");
    setExportResourceType("all");
    setExportDateRange("all");
    setExportUserIds(new Set());
    setExportUserSearch("");
    setSheet("export");
  }, []);

  const exportFilters = useMemo<ActivityFilters>(() => {
    const range = dateRangeToFilter(exportDateRange);
    return {
      search: exportSearch.trim() || undefined,
      action: exportAction === "all" ? undefined : exportAction,
      category: exportResourceType === "all" ? undefined : exportResourceType,
      userId: exportUserIds.size > 0 ? [...exportUserIds] : undefined,
      locationId: activeLocationId,
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
    };
  }, [
    exportSearch,
    exportAction,
    exportResourceType,
    exportDateRange,
    exportUserIds,
    activeLocationId,
  ]);

  const exportCsv = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setExporting(true);
    try {
      const all = await fetchAllActivityLogs(token, exportFilters);
      if (all.length === 0) {
        Alert.alert(
          "Nothing to export",
          "No activity matches the selected filters.",
        );
        return;
      }
      setSheet(null);
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
  }, [exportFilters]);

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

  /** Non-default filters — drives the "Filters (N)" pill badge. Search isn't
   *  counted: it has its own visible field above the pill. */
  const activeFilterCount =
    (actionFilter !== "all" ? 1 : 0) +
    (resourceTypeFilter !== "all" ? 1 : 0) +
    (attendantFilter !== "all" ? 1 : 0) +
    (dateRange !== "all" ? 1 : 0);

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
            Location Activity Log
          </Text>
          {/* Export CSV — icon only, mirroring the back button's dimensions so
              the title stays centered. Opens the web's export filter modal. */}
          <Pressable
            onPress={openExport}
            disabled={exporting}
            className={`bg-gray-100 dark:bg-neutral-800 p-2 rounded-full ${
              exporting ? "opacity-60" : "active:opacity-70"
            }`}
            accessibilityRole="button"
            accessibilityLabel="Export CSV"
            accessibilityState={{ disabled: exporting }}
          >
            {exporting ? (
              <ActivityIndicator size="small" color={PRIMARY} />
            ) : (
              <Feather name="download" size={20} color={headerIcon} />
            )}
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
        <View className="px-5">
          {/* Intro */}
          <View className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mt-6 mb-5 shadow-sm">
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Location Activity Log
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Track activities across managers and attendants
            </Text>
          </View>

          {/* Global workspace location selector (company-admin only) — below the
              header, above the KPIs. Displays + switches the active location. */}
          <View className="mb-5">
            <LocationWorkspaceSelector />
          </View>

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
                    expanded={expandedIds.has(log.id)}
                    onToggleExpanded={() => toggleExpanded(log.id)}
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
            <SelectField
              label="Action"
              value={actionFilter}
              options={actionOptions as SelectOption[]}
              onSelect={(v) => setActionFilter(String(v))}
            />
            <SelectField
              label="Resource Type"
              value={resourceTypeFilter}
              options={resourceTypeOptions as SelectOption[]}
              onSelect={(v) => setResourceTypeFilter(String(v))}
            />
            <SelectField
              label="Attendant"
              value={attendantFilter}
              options={attendantOptions as SelectOption[]}
              onSelect={(v) => setAttendantFilter(String(v))}
            />
            <SelectField
              label="Date Range"
              value={dateRange}
              options={DATE_RANGE_OPTIONS as SelectOption[]}
              onSelect={(v) => setDateRange(String(v))}
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

      {/* Export — mirrors the web "Export Activity Logs" modal: its own filter
          set, independent of the list's, applied when Export CSV is pressed. */}
      <BottomSheet
        visible={sheet === "export"}
        onClose={() => (exporting ? undefined : setSheet(null))}
        title="Export Activity Logs"
      >
        <ScrollView
          className="px-5"
          contentContainerStyle={{ paddingBottom: 28 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text className="text-sm text-gray-500 dark:text-gray-400 pt-1 mb-4">
            Configure filters to export specific activity logs. All matching
            records will be included in the CSV file.
          </Text>

          <View className="gap-4">
            <View>
              <Text className="text-sm font-medium text-gray-800 dark:text-gray-100 mb-2">
                Users
              </Text>
              <View className="border border-gray-200 dark:border-neutral-700 rounded-xl p-3">
                <TextInput
                  value={exportUserSearch}
                  onChangeText={setExportUserSearch}
                  placeholder="Search users..."
                  placeholderTextColor="#9CA3AF"
                  className="bg-gray-50 dark:bg-neutral-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white mb-2"
                />

                <Pressable
                  onPress={toggleAllExportUsers}
                  className="flex-row items-center gap-2 pb-2 mb-1 border-b border-gray-100 dark:border-neutral-800"
                >
                  <Feather
                    name={
                      allExportUsersSelected ? "check-square" : "square"
                    }
                    size={18}
                    color={allExportUsersSelected ? PRIMARY : "#9CA3AF"}
                  />
                  <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 flex-1">
                    Select All ({exportUserOptions.length})
                  </Text>
                  {exportUserIds.size > 0 && (
                    <View className="bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
                      <Text className="text-[11px] font-medium text-blue-700 dark:text-blue-300">
                        {exportUserIds.size} selected
                      </Text>
                    </View>
                  )}
                </Pressable>

                <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                  {exportUserOptions.length === 0 ? (
                    <Text className="text-sm text-gray-400 dark:text-gray-500 text-center py-3">
                      {exportUserSearch
                        ? "No users found matching your search"
                        : "No users available"}
                    </Text>
                  ) : (
                    exportUserOptions.map((u) => {
                      const checked = exportUserIds.has(u.id);
                      return (
                        <Pressable
                          key={u.id}
                          onPress={() => toggleExportUser(u.id)}
                          className="flex-row items-center gap-2 py-2"
                        >
                          <Feather
                            name={checked ? "check-square" : "square"}
                            size={18}
                            color={checked ? PRIMARY : "#9CA3AF"}
                          />
                          <Text
                            numberOfLines={1}
                            className="text-sm text-gray-700 dark:text-gray-200 flex-1"
                          >
                            {u.name}
                          </Text>
                        </Pressable>
                      );
                    })
                  )}
                </ScrollView>
              </View>
            </View>

            <View>
              <Text className="text-sm font-medium text-gray-800 dark:text-gray-100 mb-2">
                Search
              </Text>
              <TextInput
                value={exportSearch}
                onChangeText={setExportSearch}
                placeholder="Search activities, users, or details..."
                placeholderTextColor="#9CA3AF"
                className="bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-xl px-3 py-3 text-sm text-gray-900 dark:text-white"
              />
            </View>

            <SelectField
              label="Action"
              value={exportAction}
              options={actionOptions as SelectOption[]}
              onSelect={(v) => setExportAction(String(v))}
            />
            <SelectField
              label="Resource Type"
              value={exportResourceType}
              options={resourceTypeOptions as SelectOption[]}
              onSelect={(v) => setExportResourceType(String(v))}
            />
            <SelectField
              label="Date Range"
              value={exportDateRange}
              options={DATE_RANGE_OPTIONS as SelectOption[]}
              onSelect={(v) => setExportDateRange(String(v))}
            />

            <View className="flex-row gap-3 mt-2">
              <Pressable
                onPress={() => setSheet(null)}
                disabled={exporting}
                className="flex-1 h-12 rounded-xl items-center justify-center border border-gray-200 dark:border-neutral-700 active:opacity-70"
              >
                <Text className="text-gray-700 dark:text-gray-200 font-semibold text-base">
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={exportCsv}
                disabled={exporting}
                className={`flex-1 h-12 rounded-xl flex-row items-center justify-center gap-2 bg-[#0644C7] active:opacity-90 ${
                  exporting ? "opacity-60" : ""
                }`}
              >
                {exporting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Feather name="download" size={16} color="#FFFFFF" />
                )}
                <Text className="text-white font-semibold text-base">
                  {exporting ? "Exporting…" : "Export CSV"}
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </BottomSheet>
    </View>
  );
};

export default ActivityLogs;
