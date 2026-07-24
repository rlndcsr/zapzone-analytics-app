import { Feather } from "@expo/vector-icons";
import { useColorScheme } from "nativewind";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import type { EmailVariable } from "../../services/emailService";

export const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

/** Sticky top bar: back chevron, icon + title/subtitle, and action buttons. */
export function ComposerHeader({
  icon,
  title,
  subtitle,
  onBack,
  actions,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  title: string;
  subtitle: string;
  onBack: () => void;
  actions?: React.ReactNode;
}) {
  const { colorScheme } = useColorScheme();
  const iconColor = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  return (
    <View className="bg-white dark:bg-neutral-900 pt-12 pb-4 px-4 w-full border-b border-gray-100 dark:border-neutral-800">
      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={onBack}
          className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Feather name="chevron-left" size={20} color={iconColor} />
        </Pressable>
        <View className="flex-row items-center gap-2 flex-1">
          <Feather name={icon} size={18} color={PRIMARY} />
          <View className="flex-1">
            <Text className="text-base font-bold text-gray-900 dark:text-white" numberOfLines={1}>
              {title}
            </Text>
            <Text className="text-[11px] text-gray-500 dark:text-gray-400" numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
        </View>
      </View>
      {!!actions && (
        <View className="flex-row items-center justify-end gap-2 mt-3">{actions}</View>
      )}
    </View>
  );
}

/** Small header action button (outline or filled). */
export function HeaderAction({
  label,
  icon,
  variant = "outline",
  disabled,
  loading,
  onPress,
}: {
  label: string;
  icon?: React.ComponentProps<typeof Feather>["name"];
  variant?: "outline" | "primary";
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
}) {
  const filled = variant === "primary";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      className={`flex-row items-center gap-1.5 px-3 py-2 rounded-xl ${
        filled
          ? "bg-[#0644C7]"
          : "border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
      }`}
      style={disabled || loading ? { opacity: 0.5 } : undefined}
    >
      {!!icon && (
        <Feather name={icon} size={14} color={filled ? "#FFFFFF" : "#374151"} />
      )}
      <Text
        className={`text-xs font-semibold ${
          filled ? "text-white" : "text-gray-700 dark:text-gray-200"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Titled card used for each form section. */
export function EmailSection({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View
      className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mb-4 border border-gray-100 dark:border-neutral-800"
      style={CARD_SHADOW}
    >
      <View className="flex-row items-center justify-between mb-4">
        <Text className="text-base font-bold text-gray-900 dark:text-white">
          {title}
        </Text>
        {right}
      </View>
      {children}
    </View>
  );
}

/** Labeled text input (single or multiline) matching the app's field style. */
export function LabeledInput({
  label,
  required,
  hint,
  value,
  onChangeText,
  placeholder,
  multiline,
  onFocus,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
  onFocus?: () => void;
  keyboardType?: React.ComponentProps<typeof TextInput>["keyboardType"];
  autoCapitalize?: React.ComponentProps<typeof TextInput>["autoCapitalize"];
}) {
  return (
    <View className="mb-1">
      <Text className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1.5">
        {label}
        {required ? <Text className="text-red-500"> *</Text> : null}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        textAlignVertical={multiline ? "top" : "center"}
        className="bg-gray-50 dark:bg-neutral-800 rounded-xl px-3.5 py-3 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-neutral-700"
        style={multiline ? { minHeight: 160 } : undefined}
      />
      {!!hint && (
        <Text className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5">
          {hint}
        </Text>
      )}
    </View>
  );
}

/** Collapsible group of insertable merge variables. */
function VariableGroup({
  title,
  vars,
  initiallyOpen,
  onInsert,
}: {
  title: string;
  vars: EmailVariable[];
  initiallyOpen?: boolean;
  onInsert: (token: string) => void;
}) {
  const [open, setOpen] = useState(!!initiallyOpen);
  return (
    <View className="rounded-xl border border-gray-200 dark:border-neutral-700 mb-2 overflow-hidden">
      <Pressable
        onPress={() => setOpen((v) => !v)}
        className="flex-row items-center justify-between px-3.5 py-3 bg-gray-50 dark:bg-neutral-800"
      >
        <Text className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          {title}
        </Text>
        <Feather name={open ? "chevron-up" : "chevron-down"} size={16} color="#9CA3AF" />
      </Pressable>
      {open && (
        <View className="px-2.5 py-2">
          {vars.map((v) => (
            <Pressable
              key={v.name}
              onPress={() => onInsert(`{{ ${v.name} }}`)}
              className="rounded-lg px-2.5 py-2 active:bg-gray-50 dark:active:bg-neutral-800"
            >
              <Text className="text-[13px] font-mono text-[#0644C7] dark:text-blue-300">
                {`{{ ${v.name} }}`}
              </Text>
              <Text className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                {v.description}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

/** "Template Variables" panel — tap a variable to insert it into the last field. */
export function VariablePanel({
  intro,
  groups,
  onInsert,
}: {
  intro: string;
  groups: { title: string; vars: EmailVariable[] }[];
  onInsert: (token: string) => void;
}) {
  return (
    <View
      className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mb-4 border border-gray-100 dark:border-neutral-800"
      style={CARD_SHADOW}
    >
      <View className="flex-row items-center gap-2 mb-2">
        <Feather name="code" size={16} color={PRIMARY} />
        <Text className="text-base font-bold text-gray-900 dark:text-white">
          Template Variables
        </Text>
      </View>
      <Text className="text-xs text-gray-500 dark:text-gray-400 mb-3">{intro}</Text>
      {groups.map((g, i) => (
        <VariableGroup
          key={g.title}
          title={g.title}
          vars={g.vars}
          initiallyOpen={i === 0}
          onInsert={onInsert}
        />
      ))}
      <View className="flex-row gap-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl px-3 py-2.5 mt-1">
        <Feather name="info" size={14} color={PRIMARY} />
        <Text className="flex-1 text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">
          Variables are automatically replaced with recipient-specific data when
          emails are sent.
        </Text>
      </View>
    </View>
  );
}
