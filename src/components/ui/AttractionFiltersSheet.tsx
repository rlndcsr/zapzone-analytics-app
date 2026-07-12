import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { BottomSheet } from "./BottomSheet";
import { formatShortDate } from "./DateRangeSheet";
import { InputField } from "./InputField";
import { SelectField, type SelectOption } from "./FormControls";

/**
 * Full set of Manage Attractions filter values — one field per web
 * ManageAttractions filter (status / category / pricingType / durationType /
 * capacityVisibility / price range / capacity range / created-date range).
 * Empty strings mean "unbounded"/"any", matching the web `useAdminTable`.
 */
export type AttractionFilterValues = {
  status: "all" | "active" | "inactive";
  category: string;
  pricingType: string;
  durationType: "all" | "unlimited" | "timed";
  capacityVisibility: "all" | "shown" | "hidden";
  priceMin: string;
  priceMax: string;
  capacityMin: string;
  capacityMax: string;
  createdStart: string;
  createdEnd: string;
};

export const EMPTY_ATTRACTION_FILTERS: AttractionFilterValues = {
  status: "all",
  category: "all",
  pricingType: "all",
  durationType: "all",
  capacityVisibility: "all",
  priceMin: "",
  priceMax: "",
  capacityMin: "",
  capacityMax: "",
  createdStart: "",
  createdEnd: "",
};

/** Number of non-default filters — drives the "Filters" pill count badge. */
export function countActiveAttractionFilters(v: AttractionFilterValues): number {
  let n = 0;
  if (v.status !== "all") n++;
  if (v.category !== "all") n++;
  if (v.pricingType !== "all") n++;
  if (v.durationType !== "all") n++;
  if (v.capacityVisibility !== "all") n++;
  if (v.priceMin !== "" || v.priceMax !== "") n++;
  if (v.capacityMin !== "" || v.capacityMax !== "") n++;
  if (v.createdStart !== "" || v.createdEnd !== "") n++;
  return n;
}

const STATUS_OPTS: SelectOption[] = [
  { label: "All Statuses", value: "all" },
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
];

// Web ManageAttractions exposes exactly these three pricing types in its filter.
const PRICING_TYPE_OPTS: SelectOption[] = [
  { label: "All Pricing Types", value: "all" },
  { label: "Per Person", value: "per_person" },
  { label: "Per Group", value: "per_group" },
  { label: "Per Hour", value: "per_hour" },
];

const DURATION_OPTS: SelectOption[] = [
  { label: "All Durations", value: "all" },
  { label: "Unlimited", value: "unlimited" },
  { label: "Timed", value: "timed" },
];

const VISIBILITY_OPTS: SelectOption[] = [
  { label: "All Visibility", value: "all" },
  { label: "Shown to Customers", value: "shown" },
  { label: "Hidden from Customers", value: "hidden" },
];

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <Text className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
    {children}
  </Text>
);

type Props = {
  visible: boolean;
  values: AttractionFilterValues;
  /** Category names for the Category dropdown (derived from loaded data). */
  categories: string[];
  onChange: (next: AttractionFilterValues) => void;
  onClear: () => void;
  onClose: () => void;
  /** Ask the parent to open the shared range calendar for Created Date. */
  onOpenCreatedDate: () => void;
};

/**
 * Manage Attractions filter panel — one BottomSheet with every web-admin filter.
 * Values apply live to the list behind it (like the web); "Done" just closes and
 * "Clear Filters" resets everything. Created Date reuses the shared range
 * calendar (opened by the parent to avoid stacking two native Modals).
 */
