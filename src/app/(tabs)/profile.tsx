import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { setStatusBarStyle } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ProfileSkeleton } from "../../components/ui/skeleton/ProfileSkeleton";
import { useSavedAccounts } from "../../lib/accounts/savedAccountsStore";
import { mediaUrl } from "../../lib/api";
// TEMP: investigation instrumentation — see docs/MAX_UPDATE_DEPTH_DEBUG_REPORT.md
import { authDebug } from "../../lib/debug/authDebug";
import { useProfile } from "../../lib/hooks/useProfile";
import { getCurrentUser } from "../../lib/session";
import { signOut } from "../../services/auth";
import type { CompanyDetails } from "../../services/profileService";

const BRAND = "#0644C7";
const BADGE_COLOR = "#3B82F6";
const HERO_RADIUS = 36;
const HERO_PADDING_X = 24;
/**
 * Space under the role pill. The first card is pulled up into it, so this has to
 * stay comfortably larger than CARD_OVERLAP or the card lands on the pill — and
 * it is applied as a style rather than a padding class for the same reason the
 * avatar is sized in numbers: nothing below it can absorb the mistake.
 */
const HERO_PADDING_BOTTOM = 52;
/** How far the first card is pulled up over the hero's rounded bottom. */
const CARD_OVERLAP = 20;
const CARD_GAP = 16;
const CONTENT_PADDING_X = 20;
const AVATAR_SIZE = 104;
/** The translucent ring around the avatar — 4pt of it shows on every side. */
const AVATAR_RING = AVATAR_SIZE + 8;
const CHIP_SIZE = 40;

const ACCORDION_TIMING = {
  duration: 260,
  easing: Easing.out(Easing.cubic),
} as const;

const CARD_SHADOW = {
  shadowColor: "#0F172A",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.06,
  shadowRadius: 14,
  elevation: 2,
} as const;

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
    : "—";

/**
 * Row icon tints. All cool — blues through indigo, sky and cyan — so the list
 * has the reference design's per-row colour variety without leaving the brand
 * family. Red stays reserved for the destructive row.
 */
const TINTS = {
  brand: { chip: "bg-blue-50 dark:bg-blue-900/30", icon: "#2563EB" },
  indigo: { chip: "bg-indigo-50 dark:bg-indigo-900/30", icon: "#4F46E5" },
  sky: { chip: "bg-sky-50 dark:bg-sky-900/30", icon: "#0284C7" },
  cyan: { chip: "bg-cyan-50 dark:bg-cyan-900/30", icon: "#0891B2" },
  danger: { chip: "bg-red-50 dark:bg-red-900/20", icon: "#EF4444" },
} as const;

type TintName = keyof typeof TINTS;

