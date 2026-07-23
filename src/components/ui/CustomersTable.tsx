import { Feather } from "@expo/vector-icons";
import { memo, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

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

type RowContext = {
  busy: boolean;
  onView: () => void;
  onDelete: () => void;
  onAddTag: () => void;
};

type Column = {
  key: string;
  label: string;
  width: number;
  render: (c: ContactRow, ctx: RowContext) => ReactNode;
};

const COLUMNS: Column[] = [
  {
    key: "name",
    label: "Name",
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
    width: 230,
    render: (c) => <IconValue icon="mail" value={c.email} />,
  },
  {
    key: "phone",
    label: "Phone",
    width: 150,
    render: (c) => <IconValue icon="phone" value={c.phone} />,
  },
  {
    key: "company",
    label: "Company",
    width: 150,
    render: (c) => <IconValue icon="home" value={c.companyName} />,
  },
  {
    key: "jobTitle",
    label: "Job Title",
    width: 140,
    render: (c) => <IconValue icon="briefcase" value={c.jobTitle} />,
  },
  {
    key: "location",
    label: "Location",
    width: 200,
    render: (c) => <IconValue icon="map-pin" value={c.locationName} lines={2} />,
  },
  {
    key: "tags",
    label: "Tags",
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
    key: "status",
    label: "Status",
    width: 110,
    render: (c) => (
      <View className="flex-row">
        <StatusBadge status={c.status} />
      </View>
    ),
  },
  {
    key: "sms",
    label: "SMS",
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
    key: "actions",
    label: "Actions",
    width: 110,
    render: (_c, ctx) => {
      if (ctx.busy) return <ActivityIndicator size="small" color="#0644C7" />;
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

const TABLE_WIDTH = COLUMNS.reduce((sum, c) => sum + c.width, 0);

/**
 * Table layout for the Customers list, mirroring the web admin's contacts
 * table: Name (first / last), Email, Phone, Company, Job Title, Location, Tags,
 * Status, SMS, and a trailing Actions cell (View / Delete). Horizontally
 * scrollable with fixed column widths. Tapping a row opens the contact actions
 * sheet — the Actions cell handles its own presses so they don't double-open.
 */
export const CustomersTable = memo(function CustomersTable({
  contacts,
  busyId,
  selectedIds,
  onToggleRow,
  onToggleAll,
  onRowPress,
  onView,
  onDelete,
  onAddTag,
}: {
  contacts: ContactRow[];
  busyId: number | null;
  /** Selected contact ids (single source of truth lives in the parent). */
  selectedIds: Set<number>;
  onToggleRow: (id: number) => void;
  /** Select / deselect every row on the current page. */
  onToggleAll: () => void;
  onRowPress: (c: ContactRow) => void;
  onView: (c: ContactRow) => void;
  onDelete: (c: ContactRow) => void;
  onAddTag: (c: ContactRow) => void;
}) {
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
        <View style={{ width: CHECKBOX_WIDTH + TABLE_WIDTH }}>
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
            {COLUMNS.map((col) => (
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
              onDelete: () => onDelete(c),
              onAddTag: () => onAddTag(c),
            };
            return (
              <Pressable
                key={c.id}
                onPress={() => onRowPress(c)}
                accessibilityRole="button"
                accessibilityLabel={`View ${c.name}`}
                className={`flex-row items-center ${
                  selected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                } ${
                  i < contacts.length - 1
                    ? "border-b border-gray-100 dark:border-neutral-800"
                    : ""
                }`}
                style={({ pressed }) => ({
                  minHeight: ROW_MIN_HEIGHT,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <CheckboxCell
                  state={selected ? "on" : "off"}
                  onPress={() => onToggleRow(c.id)}
                  label={`${selected ? "Deselect" : "Select"} ${c.name}`}
                />
                {COLUMNS.map((col) => (
                  <View
                    key={col.key}
                    className="justify-center px-4 py-3"
                    style={{ width: col.width }}
                  >
                    {col.render(c, ctx)}
                  </View>
                ))}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
});
