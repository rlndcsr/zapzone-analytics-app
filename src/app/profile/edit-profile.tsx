import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { InputField } from "../../components/ui/InputField";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import { EditProfileSkeleton } from "../../components/ui/skeleton/EditProfileSkeleton";
import { useProfile } from "../../lib/hooks/useProfile";
import { getToken } from "../../lib/session";
import {
  updateCompany,
  updateUserProfile,
  type CompanyPayload,
  type UserProfilePayload,
} from "../../services/profileService";

const SectionHeader = ({
  icon,
  title,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
}) => (
  <View className="flex-row items-center gap-2 mb-3 mt-2">
    <View className="h-8 w-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/40">
      <Feather name={icon} size={16} color="#0644C7" />
    </View>
    <Text className="text-base font-bold text-gray-900 dark:text-white">
      {title}
    </Text>
  </View>
);

const EditProfile = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  const { user, stats, loading, refresh } = useProfile();
  const [saving, setSaving] = useState(false);

  // Personal information form state.
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [position, setPosition] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [department, setDepartment] = useState("");

  // Company details form state.
  const [companyName, setCompanyName] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [industry, setIndustry] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [country, setCountry] = useState("");
  const [zipCode, setZipCode] = useState("");

  // Hydrate the form once the profile loads.
  useEffect(() => {
    if (!user) return;
    setFirstName(user.first_name ?? "");
    setLastName(user.last_name ?? "");
    setEmail(user.email ?? "");
    setPhone(user.phone ?? "");
    setPosition(user.position ?? "");
    setEmployeeId(user.employee_id ?? "");
    setDepartment(user.department ?? "");

    const c = user.company;
    if (c) {
      setCompanyName(c.company_name ?? "");
      setCompanyEmail(c.email ?? "");
      setCompanyPhone(c.phone ?? "");
      setWebsite(c.website ?? "");
      setIndustry(c.industry ?? "");
      setCompanySize(c.company_size ?? "");
      setAddress(c.address ?? "");
      setCity(c.city ?? "");
      setState(c.state ?? "");
      setCountry(c.country ?? "");
      setZipCode(c.zip_code ?? "");
    }
  }, [user]);

  const handleSave = async () => {
    if (saving || !user) return;
    const token = getToken();
    if (!token) {
      Alert.alert("Not signed in", "Please log in again.");
      return;
    }

    setSaving(true);
    try {
      const userPayload: UserProfilePayload = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        position: position.trim() || null,
        employee_id: employeeId.trim() || null,
        department: department.trim() || null,
      };
      await updateUserProfile(user.id, token, userPayload);

      const companyId = user.company_id ?? user.company?.id ?? null;
      if (companyId) {
        const companyPayload: CompanyPayload = {
          company_name: companyName.trim(),
          email: companyEmail.trim() || null,
          phone: companyPhone.trim() || null,
          website: website.trim() || null,
          industry: industry.trim() || null,
          company_size: companySize.trim() || null,
          address: address.trim() || null,
          city: city.trim() || null,
          state: state.trim() || null,
          country: country.trim() || null,
          zip_code: zipCode.trim() || null,
        };
        await updateCompany(companyId, token, companyPayload);
      }

      await refresh();
      Alert.alert("Saved", "Your profile has been updated.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert(
        "Update failed",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const hasCompany = !!(user?.company_id ?? user?.company);

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header */}
      <View
        className="bg-white dark:bg-neutral-900 px-5 pb-4 flex-row items-center gap-3 border-b border-gray-100 dark:border-neutral-800"
        style={{ paddingTop: insets.top + 12 }}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          className="h-9 w-9 items-center justify-center rounded-full bg-gray-100 dark:bg-neutral-800 active:opacity-80"
        >
          <Feather name="chevron-left" size={22} color={headerIcon} />
        </Pressable>
        <Text className="text-xl font-bold text-gray-900 dark:text-white">Edit Profile</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 40,
          }}
        >
          {loading ? (
            <EditProfileSkeleton />
          ) : (
            <>
              {/* Personal Information */}
              <View className="rounded-2xl bg-white dark:bg-neutral-900 p-4">
                <SectionHeader icon="user" title="Personal Information" />
                <InputField
                  label="First Name"
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="First name"
                  containerClassName="mb-3"
                />
                <InputField
                  label="Last Name"
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="Last name"
                  containerClassName="mb-3"
                />
                <InputField
                  label="Email Address"
                  icon="mail"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholder="you@example.com"
                  containerClassName="mb-3"
                />
                <InputField
                  label="Phone Number"
                  icon="phone"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  placeholder="Phone number"
                  containerClassName="mb-3"
                />
                <InputField
                  label="Position / Title"
                  value={position}
                  onChangeText={setPosition}
                  placeholder="e.g. Company Admin"
                  containerClassName="mb-3"
                />
                <InputField
                  label="Employee ID"
                  value={employeeId}
                  onChangeText={setEmployeeId}
                  placeholder="Employee ID"
                  containerClassName="mb-3"
                />
                <InputField
                  label="Department"
                  value={department}
                  onChangeText={setDepartment}
                  placeholder="Department"
                />
              </View>

              {/* Company Details */}
              {hasCompany && (
                <View className="mt-4 rounded-2xl bg-white dark:bg-neutral-900 p-4">
                  <SectionHeader icon="briefcase" title="Company Details" />
                  <InputField
                    label="Company Name"
                    value={companyName}
                    onChangeText={setCompanyName}
                    placeholder="Company name"
                    containerClassName="mb-3"
                  />
                  <InputField
                    label="Company Email"
                    icon="mail"
                    value={companyEmail}
                    onChangeText={setCompanyEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    placeholder="company@example.com"
                    containerClassName="mb-3"
                  />
                  <InputField
                    label="Company Phone"
                    icon="phone"
                    value={companyPhone}
                    onChangeText={setCompanyPhone}
                    keyboardType="phone-pad"
                    placeholder="Company phone"
                    containerClassName="mb-3"
                  />
                  <InputField
                    label="Website"
                    icon="globe"
                    value={website}
                    onChangeText={setWebsite}
                    autoCapitalize="none"
                    placeholder="https://example.com"
                    containerClassName="mb-3"
                  />
                  <InputField
                    label="Industry"
                    value={industry}
                    onChangeText={setIndustry}
                    placeholder="Industry"
                    containerClassName="mb-3"
                  />
                  <InputField
                    label="Company Size"
                    value={companySize}
                    onChangeText={setCompanySize}
                    placeholder="e.g. 11-50"
                    containerClassName="mb-3"
                  />
                  <InputField
                    label="Street Address"
                    icon="map-pin"
                    value={address}
                    onChangeText={setAddress}
                    placeholder="Street address"
                    containerClassName="mb-3"
                  />
                  <InputField
                    label="City"
                    value={city}
                    onChangeText={setCity}
                    placeholder="City"
                    containerClassName="mb-3"
                  />
                  <InputField
                    label="State / Province"
                    value={state}
                    onChangeText={setState}
                    placeholder="State"
                    containerClassName="mb-3"
                  />
                  <InputField
                    label="ZIP / Postal Code"
                    value={zipCode}
                    onChangeText={setZipCode}
                    placeholder="ZIP code"
                    containerClassName="mb-3"
                  />
                  <InputField
                    label="Country"
                    value={country}
                    onChangeText={setCountry}
                    placeholder="Country"
                  />
                </View>
              )}

              {/* Business Metrics (read-only, auto-calculated) */}
              {stats && (
                <View className="mt-4 rounded-2xl bg-white dark:bg-neutral-900 p-4">
                  <SectionHeader icon="bar-chart-2" title="Business Metrics" />
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
                </View>
              )}

              <PrimaryButton
                label="Save Changes"
                onPress={handleSave}
                loading={saving}
                className="mt-6"
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

export default EditProfile;
