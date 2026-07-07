import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
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
  icon,
  title,
  children,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  children: React.ReactNode;
}) => (
  <View className="mt-4 rounded-2xl bg-white dark:bg-neutral-900 p-5 shadow-sm border border-gray-100 dark:border-neutral-800">
    <View className="flex-row items-center gap-2 mb-3">
      <View className="w-8 h-8 rounded-xl items-center justify-center bg-[#0644C7]/10">
        <Feather name={icon} size={16} color="#0644C7" />
      </View>
      <Text className="text-sm font-semibold text-gray-900 dark:text-white">
        {title}
      </Text>
    </View>
    {children}
  </View>
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
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#eb4a4a";
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
  const role = user?.role ?? session?.role;
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
      {/* Gradient Header */}
      <View className="bg-white dark:bg-neutral-900 pt-12 pb-4 px-5 w-full relative overflow-hidden z-10 border-b border-gray-100 dark:border-neutral-800">
        <View className="flex-row items-center justify-between relative z-10">
          <Image
            source={require("../../../assets/zapzone-assests/Zap-Zone.png")}
            style={{ width: 70, height: 28 }}
            contentFit="contain"
          />

          <Text
            pointerEvents="none"
            className="absolute left-0 right-0 text-center text-xl font-bold text-gray-900 dark:text-white"
          >
            Profile
          </Text>

          <View className="flex-row items-center gap-2 ">
            <Pressable
              onPress={handleLogout}
              disabled={loggingOut}
              className="px-3 py-2 border-red-200 dark:border-red-200 border rounded-full bg-red-100 dark:bg-neutral-800 items-center justify-center flex-row active:opacity-80"
            >
              {loggingOut ? (
                <ActivityIndicator color={headerIcon} size="small" />
              ) : (
                <>
                  <Feather name="log-out" size={16} color={headerIcon} />
                  <Text className="text-xs font-medium text-red-500 dark:text-white"> Logout</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>

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
        <View className="px-5 pt-0">
          {/* Profile Header Card */}
          <View className="bg-white dark:bg-neutral-900 rounded-2xl p-6 mt-6 mb-5 shadow-sm border border-gray-100 dark:border-neutral-800 items-center">
            <View className="w-20 h-20 rounded-full bg-[#0644C7]/10 items-center justify-center">
              <Image
                source={require("../../../assets/zapzone-assests/zapzone.png")}
                style={{ width: 50, height: 50 }}
                contentFit="contain"
              />
            </View>

            <Text className="mt-3 text-xl font-bold text-gray-900 dark:text-white">
              {displayName}
            </Text>
            <Text className="mt-1 text-sm text-[#0644C7] dark:text-blue-400 font-medium">
              {formatRole(role)}
            </Text>
            {displayEmail ? (
              <Text className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                {displayEmail}
              </Text>
            ) : null}

            {/* Quick Actions */}
            <View className="flex-row gap-3 mt-4 w-full">
              <Pressable
                onPress={() => router.push("/profile/edit-profile")}
                className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-[#0644C7]/10 py-2.5 active:opacity-80"
              >
                <Feather name="edit-2" size={16} color="#0644C7" />
                <Text className="text-xs font-medium text-[#0644C7]">
                  Edit Profile
                </Text>
              </Pressable>
              <Pressable
                onPress={() => router.push("/settings/settings")}
                className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-gray-100 dark:bg-neutral-800 py-2.5 active:opacity-80"
              >
                <Feather name="settings" size={16} color="#6B7280" />
                <Text className="text-xs font-medium text-gray-600 dark:text-gray-300">
                  Settings
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Loading / error states for the fetched data */}
          {loading && !refreshing && <ProfileSkeleton />}

          {!loading && error && (
            <View className="bg-red-50 border border-red-100 rounded-2xl p-5 mb-5">
              <Text className="text-red-600 font-semibold">
                Something went wrong
              </Text>
              <Text className="text-red-500 text-sm mt-1">{error}</Text>
            </View>
          )}

          {(!loading || refreshing) && user && (
            <>
              {/* Personal Information */}
              <SectionCard icon="user" title="Personal Information">
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
                <SectionCard icon="briefcase" title="Company Details">
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
                <SectionCard icon="bar-chart-2" title="Business Overview">
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
