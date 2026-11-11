import { Feather } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import type { FeatherIconName } from "../../lib/attractions/attractionDisplay";
import type { MembershipPlanRow } from "../../services/membershipPlansService";
import { SelectableTable, type TableColumn } from "./SelectableTable";

const CELL_TEXT = "text-sm text-gray-700 dark:text-gray-200";

/** "$59.99", or "Free" for a zero price. */
export const planPrice = (p: MembershipPlanRow) =>
  p.price <= 0 ? "Free" : `$${p.price.toFixed(2)}`;

export type PlanRowHandlers = {
  /** Admins and location managers; everyone else sees "View only". */
  canManage: boolean;
  togglingId: number | null;
  deletingId: number | null;
  onToggle: (p: MembershipPlanRow) => void;
  onBenefits: (p: MembershipPlanRow) => void;
  onEdit: (p: MembershipPlanRow) => void;
  onDelete: (p: MembershipPlanRow) => void;
};

/** The web Status cell: a toggle icon and Active / Inactive, tap to flip. */
export function PlanStatusToggle({
  plan,
  h,
}: {
  plan: MembershipPlanRow;
  h: PlanRowHandlers;
}) {
  const busy = h.togglingId === plan.id;
  return (
    <Pressable
      onPress={() => h.onToggle(plan)}
      disabled={!h.canManage || busy}
      hitSlop={6}
      accessibilityRole="switch"
      accessibilityState={{ checked: plan.isActive, disabled: !h.canManage }}
      accessibilityLabel={`${plan.name} status, ${plan.isActive ? "Active" : "Inactive"}`}
      className="flex-row items-center gap-1.5 self-start active:opacity-70"
    >
      {busy ? (
        <ActivityIndicator size="small" color="#0644C7" />
      ) : (
        <Feather
          name={plan.isActive ? "toggle-right" : "toggle-left"}
          size={20}
          color={plan.isActive ? "#16A34A" : "#9CA3AF"}
        />
      )}
      <Text
        className={`text-xs font-medium ${
          plan.isActive
            ? "text-green-700 dark:text-green-400"
            : "text-gray-500 dark:text-gray-400"
        }`}
      >
        {plan.isActive ? "Active" : "Inactive"}
      </Text>
    </Pressable>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  danger = false,
  busy = false,
  a11y,
}: {
  icon: FeatherIconName;
  label: string;
  onPress: () => void;
  danger?: boolean;
  busy?: boolean;
  a11y: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      className={`flex-row items-center gap-1 h-8 px-2.5 rounded-lg active:opacity-70 ${
        danger
          ? "bg-red-600"
          : "border border-gray-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
      }`}
    >
      {busy ? (
        <ActivityIndicator size="small" color={danger ? "#FFFFFF" : "#6B7280"} />
      ) : (
        <Feather name={icon} size={12} color={danger ? "#FFFFFF" : "#6B7280"} />
      )}
      <Text
        className={`text-xs font-medium ${
          danger ? "text-white" : "text-gray-700 dark:text-gray-200"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Benefits · Edit · Delete, or "View only" — the web's row actions. */
export function PlanActions({
  plan,
  h,
}: {
  plan: MembershipPlanRow;
  h: PlanRowHandlers;
}) {
  if (!h.canManage) {
    return (
      <Text className="text-xs text-gray-400 dark:text-gray-500">View only</Text>
    );
  }
  return (
    <View className="flex-row items-center gap-2">
      <ActionButton
        icon="star"
        label="Benefits"
        a11y={`Benefits for ${plan.name}`}
        onPress={() => h.onBenefits(plan)}
      />
      <ActionButton
        icon="edit-2"
        label="Edit"
        a11y={`Edit ${plan.name}`}
        onPress={() => h.onEdit(plan)}
      />
      <ActionButton
        icon="trash-2"
        label="Delete"
        a11y={`Delete ${plan.name}`}
        danger
        busy={h.deletingId === plan.id}
        onPress={() => h.onDelete(plan)}
      />
    </View>
  );
}

const text = (value: string) => (
  <Text numberOfLines={1} className={CELL_TEXT}>
    {value}
  </Text>
);

/**
 * Columns mirror the web admin's default set: Name, Price, Interval, Usage,
 * Access, Status, Actions.
 */
function columns(h: PlanRowHandlers): TableColumn<MembershipPlanRow>[] {
  return [
    {
      key: "name",
      label: "Name",
      width: 190,
      render: (p) => (
        <Text
          numberOfLines={2}
          className="text-sm font-semibold text-gray-900 dark:text-white"
        >
          {p.name}
        </Text>
      ),
    },
    { key: "price", label: "Price", width: 100, render: (p) => text(planPrice(p)) },
    { key: "interval", label: "Interval", width: 110, render: (p) => text(p.intervalLabel) },
    { key: "usage", label: "Usage", width: 120, render: (p) => text(p.usageLabel) },
    { key: "access", label: "Access", width: 90, render: (p) => text(p.accessLabel) },
    {
      key: "status",
      label: "Status",
      width: 120,
      render: (p) => <PlanStatusToggle plan={p} h={h} />,
    },
    {
      key: "actions",
      label: "Actions",
      width: h.canManage ? 270 : 110,
      render: (p) => <PlanActions plan={p} h={h} />,
    },
  ];
}

/** Table view for Membership Plans. Rows are inert; actions are explicit. */
export function MembershipPlansTable({
  plans,
  handlers,
}: {
  plans: MembershipPlanRow[];
  handlers: PlanRowHandlers;
}) {
  return (
    <SelectableTable
      columns={columns(handlers)}
      rows={plans}
      rowId={(p) => p.id}
      flat
    />
  );
}
