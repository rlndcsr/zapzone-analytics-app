import { Feather } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { formatDateET } from "../../lib/date/venueTime";
import { getCurrentUser, getToken } from "../../lib/session";
import { fetchAttractions } from "../../services/attractionsService";
import { fetchPackages } from "../../services/bookingsService";
import { fetchEvents } from "../../services/eventsService";
import {
  fetchFeeSupport,
  type FeeSupportDetail,
  type FeeSupportEntityType,
  type FeeSupportRow,
} from "../../services/feeSupportService";
import { fetchMembershipPlans } from "../../services/membershipPlansService";
import { BottomSheet } from "./BottomSheet";

const PRIMARY = "#0644C7";

type IconName = React.ComponentProps<typeof Feather>["name"];

const ENTITY_META: Record<
  FeeSupportEntityType,
  { icon: IconName; label: string; plural: string }
> = {
  package: { icon: "package", label: "Package", plural: "packages" },
  attraction: { icon: "zap", label: "Attraction", plural: "attractions" },
  event: { icon: "calendar", label: "Event", plural: "events" },
  membership: {
    icon: "credit-card",
    label: "Membership",
    plural: "membership plans",
  },
};

/** The web's wording for the two application modes. */
const APPLICATION_HINT: Record<FeeSupportRow["applicationType"], string> = {
  additive: "Added on top of the displayed price.",
  inclusive: "Already included in the displayed price.",
};

const money = (n: number) =>
  `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/** Section heading, matching the other detail sheets' in-sheet rhythm. */
const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <Text className="text-base font-bold text-gray-900 dark:text-white mt-6 mb-3">
    {children}
  </Text>
);

/** Half-width labelled fact with a tinted icon tile. */
const DetailTile = ({
  icon,
  label,
  value,
}: {
  icon: IconName;
  label: string;
  value: string;
}) => (
  <View className="w-1/2 flex-row items-start gap-2.5 mb-4 pr-2">
    <View className="w-8 h-8 rounded-lg bg-[#0644C7]/10 items-center justify-center">
      <Feather name={icon} size={15} color={PRIMARY} />
    </View>
    <View className="flex-1">
      <Text className="text-[11px] text-gray-500 dark:text-gray-400">
        {label}
      </Text>
      <Text className="text-[13px] font-medium text-gray-900 dark:text-white">
        {value}
      </Text>
    </View>
  </View>
);

const Chip = ({ icon, label }: { icon: IconName; label: string }) => (
  <View className="flex-row items-center gap-1 bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-lg">
    <Feather name={icon} size={11} color={PRIMARY} />
    <Text className="text-xs font-medium text-[#0644C7] dark:text-blue-300">
      {label}
    </Text>
  </View>
);

const StatusPill = ({ active }: { active: boolean }) => (
  <View
    className={`flex-row items-center gap-1 px-2.5 py-1 rounded-full ${
      active
        ? "bg-green-50 dark:bg-green-900/30"
        : "bg-gray-100 dark:bg-neutral-800"
    }`}
  >
    <Feather name="power" size={11} color={active ? "#16A34A" : "#9CA3AF"} />
    <Text
      className={`text-xs font-semibold ${
        active
          ? "text-green-600 dark:text-green-400"
          : "text-gray-500 dark:text-gray-400"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </Text>
  </View>
);

type Props = {
  visible: boolean;
  /** The tapped list row; its values render immediately, before the fetch lands. */
  row: FeeSupportRow | null;
  /** True while the parent is deleting this fee. */
  busy?: boolean;
  onClose: () => void;
  onEdit: (row: FeeSupportRow) => void;
  onDelete: (row: FeeSupportRow) => void;
};

/**
 * Per-fee detail sheet for Fee Supports — opened by tapping a table row. The
 * list row carries everything except which items the fee targets (the list
 * endpoint only reports a count), so GET /api/fee-supports/{id} supplies the
 * entity ids and the matching entity list resolves them to names. Both lookups
 * are best-effort: the sheet is complete without them, and falls back to the
 * row's count. Footer actions reuse the screen's Edit and Delete handlers.
 */
