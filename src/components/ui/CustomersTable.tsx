import { Feather } from "@expo/vector-icons";
import { memo, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { formatDateTimeET } from "../../lib/date/venueTime";
import type { ContactRow } from "../../services/contactsService";
import { StatusBadge } from "./StatusBadge";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const HEADER_MIN_HEIGHT = 48;
const ROW_MIN_HEIGHT = 64;

/** Leading selection-checkbox column width. */
const CHECKBOX_WIDTH = 48;

const CELL_TEXT = "text-sm text-gray-600 dark:text-gray-300";
const MUTED = "#9CA3AF";

/** How many tag chips to show inline before collapsing the rest into "+N". */
const MAX_TAGS = 2;

/**
 * Selection checkbox cell (leading column). A nested Pressable so it handles
 * its own touch — toggling selection without opening the row. `state` drives
 * the icon: unchecked, checked, or the header's indeterminate dash.
 */
const CheckboxCell = ({
  state,
  onPress,
  label,
}: {
  state: "off" | "on" | "some";
  onPress: () => void;
  label: string;
}) => (
  <View className="items-center justify-center" style={{ width: CHECKBOX_WIDTH }}>
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: state === "on" }}
      accessibilityLabel={label}
      className="active:opacity-60"
    >
      <Feather
        name={
          state === "on"
            ? "check-square"
            : state === "some"
              ? "minus-square"
              : "square"
        }
        size={19}
        color={state === "off" ? "#9CA3AF" : "#0644C7"}
      />
    </Pressable>
  </View>
);

/** Icon + text cell with an em-dash fallback (mirrors the web's "—"). */
const IconValue = ({
  icon,
  value,
  lines = 1,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  value: string | null;
  lines?: number;
}) => (
  <View className="flex-row items-center gap-1.5">
    <Feather name={icon} size={13} color={MUTED} />
    <Text numberOfLines={lines} className={`flex-1 ${CELL_TEXT}`}>
      {value || "—"}
    </Text>
  </View>
);

/** Created / Updated cells — venue time, matching the rest of the app. */
const fmtStamp = (iso: string | null): string =>
  formatDateTimeET(iso, { month: "short", showZone: false });

type RowContext = {
  busy: boolean;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddTag: () => void;
  onToggleStatus: () => void;
};

type Column = {
  key: string;
  label: string;
  width: number;
  /** Heading in the "Toggle Columns" sheet (mirrors the web's column groups). */
  group: string;
  /** Off until the user turns it on, matching the web's default view. */
  defaultHidden?: boolean;
  render: (c: ContactRow, ctx: RowContext) => ReactNode;
};

