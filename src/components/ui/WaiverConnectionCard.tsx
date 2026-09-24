import * as Clipboard from "expo-clipboard";
import {
  Clock,
  FileText,
  Link2,
  ShieldCheck,
  Tablet,
  UserCheck,
} from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { launchKioskSession } from "../../lib/waivers/kiosk";
import { getToken } from "../../lib/session";
import {
  checkInAllWaivers,
  checkInWaiver,
  type ConnectedWaiver,
  type EntityWaivers,
  type WaiverEntityType,
} from "../../services/waiversService";

const PRIMARY = "#0644C7";

// The web panel's own pill map — not StatusBadge's, which reads "pending"
// where this card says "Not signed".
const STATUS_STYLE: Record<string, { wrap: string; text: string }> = {
  completed: {
    wrap: "bg-emerald-50 border-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-900/40",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  pending: {
    wrap: "bg-amber-50 border-amber-100 dark:bg-amber-900/20 dark:border-amber-900/40",
    text: "text-amber-700 dark:text-amber-300",
  },
  expired: {
    wrap: "bg-gray-50 border-gray-200 dark:bg-neutral-800 dark:border-neutral-700",
    text: "text-gray-500 dark:text-gray-400",
  },
  replaced: {
    wrap: "bg-gray-50 border-gray-200 dark:bg-neutral-800 dark:border-neutral-700",
    text: "text-gray-500 dark:text-gray-400",
  },
  deleted: {
    wrap: "bg-red-50 border-red-100 dark:bg-red-900/20 dark:border-red-900/40",
    text: "text-red-700 dark:text-red-300",
  },
};

const STATUS_LABEL: Record<string, string> = {
  completed: "Signed",
  pending: "Not signed",
  expired: "Expired",
  replaced: "Replaced",
  deleted: "Deleted",
};

const formatDateTime = (iso?: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
};

const formatDate = (val?: string | null): string => {
  if (!val) return "";
  const datePart = val.split("T")[0].split(" ")[0];
  const d = new Date(`${datePart}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? datePart
    : d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
};

const messageOf = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;

const Pill = ({
  wrap,
  text,
  children,
}: {
  wrap: string;
  text: string;
  children: React.ReactNode;
}) => (
  <View className={`flex-row items-center gap-0.5 rounded-full border px-1.5 py-0.5 ${wrap}`}>
    {typeof children === "string" ? (
      <Text className={`text-[10px] font-semibold ${text}`}>{children}</Text>
    ) : (
      children
    )}
  </View>
);

const CardFrame = ({ children }: { children: React.ReactNode }) => (
  <View className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
    {children}
  </View>
);

const Title = ({ title }: { title: string }) => (
  <View className="flex-row items-center gap-2">
    <ShieldCheck size={16} color={PRIMARY} />
    <Text className="text-sm font-bold text-gray-900 dark:text-white">
      {title}
    </Text>
  </View>
);

/**
 * The web's `WaiverConnectionPanel`, for one record: its own white card with the
 * signed / pending / checked-in counts, the prefilled kiosk, and one row per
 * waiver with Copy link and per-waiver check-in.
 *
 * The caller fetches the waivers (a screen with several of these loads them
 * together) and hands them in; `onChanged` is how a check-in here asks for them
 * to be read again, so the counts never run ahead of the server.
 */
export function WaiverConnectionCard({
  type,
  id,
  waivers,
  loading,
  onChanged,
  title = "Waivers",
  compact = false,
  checkInActions = true,
  emptyMessage,
}: {
  type: Exclude<WaiverEntityType, "customer">;
  id: number;
  waivers: EntityWaivers | null;
  loading: boolean;
  onChanged?: () => Promise<void> | void;
  title?: string;
  /** Drops each row's template / date / signed-at line, as the web does. */
  compact?: boolean;
  checkInActions?: boolean;
  emptyMessage?: string;
}) {
  const [launching, setLaunching] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | "all" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  const openKiosk = async () => {
    setLaunching(true);
    setActionError(null);
    try {
      await launchKioskSession(type, id);
    } finally {
      setLaunching(false);
    }
  };

  const copyLink = async (w: ConnectedWaiver) => {
    if (!w.signingUrl) return;
    try {
      await Clipboard.setStringAsync(w.signingUrl);
      setCopied(w.id);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(null), 2000);
    } catch {
      // the web swallows a clipboard failure too; the link is still on the row
    }
  };

  const checkIn = async (w: ConnectedWaiver) => {
    const token = getToken();
    if (!token) {
      setActionError("Not authenticated");
      return;
    }
    setBusyId(w.id);
    setActionError(null);
    try {
      await checkInWaiver(token, w.id);
      await onChanged?.();
    } catch (err) {
      setActionError(messageOf(err, "Failed to check in waiver"));
    } finally {
      setBusyId(null);
    }
  };

  const checkInAll = async () => {
    const token = getToken();
    if (!token) {
      setActionError("Not authenticated");
      return;
    }
    setBusyId("all");
    setActionError(null);
    try {
      await checkInAllWaivers(token, type, id);
      await onChanged?.();
    } catch (err) {
      setActionError(messageOf(err, "Failed to check in waivers"));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <CardFrame>
        <Title title={title} />
        <View className="items-center py-3">
          <ActivityIndicator color={PRIMARY} />
        </View>
      </CardFrame>
    );
  }

  const list = waivers?.waivers ?? [];
  const summary = waivers?.summary ?? {
    total: 0,
    completed: 0,
    pending: 0,
    checkedIn: 0,
  };

  const kioskButton = (label: string) => (
    <Pressable
      onPress={() => void openKiosk()}
      disabled={launching}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel="Open waiver kiosk"
      className={`flex-row items-center gap-1 rounded px-2 py-1 active:opacity-70 ${
        launching ? "opacity-50" : ""
      }`}
    >
      <Tablet size={12} color={PRIMARY} />
      <Text className="text-[11px] font-semibold text-[#0644C7] dark:text-blue-300">
        {launching ? "…" : label}
      </Text>
    </Pressable>
  );

  if (summary.total === 0) {
    return (
      <CardFrame>
        <View className="mb-1 flex-row items-center justify-between">
          <Title title={title} />
          {kioskButton("Prefilled kiosk")}
        </View>
        <Text className="text-xs text-gray-400 dark:text-gray-500">
          {emptyMessage ?? `No waiver connected to this ${type.replace("_", " ")}.`}
        </Text>
      </CardFrame>
    );
  }

  const checkableCount = list.filter(
    (w) => w.status === "completed" && !w.checkedInAt,
  ).length;

  return (
    <CardFrame>
      <View className="mb-3 flex-row flex-wrap items-center justify-between gap-2">
        <Title title={title} />
        <View className="flex-row flex-wrap items-center gap-2">
          <View className="flex-row items-center gap-1">
            <ShieldCheck size={12} color="#059669" />
            <Text className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              {summary.completed} signed
            </Text>
          </View>
          {summary.pending > 0 && (
            <View className="flex-row items-center gap-1">
              <Clock size={12} color="#D97706" />
              <Text className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                {summary.pending} pending
              </Text>
            </View>
          )}
          {checkInActions && summary.checkedIn > 0 && (
            <View className="flex-row items-center gap-1">
              <UserCheck size={12} color="#047857" />
              <Text className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                {summary.checkedIn} checked in
              </Text>
            </View>
          )}
          {kioskButton("Kiosk")}
          {checkInActions && checkableCount > 1 && (
            <Pressable
              onPress={() => void checkInAll()}
              disabled={busyId !== null}
              accessibilityRole="button"
              className={`flex-row items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 active:opacity-90 ${
                busyId !== null ? "opacity-50" : ""
              }`}
            >
              {busyId === "all" ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <UserCheck size={12} color="#FFFFFF" />
              )}
              <Text className="text-[11px] font-semibold text-white">
                Check In All ({checkableCount})
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {!!actionError && (
        <View className="mb-2 rounded-lg border border-red-100 bg-red-50 px-3 py-1.5 dark:border-red-900/40 dark:bg-red-900/20">
          <Text className="text-[11px] text-red-700 dark:text-red-300">
            {actionError}
          </Text>
        </View>
      )}

      {list.map((w, index) => {
        const style = STATUS_STYLE[w.status] ?? STATUS_STYLE.pending;
        return (
          <View
            key={w.id}
            className={`flex-row items-start justify-between gap-3 py-2.5 ${
              index > 0 ? "border-t border-gray-50 dark:border-neutral-800" : ""
            }`}
          >
            <View className="min-w-0 flex-1">
              <View className="flex-row flex-wrap items-center gap-2">
                <Text
                  className="shrink text-sm font-medium text-gray-900 dark:text-white"
                  numberOfLines={1}
                >
                  {w.displayName}
                </Text>
                <Pill wrap={style.wrap} text={style.text}>
                  {STATUS_LABEL[w.status] ?? w.status}
                </Pill>
                {checkInActions &&
                  (w.checkedInAt ? (
                    <Pill
                      wrap={STATUS_STYLE.completed.wrap}
                      text={STATUS_STYLE.completed.text}
                    >
                      <UserCheck size={10} color="#047857" />
                      <Text className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                        Checked In
                      </Text>
                    </Pill>
                  ) : (
                    <Pill
                      wrap="bg-gray-50 border-gray-200 dark:bg-neutral-800 dark:border-neutral-700"
                      text="text-gray-400 dark:text-gray-500"
                    >
                      Not Checked In
                    </Pill>
                  ))}
              </View>
              {!compact && (
                <Text className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
                  {w.template ? `${w.template} · ` : ""}
                  {formatDate(w.selectedDate)}
                  {w.minors.length > 0 ? ` · Minors: ${w.minors.join(", ")}` : ""}
                  {w.submittedAt ? ` · Signed ${formatDateTime(w.submittedAt)}` : ""}
                  {w.checkedInAt
                    ? ` · Checked in ${formatDateTime(w.checkedInAt)}`
                    : ""}
                </Text>
              )}
            </View>

            <View className="shrink-0 flex-row items-center gap-1">
              {w.status === "pending" && !!w.signingUrl && (
                <Pressable
                  onPress={() => void copyLink(w)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`Copy waiver link for ${w.displayName}`}
                  className="flex-row items-center gap-1 rounded px-2 py-1 active:opacity-70"
                >
                  {copied === w.id ? (
                    <FileText size={12} color={PRIMARY} />
                  ) : (
                    <Link2 size={12} color={PRIMARY} />
                  )}
                  <Text className="text-[11px] font-semibold text-[#0644C7] dark:text-blue-300">
                    {copied === w.id ? "Copied" : "Copy link"}
                  </Text>
                </Pressable>
              )}
              {checkInActions && w.status === "completed" && !w.checkedInAt && (
                <Pressable
                  onPress={() => void checkIn(w)}
                  disabled={busyId !== null}
                  accessibilityRole="button"
                  accessibilityLabel={`Check in waiver for ${w.displayName}`}
                  className={`flex-row items-center gap-1 rounded-lg border border-emerald-100 bg-emerald-50 px-2 py-1 active:opacity-70 dark:border-emerald-900/40 dark:bg-emerald-900/20 ${
                    busyId !== null ? "opacity-50" : ""
                  }`}
                >
                  {busyId === w.id ? (
                    <ActivityIndicator size="small" color="#047857" />
                  ) : (
                    <UserCheck size={12} color="#047857" />
                  )}
                  <Text className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                    Check In
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        );
      })}
    </CardFrame>
  );
}

export default WaiverConnectionCard;
