import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { BottomSheet } from "./BottomSheet";
import { formatShortDate } from "./DateRangeSheet";
import { InputField } from "./InputField";
import { SelectField, type SelectOption } from "./FormControls";

/** Which of the two date ranges an "open calendar" request targets. */
export type EventPurchaseDateTarget = "created" | "scheduled";

export type EventPurchaseFilterValues = {
  status: string;
  event: string;
  paymentMethod: string;
  paymentStatus: string;
  customerType: "all" | "registered" | "guest";
  balance: "all" | "due" | "paid";
  createdFrom: string;
  createdTo: string;
  scheduledFrom: string;
  scheduledTo: string;
  amountMin: string;
  amountMax: string;
};

export const EMPTY_EVENT_PURCHASE_FILTERS: EventPurchaseFilterValues = {
  status: "all",
  event: "all",
  paymentMethod: "all",
  paymentStatus: "all",
  customerType: "all",
  balance: "all",
  createdFrom: "",
  createdTo: "",
  scheduledFrom: "",
  scheduledTo: "",
  amountMin: "",
  amountMax: "",
};

/** Number of non-default filters — drives the "Filters" pill count badge. */
export function countActiveEventPurchaseFilters(
  v: EventPurchaseFilterValues,
): number {
  let n = 0;
  if (v.status !== "all") n++;
  if (v.event !== "all") n++;
  if (v.paymentMethod !== "all") n++;
  if (v.paymentStatus !== "all") n++;
  if (v.customerType !== "all") n++;
  if (v.balance !== "all") n++;
  if (v.createdFrom !== "" || v.createdTo !== "") n++;
  if (v.scheduledFrom !== "" || v.scheduledTo !== "") n++;
  if (v.amountMin !== "" || v.amountMax !== "") n++;
  return n;
}

