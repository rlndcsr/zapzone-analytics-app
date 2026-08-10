import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import { type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  children?: ReactNode;
  className?: string;
};

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  children,
  className = "pb-6",
}: ScreenHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  return (
    <View
      className={`bg-[#0644C7]/5 dark:bg-neutral-900 rounded-b-[32px] px-5 ${className}`}
      style={{ paddingTop: insets.top + 10 }}
    >
      <View className="flex-row items-center">
        <Pressable
          onPress={onBack ?? (() => router.back())}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          className="h-9 w-9 items-center justify-center rounded-full bg-black/5 dark:bg-neutral-800 active:opacity-80"
        >
          <Feather name="chevron-left" size={22} color={headerIcon} />
        </Pressable>
        <Text
          className="flex-1 text-center text-[22px] font-bold text-gray-900 dark:text-white"
          numberOfLines={1}
        >
          {title}
        </Text>
        <View className="h-9 w-9" />
      </View>

      {subtitle ? (
        <Text className="mt-2 text-center text-sm text-gray-500 dark:text-gray-400">
          {subtitle}
        </Text>
      ) : null}

      {children}
    </View>
  );
}
