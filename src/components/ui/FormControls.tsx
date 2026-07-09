import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";

const PRIMARY = "#0644C7";

export type SelectOption = { label: string; value: string | number };

/** A form field label with an optional required asterisk. */
export function FieldLabel({
  children,
  required,
  className = "",
}: {
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <Text
      className={`text-sm font-medium text-gray-700 dark:text-gray-200 mb-2 ${className}`}
    >
      {children}
      {required ? <Text className="text-red-500"> *</Text> : null}
    </Text>
  );
}

/** Labeled text input with an optional hint line below. */
export function TextField({
  label,
  required,
  hint,
  ...inputProps
}: {
  label?: string;
  required?: boolean;
  hint?: string;
} & TextInputProps) {
  return (
    <View>
      {label ? <FieldLabel required={required}>{label}</FieldLabel> : null}
      <TextInput
        placeholderTextColor="#9CA3AF"
        className="bg-white dark:bg-neutral-900 rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-800 text-sm text-gray-900 dark:text-white"
        {...inputProps}
      />
      {hint ? (
        <Text className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * A single-select dropdown that expands its options inline (an accordion), so it
 * works inside a BottomSheet without a nested modal. Mirrors a web `<select>`.
 */
export function SelectField({
  label,
  required,
  placeholder = "Select...",
  value,
  options,
  onSelect,
  disabled,
}: {
  label?: string;
  required?: boolean;
  placeholder?: string;
  value: string | number | null;
  options: SelectOption[];
  onSelect: (value: string | number) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value) ?? null;

  return (
    <View>
      {label ? <FieldLabel required={required}>{label}</FieldLabel> : null}
      <Pressable
        onPress={() => !disabled && setOpen((o) => !o)}
        className={`flex-row items-center justify-between rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-800 ${
          disabled ? "bg-gray-100 dark:bg-neutral-800 opacity-60" : "bg-white dark:bg-neutral-900"
        }`}
      >
        <Text
          className={`text-sm flex-1 mr-2 ${
            selected
              ? "text-gray-900 dark:text-white"
              : "text-gray-400 dark:text-gray-500"
          }`}
          numberOfLines={1}
        >
          {selected ? selected.label : placeholder}
        </Text>
        <Feather
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color="#9CA3AF"
        />
      </Pressable>

      {open && !disabled && (
        <View className="mt-1 rounded-xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
          <ScrollView
            style={{ maxHeight: 220 }}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            {options.length === 0 && (
              <Text className="text-sm text-gray-400 dark:text-gray-500 px-3.5 py-3">
                No options available.
              </Text>
            )}
            {options.map((o) => {
              const active = o.value === value;
              return (
                <Pressable
                  key={String(o.value)}
                  onPress={() => {
                    onSelect(o.value);
                    setOpen(false);
                  }}
                  className="flex-row items-center justify-between px-3.5 py-3 border-b border-gray-100 dark:border-neutral-800 active:bg-gray-50 dark:active:bg-neutral-800"
                >
                  <Text
                    className={`text-sm flex-1 mr-2 ${
                      active
                        ? "font-semibold text-[#0644C7]"
                        : "text-gray-700 dark:text-gray-200"
                    }`}
                  >
                    {o.label}
                  </Text>
                  {active && <Feather name="check" size={16} color={PRIMARY} />}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

/** A label + right-aligned toggle switch row. */
export function ToggleRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
        {label}
      </Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: "#D1D5DB", true: "#86B7FF" }}
        thumbColor={value ? PRIMARY : "#F3F4F6"}
      />
    </View>
  );
}

/** A checkbox + label row (matches the web plan form's boolean flags). */
export function CheckboxRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable onPress={onToggle} className="flex-row items-center gap-2.5">
      <View
        className={`w-5 h-5 rounded border items-center justify-center ${
          checked
            ? "bg-[#0644C7] border-[#0644C7]"
            : "bg-white dark:bg-neutral-900 border-gray-300 dark:border-neutral-700"
        }`}
      >
        {checked && <Feather name="check" size={13} color="#FFFFFF" />}
      </View>
      <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 flex-1">
        {label}
      </Text>
    </Pressable>
  );
}
