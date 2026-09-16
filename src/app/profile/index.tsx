import { Feather, Ionicons } from "@expo/vector-icons";
import * as Application from "expo-application";
import { useFocusEffect, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useColorScheme } from "nativewind";
import { useCallback, useState, type ComponentProps } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// TEMP: investigation instrumentation — see docs/MAX_UPDATE_DEPTH_DEBUG_REPORT.md
import { authDebug } from "../../lib/debug/authDebug";
import { useProfile } from "../../lib/hooks/useProfile";
import { getCurrentUser } from "../../lib/session";
import { getInstalledAppVersion } from "../../services/appUpdateService";
import { signOut } from "../../services/auth";

/** Same terms the login screen links to — one canonical URL for the app. */
const TERMS_URL = "https://zap-zone.com/terms-conditions/";

const BRAND = "#0644C7";
const DANGER = "#E11D48";
const CARD_RADIUS = 20;
/**
 * The icon gutter. Fixed rather than sized by the glyph so every label starts on
 * the same vertical line — Ionicons' advance widths differ between glyphs.
 */
const ICON_COLUMN = 26;

const ROLE_LABELS: Record<string, string> = {
  company_admin: "Company Administrator",
  location_manager: "Location Manager",
  attendant: "Attendant",
};

const formatRole = (role?: string | null) =>
  role
    ? (ROLE_LABELS[role] ??
      role
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" "))
    : null;

/** Build line under the menu, e.g. "Version 1.1.5 (11)". */
const versionLine = () => {
  const version = getInstalledAppVersion();
  if (!version) return null;
  const build = Application.nativeBuildVersion;
  return build ? `Version ${version} (${build})` : `Version ${version}`;
};

type IoniconName = ComponentProps<typeof Ionicons>["name"];

/** The one surface on this screen: a soft tinted panel, no border, no shadow. */
const Panel = ({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <View
    className={`overflow-hidden bg-[#EDF2F5] dark:bg-neutral-900 ${className}`}
    style={{ borderRadius: CARD_RADIUS }}
  >
    {children}
  </View>
);

type MenuRowProps = {
  icon: IoniconName;
  label: string;
  onPress: () => void;
  /** Rules sit above every row but the first, so the group reads as one list. */
  divided?: boolean;
};

const MenuRow = ({ icon, label, onPress, divided }: MenuRowProps) => {
  const { colorScheme } = useColorScheme();
  const glyph = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  const chevron = colorScheme === "dark" ? "#6B7280" : "#4B5563";

  return (
    <View>
      {divided ? (
        <View className="mx-5 h-px bg-black/[0.07] dark:bg-white/10" />
      ) : null}
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        className="flex-row items-center px-5 py-[18px] active:opacity-60"
      >
        <View style={{ width: ICON_COLUMN }} className="items-center">
          <Ionicons name={icon} size={22} color={glyph} />
        </View>
        <Text className="ml-4 flex-1 text-[16px] text-gray-900 dark:text-white">
          {label}
        </Text>
        <Feather name="chevron-right" size={20} color={chevron} />
      </Pressable>
    </View>
  );
};

/** One of the two company counters below the menu. */
const Stat = ({ value, label }: { value: number; label: string }) => (
  <View className="flex-1 items-center py-5">
    <Text className="text-2xl font-bold" style={{ color: BRAND }}>
      {value}
    </Text>
    <Text className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">
      {label}
    </Text>
  </View>
);

const Profile = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  const { user, stats, error, refresh } = useProfile();
  const [loggingOut, setLoggingOut] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Re-fetch when returning from the edit screen so saved changes show.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  // Fall back to the cached session user so the greeting is never blank while
  // the fetch runs, or if it fails.
  const session = getCurrentUser();
  const displayName = user?.name ?? session?.name ?? "there";
  const roleLabel = formatRole(user?.role ?? session?.role);
  const version = versionLine();

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    authDebug("logout START");
    try {
      await signOut();
      authDebug("logout signOut() resolved");
    } catch (error) {
      // TEMP (investigation): a rejection here means clearSession() never ran,
      // so the session survives the "logout". Rethrown — same outcome as before.
      authDebug("logout signOut() REJECTED — session may still be live", {
        error: String(error),
      });
      throw error;
    } finally {
      authDebug('logout router.replace("/")');
      router.replace("/");
    }
  };

  return (
    <View className="flex-1 bg-white dark:bg-black">
      {/* Title bar: back on the left, the screen's name centred on the row
          itself so it stays centred whatever sits beside it. */}
      <View className="px-4 pb-2" style={{ paddingTop: insets.top + 8 }}>
        <View className="h-11 flex-row items-center">
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            className="h-11 w-11 items-center justify-center rounded-full active:opacity-50"
          >
            <Feather name="arrow-left" size={24} color={headerIcon} />
          </Pressable>
          <View
            pointerEvents="none"
            className="absolute inset-0 items-center justify-center"
          >
            <Text className="text-[18px] font-semibold text-gray-900 dark:text-white">
              Profile
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 40,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={BRAND}
            colors={[BRAND]}
            progressBackgroundColor="#FFFFFF"
          />
        }
      >
        <View className="mb-7 mt-4">
          <Text className="text-[19px] text-gray-900 dark:text-gray-200">
            Welcome,
          </Text>
          <Text
            className="mt-0.5 text-[24px] font-bold text-gray-900 dark:text-white"
            numberOfLines={2}
          >
            {displayName}
          </Text>
          {roleLabel ? (
            <Text className="mt-1 text-[13px] text-gray-500 dark:text-gray-400">
              {roleLabel}
            </Text>
          ) : null}
        </View>

        {error ? (
          <View className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 dark:border-red-900/40 dark:bg-red-900/20">
            <Text className="text-sm text-red-600 dark:text-red-400">
              {error}
            </Text>
          </View>
        ) : null}

        <Panel>
          {/* Edit Profile carries both the personal and the company fields, so
              it is the one destination behind this row. */}
          <MenuRow
            icon="person"
            label="Personal information"
            onPress={() => router.push("/profile/edit-profile")}
          />
          <MenuRow
            divided
            icon="settings"
            label="Settings"
            onPress={() => router.push("/settings/settings")}
          />
          <MenuRow
            divided
            icon="document-text"
            label="Terms and conditions"
            onPress={() => void WebBrowser.openBrowserAsync(TERMS_URL)}
          />
        </Panel>

        {/* Auto-calculated company counters — only once they have arrived, so
            the menu above never shifts under a finger on its way to a row. */}
        {stats ? (
          <Panel className="mt-4">
            <View className="flex-row">
              <Stat value={stats.total_locations} label="Locations" />
              <View className="my-4 w-px bg-black/[0.07] dark:bg-white/10" />
              <Stat value={stats.total_users} label="Employees" />
            </View>
          </Panel>
        ) : null}

        <Pressable
          onPress={handleLogout}
          disabled={loggingOut}
          accessibilityRole="button"
          accessibilityLabel="Log out"
          className="mt-4 items-center justify-center bg-[#EDF2F5] py-[18px] active:opacity-60 dark:bg-neutral-900"
          style={{ borderRadius: CARD_RADIUS }}
        >
          {loggingOut ? (
            <ActivityIndicator size="small" color={DANGER} />
          ) : (
            <Text
              className="text-[16px] font-semibold"
              style={{ color: DANGER }}
            >
              Log out
            </Text>
          )}
        </Pressable>

        {version ? (
          <Text className="mt-6 text-center text-xs text-gray-400 dark:text-gray-500">
            {version}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
};

export default Profile;