export function AttractionFiltersSheet({
  visible,
  values,
  categories,
  onChange,
  onClear,
  onClose,
  onOpenCreatedDate,
}: Props) {
  const set = (patch: Partial<AttractionFilterValues>) =>
    onChange({ ...values, ...patch });

  const priceInvalid =
    values.priceMin !== "" &&
    values.priceMax !== "" &&
    Number(values.priceMin) > Number(values.priceMax);
  const capacityInvalid =
    values.capacityMin !== "" &&
    values.capacityMax !== "" &&
    Number(values.capacityMin) > Number(values.capacityMax);

  const hasCreated = values.createdStart !== "" || values.createdEnd !== "";
  const createdLabel = hasCreated
    ? `${formatShortDate(values.createdStart) || "…"} – ${formatShortDate(values.createdEnd) || "…"}`
    : null;

  const categoryOptions: SelectOption[] = [
    { label: "All Categories", value: "all" },
    ...categories.map((c) => ({ label: c, value: c })),
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
            onSelect={(v) => set({ status: v as AttractionFilterValues["status"] })}
          />
          <SelectField
            label="Category"
            value={values.category}
            options={categoryOptions}
            onSelect={(v) => set({ category: String(v) })}
          />
          <SelectField
            label="Pricing Type"
            value={values.pricingType}
            options={PRICING_TYPE_OPTS}
            onSelect={(v) => set({ pricingType: String(v) })}
          />
          <SelectField
            label="Duration"
            value={values.durationType}
            options={DURATION_OPTS}
            onSelect={(v) =>
              set({ durationType: v as AttractionFilterValues["durationType"] })
            }
          />
          <SelectField
            label="Capacity Visibility"
            value={values.capacityVisibility}
            options={VISIBILITY_OPTS}
            onSelect={(v) =>
              set({
                capacityVisibility:
                  v as AttractionFilterValues["capacityVisibility"],
              })
            }
          />

          {/* Price range */}
          <View>
            <FieldLabel>Price ($)</FieldLabel>
            <View className="flex-row gap-3">
              <InputField
                label=""
                value={values.priceMin}
                onChangeText={(t) => set({ priceMin: t.replace(/[^0-9.]/g, "") })}
                placeholder="Min"
                keyboardType="decimal-pad"
                containerClassName="flex-1"
              />
              <InputField
                label=""
                value={values.priceMax}
                onChangeText={(t) => set({ priceMax: t.replace(/[^0-9.]/g, "") })}
                placeholder="Max"
                keyboardType="decimal-pad"
                containerClassName="flex-1"
              />
            </View>
            {priceInvalid && (
              <Text className="ml-4 mt-1.5 text-xs text-red-500">
                Min cannot exceed Max
              </Text>
            )}
          </View>

          {/* Capacity range */}
          <View>
            <FieldLabel>Capacity</FieldLabel>
            <View className="flex-row gap-3">
              <InputField
                label=""
                value={values.capacityMin}
                onChangeText={(t) =>
                  set({ capacityMin: t.replace(/[^0-9]/g, "") })
                }
                placeholder="Min"
                keyboardType="number-pad"
                containerClassName="flex-1"
              />
              <InputField
                label=""
                value={values.capacityMax}
                onChangeText={(t) =>
                  set({ capacityMax: t.replace(/[^0-9]/g, "") })
                }
                placeholder="Max"
                keyboardType="number-pad"
                containerClassName="flex-1"
              />
            </View>
            {capacityInvalid && (
              <Text className="ml-4 mt-1.5 text-xs text-red-500">
                Min cannot exceed Max
              </Text>
            )}
          </View>

          {/* Created Date — opens the shared range calendar */}
          <View>
            <FieldLabel>Created Date</FieldLabel>
            <Pressable
              onPress={onOpenCreatedDate}
              className="h-14 flex-row items-center gap-3 rounded-full border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-5"
            >
              <Feather name="calendar" size={18} color="#9CA3AF" />
              <Text
                className={`flex-1 text-base ${
                  createdLabel
                    ? "text-gray-900 dark:text-white"
                    : "text-gray-400"
                }`}
                numberOfLines={1}
              >
                {createdLabel ?? "Any date"}
              </Text>
              {hasCreated ? (
                <Pressable
                  onPress={() => set({ createdStart: "", createdEnd: "" })}
                  hitSlop={10}
                >
                  <Feather name="x" size={18} color="#9CA3AF" />
                </Pressable>
              ) : (
                <Feather name="chevron-right" size={18} color="#9CA3AF" />
              )}
            </Pressable>
          </View>

          {/* Footer: Clear Filters (secondary) + Done (primary) */}
          <View className="flex-row gap-3 mt-2">
            <Pressable
              onPress={onClear}
              className="flex-1 h-14 items-center justify-center rounded-full border border-gray-300 dark:border-neutral-700 active:opacity-70"
            >
              <Text className="text-base font-semibold text-gray-700 dark:text-gray-200">
                Clear Filters
              </Text>
            </Pressable>
            <Pressable
              onPress={onClose}
              className="flex-1 h-14 items-center justify-center rounded-full bg-[#0644C7] active:opacity-90"
            >
              <Text className="text-base font-semibold text-white">Done</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}
