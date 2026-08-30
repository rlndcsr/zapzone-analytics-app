import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { router, useFocusEffect } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AccountsTable } from "../../components/ui/AccountsTable";
import { BottomSheet } from "../../components/ui/BottomSheet";
import {
  DateRangeSheet,
  formatShortDate,
} from "../../components/ui/DateRangeSheet";
import { FilterPill, PillSegment } from "../../components/ui/FilterPill";
import {
  CheckboxRow,
  RadioRow,
  SelectField,
  type SelectOption,
  TextField,
} from "../../components/ui/FormControls";
import { KpiCard } from "../../components/ui/KpiCard";
import { LocationWorkspaceSelector } from "../../components/ui/LocationWorkspaceSelector";
import { NavTileCard } from "../../components/ui/NavTileCard";
import { Pagination } from "../../components/ui/Pagination";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { ViewToggle, type ViewMode } from "../../components/ui/ViewToggle";
import {
  consumeStaffStale,
  markStaffStale,
} from "../../lib/hooks/useStaffAccounts";
import { formatDateET, formatDateTimeET } from "../../lib/date/venueTime";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  fetchLocations,
  type LocationOption,
} from "../../services/locationsService";
import {
  createStaff,
  createStaffInvite,
  deleteStaffUser,
  fetchAllStaffUsers,
  resendStaffCredentials,
  roleLabel,
  toggleStaffStatus,
  updateStaff,
  type ResendCredentialsResult,
  type StaffRole,
  type StaffStatus,
  type StaffUser,
} from "../../services/usersService";

const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const PER_PAGE_OPTIONS = [5, 10, 25, 50];

const DEPARTMENTS = [
  "Guest Services",
  "Entertainment",
  "Food & Beverage",
  "Maintenance",
  "Security",
  "Administration",
];
const SHIFTS = ["Morning", "Afternoon", "Evening", "Night", "Flexible"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type StatusFilter = "all" | StaffStatus;
type UserTypeFilter = "all" | StaffRole;
type LastLoginFilter = "any" | "never" | "today" | "7" | "30";

const STATUS_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: "All Statuses", value: "all" },
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
];

const USER_TYPE_OPTIONS: { label: string; value: UserTypeFilter }[] = [
  { label: "All Types", value: "all" },
  { label: "Company Admins", value: "company_admin" },
  { label: "Location Managers", value: "location_manager" },
  { label: "Attendants", value: "attendant" },
];

const LAST_LOGIN_OPTIONS: { label: string; value: LastLoginFilter }[] = [
  { label: "Any Time", value: "any" },
  { label: "Never", value: "never" },
  { label: "Today", value: "today" },
  { label: "Last 7 Days", value: "7" },
  { label: "Last 30 Days", value: "30" },
];

// Role → pill tint (mirrors the web "Type" badges).
const ROLE_TONE: Record<string, string> = {
  company_admin:
    "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300",
  location_manager:
    "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
  attendant:
    "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
};

/* ----------------------------------------------------------------- helpers -- */

function within30Days(created: string | null): boolean {
  if (!created) return false;
  const d = new Date(created);
  if (Number.isNaN(d.getTime())) return false;
  return (Date.now() - d.getTime()) / 86_400_000 <= 30;
}

function timeValue(value: string | null): number {
  if (!value) return 0;
  // A bare YYYY-MM-DD must be read as a LOCAL calendar date; JS parses it as
  // UTC midnight, which lands on the previous day west of Greenwich and would
  // drop a matching row from the hire-date range filter.
  const s = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value;
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function parseYmd(value: string, endOfDay = false): number | null {
  const s = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = new Date(`${s}T${endOfDay ? "23:59:59" : "00:00:00"}`).getTime();
  return Number.isNaN(t) ? null : t;
}

function inDateRange(
  value: string | null,
  from: number | null,
  to: number | null,
): boolean {
  if (from == null && to == null) return true;
  const t = timeValue(value);
  if (!t) return false;
  if (from != null && t < from) return false;
  if (to != null && t > to) return false;
  return true;
}

/** Days since a last-login timestamp, or null when never logged in. */
function lastLoginDays(value: string | null): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

function matchesLastLogin(value: string | null, filter: LastLoginFilter): boolean {
  if (filter === "any") return true;
  if (filter === "never") return !value;
  const days = lastLoginDays(value);
  if (days == null) return false;
  if (filter === "today") return days === 0;
  if (filter === "7") return days <= 7;
  if (filter === "30") return days <= 30;
  return true;
}

function uniqueSorted(values: (string | null)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v))).sort(
    (a, b) => a.localeCompare(b),
  );
}

function formatDate(value: string | null): string {
  return formatDateET(value, { month: "short" });
}

function formatLastLogin(value: string | null): string {
  if (!value) return "Never";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Never";
  if (d.toDateString() === new Date().toDateString()) return "Today";
  return formatDate(value);
}

/* The detail sheet prints raw dates the way the web AccountViewModal does —
 * `toLocaleDateString()` / `toLocaleString()` — rather than the compact
 * "Jul 22, 2026" / "Today" the list and table use. */

/** Calendar date (no instant): "2026-07-22" → "7/22/2026", parsed locally so a
 *  UTC-midnight value can't render as the previous day. */
function formatCalendarDate(value: string | null): string {
  if (!value) return "—";
  const [y, m, d] = value.split("T")[0].split("-").map(Number);
  if (!y || !m || !d) return "—";
  return new Date(y, m - 1, d).toLocaleDateString("en-US");
}

/** Timestamp → "Jul 23, 2026", on the venue's clock (not the device's). */
function formatInstantDate(value: string | null): string {
  return formatDateET(value, { month: "short" });
}

/** Timestamp → "Jul 31, 2026 at 10:11 AM", on the venue's clock. */
function formatInstantDateTime(value: string | null): string {
  return formatDateTimeET(value, { month: "short", showZone: false });
}

function escapeCsv(value: string): string {
  const s = value ?? "";
  if (s === "") return "";
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CSV_HEADERS = [
  "Employee ID", "First Name", "Last Name", "Email", "Phone", "User Type",
  "Department", "Position", "Location", "Status", "Last Login", "Created",
  "Hire Date",
];

function buildAccountsCsv(rows: StaffUser[]): string {
  const lines = rows.map((u) =>
    [
      u.employeeId ?? "",
      u.firstName,
      u.lastName,
      u.email,
      u.phone ?? "",
      roleLabel(u.role),
      u.department ?? "",
      u.position ?? "",
      u.locationName ?? "",
      u.status,
      u.lastLogin ? formatInstantDateTime(u.lastLogin) : "",
      u.createdAt ? formatInstantDateTime(u.createdAt) : "",
      u.hireDate ?? "",
    ]
      .map((v) => escapeCsv(String(v ?? "")))
      .join(","),
  );
  return [CSV_HEADERS.join(","), ...lines].join("\n");
}

/* -------------------------------------------------------------- small parts -- */

const RoleBadge = ({ role }: { role: StaffRole }) => {
  const tone =
    ROLE_TONE[role] ??
    "bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-gray-300";
  return (
    <View className={`px-2 py-1 rounded-full ${tone}`}>
      <Text className={`text-[10px] font-semibold ${tone}`}>
        {roleLabel(role)}
      </Text>
    </View>
  );
};

/** Tinted rounded icon square shown left of a sheet title, matching the web
 *  modal headers (blue for view/edit, amber for the credentials reset). */
const SheetIconTile = ({
  icon,
  tint,
  bg,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  tint: string;
  bg: string;
}) => (
  <View
    className="w-9 h-9 rounded-lg items-center justify-center shrink-0"
    style={{ backgroundColor: bg }}
  >
    <Feather name={icon} size={18} color={tint} />
  </View>
);

/** One labelled value in the account detail sheet — the mobile twin of the web
 *  AccountViewModal's `Field` (grey icon tile, caption label, value beneath). */
const DetailField = ({
  icon,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  value: string | null;
}) => (
  <View className="w-1/2 px-1.5 mb-4">
    <View className="flex-row items-start gap-2.5">
      <View className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-neutral-800 items-center justify-center mt-0.5">
        <Feather name={icon} size={14} color="#6B7280" />
      </View>
      <View className="flex-1">
        <Text className="text-xs font-medium text-gray-500 dark:text-gray-400">
          {label}
        </Text>
        <Text className="text-sm text-gray-900 dark:text-white">
          {value || "—"}
        </Text>
      </View>
    </View>
  </View>
);

/** Uppercase section heading in the detail sheet (CONTACT / DATES / …). */
const DetailSection = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <View className="mb-2">
    <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
      {title}
    </Text>
    <View className="flex-row flex-wrap -mx-1.5">{children}</View>
  </View>
);