/** A single label/value line; hidden when the value is empty. */
const InfoRow = ({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) => {
  const display =
    value === null || value === undefined || value === "" ? "—" : String(value);
  return (
    <View className="flex-row items-start justify-between border-b border-gray-100 py-3 dark:border-neutral-800/50">
      <Text className="mr-3 flex-1 text-sm text-gray-400 dark:text-gray-500">
        {label}
      </Text>
      <Text className="flex-[1.4] text-right text-sm font-medium text-gray-900 dark:text-white">
        {display}
      </Text>
    </View>
  );
};

/** The white cards that overlap the hero: rounded, hairline border, soft lift. */
const Card = ({
  title,
  padded,
  children,
}: {
  title: string;
  /** `p-5` for content cards; row lists use the tighter `px-5 py-2`. */
  padded?: boolean;
  children: React.ReactNode;
}) => (
  <View
    className={`rounded-3xl border border-gray-100 bg-white dark:border-neutral-800 dark:bg-neutral-900 ${padded ? "p-5" : "px-5 py-2"}`}
    style={CARD_SHADOW}
  >
    <Text
      className={`text-[15px] font-bold text-gray-900 dark:text-white ${padded ? "mb-3" : "mb-1 mt-3"}`}
    >
      {title}
    </Text>
    {children}
  </View>
);

const RowChip = ({
  icon,
  tint,
  loading,
}: {
  icon: keyof typeof Feather.glyphMap;
  tint: TintName;
  loading?: boolean;
}) => (
  <View
    className={`items-center justify-center rounded-2xl ${TINTS[tint].chip}`}
    style={{ width: CHIP_SIZE, height: CHIP_SIZE }}
  >
    {loading ? (
      <ActivityIndicator size="small" color={TINTS[tint].icon} />
    ) : (
      <Feather name={icon} size={18} color={TINTS[tint].icon} />
    )}
  </View>
);

/** Tappable list row: tinted icon chip, label, chevron. */
const MenuRow = ({
  icon,
  label,
  tint = "brand",
  onPress,
  loading,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  tint?: TintName;
  onPress: () => void;
  loading?: boolean;
}) => (
  <Pressable
    onPress={onPress}
    disabled={loading}
    accessibilityRole="button"
    accessibilityLabel={label}
    className="flex-row items-center py-3.5 active:opacity-70"
  >
    <RowChip icon={icon} tint={tint} loading={loading} />
    <Text
      className={`ml-4 flex-1 text-[15px] font-medium ${
        tint === "danger" ? "text-red-500" : "text-gray-900 dark:text-white"
      }`}
    >
      {label}
    </Text>
    <Feather name="chevron-right" size={20} color="#9CA3AF" />
  </Pressable>
);

/**
 * The same row, but it opens its own detail underneath instead of navigating.
 *
 * The body is always laid out — it is only clipped by the wrapper's animated
 * height — so `onLayout` reports its true height even while closed, and a later
 * fetch that lengthens the content re-measures without any extra work.
 */
const ExpandableRow = ({
  icon,
  label,
  tint = "brand",
  children,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  tint?: TintName;
  children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  const [bodyHeight, setBodyHeight] = useState(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, ACCORDION_TIMING);
  }, [open, progress]);

  const bodyStyle = useAnimatedStyle(() => ({
    height: bodyHeight * progress.value,
    opacity: progress.value,
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.value * 90}deg` }],
  }));

  return (
    <View>
      <Pressable
        onPress={() => setOpen((prev) => !prev)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        className="flex-row items-center py-3.5 active:opacity-70"
      >
        <RowChip icon={icon} tint={tint} />
        <Text className="ml-4 flex-1 text-[15px] font-medium text-gray-900 dark:text-white">
          {label}
        </Text>
        <Animated.View style={chevronStyle}>
          <Feather name="chevron-right" size={20} color="#9CA3AF" />
        </Animated.View>
      </Pressable>

      <Animated.View
        // Clipped-but-laid-out content is still in the accessibility tree, so it
        // has to be taken out of it explicitly while the row is closed.
        accessibilityElementsHidden={!open}
        importantForAccessibility={open ? "auto" : "no-hide-descendants"}
        style={[{ overflow: "hidden" }, bodyStyle]}
      >
        <View
          onLayout={(e) => setBodyHeight(e.nativeEvent.layout.height)}
          className="pb-2"
        >
          {children}
        </View>
      </Animated.View>
    </View>
  );
};

/**
 * The hero's background shapes. A circle with one square corner reads as a leaf,
 * and four of them at different sizes and turns give the flat brand blue some
 * depth without needing a gradient.
 */
const HeroDecor = () => (
  <>
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: -44,
        left: -34,
        width: 172,
        height: 172,
        borderRadius: 86,
        borderTopLeftRadius: 0,
        backgroundColor: "rgba(255,255,255,0.07)",
        transform: [{ rotate: "12deg" }],
      }}
    />
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 24,
        right: -48,
        width: 136,
        height: 136,
        borderRadius: 68,
        borderBottomRightRadius: 0,
        backgroundColor: "rgba(255,255,255,0.06)",
      }}
    />
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        bottom: -26,
        left: 44,
        width: 96,
        height: 96,
        borderRadius: 48,
        borderTopRightRadius: 0,
        backgroundColor: "rgba(255,255,255,0.05)",
        transform: [{ rotate: "-18deg" }],
      }}
    />
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        bottom: 34,
        right: 26,
        width: 58,
        height: 58,
        borderRadius: 29,
        borderBottomLeftRadius: 0,
        backgroundColor: "rgba(255,255,255,0.09)",
      }}
    />
  </>
);

const composeAddress = (company: CompanyDetails) =>
  [
    company.address,
    company.city,
    company.state,
    company.zip_code,
    company.country,
  ]
    .filter(Boolean)
    .join(", ");

const Profile = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, stats, loading, error, refresh } = useProfile();
  const savedAccounts = useSavedAccounts();
  const [loggingOut, setLoggingOut] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Re-fetch when returning from the edit screen so saved changes show. The
  // status bar goes light for the blue hero and back to `auto` on the way out —
  // the other tabs are on a light background and stay mounted behind this one.
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

  // Fall back to the cached session user for the header while the fetch runs
  // or if it fails, so the screen is never blank.
  const session = getCurrentUser();
  const displayName = user?.name ?? session?.name ?? "Guest";
  const displayEmail = user?.email ?? session?.email ?? null;
  const company = user?.company ?? null;
  const avatarUri = mediaUrl(user?.profile_path);

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
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 96,
          paddingTop: 0,
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
        {/* Brand hero — title + menu, then the avatar, name and role */}
        <View
          className="overflow-hidden"
          style={{
            backgroundColor: BRAND,
            borderBottomLeftRadius: HERO_RADIUS,
            borderBottomRightRadius: HERO_RADIUS,
            paddingHorizontal: HERO_PADDING_X,
            paddingTop: insets.top + 10,
            paddingBottom: HERO_PADDING_BOTTOM,
          }}
        >
          <HeroDecor />

          <View className="flex-row items-center justify-between">
            <Text className="text-[22px] font-bold text-white">Profile</Text>
            <Pressable
              onPress={() => router.push("/settings/settings")}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Settings"
              className="h-10 w-10 items-center justify-center rounded-full border active:opacity-70"
              style={{ borderColor: "rgba(255,255,255,0.35)" }}
            >
              <Feather name="more-vertical" size={18} color="#FFFFFF" />
            </Pressable>
          </View>

          <View className="mt-5 items-center">
            {/* Every size here is an explicit number, and the ring's box is
                sized rather than padded: the avatar is the one element on the
                screen whose height nothing else constrains, so a class that does
                not resolve leaves it free to stretch the whole column. */}
            <View
              style={{
                width: AVATAR_RING,
                height: AVATAR_RING,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View
                style={{
                  width: AVATAR_RING,
                  height: AVATAR_RING,
                  borderRadius: AVATAR_RING / 2,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(255,255,255,0.25)",
                }}
              >
                <View
                  className="bg-white dark:bg-neutral-800"
                  style={{
                    width: AVATAR_SIZE,
                    height: AVATAR_SIZE,
                    borderRadius: AVATAR_SIZE / 2,
                    overflow: "hidden",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {avatarUri ? (
                    <Image
                      source={{ uri: avatarUri }}
                      style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
                      contentFit="cover"
                    />
                  ) : (
                    <Image
                      source={require("../../../assets/zapzone-assests/zapzone.png")}
                      style={{ width: 64, height: 64 }}
                      contentFit="contain"
                    />
                  )}
                </View>
              </View>

              <Pressable
                onPress={() => router.push("/profile/edit-profile")}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Edit profile"
                className="absolute bottom-0 right-0 active:opacity-80"
              >
                <View
                  className="h-9 w-9 items-center justify-center rounded-full border-2 border-white"
                  style={{ backgroundColor: BADGE_COLOR }}
                >
                  <Feather name="edit-2" size={14} color="#FFFFFF" />
                </View>
              </Pressable>
            </View>

            <Text className="mt-4 text-[22px] font-bold text-white">
              {displayName}
            </Text>
            {displayEmail ? (
              <Text className="mt-1 text-[13px] text-white/80">
                {displayEmail}
              </Text>
            ) : null}
            {user?.role ? (
              <View
                className="mt-3 rounded-full px-3 py-1"
                style={{ backgroundColor: "rgba(255,255,255,0.18)" }}
              >
                <Text className="text-[11px] font-semibold text-white">
                  {formatRole(user.role)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* One gap for the whole stack instead of a top margin per card: the
            cards are pulled up over the hero by exactly CARD_OVERLAP, and a
            margin on the first one would quietly eat into that. */}
        <View
          style={{
            paddingHorizontal: CONTENT_PADDING_X,
            marginTop: -CARD_OVERLAP,
            gap: CARD_GAP,
          }}
        >
          {/* Account Overview — navigation only, so it renders while data loads */}
          <Card title="Account Overview">
            <MenuRow
              icon="user"
              label="My Profile"
              tint="brand"
              onPress={() => router.push("/profile/edit-profile")}
            />
            <View className="ml-14 h-px bg-gray-100 dark:bg-neutral-800/60" />
            <MenuRow
              icon="settings"
              label="Settings"
              tint="indigo"
              onPress={() => router.push("/settings/settings")}
            />
            <View className="ml-14 h-px bg-gray-100 dark:bg-neutral-800/60" />
            <MenuRow
              icon="users"
              label={
                savedAccounts.length > 1
                  ? `Saved Accounts (${savedAccounts.length})`
                  : "Saved Accounts"
              }
              tint="sky"
              onPress={() => router.push("/profile/saved-accounts")}
            />
          </Card>

          {/* Loading / error states for the fetched data */}
          {loading && !refreshing && <ProfileSkeleton />}

          {!loading && error && (
            <View
              className="rounded-3xl border border-red-100 bg-red-50 p-5"
              style={CARD_SHADOW}
            >
              <Text className="font-semibold text-red-600">
                Something went wrong
              </Text>
              <Text className="mt-1 text-sm text-red-500">{error}</Text>
            </View>
          )}

          {(!loading || refreshing) && user && (
            <>
              {/* Company Information — both detail sets fold away behind their
                  own row, so the screen opens as a short menu rather than two
                  screens of label/value pairs. */}
              <Card title="Company Information">
                <ExpandableRow
                  icon="user"
                  label="Personal Information"
                  tint="cyan"
                >
                  <InfoRow label="First Name" value={user.first_name} />
                  <InfoRow label="Last Name" value={user.last_name} />
                  <InfoRow label="Email Address" value={user.email} />
                  <InfoRow label="Phone Number" value={user.phone} />
                  <InfoRow label="Position" value={user.position} />
                  <InfoRow label="Employee ID" value={user.employee_id} />
                  <InfoRow label="Department" value={user.department} />
                  <InfoRow label="Role" value={formatRole(user.role)} />
                </ExpandableRow>

                {company ? (
                  <>
                    <View className="ml-14 h-px bg-gray-100 dark:bg-neutral-800/60" />
                    <ExpandableRow
                      icon="briefcase"
                      label="Company Details"
                      tint="indigo"
                    >
                      <InfoRow
                        label="Company Name"
                        value={company.company_name}
                      />
                      <InfoRow label="Company Email" value={company.email} />
                      <InfoRow label="Company Phone" value={company.phone} />
                      <InfoRow label="Website" value={company.website} />
                      <InfoRow label="Industry" value={company.industry} />
                      <InfoRow
                        label="Company Size"
                        value={company.company_size}
                      />
                      <InfoRow
                        label="Address"
                        value={composeAddress(company)}
                      />
                    </ExpandableRow>
                  </>
                ) : null}
              </Card>

              {/* Business Overview */}
              {stats && (
                <Card title="Business Overview" padded>
                  <Text className="mb-3 text-xs text-gray-400 dark:text-gray-500">
                    Automatically calculated from your company&apos;s locations
                    and employees.
                  </Text>
                  <View className="flex-row gap-3">
                    <View className="flex-1 items-center rounded-2xl bg-[#0644C7]/5 py-5 dark:bg-[#0644C7]/10">
                      <Text className="text-2xl font-bold text-[#0644C7]">
                        {stats.total_locations}
                      </Text>
                      <Text className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                        Locations
                      </Text>
                    </View>
                    <View className="flex-1 items-center rounded-2xl bg-[#0644C7]/5 py-5 dark:bg-[#0644C7]/10">
                      <Text className="text-2xl font-bold text-[#0644C7]">
                        {stats.total_users}
                      </Text>
                      <Text className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                        Employees
                      </Text>
                    </View>
                  </View>
                </Card>
              )}
            </>
          )}

          {/* Logout is its own card rather than a row in a titled list: it is
              the one destructive action on the screen. */}
          <Pressable
            onPress={handleLogout}
            disabled={loggingOut}
            accessibilityRole="button"
            accessibilityLabel="Logout"
            className="flex-row items-center rounded-3xl border border-gray-100 bg-white px-5 py-4 active:opacity-70 dark:border-neutral-800 dark:bg-neutral-900"
            style={CARD_SHADOW}
          >
            <RowChip icon="log-out" tint="danger" loading={loggingOut} />
            <Text className="ml-4 flex-1 text-[15px] font-semibold text-red-500">
              Logout
            </Text>
            <Feather name="chevron-right" size={20} color="#9CA3AF" />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
};

export default Profile;
