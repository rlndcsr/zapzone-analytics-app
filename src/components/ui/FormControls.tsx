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
  disabled = false,
  editable,
  ...inputProps
}: {
  label?: string;
  required?: boolean;
  hint?: string;
  /**
   * Greys the field out and blocks typing — for a value something else now
   * controls, where hiding the field would lose the number it holds. The hint
   * is the place to say what took over.
   */
  disabled?: boolean;
} & TextInputProps) {
  // Split so no utility is declared twice: repeating bg-/text- across a
  // conditional suffix leaves nativewind picking a winner rather than us.
  const tone = disabled
    ? "bg-gray-100 dark:bg-neutral-800 border-gray-200 dark:border-neutral-800 text-gray-500 dark:text-gray-400"
    : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 text-gray-900 dark:text-white";

  return (
    <View>
      {label ? <FieldLabel required={required}>{label}</FieldLabel> : null}
      <TextInput
        placeholderTextColor="#9CA3AF"
        className={`rounded-xl px-3.5 py-3 border text-sm ${tone}`}
        editable={disabled ? false : editable}
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

/** Mutually exclusive options as one inline pill bar (the web's segmented button group). */
export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View className="flex-row self-start bg-gray-100 dark:bg-neutral-800 rounded-xl p-0.5 mb-3">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            // Keyed by active so the segment remounts on toggle: css-interop then
            // resolves the shadow/dark variables on a fresh render instead of a
            // crash-prone post-mount upgrade.
            key={`${o.value}-${active}`}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className={`px-4 py-2 rounded-lg ${
              active ? "bg-white dark:bg-neutral-900 shadow-sm" : ""
            }`}
          >
            <Text
              className={`text-sm font-semibold ${
                active ? "text-[#0644C7]" : "text-gray-500 dark:text-gray-400"
              }`}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
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
/** Single-choice row — the checkbox's round twin, for mutually exclusive
 *  options (the web's `<input type="radio">` groups). */
export function RadioRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className="flex-row items-center gap-2.5 py-1.5"
    >
      <View
        className={`w-5 h-5 rounded-full border-2 items-center justify-center ${
          selected
            ? "border-[#0644C7]"
            : "border-gray-300 dark:border-neutral-700"
        }`}
      >
        {selected && <View className="w-2.5 h-2.5 rounded-full bg-[#0644C7]" />}
      </View>
      <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 flex-1">
        {label}
      </Text>
    </Pressable>
  );
}

export function CheckboxRow({
  label,
  checked,
  alignTop = false,
  onToggle,
}: {
  label: React.ReactNode;
  checked: boolean;
  /** Top-align the box for multi-line labels (e.g. consent copy). */
  alignTop?: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      className={`flex-row gap-2.5 ${alignTop ? "items-start" : "items-center"}`}
    >
      <View
        className={`w-5 h-5 rounded border items-center justify-center ${
          alignTop ? "mt-0.5" : ""
        } ${
          checked
            ? "bg-[#0644C7] border-[#0644C7]"
            : "bg-white dark:bg-neutral-900 border-gray-300 dark:border-neutral-700"
        }`}
      >
        {checked && <Feather name="check" size={13} color="#FFFFFF" />}
      </View>
      {typeof label === "string" ? (
        <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 flex-1">
          {label}
        </Text>
      ) : (
        <View className="flex-1">{label}</View>
      )}
    </Pressable>
  );
}
