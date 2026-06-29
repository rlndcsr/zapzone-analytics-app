import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
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
    value === null || value === undefined || value === ""
      ? "—"
      : String(value);
  return (
    <View className="flex-row items-start justify-between py-2.5 border-b border-gray-100 dark:border-neutral-800">
      <Text className="text-sm text-gray-500 dark:text-gray-400 flex-1 mr-3">
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
  <View className="mt-4 rounded-2xl bg-white dark:bg-neutral-900 p-4">
    <View className="flex-row items-center gap-2 mb-2">
      <View className="h-8 w-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/40">
        <Feather name={icon} size={16} color="#0644C7" />
      </View>
      <Text className="text-base font-bold text-gray-900 dark:text-white">
        {title}
      </Text>
    </View>
    {children}
  </View>
);

const composeAddress = (company: CompanyDetails) =>
  [company.address, company.city, company.state, company.zip_code, company.country]
    .filter(Boolean)
    .join(", ");

const Profile = () => {
  const router = useRouter();
  const { user, stats, loading, error, refresh } = useProfile();
  const [loggingOut, setLoggingOut] = useState(false);

  // Re-fetch when returning from the edit screen so saved changes show.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  // Fall back to the cached session user for the header while the fetch runs
  // or if it fails, so the screen is never blank.
  const session = getCurrentUser();
  const displayName = user?.name ?? session?.name ?? "Guest";
  const displayEmail = user?.email ?? session?.email ?? null;
  const role = user?.role ?? session?.role;
  const company = user?.company ?? null;

  const initials =
    displayName
      ?.split(" ")
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() ?? "";

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
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* Header card */}
        <View className="rounded-b-[32px] bg-[#0644C7] px-6 pb-6 pt-14">
          <View className="items-center">
            <View className="h-24 w-24 items-center justify-center rounded-full border-2 border-white/30 bg-neutral-700">
              <Text className="text-2xl font-bold text-white">{initials}</Text>
            </View>

            <Text className="mt-3 text-xl font-bold text-white">
              {displayName}
            </Text>
            <Text className="mt-1 text-sm text-blue-100">
              {formatRole(role)}
            </Text>
            {displayEmail ? (
              <Text className="mt-0.5 text-sm text-blue-200">
                {displayEmail}
              </Text>
            ) : null}
          </View>

          {/* Notification quick action */}
          <Pressable
            onPress={() => router.push("/notification/notification")}
            accessibilityRole="button"
            accessibilityLabel="Notification"
            className="mt-6 flex-row items-center justify-center gap-2 rounded-2xl bg-white/10 py-4 active:opacity-80"
          >
            <Feather name="bell" size={18} color="#FFFFFF" />
            <Text className="text-sm font-medium text-white">Notification</Text>
          </Pressable>
        </View>

        <View className="px-4">
          {/* Loading / error states for the fetched data */}
          {loading && (
            <View className="mt-6 items-center">
              <ActivityIndicator color="#0644C7" />
            </View>
          )}

          {!loading && error && (
            <View className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
              <Text className="font-semibold text-red-700">
                Couldn’t load profile
              </Text>
              <Text className="text-sm text-red-600">{error}</Text>
            </View>
          )}

          {!loading && user && (
            <>
              {/* Personal Information */}
              <SectionCard icon="user" title="Personal Information">
                <InfoRow label="First Name" value={user.first_name} />
                <InfoRow label="Last Name" value={user.last_name} />
                <InfoRow label="Email Address" value={user.email} />
                <InfoRow label="Phone Number" value={user.phone} />
                <InfoRow label="Position / Title" value={user.position} />
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
                  <Text className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                    Automatically calculated from your company’s locations and
                    employees.
                  </Text>
                  <View className="flex-row gap-3">
                    <View className="flex-1 items-center rounded-2xl bg-blue-50 dark:bg-blue-900/30 py-5">
                      <Text className="text-3xl font-bold text-[#0644C7] dark:text-blue-300">
                        {stats.total_locations}
                      </Text>
                      <Text className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                        Total Locations
                      </Text>
                    </View>
                    <View className="flex-1 items-center rounded-2xl bg-blue-50 dark:bg-blue-900/30 py-5">
                      <Text className="text-3xl font-bold text-[#0644C7] dark:text-blue-300">
                        {stats.total_users}
                      </Text>
                      <Text className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                        Total Employees
                      </Text>
                    </View>
                  </View>
                </SectionCard>
              )}
            </>
          )}

          {/* Menu */}
          <View className="mt-4 overflow-hidden rounded-2xl bg-white dark:bg-neutral-900">
            <Pressable
              onPress={() => router.push("/profile/edit-profile")}
              accessibilityRole="button"
              accessibilityLabel="Edit Profile"
              className="flex-row items-center px-4 py-4 border-b border-gray-100 dark:border-neutral-800 active:bg-gray-50 dark:active:bg-neutral-800"
            >
              <View className="h-9 w-9 items-center justify-center rounded-full bg-gray-100 dark:bg-neutral-800">
                <Feather name="edit-2" size={18} color="#0644C7" />
              </View>
              <Text className="ml-3 flex-1 text-base font-medium text-gray-800 dark:text-gray-100">
                Edit Profile
              </Text>
              <Feather name="chevron-right" size={20} color="#9CA3AF" />
            </Pressable>

            <Pressable
              onPress={() => router.push("/settings/settings")}
              accessibilityRole="button"
              accessibilityLabel="Setting"
              className="flex-row items-center px-4 py-4 active:bg-gray-50 dark:active:bg-neutral-800"
            >
              <View className="h-9 w-9 items-center justify-center rounded-full bg-gray-100 dark:bg-neutral-800">
                <Feather name="settings" size={18} color="#0644C7" />
              </View>
              <Text className="ml-3 flex-1 text-base font-medium text-gray-800 dark:text-gray-100">
                Settings
              </Text>
              <Feather name="chevron-right" size={20} color="#9CA3AF" />
            </Pressable>
          </View>

          {/* Log out */}
          <Pressable
            onPress={handleLogout}
            disabled={loggingOut}
            accessibilityRole="button"
            accessibilityLabel="Log out"
            android_ripple={{ color: "#FECACA" }}
            className={`mt-4 h-14 flex-row items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 active:opacity-90 ${
              loggingOut ? "opacity-60" : ""
            }`}
          >
            {loggingOut ? (
              <ActivityIndicator color="#DC2626" />
            ) : (
              <>
                <Feather name="log-out" size={18} color="#DC2626" />
                <Text className="text-base font-semibold text-red-600">
                  Log Out
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
};

export default Profile;
