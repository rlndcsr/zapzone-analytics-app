import { Feather } from "@expo/vector-icons";
import { ReactNode, Ref } from "react";
import { Text, TextInput, TextInputProps, View } from "react-native";

type InputFieldProps = TextInputProps & {
  label: string;
  icon?: keyof typeof Feather.glyphMap;
  error?: string;
  rightAccessory?: ReactNode;
  containerClassName?: string;
  ref?: Ref<TextInput>;
};

export function InputField({
  label,
  icon,
  error,
  rightAccessory,
  containerClassName,
  ref,
  ...inputProps
}: InputFieldProps) {
  return (
    <View className={containerClassName}>
      {label ? (
        <Text className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
          {label}
        </Text>
      ) : null}

      <View
        className={`h-14 flex-row items-center rounded-full border bg-white dark:bg-neutral-900 px-5 ${
          error ? "border-red-400" : "border-gray-200 dark:border-neutral-700"
        }`}
      >
        {icon ? <Feather name={icon} size={18} color="#9CA3AF" /> : null}

        <TextInput
          ref={ref}
          className="ml-3 flex-1 py-0 text-base text-gray-900 dark:text-white"
          placeholderTextColor="#9CA3AF"
          {...inputProps}
        />

        {rightAccessory}
      </View>

      {error ? (
        <Text className="ml-4 mt-1.5 text-xs text-red-500">{error}</Text>
      ) : null}
    </View>
  );
}