// Statuses mirror the web EventPurchases filter (all seven).
const STATUS_OPTS: SelectOption[] = [
  { label: "All Statuses", value: "all" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Pending", value: "pending" },
  { label: "Checked In", value: "checked-in" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Refunded", value: "refunded" },
  { label: "Voided", value: "voided" },
];

const PAYMENT_METHOD_OPTS: SelectOption[] = [
  { label: "All Methods", value: "all" },
  { label: "In-Store", value: "in-store" },
  { label: "Pay Later", value: "paylater" },
  { label: "Authorize.net", value: "authorize.net" },
];

const PAYMENT_STATUS_OPTS: SelectOption[] = [
  { label: "All Payment Statuses", value: "all" },
  { label: "Paid", value: "paid" },
  { label: "Partial", value: "partial" },
  { label: "Pending", value: "pending" },
];

const CUSTOMER_TYPE_OPTS: SelectOption[] = [
  { label: "All Customer Types", value: "all" },
  { label: "Registered", value: "registered" },
  { label: "Guest / Walk-in", value: "guest" },
];

const BALANCE_OPTS: SelectOption[] = [
  { label: "All Balances", value: "all" },
  { label: "Balance Due", value: "due" },
  { label: "Paid in Full", value: "paid" },
];

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <Text className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
    {children}
  </Text>
);

const DateRangeRow = ({
  label,
  from,
  to,
  onOpen,
  onClear,
}: {
  label: string;
  from: string;
  to: string;
  onOpen: () => void;
  onClear: () => void;
}) => {
  const has = from !== "" || to !== "";
  const text = has
    ? `${formatShortDate(from) || "…"} – ${formatShortDate(to) || "…"}`
    : null;
  return (
    <View>
      <FieldLabel>{label}</FieldLabel>
      <Pressable
        onPress={onOpen}
        className="h-14 flex-row items-center gap-3 rounded-full border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-5"
      >
        <Feather name="calendar" size={18} color="#9CA3AF" />
        <Text
          className={`flex-1 text-base ${
            text ? "text-gray-900 dark:text-white" : "text-gray-400"
          }`}
          numberOfLines={1}
        >
          {text ?? "Any date"}
        </Text>
        {has ? (
          <Pressable onPress={onClear} hitSlop={10}>
            <Feather name="x" size={18} color="#9CA3AF" />
          </Pressable>
        ) : (
          <Feather name="chevron-right" size={18} color="#9CA3AF" />
        )}
      </Pressable>
    </View>
  );
};

type Props = {
  visible: boolean;
  values: EventPurchaseFilterValues;
  /** Event names for the Event dropdown (derived from loaded data). */
  events: string[];
  onChange: (next: EventPurchaseFilterValues) => void;
  onApply: () => void;
  onClear: () => void;
  onClose: () => void;
  onOpenDateRange: (target: EventPurchaseDateTarget) => void;
};

export function EventPurchaseFiltersSheet({
  visible,
  values,
  events,
  onChange,
  onApply,
  onClear,
  onClose,
  onOpenDateRange,
}: Props) {
  const set = (patch: Partial<EventPurchaseFilterValues>) =>
    onChange({ ...values, ...patch });

  const amountInvalid =
    values.amountMin !== "" &&
    values.amountMax !== "" &&
    Number(values.amountMin) > Number(values.amountMax);

  const eventOptions: SelectOption[] = [
    { label: "All Events", value: "all" },
    ...events.map((e) => ({ label: e, value: e })),
  ];

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Filters">
      <ScrollView
        className="px-5"
        contentContainerStyle={{ paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-4 pt-1">
          <SelectField
            label="Status"
            value={values.status}
            options={STATUS_OPTS}
            onSelect={(v) => set({ status: String(v) })}
          />
          <SelectField
            label="Event"
            value={values.event}
            options={eventOptions}
            onSelect={(v) => set({ event: String(v) })}
          />
          <SelectField
            label="Payment Method"
            value={values.paymentMethod}
            options={PAYMENT_METHOD_OPTS}
            onSelect={(v) => set({ paymentMethod: String(v) })}
          />
          <SelectField
            label="Payment Status"
            value={values.paymentStatus}
            options={PAYMENT_STATUS_OPTS}
            onSelect={(v) => set({ paymentStatus: String(v) })}
          />
          <SelectField
            label="Customer Type"
            value={values.customerType}
            options={CUSTOMER_TYPE_OPTS}
            onSelect={(v) =>
              set({
                customerType: v as EventPurchaseFilterValues["customerType"],
              })
            }
          />
          <SelectField
            label="Balance"
            value={values.balance}
            options={BALANCE_OPTS}
            onSelect={(v) =>
              set({ balance: v as EventPurchaseFilterValues["balance"] })
            }
          />

          <DateRangeRow
            label="Created Date"
            from={values.createdFrom}
            to={values.createdTo}
            onOpen={() => onOpenDateRange("created")}
            onClear={() => set({ createdFrom: "", createdTo: "" })}
          />
          <DateRangeRow
            label="Scheduled Date"
            from={values.scheduledFrom}
            to={values.scheduledTo}
            onOpen={() => onOpenDateRange("scheduled")}
            onClear={() => set({ scheduledFrom: "", scheduledTo: "" })}
          />

          {/* Total Amount range */}
          <View>
            <FieldLabel>Total Amount ($)</FieldLabel>
            <View className="flex-row gap-3">
              <InputField
                label=""
                value={values.amountMin}
                onChangeText={(t) =>
                  set({ amountMin: t.replace(/[^0-9.]/g, "") })
                }
                placeholder="Min"
                keyboardType="decimal-pad"
                containerClassName="flex-1"
              />
              <InputField
                label=""
                value={values.amountMax}
                onChangeText={(t) =>
                  set({ amountMax: t.replace(/[^0-9.]/g, "") })
                }
                placeholder="Max"
                keyboardType="decimal-pad"
                containerClassName="flex-1"
              />
            </View>
            {amountInvalid && (
              <Text className="ml-4 mt-1.5 text-xs text-red-500">
                Min cannot exceed Max
              </Text>
            )}
          </View>

          {/* Footer: Clear All + Cancel (secondary), Apply (primary) */}
          <View className="gap-3 mt-2">
            <View className="flex-row gap-3">
              <Pressable
                onPress={onClear}
                accessibilityRole="button"
                accessibilityLabel="Clear all filters"
                className="flex-1 h-14 items-center justify-center rounded-full border border-gray-300 dark:border-neutral-700 active:opacity-70"
              >
                <Text className="text-base font-semibold text-gray-700 dark:text-gray-200">
                  Clear All
                </Text>
              </Pressable>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                className="flex-1 h-14 items-center justify-center rounded-full border border-gray-300 dark:border-neutral-700 active:opacity-70"
              >
                <Text className="text-base font-semibold text-gray-700 dark:text-gray-200">
                  Cancel
                </Text>
              </Pressable>
            </View>
            <Pressable
              onPress={onApply}
              accessibilityRole="button"
              accessibilityLabel="Apply filters"
              className="h-14 items-center justify-center rounded-full bg-[#0644C7] active:opacity-90"
            >
              <Text className="text-base font-semibold text-white">Apply</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}
