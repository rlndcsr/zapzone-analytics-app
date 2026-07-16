import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ProfileSkeleton } from "../../components/ui/skeleton/ProfileSkeleton";
import { useProfile } from "../../lib/hooks/useProfile";
import { getCurrentUser } from "../../lib/session";
import { signOut } from "../../services/auth";
import type { CompanyDetails } from "../../services/profileService";

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
    <View className="flex-row items-start justify-between py-3 border-b border-gray-100 dark:border-neutral-800/50">
      <Text className="text-sm text-gray-400 dark:text-gray-500 flex-1 mr-3">
        {label}
      </Text>
      <Text className="text-sm font-medium text-gray-900 dark:text-white flex-[1.4] text-right">
        {display}
      </Text>
    </View>
  );
};

const SectionCard = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <View className="mt-4 rounded-3xl bg-white dark:bg-neutral-900 p-5 border border-gray-100 dark:border-neutral-800">
    <Text className="text-lg font-bold text-gray-900 dark:text-white mb-2">
      {title}
    </Text>
    {children}
  </View>
);

/** Tappable list row with a circular icon badge and a chevron. */
const MenuRow = ({
  icon,
  label,
  onPress,
  danger,
  loading,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
  loading?: boolean;
}) => (
  <Pressable
    onPress={onPress}
    disabled={loading}
    accessibilityRole="button"
    accessibilityLabel={label}
    className="flex-row items-center py-3.5 active:opacity-70"
  >
    <View
      className={`h-11 w-11 items-center justify-center rounded-full ${
        danger
          ? "bg-red-50 dark:bg-red-900/20"
          : "bg-gray-100 dark:bg-neutral-800"
      }`}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={danger ? "#EF4444" : "#111827"}
        />
      ) : (
        <Feather name={icon} size={18} color={danger ? "#EF4444" : "#111827"} />
      )}
    </View>
    <Text
      className={`ml-4 flex-1 text-[15px] font-medium ${
        danger ? "text-red-500" : "text-gray-900 dark:text-white"
      }`}
    >
      {label}
    </Text>
    <Feather name="chevron-right" size={20} color="#9CA3AF" />
  </Pressable>
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

  // Fall back to the cached session user for the header while the fetch runs
  // or if it fails, so the screen is never blank.
  const session = getCurrentUser();
  const displayName = user?.name ?? session?.name ?? "Guest";
  const displayEmail = user?.email ?? session?.email ?? null;
  const company = user?.company ?? null;

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await signOut();
    } finally {
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
            tintColor="#0644C7"
            colors={["#0644C7"]}
            progressBackgroundColor="#FFFFFF"
          />
        }
      >
        {/* Cream hero — title + edit link, then centered avatar / name / email */}
        <View
          className="bg-[#0644C7]/5 dark:bg-neutral-900 rounded-b-[32px] px-6 pb-9"
          style={{ paddingTop: insets.top + 10 }}
        >
         

          <View className="items-center mt-6">
            <View className="h-28 w-28 rounded-full bg-white dark:bg-neutral-800 items-center justify-center overflow-hidden border border-black/5 dark:border-white/10">
              <Image
                source={require("../../../assets/zapzone-assests/zapzone.png")}
                style={{ width: 68, height: 68 }}
                contentFit="contain"
              />
            </View>
            <Text className="mt-4 text-[22px] font-bold text-gray-900 dark:text-white">
              {displayName}
            </Text>
            {displayEmail ? (
              <Text className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {displayEmail}
              </Text>
            ) : null}
          </View>
        </View>

        <View className="px-5">
          {/* Account — menu-style list of actions */}
          <View className="mt-5 rounded-3xl bg-white dark:bg-neutral-900 px-5 py-2 border border-gray-100 dark:border-neutral-800">
            <Text className="text-lg font-bold text-gray-900 dark:text-white mt-3 mb-1">
              Account
            </Text>
            <MenuRow
              icon="edit-2"
              label="Edit Profile"
              onPress={() => router.push("/profile/edit-profile")}
            />
            <View className="h-px bg-gray-100 dark:bg-neutral-800/60 ml-14" />
            <MenuRow
              icon="settings"
              label="Settings"
              onPress={() => router.push("/settings/settings")}
            />
            <View className="h-px bg-gray-100 dark:bg-neutral-800/60 ml-14" />
            <MenuRow
              icon="log-out"
              label="Logout"
              onPress={handleLogout}
              loading={loggingOut}
              danger
            />
          </View>

          {/* Loading / error states for the fetched data */}
          {loading && !refreshing && <ProfileSkeleton />}

          {!loading && error && (
            <View className="mt-4 bg-red-50 border border-red-100 rounded-3xl p-5">
              <Text className="text-red-600 font-semibold">
                Something went wrong
              </Text>
              <Text className="text-red-500 text-sm mt-1">{error}</Text>
            </View>
          )}

          {(!loading || refreshing) && user && (
            <>
              {/* Personal Information */}
              <SectionCard title="Personal Information">
                <InfoRow label="First Name" value={user.first_name} />
                <InfoRow label="Last Name" value={user.last_name} />
                <InfoRow label="Email Address" value={user.email} />
                <InfoRow label="Phone Number" value={user.phone} />
                <InfoRow label="Position" value={user.position} />
                <InfoRow label="Employee ID" value={user.employee_id} />
                <InfoRow label="Department" value={user.department} />
                <InfoRow label="Role" value={formatRole(user.role)} />
              </SectionCard>

              {/* Company Details */}
              {company && (
                <SectionCard title="Company Details">
                  <InfoRow label="Company Name" value={company.company_name} />
                  <InfoRow label="Company Email" value={company.email} />
                  <InfoRow label="Company Phone" value={company.phone} />
                  <InfoRow label="Website" value={company.website} />
                  <InfoRow label="Industry" value={company.industry} />
                  <InfoRow label="Company Size" value={company.company_size} />
                  <InfoRow label="Address" value={composeAddress(company)} />
                </SectionCard>
              )}

              {/* Business Overview */}
              {stats && (
                <SectionCard title="Business Overview">
                  <Text className="text-xs text-gray-400 dark:text-gray-500 mb-3">
                    Automatically calculated from your companys locations and
                    employees.
                  </Text>
                  <View className="flex-row gap-3">
                    <View className="flex-1 rounded-2xl bg-[#0644C7]/5 dark:bg-[#0644C7]/10 py-5 items-center">
                      <Text className="text-2xl font-bold text-[#0644C7]">
                        {stats.total_locations}
                      </Text>
                      <Text className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                        Locations
                      </Text>
                    </View>
                    <View className="flex-1 rounded-2xl bg-[#0644C7]/5 dark:bg-[#0644C7]/10 py-5 items-center">
                      <Text className="text-2xl font-bold text-[#0644C7]">
                        {stats.total_users}
                      </Text>
                      <Text className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                        Employees
                      </Text>
                    </View>
                  </View>
                </SectionCard>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default Profile;