const DateField = ({
  value,
  placeholder,
  onPress,
}: {
  value: string;
  placeholder: string;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    className="flex-row items-center justify-between bg-white dark:bg-neutral-900 rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-800 active:opacity-70"
  >
    <Text
      className={`text-sm flex-1 mr-2 ${
        value
          ? "text-gray-900 dark:text-white"
          : "text-gray-400 dark:text-gray-500"
      }`}
      numberOfLines={1}
    >
      {value ? formatShortDate(value) : placeholder}
    </Text>
    <Feather name="calendar" size={16} color="#9CA3AF" />
  </Pressable>
);

const AccountCard = ({
  user,
  onPress,
}: {
  user: StaffUser;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3 shadow-sm active:opacity-90"
    style={CARD_SHADOW}
    accessibilityRole="button"
    accessibilityLabel={`Manage ${user.name}`}
  >
    <View className="flex-row items-start justify-between mb-2">
      <View className="flex-1 mr-3">
        <Text
          className="text-base font-bold text-gray-900 dark:text-white"
          numberOfLines={1}
        >
          {user.name}
        </Text>
        <Text
          className="text-xs text-gray-400 dark:text-gray-500 mt-0.5"
          numberOfLines={1}
        >
          {user.email}
        </Text>
      </View>
      <StatusBadge status={user.status} />
    </View>

    <View className="flex-row items-center flex-wrap gap-1.5">
      <RoleBadge role={user.role} />
      {!!user.department && (
        <View className="bg-gray-100 dark:bg-neutral-800 px-2 py-1 rounded-full">
          <Text className="text-[10px] font-medium text-gray-600 dark:text-gray-300">
            {user.department}
          </Text>
        </View>
      )}
    </View>

    {!!user.locationName && (
      <View className="flex-row items-center gap-1.5 mt-2">
        <Feather name="map-pin" size={12} color="#9CA3AF" />
        <Text className="text-xs text-gray-500 dark:text-gray-400" numberOfLines={1}>
          {user.locationName}
        </Text>
      </View>
    )}

    <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
      <View className="flex-row items-center gap-1.5">
        <Feather name="clock" size={12} color="#9CA3AF" />
        <Text className="text-xs text-gray-500 dark:text-gray-400">
          Last login: {formatLastLogin(user.lastLogin)}
        </Text>
      </View>
      <Feather name="more-horizontal" size={18} color="#9CA3AF" />
    </View>
  </Pressable>
);

/** Full-width page action button — the same h-12 outlined/filled pair the Day
 *  Offs screen uses for its toolbar, so every screen's actions read alike. */
const ActionButton = ({
  icon,
  label,
  onPress,
  variant = "secondary",
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
}) => {
  const primary = variant === "primary";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`flex-1 h-12 rounded-xl items-center justify-center flex-row gap-2 ${
        primary
          ? "bg-[#0644C7] active:opacity-90"
          : "border border-gray-200 dark:border-neutral-700 active:opacity-70"
      }`}
    >
      <Feather
        name={icon}
        size={primary ? 18 : 16}
        color={primary ? "#FFFFFF" : PRIMARY}
      />
      <Text
        numberOfLines={1}
        className={
          primary
            ? "text-white font-semibold text-base"
            : "text-gray-700 dark:text-gray-200 font-semibold text-sm"
        }
      >
        {label}
      </Text>
    </Pressable>
  );
};

/** A single chip in the table's bulk-action toolbar (Activate / Deactivate /
 *  Delete). Mirrors the bookings bulk bar's chip look. */
