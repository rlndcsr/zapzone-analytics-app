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
import { Pressable, ScrollView, Text, View } from "react-native";

import {
  AttractionStatusBadge,
  CARD_SHADOW,
  PRICING_SUFFIX,
  durationLabel,
  formatCreatedAt,
  formatMoney,
} from "../../lib/attractions/attractionDisplay";
import { buildPurchaseLink } from "../../lib/attractions/purchaseLink";
import type { AttractionRow } from "../../services/attractionsService";

// Comfortable, SaaS-style row rhythm. These are floors (minHeight) — real
// cell padding (py-*) does the breathing, so rows stay vertically centered and
// never feel clamped.
const HEADER_MIN_HEIGHT = 48;
const ROW_MIN_HEIGHT = 68;

/** Leading selection-checkbox column width. */
const CHECKBOX_WIDTH = 48;

/** Shared secondary-cell text style so every column reads consistently. */
const CELL_TEXT = "text-sm text-gray-600 dark:text-gray-300";

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
      className="flex-row items-center gap-1.5 self-start px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 active:opacity-70"
    >
      <Feather
        name={copied ? "check" : "link"}
        size={12}
        color={copied ? "#16A34A" : "#6B7280"}
      />
      <Text
        className={`text-xs font-medium ${
          copied
            ? "text-green-600 dark:text-green-400"
            : "text-gray-600 dark:text-gray-300"
        }`}
      >
        {copied ? "Copied!" : "Copy Link"}
      </Text>
    </Pressable>
  );
};

type Column = {
  key: string;
  label: string;
  width: number;
  render: (attraction: AttractionRow) => ReactNode;
};

/**
 * Columns mirror the web `/attractions` admin table's default-visible set, in
 * the same order and with the same labels: Order, Attraction, Category, Price,
 * Capacity, Duration, Status, Purchase Link. The Attraction cell is the same
 * rich, multi-line cell as the web (name + Copy badge, location, description,
 * created date), so the location / description / created data the web folds in
 * there is preserved without separate columns. Pricing type is surfaced through
 * the Price suffix exactly as the web default view does.
 *
 * Web-only affordances are intentionally excluded (see the deliverables): the
 * selection checkbox (no mobile bulk-select), the row Actions menu (mobile taps
 * the row to open the Details sheet instead), and the Order column's
 * drag-to-reorder chevrons (no reorder on mobile — the number is shown
 * read-only). Columns hidden by default on the web (ID, Updated, and the
 * stand-alone Pricing Type / Location / Description / Created toggles) are not
 * surfaced, matching what a web user actually sees.
 */
const COLUMNS: Column[] = [
  {
    key: "order",
    label: "Order",
    width: 80,
    render: (a) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {a.displayOrder + 1}
      </Text>
    ),
  },
  {
    key: "attraction",
    label: "Attraction",
    width: 240,
    render: (a) => {
      const created = formatCreatedAt(a.createdAt);
      return (
        <View>
          <View className="flex-row items-center gap-1.5">
            <Text
              numberOfLines={1}
              className="flex-1 text-sm font-semibold text-gray-900 dark:text-white"
            >
              {a.name}
            </Text>
            {a.name.includes("(Copy)") && (
              <View className="flex-row items-center gap-0.5 px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40">
                <Feather name="copy" size={8} color="#B45309" />
                <Text className="text-[9px] font-semibold text-amber-700 dark:text-amber-400">
                  Copy
                </Text>
              </View>
            )}
          </View>
          {!!a.locationName && (
            <View className="flex-row items-center gap-1 mt-0.5">
              <Feather name="map-pin" size={11} color="#9CA3AF" />
              <Text
                numberOfLines={1}
                className="flex-1 text-xs text-gray-500 dark:text-gray-400"
              >
                {a.locationName}
              </Text>
            </View>
          )}
          {!!a.description && (
            <Text
              numberOfLines={2}
              className="text-xs text-gray-500 dark:text-gray-400 leading-4 mt-1"
            >
              {a.description}
            </Text>
          )}
          {!!created && (
            <View className="flex-row items-center gap-1 mt-1">
              <Feather name="calendar" size={11} color="#9CA3AF" />
              <Text className="text-xs text-gray-400 dark:text-gray-500">
                {created}
              </Text>
            </View>
          )}
        </View>
      );
    },
  },
  {
    key: "category",
    label: "Category",
    width: 130,
    render: (a) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {a.category}
      </Text>
    ),
  },
  {
    key: "price",
    label: "Price",
    width: 130,
    render: (a) => {
      const suffix = PRICING_SUFFIX[a.pricingType] ?? "";
      return (
        <Text
          numberOfLines={1}
          className="text-sm font-semibold text-gray-900 dark:text-white"
        >
          {formatMoney(a.price)}
          {!!suffix && (
            <Text className="text-xs font-normal text-gray-400"> {suffix}</Text>
          )}
        </Text>
      );
    },
  },
  {
    key: "capacity",
    label: "Capacity",
    width: 140,
    render: (a) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {a.maxCapacity} people
        {!a.displayCapacityToCustomers && (
          <Text className="text-gray-400 dark:text-gray-500"> (hidden)</Text>
        )}
      </Text>
    ),
  },
  {
    key: "duration",
    label: "Duration",
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
    width: 110,
    render: (a) => (
      <View className="flex-row">
        <AttractionStatusBadge status={a.status} />
      </View>
    ),
  },
  {
    key: "purchaseLink",
    label: "Purchase Link",
    width: 140,
    render: (a) => <PurchaseLinkCell attraction={a} />,
  },
];

const TABLE_WIDTH =
  CHECKBOX_WIDTH + COLUMNS.reduce((sum, c) => sum + c.width, 0);

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

/**
 * Table layout for the attractions list. The whole grid is horizontally
 * scrollable (fixed per-column widths keep header + rows aligned); each row is
 * a single Pressable that opens the Attraction Details sheet, matching the card
 * view's tap behaviour exactly. Renders from the same `AttractionRow[]` as the
 * card view — no separate data source, no refetch on layout switch.
 */
export const AttractionsTable = memo(function AttractionsTable({
  attractions,
  onRowPress,
  selectedIds,
  onToggleRow,
  onToggleAll,
}: {
  attractions: AttractionRow[];
  onRowPress: (attraction: AttractionRow) => void;
  /** Selected attraction ids (single source of truth lives in the parent). */
  selectedIds: Set<number>;
  onToggleRow: (id: number) => void;
  /** Select / deselect every row on the current page. */
  onToggleAll: () => void;
}) {
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
    <View
      className="rounded-2xl bg-white dark:bg-neutral-900 overflow-hidden border border-gray-100 dark:border-neutral-800 mb-3"
      style={CARD_SHADOW}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
      >
        <View style={{ width: TABLE_WIDTH }}>
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
          {attractions.map((attraction, i) => {
            const selected = selectedIds.has(attraction.id);
            return (
              <Pressable
                key={attraction.id}
                onPress={() => onRowPress(attraction)}
                accessibilityRole="button"
                accessibilityLabel={`View details for ${attraction.name}`}
                className={`flex-row items-center ${
                  selected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                } ${
                  i < attractions.length - 1
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
                  onPress={() => onToggleRow(attraction.id)}
                  label={`${selected ? "Deselect" : "Select"} ${attraction.name}`}
                />
                {COLUMNS.map((col) => (
                  <View
                    key={col.key}
                    className="justify-center px-4 py-4"
                    style={{ width: col.width }}
                  >
                    {col.render(attraction)}
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
