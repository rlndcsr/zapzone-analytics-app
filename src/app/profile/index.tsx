import { Feather, Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { setStatusBarStyle } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import { useColorScheme } from "nativewind";
import { useCallback, useState, type ComponentProps } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandLogo } from "../../components/ui/BrandLogo";
import { mediaUrl } from "../../lib/api";
import { useLocationOptions } from "../../lib/hooks/useLocationOptions";
import { useLogout } from "../../lib/hooks/useLogout";
import { useProfile } from "../../lib/hooks/useProfile";
import {
  getCurrentUser,
  getToken,
  useCurrentUserRole,
} from "../../lib/session";
import { getAppVersionLabel } from "../../services/appUpdateService";
import { updateProfilePicture } from "../../services/profileService";

/** Same terms the login screen links to — one canonical URL for the app. */
const TERMS_URL = "https://zap-zone.com/terms-conditions/";

const BRAND = "#0644C7";
/** The lighter blue the web draws its Business Metrics counters in. */
const STAT_BLUE = "#3B82F6";
const DANGER = "#E11D48";
const CARD_RADIUS = 20;
const HERO_RADIUS = 32;
/** The screen gutter, shared by the hero and the menu below it. */
const SCREEN_PADDING_X = 20;
/** Breathing room above the title bar, measured from the status bar. */
const HERO_TOP_GAP = 8;
/** Air under the greeting, before the hero's rounded bottom edge. */
const HERO_BOTTOM_GAP = 28;
/** Gap between the hero and the menu. */
const CONTENT_TOP_GAP = 24;
const AVATAR_SIZE = 72;
/** The camera badge that overlaps the avatar's bottom-right corner. */
const AVATAR_BADGE = 26;
/** The endpoint caps the encoded string at ~27MB, i.e. a 20MB image. */
const MAX_IMAGE_BASE64 = 27_000_000;
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

type IoniconName = ComponentProps<typeof Ionicons>["name"];

/** The one surface below the hero: a soft tinted panel, no border, no shadow. */
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

/** A heading + explainer above a section, matching the web admin's profile. */
const SectionHeading = ({
  icon,
  title,
  blurb,
}: {
  icon: IoniconName;
  title: string;
  blurb: string;
}) => (
  <>
    <View className="flex-row items-center px-1">
      <Ionicons name={icon} size={16} color={BRAND} />
      <Text className="ml-2 text-[15px] font-bold text-gray-900 dark:text-white">
        {title}
      </Text>
    </View>
    <Text className="mb-3 mt-1 px-1 text-xs leading-4 text-gray-500 dark:text-gray-400">
      {blurb}
    </Text>
  </>
);

/**
 * Every location's own logo, the way the web admin's profile page lists them
 * (`LocationLogosSection`, directly above its Business Metrics). Read-only
 * here: this is the roster, not the editor.
 *
 * Sourced from the same lightweight `/api/mobile/locations` list the rest of the
 * app's location pickers use, so it lists the *active* locations — the counter
 * below counts every location, active or not, and the two can differ.
 */
const LocationLogos = ({
  companyLogoPath,
}: {
  /** Shown for a location with no logo of its own, matching the web. */
  companyLogoPath: string | null;
}) => {
  const { locations, loading } = useLocationOptions();

  if (loading) {
    return (
      <Panel className="mt-4">
        <View className="items-center py-8">
          <ActivityIndicator size="small" color={BRAND} />
        </View>
      </Panel>
    );
  }

  if (locations.length === 0) return null;

  return (
    <View className="mt-6">
      <SectionHeading
        icon="location"
        title="Location Logos"
        blurb="Each location shows its own logo. A location with no logo of its own falls back to the company logo."
      />

      <Panel>
        {locations.map((location, index) => (
          <View key={location.id}>
            {index > 0 ? (
              <View className="mx-5 h-px bg-black/[0.07] dark:bg-white/10" />
            ) : null}
            <View className="flex-row items-center px-5 py-3.5">
              {/* White plate: most marks are transparent PNGs drawn in dark
                  ink, which vanish straight into the panel without one. */}
              <View className="rounded-xl bg-white p-1.5">
                <BrandLogo
                  src={location.logoPath ?? companyLogoPath}
                  size="sm"
                />
              </View>
              <Text
                numberOfLines={2}
                className="ml-4 flex-1 text-[14px] text-gray-900 dark:text-white"
              >
                {location.name}
              </Text>
            </View>
          </View>
        ))}
      </Panel>
    </View>
  );
};

