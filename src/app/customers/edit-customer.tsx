import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  SelectField,
  TextField,
  ToggleRow,
  type SelectOption,
} from "../../components/ui/FormControls";
import { PRIMARY, Section } from "../../components/ui/attractionFormKit";
import { markContactsStale } from "../../lib/contactsStale";
import { getToken } from "../../lib/session";
import {
  fetchContact,
  updateContact,
  type ContactStatus,
} from "../../services/contactsService";

const STATUS_OPTIONS: SelectOption[] = [
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
];

// Created/Last Updated → "7/23/2026, 10:50:44 AM" (web admin parity).
const fmtDateTime = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
};

// A labeled read-only value on a soft box (Location/Created/Last Updated).
const ReadOnly = ({ label, value }: { label: string; value: string }) => (
  <View className="mb-4">
    <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
      {label}
    </Text>
    <View className="rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800">
      <Text className="text-sm text-gray-700 dark:text-gray-200">
        {value?.trim() ? value : "—"}
      </Text>
    </View>
  </View>
);

const EditCustomer = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const contactId = Number(params.id);

  const [loadingDetail, setLoadingDetail] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Editable fields (mirrors the web admin's edit form).
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [smsConsent, setSmsConsent] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [source, setSource] = useState("");
  const [status, setStatus] = useState<ContactStatus>("active");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateField, setStateField] = useState("");
  const [zip, setZip] = useState("");
  const [country, setCountry] = useState("");
  const [notes, setNotes] = useState("");

  // Display-only (read-only in the web edit view too).
  const [displayName, setDisplayName] = useState("");
  const [locationName, setLocationName] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  // Load the contact and seed the form (reuses the shared fetchContact/mapper).
  useEffect(() => {
    if (!Number.isFinite(contactId) || contactId <= 0) {
      setLoadError("Missing customer id.");
      setLoadingDetail(false);
      return;
    }
    const token = getToken();
    if (!token) {
      setLoadError("Not signed in.");
      setLoadingDetail(false);
      return;
    }
    let active = true;
    const controller = new AbortController();
    (async () => {
      try {
        const c = await fetchContact(token, contactId, controller.signal);
        if (!active) return;
        setFirstName(c.firstName);
        setLastName(c.lastName);
        setEmail(c.email);
        setPhone(c.phone ?? "");
        setDateOfBirth(c.dateOfBirth ? c.dateOfBirth.slice(0, 10) : "");
        setSmsConsent(c.smsConsent);
        setCompanyName(c.companyName ?? "");
        setJobTitle(c.jobTitle ?? "");
        setSource(c.source ?? "");
        setStatus(c.status);
        setAddress(c.address ?? "");
        setCity(c.city ?? "");
        setStateField(c.state ?? "");
        setZip(c.zip ?? "");
        setCountry(c.country ?? "");
        setNotes(c.notes ?? "");
        setDisplayName(c.name);
        setLocationName(c.locationName ?? "");
        setTags(c.tags);
        setCreatedAt(c.createdAt);
        setUpdatedAt(c.updatedAt);
      } catch (err) {
        if (active)
          setLoadError(
            err instanceof Error ? err.message : "Failed to load customer.",
          );
      } finally {
        if (active) setLoadingDetail(false);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [contactId]);

  const handleSubmit = async () => {
    if (!email.trim())
      return Alert.alert("Missing email", "Email is required.");
    if (dateOfBirth.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth.trim()))
      return Alert.alert("Invalid date", "Use the format YYYY-MM-DD.");
    const token = getToken();
    if (!token) return Alert.alert("Not signed in", "Please sign in again.");

    setSubmitting(true);
    try {
      await updateContact(token, contactId, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        dateOfBirth: dateOfBirth.trim() || null,
        smsConsent,
        companyName: companyName.trim(),
        jobTitle: jobTitle.trim(),
        source: source.trim(),
        status,
        address: address.trim(),
        city: city.trim(),
        state: stateField.trim(),
        zip: zip.trim(),
        country: country.trim(),
        notes: notes.trim(),
      });
      markContactsStale();
      router.back();
    } catch (err) {
      Alert.alert(
        "Update failed",
        err instanceof Error ? err.message : "Could not update the customer.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header: back button + title + customer name subtitle. */}
      <View className="bg-white dark:bg-neutral-900 pt-12 pb-4 px-5 w-full border-b border-gray-100 dark:border-neutral-800">
        <View className="flex-row items-center justify-between">
          <Pressable
            onPress={() => router.back()}
            className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Feather name="chevron-left" size={20} color={PRIMARY} />
          </Pressable>
          <Text className="text-gray-900 dark:text-white text-lg font-bold">
            Edit Customer
          </Text>
          <View style={{ width: 36 }} />
        </View>
        {!loadingDetail && !loadError && !!displayName && (
          <Text
            className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center"
            numberOfLines={1}
          >
            {displayName}
          </Text>
        )}
      </View>

      {loadingDetail ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={PRIMARY} />
        </View>
      ) : loadError ? (
        <View className="flex-1 items-center justify-center px-8">
          <Feather name="alert-circle" size={40} color="#EF4444" />
          <Text className="text-sm text-gray-600 dark:text-gray-300 mt-3 text-center">
            {loadError}
          </Text>
          <Pressable
            onPress={() => router.back()}
            className="mt-4 px-5 py-2.5 rounded-xl bg-[#0644C7]"
          >
            <Text className="text-sm font-semibold text-white">Go back</Text>
          </Pressable>
        </View>
      ) : (
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Section icon="user" title="Personal Information">
              <View className="gap-4">
                <TextField
                  label="First Name"
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="First name"
                />
                <TextField
                  label="Last Name"
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="Last name"
                />
                <TextField
                  label="Email"
                  required
                  value={email}
                  onChangeText={setEmail}
                  placeholder="name@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <TextField
                  label="Phone"
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="Phone number"
                  keyboardType="phone-pad"
                />
                <TextField
                  label="Date of Birth"
                  value={dateOfBirth}
                  onChangeText={setDateOfBirth}
                  placeholder="YYYY-MM-DD"
                  hint="Format: YYYY-MM-DD"
                  autoCapitalize="none"
                />
                <ToggleRow
                  label="SMS Consent"
                  value={smsConsent}
                  onValueChange={setSmsConsent}
                />
              </View>
            </Section>

            <Section icon="briefcase" title="Work Information">
              <View className="gap-4">
                <TextField
                  label="Company"
                  value={companyName}
                  onChangeText={setCompanyName}
                  placeholder="Company name"
                />
                <TextField
                  label="Job Title"
                  value={jobTitle}
                  onChangeText={setJobTitle}
                  placeholder="Job title"
                />
                <TextField
                  label="Source"
                  value={source}
                  onChangeText={setSource}
                  placeholder="How they found you"
                />
                <SelectField
                  label="Status"
                  value={status}
                  options={STATUS_OPTIONS}
                  onSelect={(v) => setStatus(v as ContactStatus)}
                />
              </View>
            </Section>

            <Section icon="map-pin" title="Address">
              <View className="gap-4">
                <TextField
                  label="Street Address"
                  value={address}
                  onChangeText={setAddress}
                  placeholder="Street address"
                />
                <TextField
                  label="City"
                  value={city}
                  onChangeText={setCity}
                  placeholder="City"
                />
                <TextField
                  label="State"
                  value={stateField}
                  onChangeText={setStateField}
                  placeholder="State"
                />
                <TextField
                  label="ZIP"
                  value={zip}
                  onChangeText={setZip}
                  placeholder="ZIP code"
                />
                <TextField
                  label="Country"
                  value={country}
                  onChangeText={setCountry}
                  placeholder="Country"
                />
              </View>
            </Section>

            <Section icon="file-text" title="Additional Information">
              <ReadOnly label="Location" value={locationName} />
              <ReadOnly label="Created" value={fmtDateTime(createdAt)} />
              <ReadOnly label="Last Updated" value={fmtDateTime(updatedAt)} />
              {/* Tags are display-only here; they are managed on the details view. */}
              <View className="mb-4">
                <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                  Tags
                </Text>
                {tags.length > 0 ? (
                  <View className="flex-row flex-wrap">
                    {tags.map((t) => (
                      <View
                        key={t}
                        className="bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-full mr-2 mb-2"
                      >
                        <Text className="text-xs font-medium text-[#0644C7] dark:text-blue-300">
                          {t}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text className="text-sm text-gray-400 dark:text-gray-500">—</Text>
                )}
              </View>
              <TextField
                label="Notes"
                value={notes}
                onChangeText={setNotes}
                placeholder="Add notes..."
                multiline
                style={{ minHeight: 96, textAlignVertical: "top" }}
              />
            </Section>
          </ScrollView>

          {/* Sticky footer: Cancel + Save (matches the other edit screens). */}
          <View
            className="flex-row gap-3 px-5 pt-3 border-t border-gray-100 dark:border-neutral-800 bg-white dark:bg-neutral-900"
            style={{ paddingBottom: insets.bottom + 12 }}
          >
            <Pressable
              onPress={() => router.back()}
              disabled={submitting}
              className="flex-1 items-center justify-center py-3.5 rounded-xl border border-gray-200 dark:border-neutral-700"
            >
              <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              disabled={submitting}
              className="flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl bg-[#0644C7] active:opacity-90"
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Feather name="check" size={16} color="#fff" />
                  <Text className="text-sm font-semibold text-white">
                    Save changes
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
};

export default EditCustomer;
