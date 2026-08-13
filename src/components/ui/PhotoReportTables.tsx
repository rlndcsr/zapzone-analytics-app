import { memo, type ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";

import type {
  PhotoReportAuditEntry,
  PhotoReportDay,
} from "../../services/photosService";
import { ViewToggle, type ViewMode } from "./ViewToggle";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const HEADER_MIN_HEIGHT = 48;
const ROW_MIN_HEIGHT = 56;

const CELL_TEXT = "text-sm text-gray-600 dark:text-gray-300";
const CELL_STRONG = "text-sm text-gray-900 dark:text-white";
const CELL_NUM = "text-sm text-gray-700 dark:text-gray-200";

const DASH = "—";

type Column<T> = {
  key: string;
  label: string;
  width: number;
  render: (row: T) => ReactNode;
};

/** Titled block carrying the Table/Cards switch, shared by both report tables. */
function Section({
  title,
  subtitle,
  mode,
  onModeChange,
  children,
}: {
  title: string;
  subtitle?: string;
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  children: ReactNode;
}) {
  return (
    <View
      className="mb-3 overflow-hidden rounded-2xl border border-gray-100 bg-white dark:border-neutral-800 dark:bg-neutral-900"
      style={CARD_SHADOW}
    >
      <View className="flex-row items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-neutral-800">
        <View className="flex-1">
          <Text className="font-semibold text-gray-900 dark:text-white">
            {title}
          </Text>
          {!!subtitle && (
            <Text className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {subtitle}
            </Text>
          )}
        </View>
        <ViewToggle mode={mode} onChange={onModeChange} />
      </View>
      {children}
    </View>
  );
}

/** Fixed-width columns in a horizontal scroller, so no column is dropped. */
function Table<T>({
  columns,
  rows,
  keyOf,
}: {
  columns: Column<T>[];
  rows: T[];
  keyOf: (row: T, index: number) => string;
}) {
  const width = columns.reduce((sum, c) => sum + c.width, 0);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      nestedScrollEnabled
    >
      <View style={{ width }}>
        <View
          className="flex-row items-center border-b border-gray-100 bg-gray-50 dark:border-neutral-800 dark:bg-neutral-800/60"
          style={{ minHeight: HEADER_MIN_HEIGHT }}
        >
          {columns.map((col) => (
            <View
              key={col.key}
              className="justify-center px-4 py-3"
              style={{ width: col.width }}
            >
              <Text
                numberOfLines={1}
                className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500"
              >
                {col.label}
              </Text>
            </View>
          ))}
        </View>

        {rows.map((row, i) => (
          <View
            key={keyOf(row, i)}
            className={`flex-row items-center ${
              i < rows.length - 1
                ? "border-b border-gray-100 dark:border-neutral-800"
                : ""
            }`}
            style={{ minHeight: ROW_MIN_HEIGHT }}
          >
            {columns.map((col) => (
              <View
                key={col.key}
                className="justify-center px-4 py-3"
                style={{ width: col.width }}
              >
                {col.render(row)}
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

/** Label/value row, matching the report screen's existing record cards. */
function CardField({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-start justify-between gap-3 py-1">
      <Text className="shrink text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {label}
      </Text>
      <Text className="flex-1 text-right text-sm text-gray-800 dark:text-gray-100">
        {value}
      </Text>
    </View>
  );
}

/** The web renders the action name as a <code> chip. */
function ActionChip({ action }: { action: string }) {
  return (
    <View className="self-start rounded bg-gray-100 px-1.5 py-0.5 dark:bg-neutral-800">
      <Text
        numberOfLines={1}
        className="text-xs text-gray-700 dark:text-gray-200"
      >
        {action}
      </Text>
    </View>
  );
}

/* ------------------------------------------------ daily library: by day -- */

const DAY_COLUMNS: Column<PhotoReportDay>[] = [
  {
    key: "operating_day",
    label: "Operating day",
    width: 150,
    render: (r) => (
      <Text numberOfLines={1} className={CELL_STRONG}>
        {r.operatingDay}
      </Text>
    ),
  },
  {
    key: "photos",
    label: "Photos",
    width: 110,
    render: (r) => (
      <Text numberOfLines={1} className={CELL_NUM}>
        {r.photos.toLocaleString()}
      </Text>
    ),
  },
  {
    key: "downloads",
    label: "Downloads",
    width: 130,
    render: (r) => (
      <Text numberOfLines={1} className={CELL_NUM}>
        {r.downloads.toLocaleString()}
      </Text>
    ),
  },
];

export const PhotoReportDaysSection = memo(function PhotoReportDaysSection({
  days,
  mode,
  onModeChange,
}: {
  days: PhotoReportDay[];
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
}) {
  return (
    <Section
      title="Photos by operating day"
      mode={mode}
      onModeChange={onModeChange}
    >
      {mode === "table" ? (
        <Table columns={DAY_COLUMNS} rows={days} keyOf={(r) => r.operatingDay} />
      ) : (
        <View className="gap-2 p-3">
          {days.map((r) => (
            <View
              key={r.operatingDay}
              className="rounded-xl border border-gray-100 p-3 dark:border-neutral-800"
            >
              <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                {r.operatingDay}
              </Text>
              <View className="mt-1">
                <CardField label="Photos" value={r.photos.toLocaleString()} />
                <CardField
                  label="Downloads"
                  value={r.downloads.toLocaleString()}
                />
              </View>
            </View>
          ))}
        </View>
      )}
    </Section>
  );
});

/* ------------------------------------------------------------ audit log -- */

/**
 * Device-local, matching the web's `new Date(created_at).toLocaleString()`.
 * Deliberately NOT venue time — this table follows the web's own rendering.
 */
const auditWhen = (e: PhotoReportAuditEntry): string => {
  if (!e.createdAt) return DASH;
  const d = new Date(e.createdAt);
  return Number.isNaN(d.getTime()) ? DASH : d.toLocaleString();
};

const AUDIT_COLUMNS: Column<PhotoReportAuditEntry>[] = [
  {
    key: "when",
    label: "When",
    width: 200,
    render: (e) => (
      <Text numberOfLines={2} className={CELL_TEXT}>
        {auditWhen(e)}
      </Text>
    ),
  },
  {
    key: "who",
    label: "Who",
    width: 170,
    render: (e) => (
      <Text numberOfLines={2} className={CELL_STRONG}>
        {e.userName ?? DASH}
      </Text>
    ),
  },
  {
    key: "action",
    label: "Action",
    width: 210,
    render: (e) => <ActionChip action={e.action} />,
  },
  {
    key: "detail",
    label: "Detail",
    width: 280,
    render: (e) => (
      <Text numberOfLines={3} className={CELL_TEXT}>
        {e.description ?? DASH}
      </Text>
    ),
  },
  {
    key: "location",
    label: "Location",
    width: 170,
    render: (e) => (
      <Text numberOfLines={2} className={CELL_TEXT}>
        {e.locationName ?? DASH}
      </Text>
    ),
  },
];

export const PhotoReportAuditSection = memo(function PhotoReportAuditSection({
  entries,
  mode,
  onModeChange,
}: {
  entries: PhotoReportAuditEntry[];
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
}) {
  return (
    <Section
      title="Audit log"
      subtitle="Every capture, delivery, download, staff resend, hide and passcode change."
      mode={mode}
      onModeChange={onModeChange}
    >
      {entries.length === 0 ? (
        <View className="p-8">
          <Text className="text-center text-sm text-gray-500 dark:text-gray-400">
            Nothing recorded in this range.
          </Text>
        </View>
      ) : mode === "table" ? (
        <Table
          columns={AUDIT_COLUMNS}
          rows={entries}
          keyOf={(e) => String(e.id)}
        />
      ) : (
        <View className="gap-2 p-3">
          {entries.map((e) => (
            <View
              key={e.id}
              className="rounded-xl border border-gray-100 p-3 dark:border-neutral-800"
            >
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                {auditWhen(e)}
              </Text>
              <Text className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white">
                {e.userName ?? DASH}
              </Text>
              <View className="mt-1.5 flex-row">
                <ActionChip action={e.action} />
              </View>
              <View className="mt-1">
                <CardField label="Detail" value={e.description ?? DASH} />
                <CardField label="Location" value={e.locationName ?? DASH} />
              </View>
            </View>
          ))}
        </View>
      )}
    </Section>
  );
});
