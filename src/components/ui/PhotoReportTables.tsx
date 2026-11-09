import { memo, type ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";

import type {
  PhotoReportAuditEntry,
  PhotoReportDay,
  PhotoReportRow,
} from "../../services/photosService";
import type { ViewMode } from "./ViewToggle";

/*
 * Photo Reports lists, drawn the Manage Attractions way: a bordered table
 * (grey header row, hairline rows, horizontal scroll so no column is dropped)
 * or one bordered card per row. The screen owns the list header, the
 * Table/Cards toggle and the pager; these only draw the rows they are given.
 */

const HEADER_MIN_HEIGHT = 44;
const ROW_MIN_HEIGHT = 56;

const CELL_TEXT = "text-sm text-gray-700 dark:text-gray-300";
const CELL_STRONG = "text-sm font-semibold text-gray-900 dark:text-white";

const DASH = "—";

type Column<T> = {
  key: string;
  label: string;
  width: number;
  render: (row: T) => ReactNode;
};

/** "PHOTOS UPLOADED" -> "Photos uploaded", keeping acronyms upper case. */
export const readableLabel = (label: string): string => {
  const lower = label.toLowerCase();
  return (lower.charAt(0).toUpperCase() + lower.slice(1)).replace(
    /\b(qr|sms|mms|id|url)\b/gi,
    (m) => m.toUpperCase(),
  );
};

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
    <View className="mb-3 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
      >
        <View style={{ minWidth: width }}>
          <View
            className="flex-row items-center border-b border-gray-200 bg-gray-50 dark:border-neutral-800 dark:bg-neutral-800/50"
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
                  className="text-xs font-medium text-gray-500 dark:text-gray-400"
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
    </View>
  );
}

/** One row as a card: a bold title line, then label/value rows. */
function RowCard({
  title,
  eyebrow,
  badge,
  fields,
}: {
  title: string;
  eyebrow?: string;
  badge?: string;
  fields: { label: string; value: string }[];
}) {
  return (
    <View className="mb-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      {!!eyebrow && (
        <Text className="mb-0.5 text-xs text-gray-500 dark:text-gray-400">
          {eyebrow}
        </Text>
      )}
      <Text className="text-base font-semibold text-gray-900 dark:text-white">
        {title}
      </Text>
      {!!badge && (
        <View className="mt-1.5 flex-row">
          <ActionChip action={badge} />
        </View>
      )}
      {fields.length > 0 && (
        <View className="mt-3 border-t border-gray-100 pt-2 dark:border-neutral-800">
          {fields.map((f, i) => (
            <View
              key={`${f.label}-${i}`}
              className="flex-row items-start justify-between gap-3 py-1"
            >
              {!!f.label && (
                <Text className="shrink text-xs text-gray-500 dark:text-gray-400">
                  {f.label}
                </Text>
              )}
              <Text className="flex-1 text-right text-sm text-gray-900 dark:text-white">
                {f.value}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/** The web renders the action name as a <code> chip. */
function ActionChip({ action }: { action: string }) {
  return (
    <View className="max-w-full self-start rounded-md bg-gray-100 px-2 py-1 dark:bg-neutral-800">
      <Text
        numberOfLines={1}
        className="text-xs font-medium text-gray-700 dark:text-gray-300"
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
      <Text numberOfLines={1} className={CELL_TEXT}>
        {r.photos.toLocaleString()}
      </Text>
    ),
  },
  {
    key: "downloads",
    label: "Downloads",
    width: 130,
    render: (r) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {r.downloads.toLocaleString()}
      </Text>
    ),
  },
];

export const PhotoReportDaysList = memo(function PhotoReportDaysList({
  days,
  mode,
}: {
  days: PhotoReportDay[];
  mode: ViewMode;
}) {
  return mode === "table" ? (
    <Table columns={DAY_COLUMNS} rows={days} keyOf={(r) => r.operatingDay} />
  ) : (
    <>
      {days.map((r) => (
        <RowCard
          key={r.operatingDay}
          title={r.operatingDay}
          fields={[
            { label: "Photos", value: r.photos.toLocaleString() },
            { label: "Downloads", value: r.downloads.toLocaleString() },
          ]}
        />
      ))}
    </>
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
      <Text numberOfLines={3} className={`${CELL_TEXT} leading-4`}>
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

export const PhotoReportAuditList = memo(function PhotoReportAuditList({
  entries,
  mode,
}: {
  entries: PhotoReportAuditEntry[];
  mode: ViewMode;
}) {
  return mode === "table" ? (
    <Table
      columns={AUDIT_COLUMNS}
      rows={entries}
      keyOf={(e) => String(e.id)}
    />
  ) : (
    <>
      {entries.map((e) => (
        <RowCard
          key={e.id}
          eyebrow={auditWhen(e)}
          title={e.userName ?? DASH}
          badge={e.action}
          fields={[
            { label: "Detail", value: e.description ?? DASH },
            { label: "Location", value: e.locationName ?? DASH },
          ]}
        />
      ))}
    </>
  );
});

/* ------------------------------------- any other list-shaped report -- */

/** Rough column width from the longest label/value, kept within bounds. */
const columnWidth = (longest: number) =>
  Math.min(280, Math.max(120, longest * 8 + 32));

/**
 * Records from a list-shaped report. Their fields are whatever the server
 * sent, so the columns are the union of field keys in first-seen order.
 */
export const PhotoReportRecordsList = memo(function PhotoReportRecordsList({
  rows,
  mode,
}: {
  rows: PhotoReportRow[];
  mode: ViewMode;
}) {
  if (mode === "cards") {
    return (
      <>
        {rows.map((row) => {
          const [first, ...rest] = row.fields;
          return (
            <RowCard
              key={row.key}
              title={first?.value ?? DASH}
              fields={rest.map((f) => ({
                label: f.label ? readableLabel(f.label) : "",
                value: f.value,
              }))}
            />
          );
        })}
      </>
    );
  }

  const meta = new Map<string, { label: string; longest: number }>();
  rows.forEach((row) =>
    row.fields.forEach((f) => {
      const label = f.label ? readableLabel(f.label) : "Value";
      const prev = meta.get(f.key);
      const longest = Math.max(prev?.longest ?? label.length, f.value.length);
      meta.set(f.key, { label: prev?.label ?? label, longest });
    }),
  );
  const columns: Column<PhotoReportRow>[] = [...meta.entries()].map(
    ([key, { label, longest }], i) => ({
      key,
      label,
      width: columnWidth(longest),
      render: (row) => (
        <Text
          numberOfLines={2}
          className={i === 0 ? CELL_STRONG : CELL_TEXT}
        >
          {row.fields.find((f) => f.key === key)?.value ?? DASH}
        </Text>
      ),
    }),
  );
  return <Table columns={columns} rows={rows} keyOf={(r) => r.key} />;
});
