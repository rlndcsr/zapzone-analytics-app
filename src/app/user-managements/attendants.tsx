import { Feather } from "@expo/vector-icons";
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

import { BottomSheet } from "../../components/ui/BottomSheet";
import {
  DateRangeSheet,
  formatShortDate,
} from "../../components/ui/DateRangeSheet";
import {
  CheckboxRow,
  SelectField,
  type SelectOption,
  TextField,
} from "../../components/ui/FormControls";
import { KpiCard } from "../../components/ui/KpiCard";
import { Pagination } from "../../components/ui/Pagination";
import { StatusBadge } from "../../components/ui/StatusBadge";
import {
  consumeStaffStale,
  markStaffStale,
} from "../../lib/hooks/useStaffAccounts";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  fetchLocationById,
  updateLocation,
  type LocationOption,
} from "../../services/locationsService";
import {
  createStaff,
  createStaffInvite,
  deleteStaffUser,
  fetchAllStaffUsers,
  toggleStaffStatus,
  updateStaff,
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

const PER_PAGE_OPTIONS = [10, 25, 50];

// Mirrors the web AttendantEditModal option lists.
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
// Location phone format from the web EditLocationModal (7–20 chars, digits/space/-/+/()/.)
const LOCATION_PHONE_RE = /^[\d\s\-+().]{7,20}$/;

type StatusFilter = "all" | StaffStatus;
type AccountFilter = "all" | "created" | "pending";
type SortKey = "newest" | "oldest" | "name_asc" | "name_desc" | "dept_asc";

const ACCOUNT_OPTIONS: { label: string; value: AccountFilter }[] = [
  { label: "All Accounts", value: "all" },
  { label: "Account Created", value: "created" },
  { label: "Invitation Pending", value: "pending" },
];

const STATUS_OPTIONS: SelectOption[] = [
  { label: "All Statuses", value: "all" },
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
];

const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: "Newest first", value: "newest" },
  { label: "Oldest first", value: "oldest" },
  { label: "Name (A–Z)", value: "name_asc" },
  { label: "Name (Z–A)", value: "name_desc" },
  { label: "Department (A–Z)", value: "dept_asc" },
];

/* ----------------------------------------------------------------- helpers -- */

function within30Days(created: string | null): boolean {
  if (!created) return false;
  const d = new Date(created);
  if (Number.isNaN(d.getTime())) return false;
  return (Date.now() - d.getTime()) / 86_400_000 <= 30;
}

function experienceMonths(hireDate: string | null): number {
  if (!hireDate) return 0;
  const d = new Date(hireDate);
  if (Number.isNaN(d.getTime())) return 0;
  const months =
    (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.4375);
  return Math.max(0, Math.floor(months));
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function uniqueSorted(values: (string | null)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v))).sort(
    (a, b) => a.localeCompare(b),
  );
}