/** One of the two company counters — the web's tile, at phone width. */
const StatTile = ({ value, label }: { value: number; label: string }) => (
  <View className="flex-1 items-center rounded-2xl bg-blue-50 py-6 dark:bg-blue-900/20">
    <Text className="text-[28px] font-bold" style={{ color: STAT_BLUE }}>
      {value}
    </Text>
    <Text className="mt-1 text-xs font-medium text-gray-600 dark:text-gray-400">
      {label}
    </Text>
  </View>
);

const Profile = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { user, stats, error, refresh } = useProfile();
  const { loggingOut, logout } = useLogout();
  const isCompanyAdmin = useCurrentUserRole() === "company_admin";
  const [refreshing, setRefreshing] = useState(false);
  const [savingPhoto, setSavingPhoto] = useState(false);

  // Re-fetch when returning from the edit screen so saved changes show. The
  // status bar goes light for the blue hero and back to `auto` on the way out.
  useFocusEffect(
    useCallback(() => {
      refresh();
      setStatusBarStyle("light", true);
      return () => setStatusBarStyle("auto", true);
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
  const avatarUri = mediaUrl(user?.profile_path);
  const company = user?.company ?? null;
  const version = getAppVersionLabel();

  /**
   * Pick a new avatar and send it straight up — the same base64 data-URI shape
   * the company logo uses, on the user's own `update-profile-path` endpoint.
   * There is no Save button on this screen, so the pick is the commit.
   */
  const changePhoto = async () => {
    if (savingPhoto) return;

    const token = getToken();
    const userId = user?.id ?? session?.id;
    if (!token || !userId) {
      Alert.alert("Not signed in", "Please log in again.");
      return;
    }

    let dataUri: string;
    try {
      const ImagePicker = await import("expo-image-picker");
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Permission needed",
          "Allow photo library access to choose a picture.",
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        base64: true,
        quality: 0.8,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (result.canceled) return;

      const asset = result.assets?.[0];
      if (!asset?.base64) return;
      if (asset.base64.length > MAX_IMAGE_BASE64) {
        Alert.alert("Image too large", "Please choose an image under 20MB.");
        return;
      }
      dataUri = `data:${asset.mimeType ?? "image/jpeg"};base64,${asset.base64}`;
    } catch {
      Alert.alert("Image error", "Could not open the image picker.");
      return;
    }

    setSavingPhoto(true);
    try {
      await updateProfilePicture(userId, token, dataUri);
      // Re-read rather than trusting the response: `useProfile` owns this
      // screen's copy of the user, and the avatar is read off it.
      await refresh();
    } catch (err) {
      Alert.alert(
        "Upload failed",
        err instanceof Error ? err.message : "Could not update your picture.",
      );
    } finally {
      setSavingPhoto(false);
    }
  };

  return (
    <View className="flex-1 bg-white dark:bg-black">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
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
        {/* Blue hero: the title bar, then the avatar with the greeting beside
            it. Tapping the avatar picks a new one — the badge says so. */}
        <View
          className="overflow-hidden"
          style={{
            backgroundColor: BRAND,
            borderBottomLeftRadius: HERO_RADIUS,
            borderBottomRightRadius: HERO_RADIUS,
            paddingHorizontal: SCREEN_PADDING_X,
            paddingTop: insets.top + HERO_TOP_GAP,
            paddingBottom: HERO_BOTTOM_GAP,
          }}
        >
          {/* The title is centred on the row itself, so the back button on one
              side cannot pull it off centre. */}
          <View className="h-11 flex-row items-center">
            <Pressable
              onPress={() => router.back()}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              className="-ml-2 h-11 w-11 items-center justify-center rounded-full active:opacity-50"
            >
              <Feather name="arrow-left" size={24} color="#FFFFFF" />
            </Pressable>
            <View
              pointerEvents="none"
              className="absolute inset-0 items-center justify-center"
            >
              <Text className="text-[18px] font-semibold text-white">
                Profile
              </Text>
            </View>
          </View>

          <View className="mt-5 flex-row items-center">
            <Pressable
              onPress={() => void changePhoto()}
              disabled={savingPhoto}
              accessibilityRole="button"
              accessibilityLabel="Change profile picture"
              className="active:opacity-80"
              style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
            >
              <View
                className="items-center justify-center overflow-hidden"
                style={{
                  width: AVATAR_SIZE,
                  height: AVATAR_SIZE,
                  borderRadius: AVATAR_SIZE / 2,
                  backgroundColor: "rgba(255,255,255,0.2)",
                }}
              >
                {avatarUri ? (
                  <Image
                    source={{ uri: avatarUri }}
                    style={{ width: "100%", height: "100%" }}
                    contentFit="contain"
                    accessibilityRole="image"
                    accessibilityLabel="Profile picture"
                  />
                ) : (
                  <Ionicons name="person" size={34} color="#FFFFFF" />
                )}
              </View>

              {savingPhoto ? (
                <View
                  className="absolute items-center justify-center"
                  style={{
                    width: AVATAR_SIZE,
                    height: AVATAR_SIZE,
                    borderRadius: AVATAR_SIZE / 2,
                    backgroundColor: "rgba(0,0,0,0.35)",
                  }}
                >
                  <ActivityIndicator size="small" color="#FFFFFF" />
                </View>
              ) : (
                <View
                  className="absolute bottom-0 right-0 items-center justify-center border-2 border-white bg-white"
                  style={{
                    width: AVATAR_BADGE,
                    height: AVATAR_BADGE,
                    borderRadius: AVATAR_BADGE / 2,
                  }}
                >
                  <Feather name="camera" size={12} color={BRAND} />
                </View>
              )}
            </Pressable>

            <View className="ml-4 flex-1">
              <Text className="text-[15px] text-white/80">Welcome,</Text>
              <Text
                className="mt-0.5 text-[22px] font-bold text-white"
                numberOfLines={2}
              >
                {displayName}
              </Text>
              {roleLabel ? (
                <Text className="mt-1 text-[12px] text-white/70">
                  {roleLabel}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        <View
          style={{
            paddingHorizontal: SCREEN_PADDING_X,
            paddingTop: CONTENT_TOP_GAP,
          }}
        >
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

          {/* Company-admin only, as on the web — a manager has one location and
              no say over any other's branding. */}
          {isCompanyAdmin ? (
            <LocationLogos companyLogoPath={company?.logo_path ?? null} />
          ) : null}

          {/* Only once the counts have arrived, so the menu above never shifts
              under a finger on its way to a row. `total_employees` excludes
              company admins — the same rule the web applies, served by the API
              so both clients show one number; `total_users` is the fallback for
              a backend that predates the field. */}
          {stats ? (
            <View className="mt-6">
              <SectionHeading
                icon="people"
                title="Business Metrics"
                blurb="These metrics are automatically calculated based on your company's locations and employees."
              />
              <View className="flex-row gap-3">
                <StatTile
                  value={stats.total_locations}
                  label="Total Locations"
                />
                <StatTile
                  value={stats.total_employees ?? stats.total_users}
                  label="Total Employees"
                />
              </View>
            </View>
          ) : null}

          <Pressable
            onPress={() => void logout()}
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
        </View>
      </ScrollView>
    </View>
  );
};

export default Profile;
