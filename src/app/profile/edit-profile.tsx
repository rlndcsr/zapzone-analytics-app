import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
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
import { BottomSheet } from "../../components/ui/BottomSheet";
import { DatePickerSheet } from "../../components/ui/DatePickerSheet";
import { EmailSuggestions } from "../../components/ui/EmailSuggestions";
import { InputField } from "../../components/ui/InputField";
import { StatusModal } from "../../components/ui/StatusModal";
import { CONTROL_RADIUS, PrimaryButton } from "../../components/ui/PrimaryButton";
import { mediaUrl } from "../../lib/api";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { EditProfileSkeleton } from "../../components/ui/skeleton/EditProfileSkeleton";
import { useProfile } from "../../lib/hooks/useProfile";
import { useStatusModal } from "../../lib/hooks/useStatusModal";
import { getToken } from "../../lib/session";
import {
  COMPANY_SIZES,
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
  const { user, loading, refresh } = useProfile();
  const [saving, setSaving] = useState(false);
  const status = useStatusModal();

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
  const [foundedDate, setFoundedDate] = useState("");
  const [taxId, setTaxId] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  /** Existing logo URL from the API, and a newly picked base64 replacement. */
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [newLogo, setNewLogo] = useState<string | null>(null);
  const [sizeSheetOpen, setSizeSheetOpen] = useState(false);
  const [dateSheetOpen, setDateSheetOpen] = useState(false);
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
      setFoundedDate((c.founded_date ?? "").substring(0, 10));
      setTaxId(c.tax_id ?? "");
      setRegistrationNumber(c.registration_number ?? "");
      setLogoUrl(mediaUrl(c.logo_path));
      setAddress(c.address ?? "");
      setCity(c.city ?? "");
      setState(c.state ?? "");
      setCountry(c.country ?? "");
      setZipCode(c.zip_code ?? "");
    }
  }, [user]);

  /** Pick a company logo as a base64 data URI — what the API stores. */
  const pickLogo = async () => {
    try {
      const ImagePicker = await import("expo-image-picker");
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Permission needed",
          "Allow photo library access to choose a logo.",
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        base64: true,
        quality: 0.8,
      });
      if (result.canceled) return;
      const a = result.assets?.[0];
      if (!a?.base64) return;
      // The endpoint caps the encoded string at ~27MB, i.e. a 20MB image.
      if (a.base64.length > 27_000_000) {
        Alert.alert("Image too large", "Please choose an image under 20MB.");
        return;
      }
      setNewLogo(`data:${a.mimeType ?? "image/jpeg"};base64,${a.base64}`);
    } catch {
      Alert.alert("Image error", "Could not open the image picker.");
    }
  };

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
          founded_date: foundedDate.trim() || null,
          tax_id: taxId.trim() || null,
          registration_number: registrationNumber.trim() || null,
          // Only sent when a new one was picked — omitting it keeps the
          // existing logo, since the API treats the field as `sometimes`.
          ...(newLogo ? { logo_path: newLogo } : {}),
          address: address.trim() || null,
          city: city.trim() || null,
          state: state.trim() || null,
          country: country.trim() || null,
          zip_code: zipCode.trim() || null,
        };
        await updateCompany(companyId, token, companyPayload);
      }

      await refresh();
      status.show({
        variant: "success",
        title: "Changes Saved",
        message: "Your profile has been updated.",
        confirmLabel: "Done",
        onConfirm: () => router.back(),
      });
    } catch (err) {
      status.error(
        "Update Failed",
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
      {/* Cream hero — centered title, then centered avatar / name */}
      <ScreenHeader title="Edit Profile" className="pb-8">
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
      </ScreenHeader>

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
                <View className="mb-3">
                  <InputField
                    label="Email Address"
                    icon="mail"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    placeholder="you@example.com"
                  />
                  <EmailSuggestions value={email} onSelect={setEmail} />
                </View>
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
                  <SectionHeader title="Company Information" />
                  <InputField
                    label="Company Name"
                    value={companyName}
                    onChangeText={setCompanyName}
                    placeholder="Company name"
                    containerClassName="mb-3"
                  />

                  {/* Company Logo */}
                  <Text className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                    Company Logo
                  </Text>
                  <View className="mb-3 flex-row items-center gap-3">
                    <Pressable
                      onPress={pickLogo}
                      className="h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-neutral-700 dark:bg-neutral-800"
                      accessibilityRole="button"
                      accessibilityLabel="Choose company logo"
                    >
                      {newLogo || logoUrl ? (
                        <Image
                          source={{ uri: newLogo ?? logoUrl ?? undefined }}
                          style={{ width: "100%", height: "100%" }}
                          contentFit="contain"
                        />
                      ) : (
                        <Feather name="image" size={22} color="#9CA3AF" />
                      )}
                    </Pressable>
                    <View className="flex-1">
                      <Pressable onPress={pickLogo} accessibilityRole="button">
                        <Text className="text-sm font-semibold text-[#0644C7]">
                          Upload your company logo
                        </Text>
                      </Pressable>
                      <Text className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        Max size: 20MB. Supported: PNG, JPG, JPEG
                      </Text>
                      {!!newLogo && (
                        <Pressable
                          onPress={() => setNewLogo(null)}
                          accessibilityRole="button"
                          className="mt-1"
                        >
                          <Text className="text-xs font-semibold text-red-600">
                            Undo change
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  </View>

                  <View className="mb-3">
                    <InputField
                      label="Company Email"
                      icon="mail"
                      value={companyEmail}
                      onChangeText={setCompanyEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      placeholder="company@example.com"
                    />
                    <EmailSuggestions
                      value={companyEmail}
                      onSelect={setCompanyEmail}
                    />
                  </View>
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
                  {/* A picker, not free text: the API validates this against a
                      fixed list, so a typed "12-50" would fail to save. */}
                  <Text className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                    Company Size
                  </Text>
                  <Pressable
                    onPress={() => setSizeSheetOpen(true)}
                    className="mb-3 h-14 flex-row items-center justify-between rounded-lg border border-gray-200 px-5 dark:border-neutral-700"
                    accessibilityRole="button"
                  >
                    <Text
                      className={`text-base ${
                        companySize
                          ? "text-gray-900 dark:text-white"
                          : "text-gray-400"
                      }`}
                    >
                      {companySize || "e.g., 1-10, 11-50, 51-200"}
                    </Text>
                    <Feather name="chevron-down" size={18} color="#9CA3AF" />
                  </Pressable>

                  <Text className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                    Founded Date
                  </Text>
                  <Pressable
                    onPress={() => setDateSheetOpen(true)}
                    className="mb-3 h-14 flex-row items-center justify-between rounded-lg border border-gray-200 px-5 dark:border-neutral-700"
                    accessibilityRole="button"
                  >
                    <View className="flex-row items-center gap-2">
                      <Feather name="calendar" size={16} color="#9CA3AF" />
                      <Text
                        className={`text-base ${
                          foundedDate
                            ? "text-gray-900 dark:text-white"
                            : "text-gray-400"
                        }`}
                      >
                        {foundedDate || "mm/dd/yyyy"}
                      </Text>
                    </View>
                    {!!foundedDate && (
                      <Pressable
                        onPress={() => setFoundedDate("")}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Clear founded date"
                      >
                        <Feather name="x" size={16} color="#9CA3AF" />
                      </Pressable>
                    )}
                  </Pressable>

                  <InputField
                    label="Tax ID"
                    value={taxId}
                    onChangeText={setTaxId}
                    placeholder="Tax ID"
                    containerClassName="mb-3"
                  />
                  <InputField
                    label="Registration Number"
                    value={registrationNumber}
                    onChangeText={setRegistrationNumber}
                    placeholder="Registration number"
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


              {/* Softer corners than the pill default — className cannot win
                  against `rounded-full` (NativeWind resolves by CSS order), so
                  the radius is set inline, as PrimaryButton documents. */}
              <PrimaryButton
                label="Save Changes"
                onPress={handleSave}
                loading={saving}
                className="mt-6"
                style={{ borderRadius: CONTROL_RADIUS }}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Company size — the API's fixed list. */}
      <BottomSheet
        visible={sizeSheetOpen}
        onClose={() => setSizeSheetOpen(false)}
        title="Company Size"
      >
        <View className="px-4 pb-6">
          {COMPANY_SIZES.map((size) => {
            const active = companySize === size;
            return (
              <Pressable
                key={size}
                onPress={() => {
                  setCompanySize(size);
                  setSizeSheetOpen(false);
                }}
                className={`flex-row items-center justify-between rounded-xl px-4 py-3.5 ${
                  active ? "bg-blue-50 dark:bg-blue-900/20" : ""
                }`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text
                  className={`text-base font-medium ${
                    active
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  {size}
                </Text>
                {active && <Feather name="check" size={16} color="#3B82F6" />}
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>

      {/* Founded date — a past date, so the picker is given an early floor. */}
      <DatePickerSheet
        visible={dateSheetOpen}
        value={foundedDate}
        minDate="1900-01-01"
        title="Founded Date"
        onClose={() => setDateSheetOpen(false)}
        onSelect={(date) => {
          setFoundedDate(date);
          setDateSheetOpen(false);
        }}
      />

      {/* Save outcome — success and failure, in the app's own dialog. */}
      <StatusModal {...status.props} />
    </View>
  );
};

export default EditProfile;
