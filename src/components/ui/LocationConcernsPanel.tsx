import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import {
  type ComponentProps,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { getToken } from "../../lib/session";
import {
  fetchCheckoutConcernStats,
  fetchCheckoutConcerns,
  updateCheckoutConcernStatus,
  type ConcernRow,
  type ConcernStats,
  type ConcernStatus,
} from "../../services/checkoutConcernsService";
import {
  ContactLine,
  KIND_META,
  STATUS_META,
  describeWanted,
} from "./ConcernsTable";
import { SkeletonBlock, usePulse } from "./skeleton/SkeletonBlock";

const PRIMARY = "#0644C7";
const CONCERNS_ROUTE = "/customers/customer-concerns";

type FeatherIconName = ComponentProps<typeof Feather>["name"];

/** "just now" · "12m ago" · "3h ago" · "yesterday" · "4d ago" (web wording). */
export function formatConcernAge(
  iso: string,
  now: number = Date.now(),
): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.max(0, Math.round((now - then) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

const RowButton = ({
  icon,
  label,
  tone,
  disabled,
  onPress,
}: {
  icon: FeatherIconName;
  label: string;
  tone: "contacted" | "reopen" | "resolve";
  disabled: boolean;
  onPress: () => void;
}) => {
  const style = {
    contacted: {
      box: "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30",
      text: "text-blue-700 dark:text-blue-300",
      color: "#1D4ED8",
    },
    reopen: {
      box: "border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900",
      text: "text-gray-600 dark:text-gray-300",
      color: "#4B5563",
    },
    resolve: {
      box: "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/30",
      text: "text-emerald-700 dark:text-emerald-300",
      color: "#047857",
    },
  }[tone];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      className={`flex-row items-center gap-1.5 px-3 py-2 rounded-lg border active:opacity-70 ${style.box} ${
        disabled ? "opacity-50" : ""
      }`}
    >
      <Feather name={icon} size={13} color={style.color} />
      <Text className={`text-xs font-semibold ${style.text}`}>{label}</Text>
    </Pressable>
  );
};

const ConcernItem = ({
  concern,
  saving,
  isLast,
  onSetStatus,
}: {
  concern: ConcernRow;
  saving: boolean;
  isLast: boolean;
  onSetStatus: (concern: ConcernRow, next: ConcernStatus) => void;
}) => {
  const kind = KIND_META[concern.kind] ?? KIND_META.schedule_help;
  const status = STATUS_META[concern.status] ?? STATUS_META.new;
  const age = formatConcernAge(concern.createdAt);

  return (
    <View
      className={`p-3 ${
        isLast ? "" : "border-b border-gray-100 dark:border-neutral-800"
      }`}
    >
      <Text
        numberOfLines={1}
        className="text-sm font-semibold text-gray-900 dark:text-white"
      >
        {concern.name}
      </Text>
      <View className="flex-row flex-wrap items-center gap-1.5 mt-1">
        <View
          className={`flex-row items-center gap-1 px-2 py-0.5 rounded-full ${kind.bg}`}
        >
          <Feather name={kind.icon} size={10} color="#6B7280" />
          <Text className={`text-[10px] font-semibold ${kind.fg}`}>
            {kind.label}
          </Text>
        </View>
        <View className={`px-2 py-0.5 rounded-full ${status.bg}`}>
          <Text className={`text-[10px] font-semibold ${status.fg}`}>
            {status.label}
          </Text>
        </View>
        {!!age && (
          <Text className="text-[11px] text-gray-400 dark:text-gray-500">
            {age}
          </Text>
        )}
      </View>

      <Text className="text-xs text-gray-600 dark:text-gray-300 mt-1.5">
        {describeWanted(concern)}
      </Text>
      {!!concern.message && (
        <Text
          numberOfLines={2}
          className="text-xs italic text-gray-500 dark:text-gray-400 mt-1"
        >
          “{concern.message}”
        </Text>
      )}

      {(!!concern.phone || !!concern.email) && (
        <View className="gap-1 mt-2">
          {!!concern.phone && (
            <ContactLine
              icon="phone"
              value={concern.phone}
              url={`tel:${concern.phone}`}
            />
          )}
          {!!concern.email && (
            <ContactLine
              icon="mail"
              value={concern.email}
              url={`mailto:${concern.email}`}
              small
            />
          )}
        </View>
      )}

      <View className="flex-row flex-wrap items-center gap-2 mt-2.5">
        {concern.status === "new" ? (
          <RowButton
            icon="phone-call"
            label="Mark contacted"
            tone="contacted"
            disabled={saving}
            onPress={() => onSetStatus(concern, "contacted")}
          />
        ) : (
          <RowButton
            icon="rotate-ccw"
            label="Reopen"
            tone="reopen"
            disabled={saving}
            onPress={() => onSetStatus(concern, "new")}
          />
        )}
        <RowButton
          icon="check-circle"
          label="Resolve"
          tone="resolve"
          disabled={saving}
          onPress={() => onSetStatus(concern, "resolved")}
        />
        {saving && <ActivityIndicator size="small" color={PRIMARY} />}
      </View>
    </View>
  );
};

const LoadingRows = () => {
  const pulse = usePulse();
  return (
    <View className="gap-2">
      {[0, 1, 2].map((row) => (
        <SkeletonBlock key={row} pulse={pulse} className="h-14 rounded-lg" />
      ))}
    </View>
  );
};

/**
 * Customer Concerns for one location, on the manager dashboard (web parity:
 * components/admin/dashboard/LocationConcernsPanel.tsx): who is waiting on a
 * call, what they wanted, their number, and mark-contacted / resolve in place.
 * The list is the open ones only — resolving a row takes it off.
 */
export function LocationConcernsPanel({
  locationId,
  locationName,
  refreshSignal = 0,
  limit = 5,
}: {
  locationId: number;
  locationName?: string | null;
  /** Bump to reload, e.g. on the dashboard's pull-to-refresh. */
  refreshSignal?: number;
  limit?: number;
}) {
  const [concerns, setConcerns] = useState<ConcernRow[]>([]);
  const [stats, setStats] = useState<ConcernStats | null>(null);
  const [openTotal, setOpenTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setError(null);
    try {
      const token = getToken();
      if (!token) throw new Error("Not authenticated");
      const [page, statistics] = await Promise.all([
        fetchCheckoutConcerns({
          token,
          locationId,
          openOnly: true,
          perPage: limit,
        }),
        fetchCheckoutConcernStats(token, locationId),
      ]);
      if (seq !== loadSeq.current) return;
      setConcerns(page.rows);
      setOpenTotal(page.total);
      setStats(statistics);
    } catch {
      if (seq === loadSeq.current) {
        setError("Could not load customer concerns for this location.");
      }
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [locationId, limit]);

  useEffect(() => {
    load();
  }, [load, refreshSignal]);

  // Drop any in-flight load's result once the panel is gone.
  useEffect(
    () => () => {
      loadSeq.current++;
    },
    [],
  );

  const setStatus = useCallback(
    async (concern: ConcernRow, next: ConcernStatus) => {
      try {
        setSavingId(concern.id);
        const token = getToken();
        if (!token) throw new Error("Not authenticated");
        await updateCheckoutConcernStatus(token, concern.id, next);
        await load();
      } catch {
        setError("That did not save. Please try again.");
      } finally {
        setSavingId(null);
      }
    },
    [load],
  );

  const openAll = () => router.push(CONCERNS_ROUTE as never);

  const counters: {
    label: string;
    value: number;
    icon: FeatherIconName;
    box: string;
    text: string;
    color: string;
  }[] = [
    {
      label: "Needs a call",
      value: stats?.open ?? 0,
      icon: "phone-call",
      box: "bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800",
      text: "text-amber-700 dark:text-amber-300",
      color: "#B45309",
    },
    {
      label: "Received today",
      value: stats?.today ?? 0,
      icon: "inbox",
      box: "bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800",
      text: "text-emerald-700 dark:text-emerald-300",
      color: "#047857",
    },
  ];

  const byReason: { label: string; value: number; icon: FeatherIconName }[] = [
    {
      label: "Schedule help",
      value: stats?.scheduleHelp ?? 0,
      icon: "calendar",
    },
    { label: "Call to book", value: stats?.callToBook ?? 0, icon: "phone" },
    {
      label: "Left unfinished",
      value: stats?.abandonedCheckout ?? 0,
      icon: "shopping-cart",
    },
  ];

  return (
    <View className="mt-6 bg-white dark:bg-neutral-900 rounded-2xl border border-gray-100 dark:border-neutral-800 p-4">
      {/* Header */}
      <View className="flex-row items-start justify-between gap-2 mb-3">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Feather name="phone-call" size={15} color={PRIMARY} />
            <Text className="text-base font-bold text-gray-900 dark:text-white">
              Customer Concerns
            </Text>
          </View>
          <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Guests at {locationName || "this location"} waiting on a call back
          </Text>
        </View>
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => load()}
            disabled={loading}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Refresh customer concerns"
            className={`flex-row items-center gap-1 active:opacity-70 ${
              loading ? "opacity-40" : ""
            }`}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#6B7280" />
            ) : (
              <Feather name="refresh-cw" size={12} color="#6B7280" />
            )}
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              Refresh
            </Text>
          </Pressable>
          <Pressable
            onPress={openAll}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="View all customer concerns"
            className="flex-row items-center gap-1 active:opacity-70"
          >
            <Text className="text-xs font-semibold text-[#0644C7] dark:text-blue-400">
              View all
            </Text>
            <Feather name="arrow-right" size={12} color={PRIMARY} />
          </Pressable>
        </View>
      </View>

      {/* What is open now */}
      <View className="flex-row gap-2 mb-2">
        {counters.map((counter) => (
          <View
            key={counter.label}
            className={`flex-1 rounded-lg border px-2.5 py-2 ${counter.box}`}
          >
            <View className="flex-row items-center gap-1.5">
              <Feather name={counter.icon} size={12} color={counter.color} />
              <Text
                numberOfLines={1}
                className={`text-[10px] font-semibold uppercase tracking-wide ${counter.text}`}
              >
                {counter.label}
              </Text>
            </View>
            <Text className={`text-lg font-bold mt-0.5 ${counter.text}`}>
              {counter.value}
            </Text>
          </View>
        ))}
      </View>

      {/* All-time totals by reason — what the statistics endpoint counts. */}
      <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1 mb-4">
        <Text className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
          All time by reason
        </Text>
        {byReason.map((reason) => (
          <View key={reason.label} className="flex-row items-center gap-1">
            <Feather name={reason.icon} size={11} color="#9CA3AF" />
            <Text className="text-[11px] text-gray-500 dark:text-gray-400">
              {reason.label}{" "}
              <Text className="font-semibold text-gray-700 dark:text-gray-200">
                {reason.value}
              </Text>
            </Text>
          </View>
        ))}
      </View>

      {!!error && concerns.length > 0 && (
        <Text className="text-xs text-rose-600 dark:text-rose-400 mb-3">
          {error}
        </Text>
      )}

      {loading && concerns.length === 0 ? (
        <LoadingRows />
      ) : error && concerns.length === 0 ? (
        // A failed load is not an all-clear: nobody knows who is waiting.
        <View className="items-center py-6 px-3 rounded-lg border border-rose-100 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-900/10">
          <Feather name="alert-triangle" size={28} color="#FB7185" />
          <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 text-center mt-2">
            {error}
          </Text>
          <Text className="text-xs text-gray-500 dark:text-gray-400 text-center mt-0.5">
            This is not an all-clear — open the full page to check who is
            waiting.
          </Text>
          <View className="flex-row items-center gap-4 mt-3">
            <Pressable
              onPress={() => load()}
              hitSlop={8}
              accessibilityRole="button"
              className="active:opacity-70"
            >
              <Text className="text-xs font-semibold text-[#0644C7] dark:text-blue-400">
                Try again
              </Text>
            </Pressable>
            <Pressable
              onPress={openAll}
              hitSlop={8}
              accessibilityRole="button"
              className="active:opacity-70"
            >
              <Text className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                Open Customer Concerns
              </Text>
            </Pressable>
          </View>
        </View>
      ) : concerns.length === 0 ? (
        <View className="items-center py-6">
          <Feather name="check-circle" size={28} color="#34D399" />
          <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mt-2">
            Nobody is waiting on a call
          </Text>
          <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            New concerns from this location land here.
          </Text>
        </View>
      ) : (
        <>
          <View className="border border-gray-100 dark:border-neutral-800 rounded-lg">
            {concerns.map((concern, index) => (
              <ConcernItem
                key={concern.id}
                concern={concern}
                saving={savingId === concern.id}
                isLast={index === concerns.length - 1}
                onSetStatus={setStatus}
              />
            ))}
          </View>
          {openTotal > concerns.length && (
            <Pressable
              onPress={openAll}
              accessibilityRole="button"
              className="mt-2 items-center active:opacity-70"
            >
              <Text className="text-xs text-[#0644C7] dark:text-blue-400">
                Showing {concerns.length} of {openTotal} waiting on a call — see
                the rest
              </Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}
