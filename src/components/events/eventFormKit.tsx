import { Feather } from "@expo/vector-icons";
import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { BottomSheet } from "../ui/BottomSheet";

/*
 * Pieces shared by the Create Event and Edit Event screens, so the two forms
 * look and behave the same.
 */

export const PRIMARY = "#0644C7";

export type IconName = ComponentProps<typeof Feather>["name"];

export const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

export const INTERVAL_OPTIONS = [15, 30, 45, 60, 90, 120];

/** "17:00" → "5:00 PM". */
export function formatTime(value: string): string {
  if (!value) return "";
  const [hStr, mStr] = value.split(":");
  let hour = Number(hStr);
  const meridian = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${mStr} ${meridian}`;
}

/** "2027-01-21" → "Jan 21, 2027". */
export function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(`${dateStr.substring(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export const Section = ({
  icon,
  title,
  children,
  right,
}: {
  icon: IconName;
  title: string;
  children: ReactNode;
  /** Optional control at the heading's right edge (e.g. Select All). */
  right?: ReactNode;
}) => (
  <View
    className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mb-4 shadow-sm"
    style={CARD_SHADOW}
  >
    <View className="flex-row items-center gap-2 mb-4">
      <View className="w-8 h-8 rounded-lg bg-[#0644C7]/10 items-center justify-center">
        <Feather name={icon} size={16} color={PRIMARY} />
      </View>
      <Text className="flex-1 text-base font-bold text-gray-900 dark:text-white">{title}</Text>
      {right}
    </View>
    {children}
  </View>
);

export const FieldLabel = ({ children }: { children: ReactNode }) => (
  <Text className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
    {children}
  </Text>
);

export const SelectRow = ({
  icon,
  value,
  placeholder,
  onPress,
  error,
  compact = false,
}: {
  icon: IconName;
  value: string | null;
  placeholder: string;
  onPress: () => void;
  error?: boolean;
  /** Half-width rows drop the icon and tighten padding so the value fits. */
  compact?: boolean;
}) => (
  <Pressable
    onPress={onPress}
    className={`h-14 flex-row items-center rounded-lg border bg-white dark:bg-neutral-900 ${
      compact ? "gap-1.5 px-3" : "gap-3 px-5"
    } ${error ? "border-red-400" : "border-gray-200 dark:border-neutral-700"}`}
  >
    {!compact && <Feather name={icon} size={18} color="#9CA3AF" />}
    <Text
      className={`flex-1 text-base ${value ? "text-gray-900 dark:text-white" : "text-gray-400"}`}
      numberOfLines={1}
    >
      {value ?? placeholder}
    </Text>
    <Feather name="chevron-down" size={compact ? 16 : 18} color="#9CA3AF" />
  </Pressable>
);

export const ErrorText = ({ error }: { error?: string }) =>
  error ? <Text className="ml-4 mt-1.5 text-xs text-red-500">{error}</Text> : null;

/** A single line in the Live Preview card. */
export const PreviewLine = ({
  icon,
  label,
  value,
  muted,
}: {
  icon: IconName;
  label: string;
  value: string;
  muted?: boolean;
}) => (
  <View className="flex-row items-center gap-2 mb-2">
    <Feather name={icon} size={14} color="#9CA3AF" />
    <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">{label}:</Text>
    <Text
      className={`text-sm flex-1 ${muted ? "text-gray-300 dark:text-gray-600" : "text-gray-800 dark:text-gray-100"}`}
      numberOfLines={1}
    >
      {value}
    </Text>
  </View>
);

/** Location picker sheet (company admins). */
export const LocationSheet = ({
  visible,
  options,
  selectedId,
  onClose,
  onSelect,
}: {
  visible: boolean;
  options: { id: number; name: string }[];
  selectedId: number | null;
  onClose: () => void;
  onSelect: (id: number) => void;
}) => (
  <BottomSheet visible={visible} onClose={onClose} title="Select Location">
    <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
      {options.length === 0 && (
        <Text className="text-sm text-gray-400 px-4 py-3">No locations available.</Text>
      )}
      {options.map((loc) => {
        const isSelected = selectedId === loc.id;
        return (
          <Pressable
            key={loc.id}
            onPress={() => onSelect(loc.id)}
            className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
              isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
            }`}
          >
            <Text
              className={`text-base font-medium flex-1 mr-2 ${
                isSelected ? "text-blue-600 dark:text-blue-400" : "text-gray-700 dark:text-gray-200"
              }`}
              numberOfLines={1}
            >
              {loc.name}
            </Text>
            {isSelected && <Feather name="check" size={16} color="#3B82F6" />}
          </Pressable>
        );
      })}
    </ScrollView>
  </BottomSheet>
);

/**
 * Time slot length picker: the preset lengths plus a Custom entry. `validate`
 * judges a length against the rest of the form (e.g. longer than the window);
 * a preset is applied as picked, a custom one only once it passes.
 */
export const IntervalSheet = ({
  visible,
  value,
  minMinutes = 1,
  validate,
  onClose,
  onApply,
}: {
  visible: boolean;
  value: number;
  /** Shortest custom length accepted. */
  minMinutes?: number;
  validate: (minutes: number) => string | null;
  onClose: () => void;
  onApply: (minutes: number) => void;
}) => {
  const isCustomValue = !INTERVAL_OPTIONS.includes(value);
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState("");

  // Each opening starts from the current value.
  useEffect(() => {
    if (!visible) return;
    setCustomOpen(isCustomValue);
    setCustomText(isCustomValue ? String(value) : "");
  }, [visible, value, isCustomValue]);

  const applyCustom = () => {
    const minutes = parseInt(customText, 10);
    if (!Number.isFinite(minutes) || minutes < minMinutes) {
      Alert.alert(
        "Invalid interval",
        `Enter a whole number of minutes, at least ${minMinutes}.`,
      );
      return;
    }
    const problem = validate(minutes);
    if (problem) {
      Alert.alert("Invalid interval", problem);
      return;
    }
    onApply(minutes);
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Time slot length (min)">
      <ScrollView
        className="px-4 pb-6"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {INTERVAL_OPTIONS.map((opt) => {
          const isSelected = !customOpen && value === opt;
          return (
            <Pressable
              key={opt}
              onPress={() => {
                setCustomOpen(false);
                onApply(opt);
              }}
              className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
                isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
              }`}
            >
              <Text
                className={`text-base font-medium ${
                  isSelected ? "text-blue-600 dark:text-blue-400" : "text-gray-700 dark:text-gray-200"
                }`}
              >
                {opt} minutes
              </Text>
              {isSelected && <Feather name="check" size={16} color="#3B82F6" />}
            </Pressable>
          );
        })}

        <Pressable
          onPress={() => setCustomOpen((open) => !open)}
          className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
            customOpen ? "bg-blue-50 dark:bg-blue-900/20" : ""
          }`}
        >
          <Text
            className={`text-base font-medium ${
              customOpen ? "text-blue-600 dark:text-blue-400" : "text-gray-700 dark:text-gray-200"
            }`}
          >
            Custom
          </Text>
          {isCustomValue && !customOpen && (
            <Text className="text-sm text-gray-500 dark:text-gray-400">{value} minutes</Text>
          )}
          {customOpen && <Feather name="check" size={16} color="#3B82F6" />}
        </Pressable>

        {customOpen && (
          <View className="px-4 pt-1 flex-row items-center gap-2">
            <TextInput
              value={customText}
              onChangeText={(t) => setCustomText(t.replace(/\D/g, ""))}
              placeholder="Minutes"
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
              returnKeyType="done"
              onSubmitEditing={applyCustom}
              className="flex-1 h-12 rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 text-base text-gray-900 dark:text-white"
            />
            <Pressable
              onPress={applyCustom}
              disabled={!customText.trim()}
              className={`h-12 px-5 items-center justify-center rounded-xl ${
                customText.trim() ? "bg-[#0644C7]" : "bg-gray-300 dark:bg-neutral-700"
              }`}
            >
              <Text className="text-sm font-semibold text-white">Apply</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </BottomSheet>
  );
};