function timeValue(value: string | null): number {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** Parse a `YYYY-MM-DD` bound; returns null for empty/partial/invalid input. */
function parseYmd(value: string, endOfDay = false): number | null {
  const s = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = new Date(`${s}T${endOfDay ? "23:59:59" : "00:00:00"}`).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Web daterange predicate: row date within [from, to] (bounds optional). */
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

function compareAttendants(a: StaffUser, b: StaffUser, key: SortKey): number {
  switch (key) {
    case "oldest":
      return timeValue(a.createdAt) - timeValue(b.createdAt);
    case "name_asc":
      return a.name.localeCompare(b.name);
    case "name_desc":
      return b.name.localeCompare(a.name);
    case "dept_asc":
      return (a.department ?? "").localeCompare(b.department ?? "");
    case "newest":
    default:
      return timeValue(b.createdAt) - timeValue(a.createdAt);
  }
}

/* -------------------------------------------------------------- small parts -- */

const DetailRow = ({
  icon,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  value: string;
}) => (
  <View className="flex-row items-center gap-3 py-2.5">
    <View className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-neutral-800 items-center justify-center">
      <Feather name={icon} size={15} color={PRIMARY} />
    </View>
    <View className="flex-1">
      <Text className="text-[11px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">
        {label}
      </Text>
      <Text className="text-sm text-gray-800 dark:text-gray-100" numberOfLines={2}>
        {value}
      </Text>
    </View>
  </View>
);

/** Tappable date field that opens the shared calendar (DateRangeSheet). */
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

const AttendantCard = ({
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
          {user.employeeId ? `ID: ${user.employeeId}` : user.email}
        </Text>
      </View>
      <StatusBadge status={user.status} />
    </View>

    <View className="flex-row items-center flex-wrap gap-1.5">
      {!!user.position && (
        <View className="bg-blue-100 dark:bg-blue-900/30 px-2 py-1 rounded-full">
          <Text className="text-[10px] font-semibold text-blue-700 dark:text-blue-300">
            {user.position}
          </Text>
        </View>
      )}
      {!!user.department && (
        <View className="bg-gray-100 dark:bg-neutral-800 px-2 py-1 rounded-full">
          <Text className="text-[10px] font-medium text-gray-600 dark:text-gray-300">
            {user.department}
          </Text>
        </View>
      )}
      {!!user.shift && (
        <View className="bg-amber-100 dark:bg-amber-900/30 px-2 py-1 rounded-full">
          <Text className="text-[10px] font-medium text-amber-700 dark:text-amber-300">
            {user.shift}
          </Text>
        </View>
      )}
    </View>

    {!!user.phone && (
      <View className="flex-row items-center gap-1.5 mt-2">
        <Feather name="phone" size={12} color="#9CA3AF" />
        <Text className="text-xs text-gray-500 dark:text-gray-400">
          {user.phone}
        </Text>
      </View>
    )}

    <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
      <View className="flex-row items-center gap-1.5">
        <Feather name="award" size={12} color="#9CA3AF" />
        <Text className="text-xs text-gray-500 dark:text-gray-400">
          {experienceMonths(user.hireDate)} months
        </Text>
      </View>
      <Feather name="more-horizontal" size={18} color="#9CA3AF" />
    </View>
  </Pressable>
);

/** Reusable single-select filter sheet (status / department / position / shift / sort). */
function FilterOptionSheet<T extends string | number>({
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
  options: { label: string; value: T }[];
  value: T;
  onSelect: (value: T) => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
        {options.map((option) => {
          const isSelected = value === option.value;
          return (
            <Pressable
              key={String(option.value)}
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

/* ------------------------------------------------------------------ screen -- */

type FormState = {
  id: number | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  role: StaffRole;
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

const ManageAttendants = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  const currentUser = getCurrentUser();
  const role = currentUser?.role;
  const isCompanyAdmin = role === "company_admin";
  const isLocationManager = role === "location_manager";
  // The web /manager/attendants page lets the location manager view + full-CRUD
  // attendants; company_admin reaches the same component. Attendants blocked.
  const canManage = isCompanyAdmin || isLocationManager;
  const ownLocationId = currentUser?.location_id ?? null;
  const ownLocation = currentUser?.location ?? null;

  const [attendants, setAttendants] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [positionFilter, setPositionFilter] = useState<string>("all");
  const [shiftFilter, setShiftFilter] = useState<string>("all");
  const [accountFilter, setAccountFilter] = useState<AccountFilter>("all");
  const [hireFrom, setHireFrom] = useState("");
  const [hireTo, setHireTo] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [expMin, setExpMin] = useState("");
  const [expMax, setExpMax] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("newest");

  const [locationDetail, setLocationDetail] = useState<LocationOption | null>(
    null,
  );

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const [sheet, setSheet] = useState<
    | null
    | "status"
    | "department"
    | "position"
    | "shift"
    | "account"
    | "more"
    | "hireRange"
    | "createdRange"
    | "sort"
    | "actions"
    | "view"
    | "form"
    | "invite"
    | "editLocation"
  >(null);
  const [selected, setSelected] = useState<StaffUser | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Edit Location (Your Location card → Edit) — mirrors the web EditLocationModal.
  const [editLoc, setEditLoc] = useState({
    name: "",
    address: "",
    city: "",
    state: "",
    zip_code: "",
    phone: "",
    email: "",
  });
  const [editLocSaving, setEditLocSaving] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteUserType, setInviteUserType] = useState<"attendant" | "manager">(
    "attendant",
  );
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [inviting, setInviting] = useState(false);

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
        { role: "attendant", sortBy: "created_at", sortOrder: "desc" },
        signal,
      );
      // Apply the same display defaults the web transform uses, so KPIs, cards,
      // and experience match exactly (mapUser is shared, so we default here).
      setAttendants(
        users.map((u) => ({
          ...u,
          position: u.position ?? "Attendant",
          department: u.department ?? "Guest Services",
          employeeId: u.employeeId ?? `ZAP-${u.id}`,
          hireDate: u.hireDate ?? (u.createdAt ? u.createdAt.split("T")[0] : null),
        })),
      );
    } catch (err) {
      if (signal?.aborted) return;
      setError(
        err instanceof Error ? err.message : "Could not load attendants.",
      );
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

  // "Your Location" banner detail — best-effort enrichment of the cached
  // session location (name/city/state) with address/phone/email. Sourced from
  // the lightweight GET /api/mobile/locations (NOT the heavy /api/locations/{id},
  // which eager-loads base64 package images and OOM-crashes Hermes). Non-blocking:
  // the banner renders from the session user immediately regardless.
  useEffect(() => {
    if (!isLocationManager || ownLocationId == null) return;
    const controller = new AbortController();
    (async () => {
      const token = getToken();
      if (!token) return;
      try {
        const detail = await fetchLocationById(
          token,
          ownLocationId,
          controller.signal,
        );
        if (detail && !controller.signal.aborted) setLocationDetail(detail);
      } catch {
        // Fall back to the cached session location silently.
      }
    })();
    return () => controller.abort();
  }, [isLocationManager, ownLocationId]);

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
    departmentFilter,
    positionFilter,
    shiftFilter,
    accountFilter,
    hireFrom,
    hireTo,
    createdFrom,
    createdTo,
    expMin,
    expMax,
    sortKey,
    perPage,
  ]);

  /* ---- derived ---- */

  const departmentOptions = useMemo<{ label: string; value: string }[]>(
    () => [
      { label: "All Departments", value: "all" },
      ...uniqueSorted(attendants.map((a) => a.department)).map((d) => ({
        label: d,
        value: d,
      })),
    ],
    [attendants],
  );

  const positionOptions = useMemo<{ label: string; value: string }[]>(
    () => [
      { label: "All Positions", value: "all" },
      ...uniqueSorted(attendants.map((a) => a.position)).map((p) => ({
        label: p,
        value: p,
      })),
    ],
    [attendants],
  );

  const shiftOptions = useMemo<{ label: string; value: string }[]>(
    () => [
      { label: "All Shifts", value: "all" },
      ...uniqueSorted(attendants.map((a) => a.shift)).map((s) => ({
        label: s,
        value: s,
      })),
    ],
    [attendants],
  );

  const filtered = useMemo(() => {
    let rows = attendants;
    if (statusFilter !== "all")
      rows = rows.filter((a) => a.status === statusFilter);
    if (departmentFilter !== "all")
      rows = rows.filter((a) => (a.department ?? "") === departmentFilter);
    if (positionFilter !== "all")
      rows = rows.filter((a) => (a.position ?? "") === positionFilter);
    if (shiftFilter !== "all")
      rows = rows.filter((a) => (a.shift ?? "") === shiftFilter);

    // Account filter — every loaded staff record has an account (matches the
    // web, which hardcodes accountCreated=true), so "pending" yields none here.
    if (accountFilter === "pending") rows = rows.filter(() => false);

    // Hire Date range
    const hf = parseYmd(hireFrom);
    const ht = parseYmd(hireTo, true);
    if (hf != null || ht != null)
      rows = rows.filter((a) => inDateRange(a.hireDate, hf, ht));

    // Created Date range
    const cf = parseYmd(createdFrom);
    const ct = parseYmd(createdTo, true);
    if (cf != null || ct != null)
      rows = rows.filter((a) => inDateRange(a.createdAt, cf, ct));

    // Experience (months) range
    const emin = expMin.trim() === "" ? null : Number(expMin);
    const emax = expMax.trim() === "" ? null : Number(expMax);
    if ((emin != null && !Number.isNaN(emin)) || (emax != null && !Number.isNaN(emax))) {
      rows = rows.filter((a) => {
        const e = experienceMonths(a.hireDate);
        if (emin != null && !Number.isNaN(emin) && e < emin) return false;
        if (emax != null && !Number.isNaN(emax) && e > emax) return false;
        return true;
      });
    }

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
          a.position,
        ].map((v) => (v ?? "").toLowerCase());
        return tokens.every((t) => fields.some((f) => f.includes(t)));
      });
    }

    return [...rows].sort((a, b) => compareAttendants(a, b, sortKey));
  }, [
    attendants,
    statusFilter,
    departmentFilter,
    positionFilter,
    shiftFilter,
    accountFilter,
    hireFrom,
    hireTo,
    createdFrom,
    createdTo,
    expMin,
    expMax,
    debouncedSearch,
    sortKey,
  ]);

  const moreActiveCount =
    (hireFrom || hireTo ? 1 : 0) +
    (createdFrom || createdTo ? 1 : 0) +
    (expMin || expMax ? 1 : 0);

  const total = filtered.length;
  const paged = useMemo(
    () => filtered.slice((page - 1) * perPage, page * perPage),
    [filtered, page, perPage],
  );

  // KPI aggregates over the full (server-scoped) set — matches the web page.
  const totalAttendants = attendants.length;
  const activeCount = attendants.filter((a) => a.status === "active").length;
  const inactiveCount = totalAttendants - activeCount;
  const newCount = attendants.filter((a) => within30Days(a.createdAt)).length;
  const departmentCount = new Set(
    attendants.map((a) => a.department).filter(Boolean),
  ).size;

  /* ---- form ---- */

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

  const roleOptions = useMemo<SelectOption[]>(() => {
    const opts: SelectOption[] = [
      { label: "Attendant", value: "attendant" },
      { label: "Location Manager", value: "location_manager" },
    ];
    if (isCompanyAdmin) opts.push({ label: "Company Admin", value: "company_admin" });
    return opts;
  }, [isCompanyAdmin]);

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
          location_id: ownLocationId ?? undefined,
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
  }, [form, isEditing, ownLocationId, afterMutation]);

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
        err instanceof Error ? err.message : "Could not update this attendant.",
      );
    } finally {
      setActionBusy(false);
    }
  }, [selected, afterMutation]);

  const confirmDelete = useCallback(() => {
    if (!selected) return;
    const target = selected;
    Alert.alert(
      "Delete attendant",
      `Permanently delete ${target.name}? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setActionBusy(true);
            try {
              await deleteStaffUser(getToken() ?? "", target.id);
              setSheet(null);
              afterMutation();
            } catch (err) {
              Alert.alert(
                "Delete failed",
                err instanceof Error ? err.message : "Could not delete this attendant.",
              );
            } finally {
              setActionBusy(false);
            }
          },
        },
      ],
    );
  }, [selected, afterMutation]);

  /* ---- invite ---- */

  const openInvite = useCallback(() => {
    setInviteEmail("");
    setInviteUserType("attendant");
    setInviteLink(null);
    setInviteSuccess(false);
    setSheet("invite");
  }, []);

  // Mirrors the web "Send Account Invitation" modal: generate a shareable
  // signup link (POST /shareable-tokens), then surface it in the sheet.
  const sendInvite = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    const email = inviteEmail.trim();
    if (!email) return;
    setInviting(true);
    try {
      const link = await createStaffInvite(token, {
        email,
        role: inviteUserType === "manager" ? "location_manager" : "attendant",
        company_id: currentUser?.company_id ?? undefined,
        location_id: ownLocationId ?? undefined,
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
  }, [inviteEmail, inviteUserType, currentUser, ownLocationId]);

  const shareInviteLink = useCallback(async () => {
    if (!inviteLink) return;
    await Share.share({
      message: `You're invited to join ZapZone. Complete your account setup here: ${inviteLink}`,
    });
  }, [inviteLink]);

  /* ---- export ---- */

  const exportCsv = useCallback(async () => {
    if (filtered.length === 0) {
      Alert.alert("Nothing to export", "There are no attendants matching the current filters.");
      return;
    }
    try {
      const header = [
        "Employee ID",
        "First Name",
        "Last Name",
        "Email",
        "Phone",
        "Position",
        "Department",
        "Shift",
        "Status",
        "Experience (months)",
        "Hire Date",
        "Created",
      ];
      const escape = (v: string | number | null) => {
        const s = String(v ?? "");
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const rows = filtered.map((a) =>
        [
          a.employeeId,
          a.firstName,
          a.lastName,
          a.email,
          a.phone,
          a.position,
          a.department,
          a.shift,
          a.status,
          experienceMonths(a.hireDate),
          a.hireDate,
          a.createdAt,
        ]
          .map(escape)
          .join(","),
      );
      const csv = [header.join(","), ...rows].join("\n");

      // Loaded lazily so these native modules never run at app startup.
      const FileSystem = await import("expo-file-system/legacy");
      const Sharing = await import("expo-sharing");
      const stamp = new Date().toISOString().split("T")[0];
      const dest = `${FileSystem.cacheDirectory}attendants-${stamp}.csv`;
      await FileSystem.writeAsStringAsync(dest, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(dest, {
          mimeType: "text/csv",
          dialogTitle: "Export attendants",
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
    }
  }, [filtered]);

  /* ---- filter chip labels ---- */

  const statusLabel =
    STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ?? "All Statuses";
  const departmentLabel =
    departmentFilter === "all" ? "All Departments" : departmentFilter;
  const positionLabel =
    positionFilter === "all" ? "All Positions" : positionFilter;
  const shiftLabel = shiftFilter === "all" ? "All Shifts" : shiftFilter;
  const accountLabel =
    ACCOUNT_OPTIONS.find((o) => o.value === accountFilter)?.label ??
    "All Accounts";
  const sortLabel =
    SORT_OPTIONS.find((o) => o.value === sortKey)?.label ?? "Newest first";

  const editLocationId = locationDetail?.id ?? ownLocationId;

  const openEditLocation = useCallback(() => {
    setEditLoc({
      name: locationDetail?.name ?? ownLocation?.name ?? "",
      address: locationDetail?.streetAddress ?? "",
      city: locationDetail?.city ?? ownLocation?.city ?? "",
      state: locationDetail?.state ?? ownLocation?.state ?? "",
      zip_code: locationDetail?.zipCode ?? "",
      phone: locationDetail?.phone ?? "",
      email: locationDetail?.email ?? "",
    });
    setSheet("editLocation");
  }, [locationDetail, ownLocation]);

  const saveEditLocation = useCallback(async () => {
    const token = getToken();
    if (!token || editLocationId == null) return;
    const name = editLoc.name.trim();
    if (!name) {
      Alert.alert("Name required", "Location name is required.");
      return;
    }
    const phone = editLoc.phone.trim();
    if (phone && !LOCATION_PHONE_RE.test(phone)) {
      Alert.alert("Invalid phone", "Invalid phone format. Example: (555) 123-4567");
      return;
    }
    setEditLocSaving(true);
    try {
      const address = editLoc.address.trim();
      const city = editLoc.city.trim();
      const state = editLoc.state.trim();
      const zip = editLoc.zip_code.trim();
      const email = editLoc.email.trim();
      await updateLocation(token, editLocationId, {
        name,
        address,
        city,
        state,
        zip_code: zip,
        phone,
        email,
      });
      // Reflect the change in the banner immediately (avoids re-hitting the
      // heavy GET /locations/{id}).
      setLocationDetail((prev) => ({
        id: prev?.id ?? editLocationId,
        name,
        address: address || [city, state].filter(Boolean).join(", "),
        streetAddress: address || null,
        city: city || null,
        state: state || null,
        zipCode: zip || null,
        phone: phone || null,
        email: email || null,
        timezone: prev?.timezone ?? null,
      }));
      setSheet(null);
      Alert.alert("Location updated", "Location updated successfully.");
    } catch (err) {
      Alert.alert(
        "Update failed",
        err instanceof Error ? err.message : "Something went wrong. Please try again.",
      );
    } finally {
      setEditLocSaving(false);
    }
  }, [editLoc, editLocationId]);

  // "Your Location" banner values (detail preferred, cached session fallback).
  const locName = locationDetail?.name ?? ownLocation?.name ?? "";
  const locAddress = locationDetail
    ? [
        locationDetail.streetAddress,
        locationDetail.city,
        locationDetail.state,
        locationDetail.zipCode,
      ]
        .filter(Boolean)
        .join(", ")
    : [ownLocation?.city, ownLocation?.state].filter(Boolean).join(", ");
  const locPhone = locationDetail?.phone ?? null;
  const locEmail = locationDetail?.email ?? null;
  const showLocationBanner =
    isLocationManager && (!!ownLocation || !!locationDetail);

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
            Manage Attendants
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
              Manage Attendants
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              View and manage all staff members in your facility
            </Text>
          </View>

          {/* Your Location banner */}
          {showLocationBanner && (
            <View
              className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-5 shadow-sm"
              style={CARD_SHADOW}
            >
              <View className="flex-row items-start gap-3">
                <View className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 items-center justify-center">
                  <Feather name="map-pin" size={18} color={PRIMARY} />
                </View>
                <View className="flex-1">
                  <Text className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    Your Location
                  </Text>
                  <Text
                    className="text-sm font-bold text-gray-900 dark:text-white mt-0.5"
                    numberOfLines={1}
                  >
                    {locName}
                  </Text>
                  {!!locAddress && (
                    <Text
                      className="text-xs text-gray-500 dark:text-gray-400 mt-0.5"
                      numberOfLines={2}
                    >
                      {locAddress}
                    </Text>
                  )}
                  {(!!locPhone || !!locEmail) && (
                    <View className="flex-row flex-wrap gap-x-4 gap-y-1 mt-1.5">
                      {!!locPhone && (
                        <View className="flex-row items-center gap-1">
                          <Feather name="phone" size={11} color="#9CA3AF" />
                          <Text className="text-xs text-gray-400 dark:text-gray-500">
                            {locPhone}
                          </Text>
                        </View>
                      )}
                      {!!locEmail && (
                        <View className="flex-row items-center gap-1">
                          <Feather name="mail" size={11} color="#9CA3AF" />
                          <Text
                            className="text-xs text-gray-400 dark:text-gray-500"
                            numberOfLines={1}
                          >
                            {locEmail}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
                {canManage && (
                  <Pressable
                    onPress={openEditLocation}
                    className="flex-row items-center gap-1 px-2.5 py-1.5 rounded-lg active:bg-gray-100 dark:active:bg-neutral-800"
                    accessibilityRole="button"
                    accessibilityLabel="Edit location details"
                  >
                    <Feather name="edit-2" size={14} color="#6B7280" />
                    <Text className="text-xs font-medium text-gray-600 dark:text-gray-300">
                      Edit
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}

          {/* Sub-navigation */}
          <View className="flex-row gap-3 mb-3">
            <Pressable
              onPress={() =>
                router.push("/user-managements/activity-logs" as never)
              }
              className="flex-1 flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800"
            >
              <Feather name="activity" size={16} color={PRIMARY} />
              <Text
                className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1"
                numberOfLines={1}
              >
                Activity Log
              </Text>
              <Feather name="chevron-right" size={14} color="#9CA3AF" />
            </Pressable>

            <Pressable
              onPress={() => router.push("/user-managements/day-offs" as never)}
              className="flex-1 flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800"
            >
              <Feather name="calendar" size={16} color={PRIMARY} />
              <Text
                className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1"
                numberOfLines={1}
              >
                Day Offs
              </Text>
              <Feather name="chevron-right" size={14} color="#9CA3AF" />
            </Pressable>
          </View>

          {/* Primary action — Create New Staff */}
          {canManage && (
            <Pressable
              onPress={openCreate}
              className="h-12 rounded-xl items-center justify-center flex-row gap-2 bg-[#0644C7] mb-3"
              accessibilityRole="button"
              accessibilityLabel="Create New Staff"
            >
              <Feather name="user-plus" size={18} color="#FFFFFF" />
              <Text
                numberOfLines={1}
                className="text-white font-semibold text-base"
              >
                Create New Staff
              </Text>
            </Pressable>
          )}

          {/* Secondary actions */}
          {canManage && (
            <View className="flex-row gap-3 mb-5">
              <Pressable
                onPress={openInvite}
                className="flex-1 flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800"
              >
                <Feather name="send" size={16} color={PRIMARY} />
                <Text
                  className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1"
                  numberOfLines={1}
                >
                  Send Invitation
                </Text>
              </Pressable>

              <Pressable
                onPress={exportCsv}
                className="flex-1 flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800"
              >
                <Feather name="download" size={16} color={PRIMARY} />
                <Text
                  className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1"
                  numberOfLines={1}
                >
                  Export CSV
                </Text>
              </Pressable>
            </View>
          )}

          {/* Error state */}
          {!loading && error && (
            <View className="bg-red-50 border border-red-100 rounded-2xl p-5 mb-5">
              <Text className="text-red-600 font-semibold">
                Something went wrong
              </Text>
              <Text className="text-red-500 text-sm mt-1">{error}</Text>
            </View>
          )}

          {/* KPI cards */}
          <View className="flex-row flex-wrap -mx-1.5 mb-3">
            <View className="w-1/2">
              <KpiCard
                icon="users"
                tone={{ bg: "#0644C720", tint: PRIMARY }}
                title="Total Attendants"
                value={String(totalAttendants)}
                hint={`${activeCount} active`}
              />
            </View>
            <View className="w-1/2">
              <KpiCard
                icon="user-check"
                tone={{ bg: "#10B98120", tint: "#10B981" }}
                title="Active Attendants"
                value={String(activeCount)}
                hint={`${inactiveCount} inactive`}
              />
            </View>
            <View className="w-1/2">
              <KpiCard
                icon="user-plus"
                tone={{ bg: "#F59E0B20", tint: "#F59E0B" }}
                title="New Attendants"
                value={String(newCount)}
                hint="Last 30 days"
              />
            </View>
            <View className="w-1/2">
              <KpiCard
                icon="grid"
                tone={{ bg: "#3B82F620", tint: "#3B82F6" }}
                title="Departments"
                value={String(departmentCount)}
                hint="Different departments"
              />
            </View>
          </View>

          {/* Search */}
          <View className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3 rounded-xl border border-gray-100 dark:border-neutral-800 mt-2 mb-3">
            <Feather name="search" size={16} color="#9CA3AF" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search attendants..."
              placeholderTextColor="#9CA3AF"
              className="flex-1 text-sm text-gray-900 dark:text-white"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <Feather name="x" size={16} color="#9CA3AF" />
              </Pressable>
            )}
          </View>

          {/* Filters */}
          <View className="flex-row gap-3 mb-3">
            <Pressable
              onPress={() => setSheet("status")}
              className="flex-1 flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800"
            >
              <Feather name="check-circle" size={16} color={PRIMARY} />
              <Text
                className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1"
                numberOfLines={1}
              >
                {statusLabel}
              </Text>
              <Feather name="chevron-down" size={14} color="#9CA3AF" />
            </Pressable>

            <Pressable
              onPress={() => setSheet("department")}
              className="flex-1 flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800"
            >
              <Feather name="grid" size={16} color={PRIMARY} />
              <Text
                className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1"
                numberOfLines={1}
              >
                {departmentLabel}
              </Text>
              <Feather name="chevron-down" size={14} color="#9CA3AF" />
            </Pressable>
          </View>

          <View className="flex-row gap-3 mb-3">
            <Pressable
              onPress={() => setSheet("position")}
              className="flex-1 flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800"
            >
              <Feather name="briefcase" size={16} color={PRIMARY} />
              <Text
                className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1"
                numberOfLines={1}
              >
                {positionLabel}
              </Text>
              <Feather name="chevron-down" size={14} color="#9CA3AF" />
            </Pressable>

            <Pressable
              onPress={() => setSheet("shift")}
              className="flex-1 flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800"
            >
              <Feather name="clock" size={16} color={PRIMARY} />
              <Text
                className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1"
                numberOfLines={1}
              >
                {shiftLabel}
              </Text>
              <Feather name="chevron-down" size={14} color="#9CA3AF" />
            </Pressable>
          </View>

          <View className="flex-row gap-3 mb-3">
            <Pressable
              onPress={() => setSheet("account")}
              className="flex-1 flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800"
            >
              <Feather name="user-check" size={16} color={PRIMARY} />
              <Text
                className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1"
                numberOfLines={1}
              >
                {accountLabel}
              </Text>
              <Feather name="chevron-down" size={14} color="#9CA3AF" />
            </Pressable>

            <Pressable
              onPress={() => setSheet("more")}
              className="flex-1 flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800"
            >
              <Feather name="filter" size={16} color={PRIMARY} />
              <Text
                className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1"
                numberOfLines={1}
              >
                More Filters
              </Text>
              {moreActiveCount > 0 ? (
                <View className="bg-[#0644C7] rounded-full min-w-5 h-5 px-1 items-center justify-center">
                  <Text className="text-[10px] font-bold text-white">
                    {moreActiveCount}
                  </Text>
                </View>
              ) : (
                <Feather name="chevron-down" size={14} color="#9CA3AF" />
              )}
            </Pressable>
          </View>

          <Pressable
            onPress={() => setSheet("sort")}
            className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800 mb-5"
          >
            <Feather name="sliders" size={16} color={PRIMARY} />
            <Text
              className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1"
              numberOfLines={1}
            >
              Sort: {sortLabel}
            </Text>
            <Feather name="chevron-down" size={14} color="#9CA3AF" />
          </Pressable>

          {/* List header */}
          {!loading && !error && (
            <View className="flex-row items-center gap-2 mb-4 mt-1">
              <Text
                numberOfLines={1}
                className="shrink text-lg font-bold text-gray-900 dark:text-white"
              >
                Attendants
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
          ) : !error && paged.length === 0 ? (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl p-8 items-center shadow-sm">
              <View className="w-16 h-16 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center mb-3">
                <Feather name="users" size={26} color="#9CA3AF" />
              </View>
              <Text className="text-gray-700 dark:text-gray-200 font-semibold text-lg">
                No attendants found
              </Text>
              <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1 max-w-xs">
                {attendants.length === 0
                  ? "Create a staff account to get started."
                  : "Try a different status, department, or search term."}
              </Text>
            </View>
          ) : (
            !error && (
              <>
                {paged.map((u) => (
                  <AttendantCard
                    key={u.id}
                    user={u}
                    onPress={() => {
                      setSelected(u);
                      setSheet("actions");
                    }}
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

      {/* Filter sheets */}
      <FilterOptionSheet
        visible={sheet === "status"}
        onClose={() => setSheet(null)}
        title="Filter by Status"
        options={STATUS_OPTIONS as { label: string; value: StatusFilter }[]}
        value={statusFilter}
        onSelect={setStatusFilter}
      />
      <FilterOptionSheet
        visible={sheet === "department"}
        onClose={() => setSheet(null)}
        title="Filter by Department"
        options={departmentOptions}
        value={departmentFilter}
        onSelect={setDepartmentFilter}
      />
      <FilterOptionSheet
        visible={sheet === "position"}
        onClose={() => setSheet(null)}
        title="Filter by Position"
        options={positionOptions}
        value={positionFilter}
        onSelect={setPositionFilter}
      />
      <FilterOptionSheet
        visible={sheet === "shift"}
        onClose={() => setSheet(null)}
        title="Filter by Shift"
        options={shiftOptions}
        value={shiftFilter}
        onSelect={setShiftFilter}
      />
      <FilterOptionSheet
        visible={sheet === "account"}
        onClose={() => setSheet(null)}
        title="Filter by Account"
        options={ACCOUNT_OPTIONS}
        value={accountFilter}
        onSelect={setAccountFilter}
      />
      <FilterOptionSheet
        visible={sheet === "sort"}
        onClose={() => setSheet(null)}
        title="Sort attendants"
        options={SORT_OPTIONS}
        value={sortKey}
        onSelect={setSortKey}
      />

      {/* More filters — date ranges + experience (web daterange/numberrange) */}
      <BottomSheet
        visible={sheet === "more"}
        onClose={() => setSheet(null)}
        title="More Filters"
      >
        <ScrollView
          className="px-5"
          contentContainerStyle={{ paddingBottom: 28 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-4 pt-2">
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
                Experience (months)
              </Text>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <TextField
                    value={expMin}
                    onChangeText={setExpMin}
                    placeholder="Min"
                    keyboardType="number-pad"
                  />
                </View>
                <View className="flex-1">
                  <TextField
                    value={expMax}
                    onChangeText={setExpMax}
                    placeholder="Max"
                    keyboardType="number-pad"
                  />
                </View>
              </View>
            </View>

            <View className="flex-row gap-3 mt-2">
              <Pressable
                onPress={() => {
                  setHireFrom("");
                  setHireTo("");
                  setCreatedFrom("");
                  setCreatedTo("");
                  setExpMin("");
                  setExpMax("");
                }}
                className="flex-1 h-12 rounded-xl items-center justify-center border border-gray-200 dark:border-neutral-700"
              >
                <Text className="text-gray-700 dark:text-gray-200 font-semibold text-base">
                  Clear
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setSheet(null)}
                className="flex-1 h-12 rounded-xl items-center justify-center bg-[#0644C7]"
              >
                <Text className="text-white font-semibold text-base">Done</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </BottomSheet>

      {/* Shared calendar (DateRangeSheet) for the Hire Date / Created Date
          ranges — returns to the More Filters sheet on apply/close. */}
      <DateRangeSheet
        visible={sheet === "hireRange"}
        initialStart={hireFrom}
        initialEnd={hireTo}
        onClose={() => setSheet("more")}
        onApply={(start, end) => {
          setHireFrom(start);
          setHireTo(end);
          setSheet("more");
        }}
      />
      <DateRangeSheet
        visible={sheet === "createdRange"}
        initialStart={createdFrom}
        initialEnd={createdTo}
        onClose={() => setSheet("more")}
        onApply={(start, end) => {
          setCreatedFrom(start);
          setCreatedTo(end);
          setSheet("more");
        }}
      />

      {/* Actions sheet */}
      <BottomSheet
        visible={sheet === "actions"}
        onClose={() => (actionBusy ? undefined : setSheet(null))}
        title={selected?.name ?? "Attendant"}
      >
        <View className="px-4 pb-8">
          <View className="flex-row items-center gap-2 px-4 pb-3 mb-2 border-b border-gray-100 dark:border-neutral-800">
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
                      Edit attendant
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

                  <Pressable
                    onPress={confirmDelete}
                    className="flex-row items-center gap-3 px-4 py-4 rounded-xl active:bg-red-50 dark:active:bg-red-900/20"
                  >
                    <Feather name="trash-2" size={18} color="#EF4444" />
                    <Text className="text-base font-medium text-red-600 flex-1">
                      Delete attendant
                    </Text>
                  </Pressable>
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

      {/* View detail sheet */}
      <BottomSheet
        visible={sheet === "view"}
        onClose={() => setSheet("actions")}
        title={selected?.name ?? "Attendant"}
      >
        {selected && (
          <ScrollView className="px-5 pb-8" showsVerticalScrollIndicator={false}>
            <View className="flex-row items-center gap-2 mb-2">
              <StatusBadge status={selected.status} />
              {!!selected.employeeId && (
                <Text className="text-xs text-gray-400 dark:text-gray-500">
                  {selected.employeeId}
                </Text>
              )}
            </View>

            <Text className="text-[11px] text-gray-400 dark:text-gray-500 uppercase tracking-wider mt-4 mb-1">
              Contact
            </Text>
            <DetailRow icon="mail" label="Email" value={selected.email} />
            <DetailRow icon="phone" label="Phone" value={selected.phone ?? "—"} />

            <Text className="text-[11px] text-gray-400 dark:text-gray-500 uppercase tracking-wider mt-4 mb-1">
              Role & Department
            </Text>
            <DetailRow
              icon="briefcase"
              label="Position"
              value={selected.position ?? "—"}
            />
            <DetailRow
              icon="grid"
              label="Department"
              value={selected.department ?? "—"}
            />
            <DetailRow icon="clock" label="Shift" value={selected.shift ?? "—"} />

            <Text className="text-[11px] text-gray-400 dark:text-gray-500 uppercase tracking-wider mt-4 mb-1">
              Dates
            </Text>
            <DetailRow
              icon="award"
              label="Experience"
              value={`${experienceMonths(selected.hireDate)} months`}
            />
            <DetailRow
              icon="calendar"
              label="Hire Date"
              value={formatDate(selected.hireDate)}
            />
            <DetailRow
              icon="user-plus"
              label="Created"
              value={formatDate(selected.createdAt)}
            />
          </ScrollView>
        )}
      </BottomSheet>

      {/* Create / edit form sheet */}
      <BottomSheet
        visible={sheet === "form"}
        onClose={() => (saving ? undefined : setSheet(null))}
        title={isEditing ? "Edit Attendant" : "Create Staff Account"}
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
                    setForm((f) => ({ ...f, role: String(v) as StaffRole }))
                  }
                />

                {isLocationManager && !!ownLocation && (
                  <View className="flex-row items-center gap-2 bg-gray-50 dark:bg-neutral-800 rounded-xl px-3.5 py-3">
                    <Feather name="map-pin" size={14} color="#9CA3AF" />
                    <Text className="text-xs text-gray-500 dark:text-gray-400 flex-1">
                      New accounts are assigned to {ownLocation.name}.
                    </Text>
                  </View>
                )}

                <SelectField
                  label="Password"
                  value={form.password_mode}
                  options={[
                    { label: "Auto-generate a password", value: "generate" },
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

            <Pressable
              onPress={saveForm}
              disabled={saving}
              className={`mt-2 h-12 rounded-xl items-center justify-center flex-row gap-2 ${
                saving ? "bg-[#0644C7]/60" : "bg-[#0644C7]"
              }`}
            >
              {saving && <ActivityIndicator color="#FFFFFF" size="small" />}
              <Text className="text-white font-semibold text-base">
                {isEditing ? "Save Changes" : "Create Account"}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </BottomSheet>

      {/* Send Account Invitation sheet (mirrors the web modal) */}
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
                { label: "Attendant", value: "attendant" },
                { label: "Location Manager", value: "manager" },
              ]}
              onSelect={(v) =>
                setInviteUserType(v === "manager" ? "manager" : "attendant")
              }
              disabled={inviting || inviteSuccess}
            />

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

      {/* Edit Location sheet (mirrors the web EditLocationModal) */}
      <BottomSheet
        visible={sheet === "editLocation"}
        onClose={() => (editLocSaving ? undefined : setSheet(null))}
        title="Edit Location"
      >
        <ScrollView
          className="px-5"
          contentContainerStyle={{ paddingBottom: 28 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-4 pt-2">
            <TextField
              label="Name"
              required
              value={editLoc.name}
              onChangeText={(v) => setEditLoc((s) => ({ ...s, name: v }))}
              placeholder="e.g. Brighton | Zap Zone"
            />
            <TextField
              label="Address"
              value={editLoc.address}
              onChangeText={(v) => setEditLoc((s) => ({ ...s, address: v }))}
            />
            <View className="flex-row gap-3">
              <View className="flex-1">
                <TextField
                  label="City"
                  value={editLoc.city}
                  onChangeText={(v) => setEditLoc((s) => ({ ...s, city: v }))}
                />
              </View>
              <View className="flex-1">
                <TextField
                  label="State"
                  value={editLoc.state}
                  onChangeText={(v) => setEditLoc((s) => ({ ...s, state: v }))}
                />
              </View>
            </View>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <TextField
                  label="ZIP Code"
                  value={editLoc.zip_code}
                  onChangeText={(v) => setEditLoc((s) => ({ ...s, zip_code: v }))}
                />
              </View>
              <View className="flex-1">
                <TextField
                  label="Phone"
                  value={editLoc.phone}
                  onChangeText={(v) => setEditLoc((s) => ({ ...s, phone: v }))}
                  placeholder="(555) 123-4567"
                  keyboardType="phone-pad"
                />
              </View>
            </View>
            <TextField
              label="Email"
              value={editLoc.email}
              onChangeText={(v) => setEditLoc((s) => ({ ...s, email: v }))}
              placeholder="contact@location.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Pressable
              onPress={saveEditLocation}
              disabled={editLocSaving}
              className={`mt-2 h-12 rounded-xl items-center justify-center flex-row gap-2 ${
                editLocSaving ? "bg-[#0644C7]/60" : "bg-[#0644C7]"
              }`}
            >
              {editLocSaving && (
                <ActivityIndicator color="#FFFFFF" size="small" />
              )}
              <Text className="text-white font-semibold text-base">
                {editLocSaving ? "Saving..." : "Save changes"}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </BottomSheet>
    </View>
  );
};

export default ManageAttendants;