export function FeeSupportDetailSheet({
  visible,
  row,
  busy = false,
  onClose,
  onEdit,
  onDelete,
}: Props) {
  const [detail, setDetail] = useState<FeeSupportDetail | null>(null);
  const [entityNames, setEntityNames] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const reqRef = useRef(0);

  /**
   * Load the fee, then resolve its entity ids against the list for its type —
   * the same lookups the create/edit form uses (packages go through the slim
   * /api/mobile/packages endpoint).
   */
  const loadDetail = useCallback(
    async (id: number, entityType: FeeSupportEntityType, locId: number | null) => {
      const token = getToken();
      const user = getCurrentUser();
      if (!token) return;
      const rid = ++reqRef.current;
      setLoading(true);
      try {
        const d = await fetchFeeSupport(token, id);
        if (rid !== reqRef.current) return;
        setDetail(d);
        if (d.entityIds.length === 0) {
          setEntityNames([]);
          return;
        }
        const loc = locId ?? undefined;
        let list: { id: number; name: string }[] = [];
        if (entityType === "package") {
          list = await fetchPackages(token, loc);
        } else if (entityType === "attraction" && user) {
          list = await fetchAttractions({ token, userId: user.id, locationId: loc });
        } else if (entityType === "event" && user) {
          list = await fetchEvents({ token, userId: user.id, locationId: loc });
        } else if (entityType === "membership") {
          list = await fetchMembershipPlans({ token, locationId: loc });
        }
        if (rid !== reqRef.current) return;
        const byId = new Map(list.map((e) => [e.id, e.name]));
        setEntityNames(d.entityIds.map((eid) => byId.get(eid) ?? `#${eid}`));
      } catch {
        // Best-effort: the sheet still shows everything the row carries.
        if (rid === reqRef.current) setEntityNames(null);
      } finally {
        if (rid === reqRef.current) setLoading(false);
      }
    },
    [],
  );

  // Keyed on the fee id, so switching rows reloads but a list refetch doesn't.
  const rowId = row?.id;
  const rowEntityType = row?.entityType;
  const rowLocationId = row?.locationId ?? null;
  useEffect(() => {
    if (visible && rowId != null && rowEntityType) {
      setDetail(null);
      setEntityNames(null);
      loadDetail(rowId, rowEntityType, rowLocationId);
    }
  }, [visible, rowId, rowEntityType, rowLocationId, loadDetail]);

  if (!row) {
    return (
      <BottomSheet visible={visible} onClose={onClose} title="Fee details">
        <View className="px-5 py-10 items-center">
          <ActivityIndicator color={PRIMARY} />
        </View>
      </BottomSheet>
    );
  }

  const entity = ENTITY_META[row.entityType];
  const isPercent = row.calculationType === "percentage";
  const isAdditive = row.applicationType === "additive";

  // What the fee does to a $100 base price — the create form's preview line.
  const feeOn100 = isPercent ? 100 * (row.feeAmount / 100) : row.feeAmount;
  const totalOn100 = isAdditive ? 100 + feeOn100 : 100;

  // The detail payload is authoritative for the count; the row is the fallback.
  const entityCount = detail?.entityIds.length ?? row.entityCount;

  const location =
    row.locationName && row.companyName
      ? `${row.locationName} | ${row.companyName}`
      : row.locationName || row.companyName || "All Locations";

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Fee details"
      subtitle={`#${row.id}`}
    >
      <ScrollView
        className="px-5"
        contentContainerStyle={{ paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header — name, status, and the list's summary chips. */}
        <Text className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
          {row.feeName}
        </Text>
        <View className="flex-row items-center gap-2 mt-1.5">
          <StatusPill active={row.status === "active"} />
          <Text
            className="text-sm text-gray-500 dark:text-gray-400 flex-1"
            numberOfLines={1}
          >
            {location}
          </Text>
        </View>

        <View className="flex-row items-center flex-wrap gap-2 mt-3">
          <Chip
            icon={isPercent ? "percent" : "dollar-sign"}
            label={row.amountLabel}
          />
          <Chip
            icon={isAdditive ? "plus-circle" : "check-circle"}
            label={isAdditive ? "Additive" : "Inclusive"}
          />
          <Chip icon={entity.icon} label={entity.label} />
        </View>

        <SectionTitle>Fee</SectionTitle>
        <View className="flex-row flex-wrap">
          <DetailTile
            icon={isPercent ? "percent" : "dollar-sign"}
            label="Amount"
            value={row.amountLabel}
          />
          <DetailTile
            icon="tag"
            label="Calculation"
            value={isPercent ? "Percentage" : "Fixed amount"}
          />
          <DetailTile
            icon={isAdditive ? "plus-circle" : "check-circle"}
            label="Application"
            value={isAdditive ? "Additive" : "Inclusive"}
          />
          <DetailTile
            icon="calendar"
            label="Created"
            value={formatDateET(row.createdAt, { month: "short" })}
          />
        </View>

        {/* Same $100 illustration the create form previews. */}
        <View className="rounded-xl border border-blue-100 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-900/20 p-3.5">
          <Text className="text-[11px] text-gray-500 dark:text-gray-400">
            On a $100 base price
          </Text>
          <Text className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5">
            {money(feeOn100)} fee · guest pays {money(totalOn100)}
          </Text>
          <Text className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
            {APPLICATION_HINT[row.applicationType]}
          </Text>
        </View>

        <SectionTitle>Applies To</SectionTitle>
        <View className="flex-row flex-wrap">
          <DetailTile
            icon={entity.icon}
            label="Entity type"
            value={entity.label}
          />
          <DetailTile
            icon="check-square"
            label="Items"
            value={`${entityCount} ${entityCount === 1 ? "item" : "items"}`}
          />
        </View>

        {loading && entityNames == null ? (
          <View className="py-2">
            <ActivityIndicator color={PRIMARY} />
          </View>
        ) : entityNames && entityNames.length > 0 ? (
          <View>
            {entityNames.map((name, i) => (
              <View
                key={`${name}-${i}`}
                className="flex-row items-center gap-2.5 rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800 px-3.5 py-2.5 mb-2"
              >
                <Feather name={entity.icon} size={14} color={PRIMARY} />
                <Text
                  className="text-sm font-medium text-gray-900 dark:text-white flex-1"
                  numberOfLines={1}
                >
                  {name}
                </Text>
              </View>
            ))}
          </View>
        ) : entityNames && entityNames.length === 0 ? (
          <Text className="text-sm text-gray-500 dark:text-gray-400">
            Not applied to any {entity.plural} yet.
          </Text>
        ) : (
          // The names lookup failed; the count above still tells the story.
          <Text className="text-xs text-gray-400 dark:text-gray-500">
            Couldn&apos;t load the {entity.plural} this fee is applied to.
          </Text>
        )}

        {/* Footer actions */}
        <View className="flex-row gap-3 mt-6">
          <Pressable
            onPress={() => onEdit(row)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Edit fee support"
            className={`flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl bg-[#0644C7] ${
              busy ? "opacity-60" : "active:opacity-90"
            }`}
          >
            <Feather name="edit-2" size={16} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-white">Edit</Text>
          </Pressable>
          <Pressable
            onPress={() => onDelete(row)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Delete fee support"
            className={`flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl bg-red-600 ${
              busy ? "opacity-60" : "active:opacity-90"
            }`}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Feather name="trash-2" size={16} color="#FFFFFF" />
            )}
            <Text className="text-sm font-semibold text-white">Delete</Text>
          </Pressable>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}