const BulkChip = ({
  label,
  icon,
  tint,
  loading,
  disabled,
  danger = false,
  onPress,
}: {
  label: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  tint: string;
  loading: boolean;
  disabled: boolean;
  danger?: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={label}
    className={`flex-row items-center gap-1.5 px-3 py-2 rounded-xl border bg-white dark:bg-neutral-900 active:opacity-70 ${
      danger
        ? "border-red-200 dark:border-red-900/50"
        : "border-gray-200 dark:border-neutral-700"
    } ${disabled ? "opacity-50" : ""}`}
  >
    {loading ? (
      <ActivityIndicator size="small" color={tint} />
    ) : (
      <Feather name={icon} size={14} color={tint} />
    )}
    <Text
      className={`text-xs font-semibold ${
        danger
          ? "text-red-600 dark:text-red-400"
          : "text-gray-700 dark:text-gray-200"
      }`}
    >
      {label}
    </Text>
  </Pressable>
);

/* ------------------------------------------------------------------ screen -- */

type FormState = {
  id: number | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  role: StaffRole;
  location_id: number | null;
  position: string;
  department: string;
  shift: string;
  status: StaffStatus;
  password_mode: "generate" | "custom";
  password: string;
  send_email: boolean;
  return_password: boolean;
};

function emptyForm(): FormState {
  return {
    id: null,
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    role: "attendant",
    location_id: null,
    position: "",
    department: "",
    shift: "",
    status: "active",
    password_mode: "generate",
    password: "",
    send_email: true,
    return_password: true,
  };
}

const ManageAccounts = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  const currentUser = getCurrentUser();
  const role = currentUser?.role;
  const isCompanyAdmin = role === "company_admin";
  const canManage = isCompanyAdmin || role === "location_manager";

  const [accounts, setAccounts] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [locations, setLocations] = useState<LocationOption[]>([]);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [userTypeFilter, setUserTypeFilter] = useState<UserTypeFilter>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [lastLoginFilter, setLastLoginFilter] = useState<LastLoginFilter>("any");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [hireFrom, setHireFrom] = useState("");
  const [hireTo, setHireTo] = useState("");

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);

  // Presentation layout for the accounts list — table by default (grid/card view
  // via the toggle), mirroring the web admin's Manage Accounts table.
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  // Bulk-selection (table view). The parent owns the selected id set.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<"active" | "inactive" | "delete" | null>(
    null,
  );

  const [sheet, setSheet] = useState<
    | null
    | "filters"
    | "createdRange"
    | "hireRange"
    | "actions"
    | "view"
    | "form"
    | "invite"
    | "resend"
    | "statusPicker"
  >(null);
  const [selected, setSelected] = useState<StaffUser | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  // Resend-credentials sheet (mirrors the web ResendCredentialsModal).
  const [resendMode, setResendMode] = useState<"generate" | "custom">("generate");
  const [resendPassword, setResendPassword] = useState("");
  const [resendSendEmail, setResendSendEmail] = useState(true);
  const [resendReturnPassword, setResendReturnPassword] = useState(true);
  const [resendConfirmed, setResendConfirmed] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendResult, setResendResult] = useState<ResendCredentialsResult | null>(
    null,
  );
  const [resendShowPassword, setResendShowPassword] = useState(false);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteUserType, setInviteUserType] = useState<StaffRole>("attendant");
  const [inviteLocationId, setInviteLocationId] = useState<number | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [inviting, setInviting] = useState(false);

  const [exporting, setExporting] = useState(false);

  /* ---- data ---- */

  const load = useCallback(async (signal?: AbortSignal) => {
    const token = getToken();
    if (!token) {
      setError("Your session has expired. Please sign in again.");
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const users = await fetchAllStaffUsers(
        token,
        { sortBy: "created_at", sortOrder: "desc" },
        signal,
      );
      // Web ManageAccounts defaults an unset department to "Administration".
      setAccounts(
        users.map((u) => ({
          ...u,
          department: u.department ?? "Administration",
        })),
      );
    } catch (err) {
      if (signal?.aborted) return;
      setError(err instanceof Error ? err.message : "Could not load accounts.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // Locations for the filter + create/invite pickers (lightweight endpoint).
  useEffect(() => {
    if (!isCompanyAdmin) return;
    const token = getToken();
    if (!token) return;
    const controller = new AbortController();
    fetchLocations(token, controller.signal)
      .then((l) => {
        if (!controller.signal.aborted) setLocations(l);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [isCompanyAdmin]);

  useFocusEffect(
    useCallback(() => {
      if (consumeStaffStale()) load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const afterMutation = useCallback(() => {
    markStaffStale();
    setSelected(null);
    load();
  }, [load]);

  /* ---- debounce + page reset ---- */

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [
    debouncedSearch,
    statusFilter,
    userTypeFilter,
    departmentFilter,
    locationFilter,
    lastLoginFilter,
    createdFrom,
    createdTo,
    hireFrom,
    hireTo,
    perPage,
  ]);

  /* ---- derived ---- */

  const departmentOptions = useMemo<{ label: string; value: string }[]>(
    () => [
      { label: "All Departments", value: "all" },
      ...uniqueSorted(accounts.map((a) => a.department)).map((d) => ({
        label: d,
        value: d,
      })),
    ],
    [accounts],
  );

  const locationFilterOptions = useMemo<{ label: string; value: string }[]>(
    () => [
      { label: "All Locations", value: "all" },
      ...uniqueSorted([
        ...accounts.map((a) => a.locationName),
        ...locations.map((l) => l.name),
      ]).map((n) => ({ label: n, value: n })),
    ],
    [accounts, locations],
  );

  const filtered = useMemo(() => {
    let rows = accounts;
    if (statusFilter !== "all")
      rows = rows.filter((a) => a.status === statusFilter);
    if (userTypeFilter !== "all")
      rows = rows.filter((a) => a.role === userTypeFilter);
    if (departmentFilter !== "all")
      rows = rows.filter((a) => (a.department ?? "") === departmentFilter);
    if (locationFilter !== "all")
      rows = rows.filter((a) => (a.locationName ?? "") === locationFilter);
    if (lastLoginFilter !== "any")
      rows = rows.filter((a) => matchesLastLogin(a.lastLogin, lastLoginFilter));

    const cf = parseYmd(createdFrom);
    const ct = parseYmd(createdTo, true);
    if (cf != null || ct != null)
      rows = rows.filter((a) => inDateRange(a.createdAt, cf, ct));

    const hf = parseYmd(hireFrom);
    const ht = parseYmd(hireTo, true);
    if (hf != null || ht != null)
      rows = rows.filter((a) => inDateRange(a.hireDate, hf, ht));

    const q = debouncedSearch.toLowerCase();
    if (q) {
      const tokens = q.split(/\s+/).filter(Boolean);
      rows = rows.filter((a) => {
        const fields = [
          a.firstName,
          a.lastName,
          a.name,
          a.email,
          a.phone,
          a.employeeId,
          a.department,
          a.locationName,
          a.position,
        ].map((v) => (v ?? "").toLowerCase());
        return tokens.every((t) => fields.some((f) => f.includes(t)));
      });
    }

    return [...rows].sort(
      (a, b) => timeValue(b.createdAt) - timeValue(a.createdAt),
    );
  }, [
    accounts,
    statusFilter,
    userTypeFilter,
    departmentFilter,
    locationFilter,
    lastLoginFilter,
    createdFrom,
    createdTo,
    hireFrom,
    hireTo,
    debouncedSearch,
  ]);

  /** Non-default filters — drives the "Filters (N)" pill badge. Search isn't
   *  counted: it has its own visible field above the pill. */
  const activeFilterCount =
    (statusFilter !== "all" ? 1 : 0) +
    (userTypeFilter !== "all" ? 1 : 0) +
    (departmentFilter !== "all" ? 1 : 0) +
    (locationFilter !== "all" ? 1 : 0) +
    (lastLoginFilter !== "any" ? 1 : 0) +
    (createdFrom || createdTo ? 1 : 0) +
    (hireFrom || hireTo ? 1 : 0);

  const total = filtered.length;
  const paged = useMemo(
    () => filtered.slice((page - 1) * perPage, page * perPage),
    [filtered, page, perPage],
  );

  // KPI aggregates over the full set (client-side, exactly like the web).
  const totalAccounts = accounts.length;
  const activeCount = accounts.filter((a) => a.status === "active").length;
  const managers = accounts.filter((a) => a.role === "location_manager");
  const attendantsList = accounts.filter((a) => a.role === "attendant");
  const activeManagers = managers.filter((a) => a.status === "active").length;
  const activeAttendants = attendantsList.filter(
    (a) => a.status === "active",
  ).length;
  const newCount = accounts.filter((a) => within30Days(a.createdAt)).length;

  const hasActiveFilters =
    statusFilter !== "all" ||
    userTypeFilter !== "all" ||
    departmentFilter !== "all" ||
    locationFilter !== "all" ||
    lastLoginFilter !== "any" ||
    !!createdFrom ||
    !!createdTo ||
    !!hireFrom ||
    !!hireTo ||
    search.trim() !== "";

  const clearFilters = useCallback(() => {
    setStatusFilter("all");
    setUserTypeFilter("all");
    setDepartmentFilter("all");
    setLocationFilter("all");
    setLastLoginFilter("any");
    setCreatedFrom("");
    setCreatedTo("");
    setHireFrom("");
    setHireTo("");
    setSearch("");
    setDebouncedSearch("");
    setPage(1);
    load();
  }, [load]);

  /* ---- create / edit ---- */

  const openCreate = useCallback(() => {
    setForm(emptyForm());
    setSheet("form");
  }, []);

  const openEdit = useCallback((u: StaffUser) => {
    setForm({
      id: u.id,
      first_name: u.firstName,
      last_name: u.lastName,
      email: u.email === "—" ? "" : u.email,
      phone: u.phone ?? "",
      role: u.role,
      location_id: u.locationId,
      position: u.position ?? "",
      department: u.department ?? "",
      shift: u.shift ?? "",
      status: (u.status as StaffStatus) ?? "active",
      password_mode: "generate",
      password: "",
      send_email: true,
      return_password: true,
    });
    setSheet("form");
  }, []);

  const isEditing = form.id != null;
  const requiresLocation = form.role !== "company_admin";

  const roleOptions = useMemo<SelectOption[]>(
    () => [
      { label: "Attendant", value: "attendant" },
      { label: "Location Manager", value: "location_manager" },
      { label: "Company Admin", value: "company_admin" },
    ],
    [],
  );

  const locationSelectOptions = useMemo<SelectOption[]>(
    () => locations.map((l) => ({ label: l.name, value: l.id })),
    [locations],
  );

  const saveForm = useCallback(async () => {
    const token = getToken();
    if (!token) return;

    const firstName = form.first_name.trim();
    const lastName = form.last_name.trim();
    const email = form.email.trim();

    if (!firstName || !lastName || !email) {
      Alert.alert("Missing information", "First name, last name, and email are required.");
      return;
    }
    if (!EMAIL_RE.test(email)) {
      Alert.alert("Invalid email", "Please enter a valid email address.");
      return;
    }
    if (!isEditing && requiresLocation && form.location_id == null) {
      Alert.alert("Location required", "Please select a location for this role.");
      return;
    }
    if (
      !isEditing &&
      form.password_mode === "custom" &&
      form.password.length < 8
    ) {
      Alert.alert("Weak password", "Custom password must be at least 8 characters.");
      return;
    }

    setSaving(true);
    try {
      if (isEditing && form.id != null) {
        await updateStaff(token, form.id, {
          first_name: firstName,
          last_name: lastName,
          email,
          phone: form.phone.trim() || null,
          position: form.position.trim() || null,
          department: form.department || null,
          shift: form.shift || null,
          status: form.status,
        });
        setSheet(null);
        afterMutation();
        Alert.alert("Changes saved", `${firstName} ${lastName}'s account was updated.`);
      } else {
        const result = await createStaff(token, {
          first_name: firstName,
          last_name: lastName,
          email,
          phone: form.phone.trim() || undefined,
          role: form.role,
          location_id: requiresLocation ? (form.location_id ?? undefined) : undefined,
          password_mode: form.password_mode,
          password:
            form.password_mode === "custom" ? form.password : undefined,
          send_email: form.send_email,
          return_password: form.return_password,
        });
        setSheet(null);
        afterMutation();
        const pwLine = result.generatedPassword
          ? `\n\nTemporary password: ${result.generatedPassword}`
          : "";
        const mailLine = result.emailSent
          ? "\n\nLogin credentials were emailed to the new user."
          : "";
        Alert.alert("Account created", `${firstName} ${lastName} was added.${pwLine}${mailLine}`);
      }
    } catch (err) {
      Alert.alert(
        isEditing ? "Update failed" : "Create failed",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }, [form, isEditing, requiresLocation, afterMutation]);

  /* ---- row actions ---- */

  const isSelf = selected?.id === currentUser?.id;

  const runToggle = useCallback(async () => {
    if (!selected) return;
    setActionBusy(true);
    try {
      await toggleStaffStatus(getToken() ?? "", selected.id);
      setSheet(null);
      afterMutation();
    } catch (err) {
      Alert.alert(
        "Update failed",
        err instanceof Error ? err.message : "Could not update this account.",
      );
    } finally {
      setActionBusy(false);
    }
  }, [selected, afterMutation]);

  // Set a specific account to a target status (used by the table's inline
  // Status dropdown). toggleStaffStatus flips, so only call it when different.
  const setStatusFor = useCallback(
    async (user: StaffUser, target: StaffStatus) => {
      if (user.status === target) {
        setSheet(null);
        return;
      }
      setActionBusy(true);
      try {
        await toggleStaffStatus(getToken() ?? "", user.id);
        setSheet(null);
        afterMutation();
      } catch (err) {
        Alert.alert(
          "Update failed",
          err instanceof Error ? err.message : "Could not update this account.",
        );
      } finally {
        setActionBusy(false);
      }
    },
    [afterMutation],
  );

  /** Open the resend sheet for a user, reset to its default state. */
  const openResendFor = useCallback((user: StaffUser) => {
    setSelected(user);
    setResendMode("generate");
    setResendPassword("");
    setResendSendEmail(true);
    setResendReturnPassword(true);
    setResendConfirmed(false);
    setResendError(null);
    setResendResult(null);
    setResendShowPassword(false);
    setSheet("resend");
  }, []);

  const submitResend = useCallback(async () => {
    if (!selected) return;
    setResendError(null);
    if (resendMode === "custom" && resendPassword.length < 8) {
      setResendError("Custom password must be at least 8 characters.");
      return;
    }
    setActionBusy(true);
    try {
      const result = await resendStaffCredentials(getToken() ?? "", selected.id, {
        passwordMode: resendMode,
        password: resendPassword,
        sendEmail: resendSendEmail,
        returnPassword: resendReturnPassword,
      });
      // The password IS rotated even when the email bounces, so always show the
      // result step rather than treating a failed send as a failed reset.
      setResendResult(result);
    } catch (err) {
      setResendError(
        err instanceof Error ? err.message : "Could not reset credentials.",
      );
    } finally {
      setActionBusy(false);
    }
  }, [
    selected,
    resendMode,
    resendPassword,
    resendSendEmail,
    resendReturnPassword,
  ]);

  const confirmDeleteFor = useCallback(
    (user: StaffUser) => {
      Alert.alert(
        "Delete account",
        `Permanently delete ${user.name}'s account? This cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              setActionBusy(true);
              try {
                await deleteStaffUser(getToken() ?? "", user.id);
                setSheet(null);
                afterMutation();
              } catch (err) {
                Alert.alert(
                  "Delete failed",
                  err instanceof Error ? err.message : "Could not delete this account.",
                );
              } finally {
                setActionBusy(false);
              }
            },
          },
        ],
      );
    },
    [afterMutation],
  );

  /* ---- selection + bulk actions (table view) ---- */

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const toggleRow = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Header checkbox — select / deselect every account on the current page.
  const toggleAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      const all = paged.length > 0 && paged.every((u) => prev.has(u.id));
      return all ? new Set() : new Set(paged.map((u) => u.id));
    });
  }, [paged]);

  // Selection is scoped to the visible page: clear it whenever the visible set
  // changes or we leave the table, so a bulk action never touches off-screen rows.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [
    debouncedSearch,
    statusFilter,
    userTypeFilter,
    departmentFilter,
    locationFilter,
    lastLoginFilter,
    createdFrom,
    createdTo,
    hireFrom,
    hireTo,
    page,
    perPage,
    viewMode,
  ]);

  // Bulk-set status / delete for the selected accounts. There's no bulk users
  // endpoint, so — like the bookings bulk bar — this fans out per-id requests,
  // skipping the current user and (for a status change) rows already in the
  // target state.
  const runBulk = useCallback(
    async (target: "active" | "inactive" | "delete") => {
      const token = getToken();
      if (!token || selectedIds.size === 0) return;
      const chosen = accounts.filter(
        (a) => selectedIds.has(a.id) && a.id !== currentUser?.id,
      );
      if (chosen.length === 0) {
        clearSelection();
        return;
      }
      setBulkBusy(target);
      try {
        if (target === "delete") {
          for (const u of chosen) await deleteStaffUser(token, u.id);
        } else {
          for (const u of chosen)
            if (u.status !== target) await toggleStaffStatus(token, u.id);
        }
        clearSelection();
        afterMutation();
      } catch (err) {
        Alert.alert(
          "Bulk action failed",
          err instanceof Error ? err.message : "Could not update the selection.",
        );
      } finally {
        setBulkBusy(null);
      }
    },
    [selectedIds, accounts, currentUser?.id, clearSelection, afterMutation],
  );

  const confirmBulkDelete = useCallback(() => {
    const count = selectedIds.size;
    if (count === 0) return;
    Alert.alert(
      "Delete accounts",
      `Permanently delete ${count} account(s)? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => runBulk("delete"),
        },
      ],
    );
  }, [selectedIds, runBulk]);

  /* ---- invite ---- */

  const openInvite = useCallback(() => {
    setInviteEmail("");
    setInviteUserType("attendant");
    setInviteLocationId(null);
    setInviteLink(null);
    setInviteSuccess(false);
    setSheet("invite");
  }, []);

  const sendInvite = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    const email = inviteEmail.trim();
    if (!email) return;
    if (inviteUserType === "attendant" && inviteLocationId == null) {
      Alert.alert("Location required", "Please select a location for this attendant.");
      return;
    }
    setInviting(true);
    try {
      const link = await createStaffInvite(token, {
        email,
        role: inviteUserType,
        company_id: currentUser?.company_id ?? undefined,
        // A manager's invite is scoped to the inviter's own location, as on web.
        location_id:
          inviteUserType === "attendant"
            ? (inviteLocationId ?? undefined)
            : inviteUserType === "location_manager"
              ? (currentUser?.location_id ?? undefined)
              : undefined,
      });
      setInviteLink(link || null);
      setInviteSuccess(true);
    } catch (err) {
      Alert.alert(
        "Invitation failed",
        err instanceof Error ? err.message : "Could not create an invitation.",
      );
    } finally {
      setInviting(false);
    }
  }, [inviteEmail, inviteUserType, inviteLocationId, currentUser]);

  const shareInviteLink = useCallback(async () => {
    if (!inviteLink) return;
    await Share.share({
      message: `You're invited to join ZapZone. Complete your account setup here: ${inviteLink}`,
    });
  }, [inviteLink]);

  /* ---- export ---- */

  const exportCsv = useCallback(async () => {
    if (filtered.length === 0) {
      Alert.alert("Nothing to export", "No accounts match the current filters.");
      return;
    }
    setExporting(true);
    try {
      const csv = buildAccountsCsv(filtered);
      const FileSystem = await import("expo-file-system/legacy");
      const Sharing = await import("expo-sharing");
      const stamp = new Date().toISOString().split("T")[0];
      const dest = `${FileSystem.cacheDirectory}accounts-export-${stamp}.csv`;
      await FileSystem.writeAsStringAsync(dest, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(dest, {
          mimeType: "text/csv",
          dialogTitle: "Export accounts",
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
  }, [filtered]);


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
            Manage Accounts
          </Text>
          {/* Export CSV lives in the header as an icon-only action. */}
          {canManage ? (
            <Pressable
              onPress={exportCsv}
              disabled={exporting}
              className={`bg-gray-100 dark:bg-neutral-800 p-2 rounded-full ${
                exporting ? "opacity-60" : ""
              }`}
              accessibilityRole="button"
              accessibilityLabel="Export CSV"
            >
              {exporting ? (
                <ActivityIndicator size="small" color={headerIcon} />
              ) : (
                <Feather name="download" size={20} color={headerIcon} />
              )}
            </Pressable>
          ) : (
            <View style={{ width: 36 }} />
          )}
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
              Manage Accounts
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Manage all staff accounts across your company
            </Text>
          </View>

          {/* Global workspace location selector (company-admin only). */}
          <View className="mb-5">
            <LocationWorkspaceSelector />
          </View>

          {/* Page actions — a 2-column grid of square cards, the same design
              the Bookings / Packages / Waivers modules use. */}
          <View className="-mx-1.5 flex-row flex-wrap">
            <View className="mb-3 w-1/2 px-1.5">
              <NavTileCard
                icon="activity"
                title="Activity Log"
                desc="Review staff account activity"
                cta="View Log"
                onPress={() =>
                  router.push("/user-managements/activity-logs" as never)
                }
              />
            </View>
            <View className="mb-3 w-1/2 px-1.5">
              <NavTileCard
                icon="calendar"
                title="Day Offs"
                desc="Blocked dates and holidays"
                cta="Manage Day Offs"
                onPress={() =>
                  router.push("/user-managements/day-offs" as never)
                }
              />
            </View>
          </View>

          {/* The two write actions, side by side above the list. */}
          {canManage && (
            <View className="flex-row items-stretch gap-3 mb-3">
              <ActionButton
                icon="send"
                label="Send Invitation"
                onPress={openInvite}
              />
              <ActionButton
                icon="plus"
                label="Staff Account"
                onPress={openCreate}
                variant="primary"
              />
            </View>
          )}

          {/* Error state */}
          {!loading && error && (
            <View className="bg-red-50 border border-red-100 rounded-2xl p-5 mb-5">
              <Text className="text-red-600 font-semibold">Something went wrong</Text>
              <Text className="text-red-500 text-sm mt-1">{error}</Text>
            </View>
          )}

          {/* KPI cards */}
          <View className="flex-row flex-wrap -mx-1.5 mb-3">
            <View className="w-1/2">
              <KpiCard
                icon="users"
                tone={{ bg: "#0644C720", tint: PRIMARY }}
                title="Total Accounts"
                value={String(totalAccounts)}
                hint={`${activeCount} active`}
              />
            </View>
            <View className="w-1/2">
              <KpiCard
                icon="shield"
                tone={{ bg: "#3B82F620", tint: "#3B82F6" }}
                title="Location Managers"
                value={String(managers.length)}
                hint={`${activeManagers} active`}
              />
            </View>
            <View className="w-1/2">
              <KpiCard
                icon="user"
                tone={{ bg: "#F59E0B20", tint: "#F59E0B" }}
                title="Attendants"
                value={String(attendantsList.length)}
                hint={`${activeAttendants} active`}
              />
            </View>
            <View className="w-1/2">
              <KpiCard
                icon="user-plus"
                tone={{ bg: "#10B98120", tint: "#10B981" }}
                title="New Accounts"
                value={String(newCount)}
                hint="Last 30 days"
              />
            </View>
          </View>

          {/* Search */}
          <View className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3 rounded-xl border border-gray-100 dark:border-neutral-800 mt-2 mb-3">
            <Feather name="search" size={16} color="#9CA3AF" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search accounts..."
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

          {/* List header + top pagination (below the title, same state as bottom) */}
          {!loading && !error && (
            <View className="mb-4 mt-1">
              <View className="flex-row items-center gap-2">
                <Text
                  numberOfLines={1}
                  className="shrink text-lg font-bold text-gray-900 dark:text-white"
                >
                  Accounts
                </Text>
                <View className="shrink-0 bg-gray-100 dark:bg-neutral-800 px-2.5 py-0.5 rounded-full">
                  <Text className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    {total}
                  </Text>
                </View>
                {/* Layout toggle (Table default / Cards grid). */}
                <View className="ml-auto">
                  <ViewToggle mode={viewMode} onChange={setViewMode} />
                </View>
              </View>
              
            </View>
          )}

          {/* Bulk-action toolbar — table view, shown while a selection exists. */}
          {viewMode === "table" && selectedIds.size > 0 && (
            <View className="rounded-2xl border border-[#0644C7]/30 bg-blue-50 dark:bg-blue-900/20 p-3 mb-4">
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-sm font-semibold text-[#0644C7] dark:text-blue-300">
                  {selectedIds.size} selected
                </Text>
                <Pressable
                  onPress={clearSelection}
                  disabled={bulkBusy !== null}
                  hitSlop={8}
                  className="flex-row items-center gap-1 active:opacity-70"
                >
                  <Feather name="x" size={14} color="#6B7280" />
                  <Text className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    Clear
                  </Text>
                </Pressable>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
              >
                <BulkChip
                  label="Activate"
                  icon="user-check"
                  tint="#16A34A"
                  loading={bulkBusy === "active"}
                  disabled={bulkBusy !== null}
                  onPress={() => runBulk("active")}
                />
                <BulkChip
                  label="Deactivate"
                  icon="user-x"
                  tint="#B45309"
                  loading={bulkBusy === "inactive"}
                  disabled={bulkBusy !== null}
                  onPress={() => runBulk("inactive")}
                />
                {isCompanyAdmin && (
                  <BulkChip
                    label="Delete"
                    icon="trash-2"
                    tint="#DC2626"
                    danger
                    loading={bulkBusy === "delete"}
                    disabled={bulkBusy !== null}
                    onPress={confirmBulkDelete}
                  />
                )}
              </ScrollView>
            </View>
          )}

          {/* List / states */}
          {loading ? (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl p-10 items-center shadow-sm">
              <ActivityIndicator color={PRIMARY} />
            </View>
          ) : !error && paged.length === 0 ? (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl p-8 items-center shadow-sm">
              <View className="w-16 h-16 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center mb-3">
                <Feather name="users" size={26} color="#9CA3AF" />
              </View>
              <Text className="text-gray-700 dark:text-gray-200 font-semibold text-lg">
                No accounts found
              </Text>
              <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1 max-w-xs">
                {hasActiveFilters
                  ? "Try a different filter or search term."
                  : "Create a staff account to get started."}
              </Text>
            </View>
          ) : (
            !error && (
              <>
                {viewMode === "table" ? (
                  <AccountsTable
                    accounts={paged}
                    selectedIds={selectedIds}
                    onToggleRow={toggleRow}
                    onToggleAll={toggleAllVisible}
                    currentUserId={currentUser?.id}
                    canManage={canManage}
                    isCompanyAdmin={isCompanyAdmin}
                    onView={(u) => {
                      setSelected(u);
                      setSheet("view");
                    }}
                    onEdit={openEdit}
                    onStatusPress={(u) => {
                      setSelected(u);
                      setSheet("statusPicker");
                    }}
                    onResend={openResendFor}
                    onDelete={confirmDeleteFor}
                  />
                ) : (
                  paged.map((u) => (
                    <AccountCard
                      key={u.id}
                      user={u}
                      onPress={() => {
                        setSelected(u);
                        setSheet("actions");
                      }}
                    />
                  ))
                )}

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
              label="Status"
              value={statusFilter}
              options={STATUS_OPTIONS as SelectOption[]}
              onSelect={(v) => setStatusFilter(v as StatusFilter)}
            />
            <SelectField
              label="User Type"
              value={userTypeFilter}
              options={USER_TYPE_OPTIONS as SelectOption[]}
              onSelect={(v) => setUserTypeFilter(v as UserTypeFilter)}
            />
            <SelectField
              label="Department"
              value={departmentFilter}
              options={departmentOptions}
              onSelect={(v) => setDepartmentFilter(String(v))}
            />
            <SelectField
              label="Location"
              value={locationFilter}
              options={locationFilterOptions}
              onSelect={(v) => setLocationFilter(String(v))}
            />
            <SelectField
              label="Last Login"
              value={lastLoginFilter}
              options={LAST_LOGIN_OPTIONS as SelectOption[]}
              onSelect={(v) => setLastLoginFilter(v as LastLoginFilter)}
            />

            <View>
              <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                Created Date
              </Text>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <DateField
                    value={createdFrom}
                    placeholder="From"
                    onPress={() => setSheet("createdRange")}
                  />
                </View>
                <View className="flex-1">
                  <DateField
                    value={createdTo}
                    placeholder="To"
                    onPress={() => setSheet("createdRange")}
                  />
                </View>
              </View>
            </View>

            <View>
              <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                Hire Date
              </Text>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <DateField
                    value={hireFrom}
                    placeholder="From"
                    onPress={() => setSheet("hireRange")}
                  />
                </View>
                <View className="flex-1">
                  <DateField
                    value={hireTo}
                    placeholder="To"
                    onPress={() => setSheet("hireRange")}
                  />
                </View>
              </View>
            </View>

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

      <DateRangeSheet
        visible={sheet === "createdRange"}
        initialStart={createdFrom}
        initialEnd={createdTo}
        onClose={() => setSheet("filters")}
        onApply={(start, end) => {
          setCreatedFrom(start);
          setCreatedTo(end);
          setSheet("filters");
        }}
      />
      <DateRangeSheet
        visible={sheet === "hireRange"}
        initialStart={hireFrom}
        initialEnd={hireTo}
        onClose={() => setSheet("filters")}
        onApply={(start, end) => {
          setHireFrom(start);
          setHireTo(end);
          setSheet("filters");
        }}
      />

      {/* Actions sheet */}
      <BottomSheet
        visible={sheet === "actions"}
        onClose={() => (actionBusy ? undefined : setSheet(null))}
        title={selected?.name ?? "Account"}
      >
        <View className="px-4 pb-8">
          <View className="flex-row items-center gap-2 px-4 pb-3 mb-2 border-b border-gray-100 dark:border-neutral-800">
            {selected && <RoleBadge role={selected.role} />}
            {selected && <StatusBadge status={selected.status} />}
            <Text
              className="text-xs text-gray-400 dark:text-gray-500 flex-1 text-right"
              numberOfLines={1}
            >
              {selected?.email}
            </Text>
          </View>

          {actionBusy ? (
            <View className="py-6 items-center">
              <ActivityIndicator color={PRIMARY} />
            </View>
          ) : (
            <>
              <Pressable
                onPress={() => setSheet("view")}
                className="flex-row items-center gap-3 px-4 py-4 rounded-xl active:bg-gray-50 dark:active:bg-neutral-800"
              >
                <Feather name="eye" size={18} color={PRIMARY} />
                <Text className="text-base font-medium text-gray-800 dark:text-gray-100 flex-1">
                  View details
                </Text>
              </Pressable>

              {canManage && !isSelf ? (
                <>
                  <Pressable
                    onPress={() => selected && openEdit(selected)}
                    className="flex-row items-center gap-3 px-4 py-4 rounded-xl active:bg-gray-50 dark:active:bg-neutral-800"
                  >
                    <Feather name="edit-2" size={18} color={PRIMARY} />
                    <Text className="text-base font-medium text-gray-800 dark:text-gray-100 flex-1">
                      Edit account
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={runToggle}
                    className="flex-row items-center gap-3 px-4 py-4 rounded-xl active:bg-gray-50 dark:active:bg-neutral-800"
                  >
                    <Feather
                      name={selected?.status === "active" ? "user-x" : "user-check"}
                      size={18}
                      color={PRIMARY}
                    />
                    <Text className="text-base font-medium text-gray-800 dark:text-gray-100 flex-1">
                      {selected?.status === "active"
                        ? "Deactivate account"
                        : "Activate account"}
                    </Text>
                  </Pressable>

                  {isCompanyAdmin && (
                    <Pressable
                      onPress={() => selected && openResendFor(selected)}
                      className="flex-row items-center gap-3 px-4 py-4 rounded-xl active:bg-gray-50 dark:active:bg-neutral-800"
                    >
                      <Feather name="key" size={18} color={PRIMARY} />
                      <Text className="text-base font-medium text-gray-800 dark:text-gray-100 flex-1">
                        Resend credentials
                      </Text>
                    </Pressable>
                  )}

                  {isCompanyAdmin && (
                    <Pressable
                      onPress={() => selected && confirmDeleteFor(selected)}
                      className="flex-row items-center gap-3 px-4 py-4 rounded-xl active:bg-red-50 dark:active:bg-red-900/20"
                    >
                      <Feather name="trash-2" size={18} color="#EF4444" />
                      <Text className="text-base font-medium text-red-600 flex-1">
                        Delete account
                      </Text>
                    </Pressable>
                  )}
                </>
              ) : isSelf ? (
                <Text className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">
                  You can&apos;t manage your own account from here.
                </Text>
              ) : null}
            </>
          )}
        </View>
      </BottomSheet>

      {/* Status picker (table inline dropdown) */}
      <BottomSheet
        visible={sheet === "statusPicker"}
        onClose={() => (actionBusy ? undefined : setSheet(null))}
        title="Set Status"
      >
        <View className="px-4 pb-8">
          {actionBusy ? (
            <View className="py-6 items-center">
              <ActivityIndicator color={PRIMARY} />
            </View>
          ) : (
            (["active", "inactive"] as StaffStatus[]).map((option) => {
              const isSelected = selected?.status === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => selected && setStatusFor(selected, option)}
                  className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
                    isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                  }`}
                >
                  <Text
                    className={`text-base font-medium capitalize ${
                      isSelected
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-gray-700 dark:text-gray-200"
                    }`}
                  >
                    {option}
                  </Text>
                  {isSelected && (
                    <View className="w-6 h-6 rounded-full bg-blue-500 items-center justify-center">
                      <Feather name="check" size={14} color="#FFFFFF" />
                    </View>
                  )}
                </Pressable>
              );
            })
          )}
        </View>
      </BottomSheet>

      {/* View detail sheet — the web AccountViewModal's sections and fields.
          Closes straight out (never back to the actions sheet), so tapping the
          table's eye icon shows exactly one sheet. */}
      <BottomSheet
        visible={sheet === "view"}
        onClose={() => setSheet(null)}
        title={selected?.name ?? "Account"}
        subtitle={
          selected
            ? [selected.status, selected.employeeId, roleLabel(selected.role)]
                .filter(Boolean)
                .join(" · ")
            : undefined
        }
        icon={<SheetIconTile icon="user" tint={PRIMARY} bg="#0644C71A" />}
      >
        {selected && (
          <ScrollView className="px-5 pb-8" showsVerticalScrollIndicator={false}>
            <View className="flex-row items-center gap-2 mb-5">
              <StatusBadge status={selected.status} />
              <RoleBadge role={selected.role} />
            </View>

            <DetailSection title="Contact">
              <DetailField icon="mail" label="Email" value={selected.email} />
              <DetailField icon="phone" label="Phone" value={selected.phone} />
            </DetailSection>

            <DetailSection title="Role & Department">
              <DetailField
                icon="shield"
                label="Role"
                value={roleLabel(selected.role)}
              />
              <DetailField
                icon="briefcase"
                label="Position"
                value={selected.position}
              />
              <DetailField
                icon="home"
                label="Department"
                value={selected.department}
              />
              <DetailField icon="clock" label="Shift" value={selected.shift} />
              <DetailField
                icon="hash"
                label="Employee ID"
                value={selected.employeeId}
              />
              <DetailField
                icon="map-pin"
                label="Location"
                value={selected.locationName}
              />
            </DetailSection>

            <DetailSection title="Dates">
              <DetailField
                icon="calendar"
                label="Hire Date"
                value={formatCalendarDate(selected.hireDate)}
              />
              <DetailField
                icon="calendar"
                label="Created"
                value={formatInstantDate(selected.createdAt)}
              />
              {!!selected.lastLogin && (
                <DetailField
                  icon="log-in"
                  label="Last Login"
                  value={formatInstantDateTime(selected.lastLogin)}
                />
              )}
            </DetailSection>

            <Pressable
              onPress={() => setSheet(null)}
              className="h-12 rounded-xl items-center justify-center bg-[#0644C7] active:opacity-90 mt-2"
            >
              <Text className="text-base font-semibold text-white">Close</Text>
            </Pressable>
          </ScrollView>
        )}
      </BottomSheet>

      {/* Create / edit form sheet */}
      <BottomSheet
        visible={sheet === "form"}
        onClose={() => (saving ? undefined : setSheet(null))}
        title={isEditing ? "Edit Account" : "Create Staff Account"}
        subtitle={
          isEditing && selected
            ? [selected.name, selected.employeeId].filter(Boolean).join(" · ")
            : undefined
        }
        icon={
          <SheetIconTile
            icon={isEditing ? "edit-2" : "user-plus"}
            tint={PRIMARY}
            bg="#0644C71A"
          />
        }
      >
        <ScrollView
          className="px-5"
          contentContainerStyle={{ paddingBottom: 28 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-4 pt-2">
            <View className="flex-row gap-3">
              <View className="flex-1">
                <TextField
                  label="First name"
                  required
                  value={form.first_name}
                  onChangeText={(v) => setForm((f) => ({ ...f, first_name: v }))}
                  placeholder="Jordan"
                />
              </View>
              <View className="flex-1">
                <TextField
                  label="Last name"
                  required
                  value={form.last_name}
                  onChangeText={(v) => setForm((f) => ({ ...f, last_name: v }))}
                  placeholder="Rivera"
                />
              </View>
            </View>

            <TextField
              label="Email"
              required
              value={form.email}
              onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
              placeholder="jordan@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <TextField
              label="Phone"
              value={form.phone}
              onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))}
              placeholder="(555) 123-4567"
              keyboardType="phone-pad"
            />

            {isEditing ? (
              <>
                <TextField
                  label="Position"
                  value={form.position}
                  onChangeText={(v) => setForm((f) => ({ ...f, position: v }))}
                  placeholder="Attendant"
                />
                <SelectField
                  label="Department"
                  placeholder="Select department"
                  value={form.department || null}
                  options={DEPARTMENTS.map((d) => ({ label: d, value: d }))}
                  onSelect={(v) =>
                    setForm((f) => ({ ...f, department: String(v) }))
                  }
                />
                <SelectField
                  label="Shift"
                  placeholder="Select shift"
                  value={form.shift || null}
                  options={SHIFTS.map((s) => ({ label: s, value: s }))}
                  onSelect={(v) => setForm((f) => ({ ...f, shift: String(v) }))}
                />
                <SelectField
                  label="Status"
                  value={form.status}
                  options={[
                    { label: "Active", value: "active" },
                    { label: "Inactive", value: "inactive" },
                  ]}
                  onSelect={(v) =>
                    setForm((f) => ({ ...f, status: String(v) as StaffStatus }))
                  }
                />
              </>
            ) : (
              <>
                <SelectField
                  label="Role"
                  required
                  value={form.role}
                  options={roleOptions}
                  onSelect={(v) =>
                    setForm((f) => ({
                      ...f,
                      role: String(v) as StaffRole,
                      // Company admins are not tied to a location.
                      location_id: v === "company_admin" ? null : f.location_id,
                    }))
                  }
                />

                {requiresLocation && (
                  <SelectField
                    label="Location"
                    required
                    placeholder="Select a location"
                    value={form.location_id}
                    options={locationSelectOptions}
                    onSelect={(v) =>
                      setForm((f) => ({ ...f, location_id: Number(v) }))
                    }
                  />
                )}

                <SelectField
                  label="Password"
                  value={form.password_mode}
                  options={[
                    { label: "Generate a strong password (recommended)", value: "generate" },
                    { label: "Set a custom password", value: "custom" },
                  ]}
                  onSelect={(v) =>
                    setForm((f) => ({
                      ...f,
                      password_mode: v === "custom" ? "custom" : "generate",
                    }))
                  }
                />
                {form.password_mode === "custom" && (
                  <TextField
                    label="Custom password"
                    required
                    value={form.password}
                    onChangeText={(v) => setForm((f) => ({ ...f, password: v }))}
                    placeholder="Min 8 characters"
                    secureTextEntry
                    hint="Minimum 8 characters."
                  />
                )}

                <CheckboxRow
                  label="Email credentials to the new user"
                  checked={form.send_email}
                  onToggle={() =>
                    setForm((f) => ({ ...f, send_email: !f.send_email }))
                  }
                />
                <CheckboxRow
                  label="Show me the password after creation"
                  checked={form.return_password}
                  onToggle={() =>
                    setForm((f) => ({
                      ...f,
                      return_password: !f.return_password,
                    }))
                  }
                />
              </>
            )}

            {/* Footer: Cancel + primary, as the web modal pairs them. */}
            <View className="flex-row gap-3 mt-2">
              <Pressable
                onPress={() => setSheet(null)}
                disabled={saving}
                className={`flex-1 h-12 rounded-xl items-center justify-center border border-gray-200 dark:border-neutral-700 active:opacity-70 ${
                  saving ? "opacity-50" : ""
                }`}
              >
                <Text className="text-gray-700 dark:text-gray-200 font-semibold text-base">
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={saveForm}
                disabled={saving}
                className={`flex-1 h-12 rounded-xl items-center justify-center flex-row gap-2 ${
                  saving ? "bg-[#0644C7]/60" : "bg-[#0644C7] active:opacity-90"
                }`}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Feather
                    name={isEditing ? "edit-2" : "user-plus"}
                    size={16}
                    color="#FFFFFF"
                  />
                )}
                <Text
                  numberOfLines={1}
                  className="text-white font-semibold text-base"
                >
                  {isEditing ? "Save changes" : "Create account"}
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </BottomSheet>

      {/* Resend credentials sheet — mirrors the web ResendCredentialsModal:
          warning, password mode, delivery options, an explicit confirmation,
          then a result step that reveals the password once. */}
      <BottomSheet
        visible={sheet === "resend"}
        onClose={() => (actionBusy ? undefined : setSheet(null))}
        title={resendResult ? "Credentials reset" : "Resend credentials"}
        subtitle={selected?.name}
        icon={<SheetIconTile icon="key" tint="#B45309" bg="#FEF3C7" />}
      >
        <ScrollView
          className="px-5"
          contentContainerStyle={{ paddingBottom: 28 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {resendResult ? (
            <View className="gap-4 pt-1">
              <View
                className={`flex-row items-start gap-2 rounded-xl border p-3 ${
                  resendResult.emailSent
                    ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-900/40"
                    : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-900/40"
                }`}
              >
                <Feather
                  name={resendResult.emailSent ? "check-circle" : "alert-triangle"}
                  size={18}
                  color={resendResult.emailSent ? "#10B981" : "#D97706"}
                />
                <View className="flex-1">
                  <Text
                    className={`text-sm font-semibold ${
                      resendResult.emailSent
                        ? "text-emerald-800 dark:text-emerald-300"
                        : "text-amber-800 dark:text-amber-300"
                    }`}
                  >
                    Password rotated successfully.
                  </Text>
                  <Text
                    className={`text-sm mt-0.5 ${
                      resendResult.emailSent
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-amber-700 dark:text-amber-400"
                    }`}
                  >
                    {resendResult.emailSent
                      ? `New credentials emailed to ${selected?.email}.`
                      : "Email could not be delivered — share the password manually."}
                  </Text>
                </View>
              </View>

              {!resendResult.emailSent && !!resendResult.emailError && (
                <View className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 rounded-xl p-3">
                  <Text className="text-sm text-amber-800 dark:text-amber-300">
                    {resendResult.emailError}
                  </Text>
                </View>
              )}

              {!!resendResult.password && (
                <View>
                  <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    New password
                  </Text>
                  <View className="flex-row gap-2">
                    <View className="flex-1 flex-row items-center justify-between bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-xl px-3.5 py-3">
                      <Text
                        className="text-sm text-gray-900 dark:text-white flex-1"
                        style={{ fontFamily: "monospace" }}
                        numberOfLines={1}
                      >
                        {resendShowPassword
                          ? resendResult.password
                          : "••••••••••••"}
                      </Text>
                      <Pressable
                        onPress={() => setResendShowPassword((s) => !s)}
                        hitSlop={10}
                        accessibilityLabel={
                          resendShowPassword ? "Hide password" : "Show password"
                        }
                      >
                        <Feather
                          name={resendShowPassword ? "eye-off" : "eye"}
                          size={16}
                          color="#6B7280"
                        />
                      </Pressable>
                    </View>
                    <Pressable
                      onPress={async () => {
                        await Clipboard.setStringAsync(resendResult.password!);
                        Alert.alert("Copied", "Password copied to the clipboard.");
                      }}
                      className="w-12 h-12 rounded-xl items-center justify-center border border-gray-200 dark:border-neutral-700 active:opacity-70"
                      accessibilityLabel="Copy password"
                    >
                      <Feather name="copy" size={16} color={PRIMARY} />
                    </Pressable>
                  </View>
                  <View className="flex-row items-start gap-1.5 mt-2">
                    <Feather name="alert-triangle" size={13} color="#B45309" />
                    <Text className="text-xs text-amber-700 dark:text-amber-400 flex-1">
                      This password will not be shown again.
                    </Text>
                  </View>
                </View>
              )}

              <Pressable
                onPress={() => setSheet(null)}
                className="h-12 rounded-xl items-center justify-center bg-[#0644C7] active:opacity-90 mt-1"
              >
                <Text className="text-base font-semibold text-white">Done</Text>
              </Pressable>
            </View>
          ) : (
            <View className="gap-4 pt-1">
              <View className="flex-row items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 rounded-xl p-3">
                <Feather name="alert-triangle" size={16} color="#D97706" />
                <Text className="text-sm text-amber-800 dark:text-amber-300 flex-1">
                  This will <Text className="font-bold">replace</Text>{" "}
                  {selected?.name}&rsquo;s current password. Their existing login
                  will stop working immediately.
                </Text>
              </View>

              {!!resendError && (
                <View className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 rounded-xl p-3">
                  <Text className="text-sm text-red-700 dark:text-red-400">
                    {resendError}
                  </Text>
                </View>
              )}

              <View>
                <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                  New password
                </Text>
                <RadioRow
                  label="Generate a strong password"
                  selected={resendMode === "generate"}
                  onPress={() => setResendMode("generate")}
                />
                <RadioRow
                  label="Set a custom password"
                  selected={resendMode === "custom"}
                  onPress={() => setResendMode("custom")}
                />
                {resendMode === "custom" && (
                  <View className="mt-2">
                    <TextField
                      value={resendPassword}
                      onChangeText={setResendPassword}
                      placeholder="Min 8 characters"
                      autoCapitalize="none"
                    />
                  </View>
                )}
              </View>

              <View className="border-t border-gray-100 dark:border-neutral-800 pt-4 gap-2">
                <CheckboxRow
                  label="Email new credentials to the user"
                  checked={resendSendEmail}
                  onToggle={() => setResendSendEmail((v) => !v)}
                />
                <CheckboxRow
                  label="Show me the password after reset"
                  checked={resendReturnPassword}
                  onToggle={() => setResendReturnPassword((v) => !v)}
                />
              </View>

              <View className="border-t border-gray-100 dark:border-neutral-800 pt-4">
                <CheckboxRow
                  label="I understand this will replace the user's password."
                  checked={resendConfirmed}
                  onToggle={() => setResendConfirmed((v) => !v)}
                />
              </View>

              <View className="flex-row gap-3">
                <Pressable
                  onPress={() => setSheet(null)}
                  disabled={actionBusy}
                  className={`flex-1 h-12 rounded-xl items-center justify-center border border-gray-200 dark:border-neutral-700 active:opacity-70 ${
                    actionBusy ? "opacity-50" : ""
                  }`}
                >
                  <Text className="text-gray-700 dark:text-gray-200 font-semibold text-base">
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  onPress={submitResend}
                  disabled={actionBusy || !resendConfirmed}
                  className={`flex-1 h-12 rounded-xl items-center justify-center flex-row gap-2 bg-[#0644C7] ${
                    actionBusy || !resendConfirmed
                      ? "opacity-50"
                      : "active:opacity-90"
                  }`}
                >
                  {actionBusy ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Feather name="key" size={16} color="#FFFFFF" />
                  )}
                  <Text
                    numberOfLines={1}
                    className="text-white font-semibold text-base"
                  >
                    {actionBusy ? "Resetting..." : "Reset & email"}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
        </ScrollView>
      </BottomSheet>

      {/* Send Account Invitation sheet */}
      <BottomSheet
        visible={sheet === "invite"}
        onClose={() => (inviting ? undefined : setSheet(null))}
        title="Send Account Invitation"
      >
        <ScrollView
          className="px-5"
          contentContainerStyle={{ paddingBottom: 28 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-4 pt-2">
            {inviteSuccess && (
              <View className="flex-row items-start gap-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-900/40 rounded-xl p-3">
                <Feather name="check-circle" size={18} color="#10B981" />
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                    Invitation sent successfully!
                  </Text>
                  <Text className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                    The invitation email has been sent to {inviteEmail.trim()}
                  </Text>
                </View>
              </View>
            )}

            <SelectField
              label="User Type"
              value={inviteUserType}
              options={[
                { label: "Company Admin", value: "company_admin" },
                { label: "Location Manager", value: "location_manager" },
                { label: "Attendant", value: "attendant" },
              ]}
              onSelect={(v) => {
                setInviteUserType(String(v) as StaffRole);
                setInviteLocationId(null);
              }}
              disabled={inviting || inviteSuccess}
            />

            {inviteUserType === "attendant" && (
              <SelectField
                label="Location"
                required
                placeholder="Select a location"
                value={inviteLocationId}
                options={locationSelectOptions}
                onSelect={(v) => setInviteLocationId(Number(v))}
                disabled={inviting || inviteSuccess}
              />
            )}

            <TextField
              label="Email Address"
              value={inviteEmail}
              onChangeText={setInviteEmail}
              placeholder="Enter email address"
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!inviting && !inviteSuccess}
            />

            {!!inviteLink && (
              <View>
                <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                  Invitation Link
                </Text>
                <View className="flex-row gap-2">
                  <View className="flex-1 bg-gray-50 dark:bg-neutral-800 rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-700">
                    <Text
                      className="text-sm text-gray-600 dark:text-gray-300"
                      numberOfLines={1}
                    >
                      {inviteLink}
                    </Text>
                  </View>
                  <Pressable
                    onPress={shareInviteLink}
                    className="w-12 rounded-xl items-center justify-center border border-gray-200 dark:border-neutral-700"
                    accessibilityLabel="Share invitation link"
                  >
                    <Feather name="share-2" size={18} color={PRIMARY} />
                  </Pressable>
                </View>
                <Text className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                  This link will expire once the account is created
                </Text>
              </View>
            )}

            {inviteSuccess ? (
              <Pressable
                onPress={() => setSheet(null)}
                className="mt-2 h-12 rounded-xl items-center justify-center border border-gray-200 dark:border-neutral-700"
              >
                <Text className="text-gray-700 dark:text-gray-200 font-semibold text-base">
                  Close
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={sendInvite}
                disabled={inviting || !inviteEmail.trim()}
                className={`mt-2 h-12 rounded-xl items-center justify-center flex-row gap-2 ${
                  inviting || !inviteEmail.trim()
                    ? "bg-[#0644C7]/60"
                    : "bg-[#0644C7]"
                }`}
              >
                {inviting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Feather name="send" size={16} color="#FFFFFF" />
                )}
                <Text className="text-white font-semibold text-base">
                  {inviting ? "Sending..." : "Send Invitation"}
                </Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </BottomSheet>
    </View>
  );
};

export default ManageAccounts;
