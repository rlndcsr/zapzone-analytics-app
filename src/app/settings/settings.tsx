import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import {
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SettingsAccountSkeleton } from "../../components/ui/skeleton/SettingsAccountSkeleton";
import { useProfile } from "../../lib/hooks/useProfile";
import { saveTheme } from "../../lib/theme";

const SettingRow = ({
  icon,
  label,
  value,
  right,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value?: string | null;
  right?: React.ReactNode;
  onPress?: () => void;
}) => {
  const content = (
    <View className="flex-row items-center px-4 py-4">
      <View className="h-9 w-9 items-center justify-center rounded-full bg-gray-100 dark:bg-neutral-800">
        <Feather name={icon} size={18} color="#0644C7" />
      </View>
      <View className="ml-3 flex-1">
        <Text className="text-base font-medium text-gray-800 dark:text-gray-100">
          {label}
        </Text>
        {value ? (
          <Text className="text-sm text-gray-500 dark:text-gray-400" numberOfLines={1}>
            {value}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        className="active:bg-gray-50 dark:active:bg-neutral-800"
      >
        {content}
      </Pressable>
    );
  }
  return content;
};

const Divider = () => (
  <View className="h-px bg-gray-100 dark:bg-neutral-800 ml-16" />
);

const SectionTitle = ({ children }: { children: string }) => (
  <Text className="mt-6 mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
    {children}
  </Text>
);

const Settings = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, stats, loading } = useProfile();
  const { colorScheme, setColorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  const toggleDarkMode = (enabled: boolean) => {
    const next = enabled ? "dark" : "light";
    setColorScheme(next);
    saveTheme(next);
  };

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header */}
      <View
        className="bg-[#0644C7] px-5 pb-4 flex-row items-center gap-3"
        style={{ paddingTop: insets.top + 12 }}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          className="h-9 w-9 items-center justify-center rounded-full bg-white/15 active:opacity-80"
        >
          <Feather name="chevron-left" size={22} color="#FFFFFF" />
        </Pressable>
        <Text className="text-xl font-bold text-white">Settings</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
      >
        {/* Account — fetched from backend */}
        <SectionTitle>Account</SectionTitle>
        <View className="overflow-hidden rounded-2xl bg-white dark:bg-neutral-900">
          {loading ? (
            <SettingsAccountSkeleton />
          ) : (
            <>
              <SettingRow
                icon="user"
                label={user?.name ?? "Account"}
                value={user?.email ?? null}
              />
              <Divider />
              <SettingRow
                icon="phone"
                label="Phone"
                value={user?.phone ?? "Not set"}
              />
              {user?.company?.company_name ? (
                <>
                  <Divider />
                  <SettingRow
                    icon="briefcase"
                    label="Company"
                    value={user.company.company_name}
                  />
                </>
              ) : null}
              {stats ? (
                <>
                  <Divider />
                  <SettingRow
                    icon="map-pin"
                    label="Locations"
                    value={`${stats.total_locations} locations • ${stats.total_users} employees`}
                  />
                </>
              ) : null}
            </>
          )}
        </View>

        {/* Appearance */}
        <SectionTitle>Appearance</SectionTitle>
        <View className="overflow-hidden rounded-2xl bg-white dark:bg-neutral-900">
          <SettingRow
            icon="moon"
            label="Dark Mode"
            value={isDark ? "On" : "Off"}
            right={
              <Switch
                value={isDark}
                onValueChange={toggleDarkMode}
                trackColor={{ false: "#D1D5DB", true: "#0644C7" }}
                thumbColor="#FFFFFF"
                ios_backgroundColor="#D1D5DB"
              />
            }
          />
        </View>

        {/* General */}
        <SectionTitle>General</SectionTitle>
        <View className="overflow-hidden rounded-2xl bg-white dark:bg-neutral-900">
          <SettingRow
            icon="bell"
            label="Notifications"
            onPress={() => router.push("/notification/notification")}
            right={<Feather name="chevron-right" size={20} color="#9CA3AF" />}
          />
        </View>
      </ScrollView>
    </View>
  );
};

export default Settings;
