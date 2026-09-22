import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GoogleCalendarCard } from "../../components/settings/GoogleCalendarCard";
import { PaymentIntegrationCard } from "../../components/settings/PaymentIntegrationCard";
import { OverridePinModal } from "../../components/ui/OverridePinModal";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { SettingsAccountSkeleton } from "../../components/ui/skeleton/SettingsAccountSkeleton";
import { reopenUpdatePrompt } from "../../lib/appUpdatePrompt";
import { useAppUpdateStatus } from "../../lib/hooks/useAppUpdateCheck";
import { useProfile } from "../../lib/hooks/useProfile";
import { getToken } from "../../lib/session";
import { saveTheme } from "../../lib/theme";
import { getInstalledAppVersion } from "../../services/appUpdateService";
import {
  getOverridePinStatus,
  type OverridePinStatus,
} from "../../services/overridePinService";

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
    <View className="flex-row items-center px-5 py-4">
      <View className="w-10 h-10 rounded-xl items-center justify-center bg-[#0644C7]/10">
        <Feather name={icon} size={20} color="#0644C7" />
      </View>
      <View className="ml-3 flex-1">
        <Text className="text-sm font-medium text-gray-800 dark:text-gray-100">
          {label}
        </Text>
        {value ? (
          <Text
            className="text-xs text-gray-400 dark:text-gray-500 mt-0.5"
            numberOfLines={1}
          >
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
        className="active:bg-gray-50/50 dark:active:bg-neutral-800/50"
      >
        {content}
      </Pressable>
    );
  }
  return content;
};

const Divider = () => (
  <View className="h-px bg-gray-100 dark:bg-neutral-800/50 ml-16" />
);

const SectionTitle = ({ children }: { children: string }) => (
  <Text className="mt-6 mb-3 px-1 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
    {children}
  </Text>
);

const Settings = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, stats, loading } = useProfile();
  const { colorScheme, setColorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  // The version footer reads the installed binary, and the launch check (already
  // deduped in the service — this adds no request) supplies the published one.
  const installedVersion = getInstalledAppVersion();
  const updateStatus = useAppUpdateStatus();

  const [overridePinStatus, setOverridePinStatus] =
    useState<OverridePinStatus | null>(null);
  const [showPinModal, setShowPinModal] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    let cancelled = false;
    getOverridePinStatus(token)
      .then((status) => {
        if (!cancelled) setOverridePinStatus(status);
      })
      .catch(() => {
        if (!cancelled) setOverridePinStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleDarkMode = (enabled: boolean) => {
    const next = enabled ? "dark" : "light";
    setColorScheme(next);
    saveTheme(next);
  };

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Centered title hero, matching Edit Profile / Saved Accounts. The old
          "Settings" welcome card lived here too; its subtitle now sits under
          the header title rather than repeating the screen name twice. */}
      <ScreenHeader
        title="Settings"
        subtitle="Manage your account and preferences"
        className="pb-7"
      />

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 96,
          paddingTop: 0,
        }}
      >
        <View className="px-5 pt-0">
          {/* Account Section */}
          <SectionTitle>Account</SectionTitle>
          <View className="overflow-hidden rounded-2xl bg-white dark:bg-neutral-900 shadow-sm border border-gray-100 dark:border-neutral-800">
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
                {overridePinStatus?.canHoldPin ? (
                  <>
                    <Divider />
                    <SettingRow
                      icon="lock"
                      label="Overlap override PIN"
                      value={
                        overridePinStatus.hasPin
                          ? "Set — staff can ask you to approve an overlapping booking"
                          : "Not set — no one can ask you to approve one yet"
                      }
                      onPress={() => setShowPinModal(true)}
                      right={
                        <View
                          className="rounded-xl bg-[#0644C7]/10 px-3 py-1.5"
                          pointerEvents="none"
                        >
                          <Text className="text-xs font-semibold text-[#0644C7]">
                            {overridePinStatus.hasPin ? "Change" : "Set"}
                          </Text>
                        </View>
                      }
                    />
                  </>
                ) : null}
              </>
            )}
          </View>

          {/* Appearance Section */}
          <SectionTitle>Appearance</SectionTitle>
          <View className="overflow-hidden rounded-2xl bg-white dark:bg-neutral-900 shadow-sm border border-gray-100 dark:border-neutral-800">
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

          {/* Integrations — the web Settings page's Payment Integration and
              Google Calendar cards, reading the same endpoints. */}
          <SectionTitle>Integrations</SectionTitle>
          <View className="gap-4">
            <PaymentIntegrationCard />
            <GoogleCalendarCard />
          </View>

          {/* General Section */}
          <SectionTitle>General</SectionTitle>
          <View className="overflow-hidden rounded-2xl bg-white dark:bg-neutral-900 shadow-sm border border-gray-100 dark:border-neutral-800">
            <SettingRow
              icon="bell"
              label="Notifications"
              onPress={() => router.push("/notification/notification")}
              right={
                <View className="flex-row items-center gap-2">
                  <View className="w-5 h-5 rounded-full bg-[#0644C7]/10 items-center justify-center">
                    <Feather name="chevron-right" size={14} color="#0644C7" />
                  </View>
                </View>
              }
            />

            {updateStatus?.hasUpdate && updateStatus.apkUrl ? (
              <>
                <Divider />
                <SettingRow
                  icon="download"
                  label="App Update"
                  value={
                    updateStatus.latestVersion
                      ? `Version ${updateStatus.latestVersion} is ready to install`
                      : "A newer version is ready to install"
                  }
                  onPress={reopenUpdatePrompt}
                  right={
                    <View
                      className="rounded-xl bg-[#0644C7] px-3.5 py-2"
                      pointerEvents="none"
                    >
                      <Text className="text-xs font-semibold text-white">
                        Update
                      </Text>
                    </View>
                  }
                />
              </>
            ) : null}
          </View>

          <View className="mt-8 items-center">
            <Text className="text-xs text-gray-400 dark:text-gray-500">
              {installedVersion
                ? `Version ${installedVersion}`
                : "Version unavailable"}
            </Text>
            {updateStatus?.hasUpdate && updateStatus.latestVersion ? (
              <Text className="text-xs font-medium text-[#0644C7] mt-1">
                Version {updateStatus.latestVersion} available
              </Text>
            ) : updateStatus && !updateStatus.hasUpdate ? (
              <Text className="text-xs text-gray-300 dark:text-gray-600 mt-1">
                You&apos;re up to date
              </Text>
            ) : null}
            <Text className="text-xs text-gray-300 dark:text-gray-600 mt-1">
              © 2026 ZapZone. All rights reserved.
            </Text>
          </View>
        </View>
      </ScrollView>

      <OverridePinModal
        visible={showPinModal}
        hasPin={overridePinStatus?.hasPin ?? false}
        onCancel={() => setShowPinModal(false)}
        onSaved={() => {
          setShowPinModal(false);
          const token = getToken();
          if (token) getOverridePinStatus(token).then(setOverridePinStatus);
        }}
      />
    </View>
  );
};

export default Settings;
