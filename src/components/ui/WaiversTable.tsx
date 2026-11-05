import { Feather } from "@expo/vector-icons";
import { memo, useMemo } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { formatDateTimeET } from "../../lib/date/venueTime";
import { SOURCE_LABELS, type Waiver, type WaiverStatus } from "../../services/waiversService";
import { RowActionGroup } from "./RowActions";
import { SelectableTable, type TableColumn } from "./SelectableTable";
import { ToneDotBadge, type DotTone } from "./SummaryPanel";

const CELL_TEXT = "text-sm text-gray-700 dark:text-gray-300";

/** Column-visibility toggles (the web "Columns" menu). */
export type WColKey =
  | "linked"
  | "minors"
  | "template"
  | "location"
  | "source"
  | "date"
  | "submitted"
  | "checkin"
  | "status"
  | "marketing";
export type WCols = Record<WColKey, boolean>;

/** The web Records table's default visibility. */
export const DEFAULT_WAIVER_COLS: WCols = {
  linked: false,
  minors: true,
  template: false,
  location: false,
  source: false,
  date: true,
  submitted: true,
  checkin: true,
  status: false,
  marketing: false,
};

export const WAIVER_COLUMN_META: { key: WColKey; label: string }[] = [
  { key: "linked", label: "Linked to" },
  { key: "minors", label: "Minors" },
  { key: "date", label: "Visit date" },
  { key: "template", label: "Template" },
  { key: "location", label: "Location" },
  { key: "status", label: "Status" },
  { key: "source", label: "Source" },
  { key: "marketing", label: "Marketing" },
  { key: "submitted", label: "Signed" },
  { key: "checkin", label: "Check-in" },
];

