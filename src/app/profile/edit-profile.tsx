import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
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

const SectionHeader = ({ title }: { title: string }) => (
  <Text className="text-lg font-bold text-gray-900 dark:text-white mb-3 mt-1">
    {title}
  </Text>
);

const EditProfile = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  const { user, loading, refresh } = useProfile();
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

  const displayName =
    `${firstName} ${lastName}`.trim() || user?.name || "Your profile";

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Cream hero — back + serif title, then centered avatar / name */}
      <View
        className="bg-[#0644C7]/5 dark:bg-neutral-900 rounded-b-[32px] px-5 pb-8"
        style={{ paddingTop: insets.top + 10 }}
      >
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            className="h-9 w-9 items-center justify-center rounded-full bg-black/5 dark:bg-neutral-800 active:opacity-80"
          >
            <Feather name="chevron-left" size={22} color={headerIcon} />
          </Pressable>
          <Text className="text-[26px] font-bold text-gray-900 dark:text-white">
            Edit Profile
          </Text>
        </View>

        <View className="items-center mt-5">
          <View className="h-24 w-24 rounded-full bg-white dark:bg-neutral-800 items-center justify-center overflow-hidden border border-black/5 dark:border-white/10">
            <Image
              source={require("../../../assets/zapzone-assests/zapzone.png")}
              style={{ width: 58, height: 58 }}
              contentFit="contain"
            />
          </View>
          <Text className="mt-3 text-lg font-semibold text-gray-900 dark:text-white">
            {displayName}
          </Text>
        </View>
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
              <View className="rounded-3xl bg-white dark:bg-neutral-900 p-5 border border-gray-100 dark:border-neutral-800">
                <SectionHeader title="Personal Information" />
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
                <View className="mt-4 rounded-3xl bg-white dark:bg-neutral-900 p-5 border border-gray-100 dark:border-neutral-800">
                  <SectionHeader title="Company Details" />
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
