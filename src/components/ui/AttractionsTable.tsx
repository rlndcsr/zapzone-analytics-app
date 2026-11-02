import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import {
  PRICING_SUFFIX,
  durationLabel,
  formatCreatedAt,
  formatMoney,
  type FeatherIconName,
} from "../../lib/attractions/attractionDisplay";
import { buildPurchaseLink } from "../../lib/attractions/purchaseLink";
import { normalizeCategory } from "../../lib/venueCategories";
import type { AttractionRow } from "../../services/attractionsService";

// Comfortable, SaaS-style row rhythm. These are floors (minHeight) — real
// cell padding (py-*) does the breathing, so rows stay vertically centered and
// never feel clamped.
const HEADER_MIN_HEIGHT = 44;
const ROW_MIN_HEIGHT = 64;

/** Leading selection-checkbox column width. */
const CHECKBOX_WIDTH = 48;

const PRIMARY = "#0644C7";

/** Shared secondary-cell text style so every column reads consistently. */
const CELL_TEXT = "text-sm text-gray-700 dark:text-gray-300";

/** Muted second line under a cell's main value (units, hints). */
const CELL_HINT = "text-xs text-gray-400 dark:text-gray-500 mt-0.5";

/**
 * Purchase Link cell — mirrors the web admin's "Copy Link" button. Copies the
 * public purchase URL to the clipboard and flips to "Copied!" for 2s. Kept as
 * its own component so each cell owns its copied state; as a nested Pressable
 * it handles the touch itself, so tapping it copies without opening the row's
 * Attraction Details sheet (matching the web cell's stopPropagation).
 */
const PurchaseLinkCell = ({ attraction }: { attraction: AttractionRow }) => {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onCopy = useCallback(async () => {
    await Clipboard.setStringAsync(buildPurchaseLink(attraction));
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }, [attraction]);

  return (
    <Pressable
      onPress={onCopy}
      accessibilityRole="button"
      accessibilityLabel={`Copy purchase link for ${attraction.name}`}
      className={`flex-row items-center gap-1.5 self-start px-2.5 py-1.5 rounded-lg active:opacity-70 ${
        copied
          ? "bg-green-50 dark:bg-green-900/30"
          : "bg-gray-100 dark:bg-neutral-800"
      }`}
    >
      <Feather
        name={copied ? "check" : "link-2"}
        size={13}
        color={copied ? "#16A34A" : "#4B5563"}
      />
      <Text
        className={`text-xs font-medium ${
          copied
            ? "text-green-700 dark:text-green-400"
            : "text-gray-700 dark:text-gray-300"
        }`}
      >
        {copied ? "Copied!" : "Copy Link"}
      </Text>
    </Pressable>
  );
};

/**
 * Per-row action handlers, supplied by the parent screen and threaded through
 * each cell's `render`. The status-select and actions cells are the only cells
 * that need them; every other column ignores the second argument. Keeping the
 * handlers in context (rather than closing over them in the module-level
 * COLUMNS array) lets COLUMNS stay a static, shared definition.
 */
type RowContext = {
  /** Cart icon — open the in-app purchase page (web "View Purchase Page"). */
  onViewPurchase: (attraction: AttractionRow) => void;
  /** Eye icon — open the Attraction Details sheet (same as a row tap). */
  onView: (attraction: AttractionRow) => void;
  onEdit: (attraction: AttractionRow) => void;
  /** Resolves once the duplicate round-trip finishes (drives the busy spinner). */
  onDuplicate: (attraction: AttractionRow) => Promise<void> | void;
  onDelete: (attraction: AttractionRow) => void;
  /** Open the "Set Status" picker sheet for this row (parent-hosted). */
  onStatusPress: (attraction: AttractionRow) => void;
};

type Column = {
  key: string;
  label: string;
  width: number;
  /** Heading in the "Toggle Columns" sheet (mirrors the web's column groups). */
  group: string;
  /** Always visible — can't be switched off (the web's `lockVisible`). */
  lockVisible?: boolean;
  /** Off until the user turns it on, matching the web's default view. */
  defaultHidden?: boolean;
  render: (attraction: AttractionRow, ctx: RowContext) => ReactNode;
};