function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr.substring(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// The web detail modal's status colours.
const STATUS_TONE: Record<WaiverStatus, DotTone> = {
  completed: "green",
  pending: "amber",
  expired: "red",
  replaced: "gray",
  deleted: "gray",
};

export const WaiverStatusPill = ({ status }: { status: WaiverStatus }) => (
  <ToneDotBadge
    tone={STATUS_TONE[status] ?? "gray"}
    label={status.charAt(0).toUpperCase() + status.slice(1)}
  />
);

/** Check-in pill — "Checked In" vs "Not Checked In", driven by checkedInAt. */
export const CheckinPill = ({ waiver }: { waiver: Waiver }) =>
  waiver.checkedInAt ? (
    <ToneDotBadge tone="green" label="Checked In" />
  ) : (
    <ToneDotBadge tone="gray" label="Not Checked In" />
  );

/** The web "Linked to" pill: booking blue, attraction purchase violet, event amber. */
const LinkedPill = ({ waiver: w }: { waiver: Waiver }) => {
  const link = w.bookingReference
    ? { label: `#${w.bookingReference}`, cls: "bg-blue-50 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-300" }
    : w.attractionPurchaseId
      ? { label: `AP-${w.attractionPurchaseId}`, cls: "bg-violet-50 dark:bg-violet-900/30", text: "text-violet-700 dark:text-violet-300" }
      : w.eventName
        ? { label: w.eventName, cls: "bg-amber-50 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-300" }
        : null;
  if (!link) return <Text className="text-xs text-gray-300 dark:text-gray-600">—</Text>;
  return (
    <View className={`self-start max-w-full px-2 py-0.5 rounded-md ${link.cls}`}>
      <Text numberOfLines={1} className={`text-xs font-medium ${link.text}`}>
        {link.label}
      </Text>
    </View>
  );
};

type Handlers = {
  busyId: number | null;
  canCheckIn: boolean;
  canPrint: boolean;
  canDelete: boolean;
  onCheckIn: (w: Waiver) => void;
  onPrint: (w: Waiver) => void;
  onDelete: (w: Waiver) => void;
};

type Column = TableColumn<Waiver> & { toggle?: WColKey };

// Web Records column order: Name · Phone · Linked to · Minors · Visit date ·
// Template · Location · Status · Source · Marketing · Signed · Check-In.
function buildColumns(h: Handlers): Column[] {
  return [
    {
      key: "name",
      label: "Name",
      width: 220,
      render: (w) => (
        <View>
          <Text numberOfLines={1} className="text-sm font-semibold text-gray-900 dark:text-white">
            {w.adultName || "—"}
          </Text>
          {!!(w.adultEmail || w.adultPhone) && (
            <Text numberOfLines={1} className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {w.adultEmail || w.adultPhone}
            </Text>
          )}
        </View>
      ),
    },
    {
      key: "phone",
      label: "Phone",
      width: 150,
      render: (w) => (
        <Text numberOfLines={1} className={CELL_TEXT}>
          {w.adultPhone || "—"}
        </Text>
      ),
    },
    {
      key: "linked",
      label: "Linked to",
      width: 150,
      toggle: "linked",
      render: (w) => <LinkedPill waiver={w} />,
    },
    {
      key: "minors",
      label: "Minors",
      width: 90,
      toggle: "minors",
      render: (w) => <Text className={CELL_TEXT}>{w.minorsCount}</Text>,
    },
    {
      key: "date",
      label: "Visit date",
      width: 140,
      toggle: "date",
      render: (w) => {
        const d = formatDate(w.selectedDate);
        return d ? (
          <Text numberOfLines={1} className={CELL_TEXT}>
            {d}
          </Text>
        ) : (
          <Text className="text-sm italic text-gray-400 dark:text-gray-500">not recorded</Text>
        );
      },
    },
    {
      key: "template",
      label: "Template",
      width: 190,
      toggle: "template",
      render: (w) => (
        <Text numberOfLines={1} className={CELL_TEXT}>
          {w.templateTitle || "—"}
        </Text>
      ),
    },
    {
      key: "location",
      label: "Location",
      width: 160,
      toggle: "location",
      render: (w) => (
        <Text numberOfLines={1} className={CELL_TEXT}>
          {w.locationName || "—"}
        </Text>
      ),
    },
    {
      key: "status",
      label: "Status",
      width: 120,
      toggle: "status",
      render: (w) => (
        <View className="flex-row">
          <WaiverStatusPill status={w.status} />
        </View>
      ),
    },
    {
      key: "source",
      label: "Source",
      width: 130,
      toggle: "source",
      render: (w) => (
        <Text numberOfLines={1} className={CELL_TEXT}>
          {SOURCE_LABELS[w.source] ?? w.source ?? "—"}
        </Text>
      ),
    },
    {
      key: "marketing",
      label: "Marketing",
      width: 120,
      toggle: "marketing",
      render: (w) =>
        w.marketingConsentStatus === "opted_in" ? (
          <View className="flex-row">
            <ToneDotBadge tone="green" label="Opted in" />
          </View>
        ) : (
          <Text className="text-xs text-gray-300 dark:text-gray-600">—</Text>
        ),
    },
    {
      key: "submitted",
      label: "Signed",
      width: 200,
      toggle: "submitted",
      render: (w) => (
        <Text numberOfLines={2} className={CELL_TEXT}>
          {w.submittedAt ? formatDateTimeET(w.submittedAt, { month: "short" }) : "—"}
        </Text>
      ),
    },
    {
      key: "checkin",
      label: "Check-in",
      width: 150,
      toggle: "checkin",
      render: (w) => (
        <View className="flex-row">
          <CheckinPill waiver={w} />
        </View>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      width: 200,
      render: (w) => {
        // The web row: Check In (a completed waiver not yet checked in), then
        // Print and Delete, each gated by role and the company settings.
        const showCheckIn = h.canCheckIn && w.status === "completed" && !w.checkedInAt;
        if (!showCheckIn && !h.canPrint && !h.canDelete)
          return <Text className="text-xs text-gray-300 dark:text-gray-600">—</Text>;
        if (h.busyId === w.id) return <ActivityIndicator size="small" color="#0644C7" />;
        return (
          <View className="flex-row items-center gap-2">
            {showCheckIn && (
              <Pressable
                onPress={() => h.onCheckIn(w)}
                className="flex-row items-center gap-1.5 h-8 px-2.5 rounded-lg border border-emerald-200 dark:border-emerald-900/40 active:opacity-70"
                accessibilityRole="button"
                accessibilityLabel={`Check in ${w.adultName}`}
              >
                <Feather name="user-check" size={13} color="#059669" />
                <Text className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  Check In
                </Text>
              </Pressable>
            )}
            <RowActionGroup
              actions={[
                h.canPrint && {
                  key: "print",
                  icon: "printer",
                  color: "#6B7280",
                  label: `Print waiver for ${w.adultName}`,
                  onPress: () => h.onPrint(w),
                },
                h.canDelete && {
                  key: "delete",
                  icon: "trash-2",
                  color: "#DC2626",
                  label: `Delete waiver for ${w.adultName}`,
                  onPress: () => h.onDelete(w),
                },
              ]}
            />
          </View>
        );
      },
    },
  ];
}

/**
 * Table layout for Waiver Records, on the shared flat table. Columns follow the
 * web Records table and its Columns menu (Location also honours `showLocation`,
 * company-admin only). Tapping a row opens the detail sheet; the Actions cell
 * handles its own presses.
 */
export const WaiversTable = memo(function WaiversTable({
  waivers,
  cols,
  showLocation,
  canCheckIn,
  canPrint,
  canDelete,
  busyId,
  onRowPress,
  onCheckIn,
  onPrint,
  onDelete,
}: {
  waivers: Waiver[];
  cols: WCols;
  showLocation: boolean;
  onRowPress: (waiver: Waiver) => void;
} & Handlers) {
  const columns = useMemo(() => {
    const all = buildColumns({ busyId, canCheckIn, canPrint, canDelete, onCheckIn, onPrint, onDelete });
    return all.filter((c) => {
      if (!c.toggle) return true;
      if (c.toggle === "location") return cols.location && showLocation;
      return cols[c.toggle];
    });
  }, [cols, showLocation, busyId, canCheckIn, canPrint, canDelete, onCheckIn, onPrint, onDelete]);

  return (
    <SelectableTable
      columns={columns}
      rows={waivers}
      rowId={(w) => w.id}
      onRowPress={onRowPress}
      rowLabel={(w) => `waiver for ${w.adultName}`}
      flat
    />
  );
});