const COLUMNS: Column[] = [
  {
    key: "id",
    label: "ID",
    group: "Identifiers",
    width: 80,
    defaultHidden: true,
    render: (c) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        #{c.id}
      </Text>
    ),
  },
  {
    key: "name",
    label: "Name",
    group: "Customer",
    width: 210,
    // Single line, truncated with an ellipsis, to keep rows short and readable.
    render: (c) => (
      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        className="text-sm font-semibold text-gray-900 dark:text-white"
      >
        {c.name}
      </Text>
    ),
  },
  {
    key: "email",
    label: "Email",
    group: "Customer",
    width: 230,
    render: (c) => <IconValue icon="mail" value={c.email} />,
  },
  {
    key: "phone",
    label: "Phone",
    group: "Customer",
    width: 150,
    render: (c) => <IconValue icon="phone" value={c.phone} />,
  },
  {
    key: "company",
    label: "Company",
    group: "Work",
    width: 150,
    render: (c) => <IconValue icon="home" value={c.companyName} />,
  },
  {
    key: "jobTitle",
    label: "Job Title",
    group: "Work",
    width: 140,
    render: (c) => <IconValue icon="briefcase" value={c.jobTitle} />,
  },
  {
    key: "location",
    label: "Location",
    group: "Details",
    width: 200,
    render: (c) => <IconValue icon="map-pin" value={c.locationName} lines={2} />,
  },
  {
    key: "tags",
    label: "Tags",
    group: "Details",
    width: 210,
    render: (c, ctx) => (
      <View className="flex-row flex-wrap items-center gap-1.5">
        {c.tags.slice(0, MAX_TAGS).map((t) => (
          <View
            key={t}
            className="bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-md"
          >
            <Text
              numberOfLines={1}
              className="text-[11px] font-medium text-[#0644C7] dark:text-blue-300"
            >
              {t}
            </Text>
          </View>
        ))}
        {c.tags.length > MAX_TAGS && (
          <Text className="text-[11px] font-medium text-gray-400 dark:text-gray-500">
            +{c.tags.length - MAX_TAGS}
          </Text>
        )}
        {/* Square add-tag button — opens the Add Tag sheet (mirrors the web). */}
        <Pressable
          onPress={ctx.onAddTag}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Add tag to ${c.name}`}
          className="w-6 h-6 rounded-md border border-dashed border-gray-300 dark:border-neutral-600 items-center justify-center active:opacity-70"
        >
          <Feather name="plus" size={13} color="#9CA3AF" />
        </Pressable>
      </View>
    ),
  },
  {
    key: "source",
    label: "Source",
    group: "Details",
    width: 160,
    defaultHidden: true,
    render: (c) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {c.source || "—"}
      </Text>
    ),
  },
  {
    key: "notes",
    label: "Notes",
    group: "Details",
    width: 220,
    defaultHidden: true,
    render: (c) => (
      <Text numberOfLines={2} className={CELL_TEXT}>
        {c.notes || "—"}
      </Text>
    ),
  },
  {
    key: "status",
    label: "Status",
    group: "Status",
    width: 130,
    // Tap-to-toggle pill, like the web's status cell ("Click to activate").
    render: (c, ctx) => (
      <View className="flex-row">
        <Pressable
          onPress={ctx.onToggleStatus}
          disabled={ctx.busy}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={
            c.status === "active"
              ? `Deactivate ${c.name}`
              : `Activate ${c.name}`
          }
          className="active:opacity-60"
        >
          <StatusBadge status={c.status} />
        </Pressable>
      </View>
    ),
  },
  {
    key: "sms",
    label: "SMS",
    group: "Status",
    width: 110,
    render: (c) =>
      c.smsConsent ? (
        <Text className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
          Opted In
        </Text>
      ) : (
        <Text className="text-sm text-gray-500 dark:text-gray-400">No</Text>
      ),
  },
  {
    key: "address",
    label: "Address",
    group: "Address",
    width: 200,
    defaultHidden: true,
    render: (c) => <IconValue icon="map-pin" value={c.address} lines={2} />,
  },
  {
    key: "city",
    label: "City",
    group: "Address",
    width: 140,
    defaultHidden: true,
    render: (c) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {c.city || "—"}
      </Text>
    ),
  },
  {
    key: "state",
    label: "State",
    group: "Address",
    width: 110,
    defaultHidden: true,
    render: (c) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {c.state || "—"}
      </Text>
    ),
  },
  {
    key: "zip",
    label: "ZIP",
    group: "Address",
    width: 110,
    defaultHidden: true,
    render: (c) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {c.zip || "—"}
      </Text>
    ),
  },
  {
    key: "country",
    label: "Country",
    group: "Address",
    width: 130,
    defaultHidden: true,
    render: (c) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {c.country || "—"}
      </Text>
    ),
  },
  {
    key: "created",
    label: "Created",
    group: "Dates",
    width: 170,
    defaultHidden: true,
    render: (c) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {fmtStamp(c.createdAt)}
      </Text>
    ),
  },
  {
    key: "updated",
    label: "Updated",
    group: "Dates",
    width: 170,
    defaultHidden: true,
    render: (c) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {fmtStamp(c.updatedAt)}
      </Text>
    ),
  },
  {
    key: "actions",
    label: "Actions",
    group: "Actions",
    width: 150,
    render: (_c, ctx) => {
      if (ctx.busy) return <ActivityIndicator size="small" color="#0644C7" />;
      // Rows are inert, so viewing and editing both start here.
      return (
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={ctx.onView}
            className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-neutral-800 items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="View customer"
          >
            <Feather name="eye" size={15} color="#0644C7" />
          </Pressable>
          <Pressable
            onPress={ctx.onEdit}
            className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-neutral-800 items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Edit customer"
          >
            <Feather name="edit-2" size={15} color="#6B7280" />
          </Pressable>
          <Pressable
            onPress={ctx.onDelete}
            className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-900/30 items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Delete customer"
          >
            <Feather name="trash-2" size={15} color="#EF4444" />
          </Pressable>
        </View>
      );
    },
  },
];

/** Column metadata for the "Toggle Columns" sheet (no render functions). */
export const CUSTOMER_COLUMNS = COLUMNS.filter((c) => c.key !== "actions").map(
  (c) => ({
    key: c.key,
    label: c.label,
    group: c.group,
    lockVisible: false,
  }),
);

/** The set of column keys shown before the user changes anything. */
export const defaultCustomerColumnKeys = (): Set<string> =>
  new Set(COLUMNS.filter((c) => !c.defaultHidden).map((c) => c.key));

/** Every column key, for the sheet's "Show All". */
export const allCustomerColumnKeys = (): Set<string> =>
  new Set(COLUMNS.map((c) => c.key));

/**
 * Table layout for the Customers list, mirroring the web admin's contacts
 * table: Name, Email, Phone, Company, Job Title, Location, Tags, Status, SMS by
 * default, with ID / Source / Notes / the address fields / Created / Updated
 * available from the "Columns" sheet. Horizontally scrollable with fixed column
 * widths. Rows are inert — viewing and editing run off the Actions cell — so a
 * stray tap while scrolling the grid sideways never opens a customer.
 */
export const CustomersTable = memo(function CustomersTable({
  contacts,
  busyId,
  selectedIds,
  onToggleRow,
  onToggleAll,
  onView,
  onEdit,
  onDelete,
  onAddTag,
  onToggleStatus,
  visibleColumns,
}: {
  contacts: ContactRow[];
  busyId: number | null;
  /** Selected contact ids (single source of truth lives in the parent). */
  selectedIds: Set<number>;
  onToggleRow: (id: number) => void;
  /** Select / deselect every row on the current page. */
  onToggleAll: () => void;
  onView: (c: ContactRow) => void;
  onEdit: (c: ContactRow) => void;
  onDelete: (c: ContactRow) => void;
  onAddTag: (c: ContactRow) => void;
  /** Flip active ⇄ inactive from the status pill, like the web cell. */
  onToggleStatus: (c: ContactRow) => void;
  /** Column keys to render, from the "Columns" sheet. Omit for the defaults. */
  visibleColumns?: Set<string>;
}) {
  const columns = COLUMNS.filter(
    (c) => c.key === "actions" || !visibleColumns || visibleColumns.has(c.key),
  );
  const tableWidth =
    CHECKBOX_WIDTH + columns.reduce((sum, c) => sum + c.width, 0);

  const selectedOnPage = contacts.reduce(
    (n, c) => (selectedIds.has(c.id) ? n + 1 : n),
    0,
  );
  const headerState: "off" | "on" | "some" =
    contacts.length > 0 && selectedOnPage === contacts.length
      ? "on"
      : selectedOnPage > 0
        ? "some"
        : "off";

  return (
    <View
      className="rounded-2xl bg-white dark:bg-neutral-900 overflow-hidden border border-gray-100 dark:border-neutral-800"
      style={CARD_SHADOW}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled>
        <View style={{ width: tableWidth }}>
          {/* Header */}
          <View
            className="flex-row items-center bg-gray-50 dark:bg-neutral-800/60 border-b border-gray-100 dark:border-neutral-800"
            style={{ minHeight: HEADER_MIN_HEIGHT }}
          >
            <CheckboxCell
              state={headerState}
              onPress={onToggleAll}
              label={
                headerState === "on"
                  ? "Deselect all rows on this page"
                  : "Select all rows on this page"
              }
            />
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

          {/* Rows */}
          {contacts.map((c, i) => {
            const selected = selectedIds.has(c.id);
            const ctx: RowContext = {
              busy: busyId === c.id,
              onView: () => onView(c),
              onEdit: () => onEdit(c),
              onDelete: () => onDelete(c),
              onAddTag: () => onAddTag(c),
              onToggleStatus: () => onToggleStatus(c),
            };
            return (
              // Inert row — the cells (checkbox, tags, status pill, actions)
              // own every touch; nothing opens from the row background.
              <View
                key={c.id}
                className={`flex-row items-center ${
                  selected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                } ${
                  i < contacts.length - 1
                    ? "border-b border-gray-100 dark:border-neutral-800"
                    : ""
                }`}
                style={{ minHeight: ROW_MIN_HEIGHT }}
              >
                <CheckboxCell
                  state={selected ? "on" : "off"}
                  onPress={() => onToggleRow(c.id)}
                  label={`${selected ? "Deselect" : "Select"} ${c.name}`}
                />
                {columns.map((col) => (
                  <View
                    key={col.key}
                    className="justify-center px-4 py-3"
                    style={{ width: col.width }}
                  >
                    {col.render(c, ctx)}
                  </View>
                ))}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
});