/**
 * Status cell as a tap-to-change pill — mirrors the Manage Accounts table. The
 * pill shows the current status with a caret; tapping it defers to the parent's
 * "Set Status" BottomSheet (via `onStatusPress`) rather than opening its own
 * menu, so the picker style stays consistent across the app. As a nested
 * Pressable it swallows its own touch, so the row's open-details press never
 * fires (same mechanism as PurchaseLinkCell).
 */
const StatusPill = ({
  attraction,
  onPress,
}: {
  attraction: AttractionRow;
  onPress: () => void;
}) => {
  const active = attraction.status === "active";
  return (
    <View className="flex-row">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Change status for ${attraction.name}, currently ${attraction.status}`}
        className={`flex-row items-center gap-1.5 pl-2 pr-1.5 py-1 rounded-full ${
          active
            ? "bg-green-50 dark:bg-green-900/30"
            : "bg-gray-100 dark:bg-neutral-800"
        } active:opacity-70`}
      >
        <View
          className={`w-1.5 h-1.5 rounded-full ${
            active ? "bg-green-500" : "bg-gray-400"
          }`}
        />
        <Text
          className={`text-xs font-medium capitalize ${
            active
              ? "text-green-700 dark:text-green-400"
              : "text-gray-600 dark:text-gray-400"
          }`}
        >
          {attraction.status}
        </Text>
        <Feather
          name="chevron-down"
          size={12}
          color={active ? "#16A34A" : "#9CA3AF"}
        />
      </Pressable>
    </View>
  );
};

/** A single icon action button inside the Actions cell. Nested Pressable, so it
 *  handles its own touch and never triggers the row's open-details press. */
const ActionIconButton = ({
  icon,
  color,
  label,
  busy = false,
  divider = false,
  onPress,
}: {
  icon: FeatherIconName;
  color: string;
  label: string;
  busy?: boolean;
  /** Hairline on the leading edge — separates buttons inside the group. */
  divider?: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    disabled={busy}
    accessibilityRole="button"
    accessibilityLabel={label}
    className={`w-8 h-8 items-center justify-center active:bg-gray-100 dark:active:bg-neutral-800 ${
      divider ? "border-l border-gray-200 dark:border-neutral-700" : ""
    }`}
  >
    {busy ? (
      <ActivityIndicator size="small" color={color} />
    ) : (
      <Feather name={icon} size={16} color={color} />
    )}
  </Pressable>
);

/**
 * Row Actions cell — View Purchase Page, View (eye → Details sheet), Edit,
 * Duplicate, Delete, in the same order as the web admin's per-row action
 * buttons. Duplicate owns a local busy spinner because its handler awaits the
 * create round-trip; Delete defers to the parent's confirm dialog, so it needs
 * no local busy state.
 */
const ActionsCell = ({
  attraction,
  ctx,
}: {
  attraction: AttractionRow;
  ctx: RowContext;
}) => {
  const [duplicating, setDuplicating] = useState(false);

  const onDuplicate = useCallback(async () => {
    setDuplicating(true);
    try {
      await ctx.onDuplicate(attraction);
    } finally {
      setDuplicating(false);
    }
  }, [attraction, ctx]);

  return (
    // One bordered segmented group: neutral icons, with only the destructive
    // action tinted, so the column reads as a single quiet control.
    <View className="flex-row items-center self-start rounded-lg border border-gray-200 dark:border-neutral-700 overflow-hidden">
      <ActionIconButton
        icon="shopping-cart"
        color="#6B7280"
        label={`View purchase page for ${attraction.name}`}
        onPress={() => ctx.onViewPurchase(attraction)}
      />
      <ActionIconButton
        divider
        icon="eye"
        color="#6B7280"
        label={`View details for ${attraction.name}`}
        onPress={() => ctx.onView(attraction)}
      />
      <ActionIconButton
        divider
        icon="edit-2"
        color={PRIMARY}
        label={`Edit ${attraction.name}`}
        onPress={() => ctx.onEdit(attraction)}
      />
      <ActionIconButton
        divider
        icon="copy"
        color="#6B7280"
        label={`Duplicate ${attraction.name}`}
        busy={duplicating}
        onPress={onDuplicate}
      />
      <ActionIconButton
        divider
        icon="trash-2"
        color="#DC2626"
        label={`Delete ${attraction.name}`}
        onPress={() => ctx.onDelete(attraction)}
      />
    </View>
  );
};

/**
 * Every column the web `/attractions` admin table offers, in the same order,
 * with the same labels, groups, and default visibility — so the "Columns" sheet
 * shows exactly what a web user sees. Order / Attraction / Category / Price /
 * Capacity / Duration / Status / Purchase Link start visible; ID, Description,
 * Location, Pricing Type, Capacity Visibility, Created and Updated start hidden.
 *
 * The Attraction cell is the same rich, multi-line cell as the web (name + Copy
 * badge, location, description, created date), so that context is present even
 * with the stand-alone columns switched off.
 *
 * The trailing Actions column mirrors the web admin's per-row buttons — View
 * Purchase Page, View (eye → Details sheet), Edit, Duplicate, Delete — and the
 * Status column is an inline select for flipping active/inactive, both wired
 * through {@link RowContext}. The Order column's drag-to-reorder chevrons are
 * still omitted (no reorder on mobile — the number is shown read-only).
 */
const COLUMNS: Column[] = [
  {
    key: "order",
    label: "Order",
    group: "Ordering",
    width: 72,
    render: (a) => (
      <View className="self-start min-w-[28px] h-7 px-1.5 rounded-md bg-gray-100 dark:bg-neutral-800 items-center justify-center">
        <Text
          numberOfLines={1}
          className="text-xs font-semibold text-gray-600 dark:text-gray-300"
        >
          {a.displayOrder + 1}
        </Text>
      </View>
    ),
  },
  {
    key: "id",
    label: "ID",
    group: "Identifiers",
    width: 80,
    defaultHidden: true,
    render: (a) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        #{a.id}
      </Text>
    ),
  },
  {
    key: "attraction",
    label: "Attraction",
    group: "Attraction",
    lockVisible: true,
    width: 240,
    render: (a) => {
      const created = formatCreatedAt(a.createdAt);
      return (
        <View>
          <View className="flex-row items-center gap-1.5">
            <Text
              numberOfLines={1}
              className="shrink text-sm font-semibold text-gray-900 dark:text-white"
            >
              {a.name}
            </Text>
            {a.name.includes("(Copy)") && (
              <View className="px-1 py-0.5 rounded bg-amber-50 dark:bg-amber-900/30">
                <Text className="text-[9px] font-semibold text-amber-700 dark:text-amber-400">
                  Copy
                </Text>
              </View>
            )}
          </View>
          {!!a.description && (
            <Text
              numberOfLines={1}
              className="text-xs text-gray-500 dark:text-gray-400 mt-0.5"
            >
              {a.description}
            </Text>
          )}
          {/* Location and created date share one quiet meta line. */}
          {(!!a.locationName || !!created) && (
            <Text
              numberOfLines={1}
              className="text-[11px] text-gray-400 dark:text-gray-500 mt-1"
            >
              {[a.locationName, created].filter(Boolean).join("  ·  ")}
            </Text>
          )}
        </View>
      );
    },
  },
  {
    key: "category",
    label: "Category",
    group: "Attraction",
    width: 130,
    // Grouped under one name, matching the chips above the table: the web
    // normalises this in its row mapper, which mobile cannot do because the
    // same mapper feeds the edit and duplicate forms.
    render: (a) => (
      <View className="self-start max-w-full px-2 py-1 rounded-md bg-gray-100 dark:bg-neutral-800">
        <Text
          numberOfLines={1}
          className="text-xs font-medium text-gray-700 dark:text-gray-300"
        >
          {normalizeCategory(a.category)}
        </Text>
      </View>
    ),
  },
  {
    key: "description",
    label: "Description",
    group: "Attraction",
    width: 240,
    defaultHidden: true,
    render: (a) => (
      <Text numberOfLines={3} className={`${CELL_TEXT} leading-4`}>
        {a.description || "—"}
      </Text>
    ),
  },
  {
    key: "location",
    label: "Location",
    group: "Location",
    width: 160,
    defaultHidden: true,
    render: (a) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {a.locationName || "—"}
      </Text>
    ),
  },
  {
    key: "price",
    label: "Price",
    group: "Pricing",
    width: 130,
    render: (a) => {
      const suffix = PRICING_SUFFIX[a.pricingType] ?? "";
      return (
        <View>
          <Text
            numberOfLines={1}
            className="text-sm font-semibold text-gray-900 dark:text-white"
          >
            {formatMoney(a.price)}
          </Text>
          {!!suffix && (
            <Text numberOfLines={1} className={CELL_HINT}>
              per {suffix.slice(1)}
            </Text>
          )}
        </View>
      );
    },
  },
  {
    key: "pricingType",
    label: "Pricing Type",
    group: "Pricing",
    width: 140,
    defaultHidden: true,
    render: (a) => (
      <Text numberOfLines={1} className={`${CELL_TEXT} capitalize`}>
        {a.pricingType.replace(/_/g, " ")}
      </Text>
    ),
  },
  {
    key: "capacity",
    label: "Capacity",
    group: "Capacity",
    width: 140,
    render: (a) => (
      <View>
        <Text numberOfLines={1} className={CELL_TEXT}>
          {a.maxCapacity} people
        </Text>
        {!a.displayCapacityToCustomers && (
          <View className="flex-row items-center gap-1 mt-0.5">
            <Feather name="eye-off" size={11} color="#9CA3AF" />
            <Text className="text-xs text-gray-400 dark:text-gray-500">
              Hidden
            </Text>
          </View>
        )}
      </View>
    ),
  },
  {
    key: "capacityVisibility",
    label: "Capacity Visibility",
    group: "Capacity",
    width: 160,
    defaultHidden: true,
    render: (a) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {a.displayCapacityToCustomers ? "Shown to customers" : "Hidden"}
      </Text>
    ),
  },
  {
    key: "duration",
    label: "Duration",
    group: "Details",
    width: 110,
    render: (a) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {durationLabel(a)}
      </Text>
    ),
  },
  {
    key: "status",
    label: "Status",
    group: "Status",
    width: 130,
    render: (a, ctx) => (
      <StatusPill attraction={a} onPress={() => ctx.onStatusPress(a)} />
    ),
  },
  {
    key: "purchaseLink",
    label: "Purchase Link",
    group: "Links",
    width: 140,
    render: (a) => <PurchaseLinkCell attraction={a} />,
  },
  {
    key: "createdAt",
    label: "Created",
    group: "Dates",
    width: 140,
    defaultHidden: true,
    render: (a) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {formatCreatedAt(a.createdAt) || "—"}
      </Text>
    ),
  },
  {
    key: "updatedAt",
    label: "Updated",
    group: "Dates",
    width: 140,
    defaultHidden: true,
    render: (a) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {formatCreatedAt(a.updatedAt) || "—"}
      </Text>
    ),
  },
  {
    key: "actions",
    label: "Actions",
    group: "Actions",
    lockVisible: true,
    width: 200,
    render: (a, ctx) => <ActionsCell attraction={a} ctx={ctx} />,
  },
];

/** Column metadata for the "Toggle Columns" sheet (no render functions). */
export type AttractionColumnMeta = {
  key: string;
  label: string;
  group: string;
  lockVisible: boolean;
};

/**
 * The toggleable columns, in table order. `actions` is excluded — it is the
 * row's control cluster, not data, and the web has no switch for it.
 */
export const ATTRACTION_COLUMNS: AttractionColumnMeta[] = COLUMNS.filter(
  (c) => c.key !== "actions",
).map((c) => ({
  key: c.key,
  label: c.label,
  group: c.group,
  lockVisible: !!c.lockVisible,
}));

/** The set of column keys shown before the user changes anything. */
export const defaultAttractionColumnKeys = (): Set<string> =>
  new Set(COLUMNS.filter((c) => !c.defaultHidden).map((c) => c.key));

/** Every column key, for the sheet's "Show All". */
export const allAttractionColumnKeys = (): Set<string> =>
  new Set(COLUMNS.map((c) => c.key));

/**
 * Selection checkbox cell. A nested Pressable, so it handles the touch itself —
 * toggling selection without triggering the row's open-details press (the same
 * mechanism the Purchase Link cell uses). `state` drives the icon: an
 * unchecked box, a checked box, or the header's indeterminate dash.
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
  <View
    className="items-center justify-center"
    style={{ width: CHECKBOX_WIDTH }}
  >
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: state === "on" }}
      accessibilityLabel={label}
      className={`w-[18px] h-[18px] rounded-[5px] items-center justify-center border active:opacity-60 ${
        state === "off"
          ? "border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-900"
          : "border-[#0644C7] bg-[#0644C7]"
      }`}
    >
      {state !== "off" && (
        <Feather
          name={state === "on" ? "check" : "minus"}
          size={12}
          color="#FFFFFF"
        />
      )}
    </Pressable>
  </View>
);

/**
 * Table layout for the attractions list. The whole grid is horizontally
 * scrollable (fixed per-column widths keep header + rows aligned); each row is
 * a single Pressable that opens the Attraction Details sheet, matching the card
 * view's tap behaviour exactly. Renders from the same `AttractionRow[]` as the
 * card view — no separate data source, no refetch on layout switch.
 */
export const AttractionsTable = memo(function AttractionsTable({
  attractions,
  onView,
  onViewPurchase,
  onEdit,
  onDuplicate,
  onDelete,
  onStatusPress,
  selectedIds,
  onToggleRow,
  onToggleAll,
  visibleColumns,
}: {
  attractions: AttractionRow[];
  /**
   * Open the Attraction Details sheet. Fired by a tap anywhere on the row that
   * an interactive cell does not claim, and by the row's eye action.
   */
  onView: (attraction: AttractionRow) => void;
  /** Row Actions — View Purchase Page, Edit, Duplicate, Delete, and the per-row
   *  status pill. */
  onViewPurchase: (attraction: AttractionRow) => void;
  onEdit: (attraction: AttractionRow) => void;
  onDuplicate: (attraction: AttractionRow) => Promise<void> | void;
  onDelete: (attraction: AttractionRow) => void;
  /** Open the parent-hosted "Set Status" picker for this row. */
  onStatusPress: (attraction: AttractionRow) => void;
  /** Selected attraction ids (single source of truth lives in the parent). */
  selectedIds: Set<number>;
  onToggleRow: (id: number) => void;
  /** Select / deselect every row on the current page. */
  onToggleAll: () => void;
  /**
   * Column keys to render, from the "Columns" sheet. Omit to show the default
   * set. Locked columns are always drawn regardless of what's in the set.
   */
  visibleColumns?: Set<string>;
}) {
  const columns = COLUMNS.filter(
    (c) => c.lockVisible || !visibleColumns || visibleColumns.has(c.key),
  );
  const tableWidth =
    CHECKBOX_WIDTH + columns.reduce((sum, c) => sum + c.width, 0);

  const rowContext: RowContext = {
    onViewPurchase,
    onView,
    onEdit,
    onDuplicate,
    onDelete,
    onStatusPress,
  };
  const selectedOnPage = attractions.reduce(
    (n, a) => (selectedIds.has(a.id) ? n + 1 : n),
    0,
  );
  const headerState: "off" | "on" | "some" =
    attractions.length > 0 && selectedOnPage === attractions.length
      ? "on"
      : selectedOnPage > 0
        ? "some"
        : "off";

  return (
    <View className="rounded-2xl bg-white dark:bg-neutral-900 overflow-hidden border border-gray-200 dark:border-neutral-800 mb-3">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
      >
        <View style={{ width: tableWidth }}>
          {/* Header */}
          <View
            className="flex-row items-center bg-gray-50 dark:bg-neutral-800/50 border-b border-gray-200 dark:border-neutral-800"
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
                  className="text-xs font-medium text-gray-500 dark:text-gray-400"
                >
                  {col.label}
                </Text>
              </View>
            ))}
          </View>

          {/* Rows */}
          {attractions.map((attraction, i) => {
            const selected = selectedIds.has(attraction.id);
            return (
              // Tapping the row opens the Attraction Details sheet, matching a
              // card tap in the other layout. The interactive cells (checkbox,
              // status pill, copy link, action icons) are nested Pressables, so
              // they win the touch and never fall through to this handler.
              <Pressable
                key={attraction.id}
                onPress={() => onView(attraction)}
                accessibilityRole="button"
                accessibilityLabel={`View details for ${attraction.name}`}
                className={`flex-row items-center ${
                  selected
                    ? "bg-blue-50/70 dark:bg-blue-900/20"
                    : "active:bg-gray-50 dark:active:bg-neutral-800/60"
                } ${
                  i < attractions.length - 1
                    ? "border-b border-gray-100 dark:border-neutral-800"
                    : ""
                }`}
                style={{ minHeight: ROW_MIN_HEIGHT }}
              >
                <CheckboxCell
                  state={selected ? "on" : "off"}
                  onPress={() => onToggleRow(attraction.id)}
                  label={`${selected ? "Deselect" : "Select"} ${attraction.name}`}
                />
                {columns.map((col) => (
                  <View
                    key={col.key}
                    className="justify-center px-4 py-3"
                    style={{ width: col.width }}
                  >
                    {col.render(attraction, rowContext)}
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
