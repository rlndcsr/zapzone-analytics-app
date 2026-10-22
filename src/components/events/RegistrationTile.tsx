import { Text, View } from "react-native";

export function RegistrationTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | null;
  hint: string;
}) {
  return (
    <View className="w-1/2 p-1.5">
      <View className="flex-1 bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-3">
        <Text className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {label}
        </Text>
        <Text className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
          {value === null ? "—" : value.toLocaleString()}
        </Text>
        <Text className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {hint}
        </Text>
      </View>
    </View>
  );
}
