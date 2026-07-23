import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { getToken } from "../../lib/session";
import {
  addContactTag,
  createContact,
  deleteContact,
  removeContactTag,
  updateContact,
  type ContactInput,
  type ContactRow,
} from "../../services/contactsService";
import { BottomSheet } from "./BottomSheet";
import { TextField, ToggleRow } from "./FormControls";
import { StatusBadge } from "./StatusBadge";

const PRIMARY = "#0644C7";

type Mode = "menu" | "view" | "edit" | "create";

const ActionRow = ({
  icon,
  label,
  danger = false,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  danger?: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
    className="flex-row items-center gap-3 px-4 py-3.5 rounded-xl mb-1"
  >
    <View className="w-9 h-9 rounded-xl items-center justify-center bg-gray-100 dark:bg-neutral-800">
      <Feather name={icon} size={18} color={danger ? "#dc2626" : "#374151"} />
    </View>
    <Text
      className="text-base font-medium text-gray-800 dark:text-gray-100"
      style={danger ? { color: "#dc2626" } : undefined}
    >
      {label}
    </Text>
  </Pressable>
);

// Created/Last Updated → "7/23/2026, 10:50:44 AM" (web admin parity).
const fmtDateTime = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
};

// Date of Birth → "M/D/YYYY" from the YYYY-MM-DD prefix (no timezone shift).
const fmtDate = (iso: string | null): string => {
  const m = iso?.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[2])}/${Number(m[3])}/${m[1]}` : "—";
};

// Titled group rendered on a soft rounded card (matches BookingFullView).
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <>
    <Text className="text-base font-bold text-gray-900 dark:text-white mt-6 mb-2">
      {title}
    </Text>
    <View className="bg-gray-50 dark:bg-neutral-800/40 rounded-2xl px-4 py-1.5">
      {children}
    </View>
  </>
);

// Label above value; empty values fall back to an em dash.
const Field = ({
  label,
  value,
  children,
}: {
  label: string;
  value?: string | null;
  children?: React.ReactNode;
}) => (
  <View className="py-2">
    <Text className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">{label}</Text>
    {children ?? (
      <Text className="text-sm font-semibold text-gray-900 dark:text-white">
        {value?.trim() ? value : "—"}
      </Text>
    )}
  </View>
);

type Props = {
  visible: boolean;
  /** null → the sheet opens in "create" mode; a row → view/edit/delete. */
  contact: ContactRow | null;
  companyId: number | null;
  locationId?: number | null;
  onClose: () => void;
  onChanged: () => void;
};

/**
 * Contact actions hub — View / Edit / Delete / tags for an existing contact, or
 * Create when `contact` is null. One BottomSheet, mode-switched (no stacked
 * modals). Backed by the /api/contacts CRUD endpoints (same as the web).
 */
export function ContactActionsSheet({
  visible,
  contact,
  companyId,
  locationId,
  onClose,
  onChanged,
}: Props) {
  // Tap a record → open straight into details ("view"), matching the other
  // modules; the "menu" hub still exists but is no longer the entry point.
  const [mode, setMode] = useState<Mode>(contact ? "view" : "create");
  const [busy, setBusy] = useState(false);

  // Form fields (create + edit).
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateField, setStateField] = useState("");
  const [zip, setZip] = useState("");
  const [country, setCountry] = useState("");
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);
  const [smsConsent, setSmsConsent] = useState(false);

  // Tags: `tags` drives the view-mode chip editor (add/remove via API);
  // `formTags` is the create-form tag picker (sent as tags[] on create only).
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [formTags, setFormTags] = useState<string[]>([]);
  const [newFormTag, setNewFormTag] = useState("");

  const seed = (c: ContactRow | null) => {
    setEmail(c?.email ?? "");
    setFirstName(c?.firstName ?? "");
    setLastName(c?.lastName ?? "");
    setPhone(c?.phone ?? "");
    setCompanyName(c?.companyName ?? "");
    setJobTitle(c?.jobTitle ?? "");
    setAddress(c?.address ?? "");
    setCity(c?.city ?? "");
    setStateField(c?.state ?? "");
    setZip(c?.zip ?? "");
    setCountry(c?.country ?? "");
    setSource(c?.source ?? "");
    setNotes(c?.notes ?? "");
    setActive((c?.status ?? "active") !== "inactive");
    setSmsConsent(!!c?.smsConsent);
    setTags(c?.tags ?? []);
    setFormTags([]);
  };

  useEffect(() => {
    if (!visible) return;
    setMode(contact ? "view" : "create");
    setBusy(false);
    setNewTag("");
    setNewFormTag("");
    seed(contact);
  }, [visible, contact]);

  const title =
    mode === "view"
      ? "Customer Details"
      : mode === "edit"
        ? "Edit contact"
        : mode === "create"
          ? "Add customer"
          : "Contact actions";

  const buildInput = (): ContactInput => ({
    companyId: companyId ?? 0,
    locationId: locationId ?? null,
    email: email.trim(),
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    phone: phone.trim(),
    companyName: companyName.trim(),
    jobTitle: jobTitle.trim(),
    address: address.trim(),
    city: city.trim(),
    state: stateField.trim(),
    zip: zip.trim(),
    country: country.trim(),
    source: source.trim(),
    notes: notes.trim(),
    status: active ? "active" : "inactive",
    smsConsent,
    // Tags are sent only on create; in edit they're managed via the chip UI.
    tags: mode === "create" ? formTags : undefined,
  });

  const save = async () => {
    if (!email.trim()) return Alert.alert("Missing email", "Email is required.");
    const token = getToken();
    if (!token) return Alert.alert("Not signed in", "Please sign in again.");
    if (mode === "create" && !companyId)
      return Alert.alert("Missing company", "No company is associated with your account.");

    setBusy(true);
    try {
      if (mode === "create") {
        await createContact(token, buildInput());
      } else if (contact) {
        await updateContact(token, contact.id, buildInput());
      }
      onChanged();
      onClose();
    } catch (err) {
      Alert.alert(
        "Save failed",
        err instanceof Error ? err.message : "Could not save the contact.",
      );
    } finally {
      setBusy(false);
    }
  };

  // Edit opens the dedicated Edit Customer screen (mirrors Packages/Attractions):
  // close the sheet first, then navigate with the contact id.
  const goEdit = () => {
    if (!contact) return;
    onClose();
    router.push(`/customers/edit-customer?id=${contact.id}`);
  };

  const toggleStatus = async () => {
    if (!contact) return;
    const token = getToken();
    if (!token) return;
    const next = contact.status === "active" ? "inactive" : "active";
    setBusy(true);
    try {
      await updateContact(token, contact.id, { status: next });
      onChanged();
      onClose();
    } catch (err) {
      Alert.alert(
        "Update failed",
        err instanceof Error ? err.message : "Could not update status.",
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = () => {
    if (!contact) return;
    Alert.alert(
      "Delete customer",
      "Are you sure you want to delete this customer? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const token = getToken();
            if (!token) return;
            setBusy(true);
            try {
              await deleteContact(token, contact.id);
              onChanged();
              onClose();
            } catch (err) {
              Alert.alert(
                "Delete failed",
                err instanceof Error ? err.message : "Could not delete.",
              );
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const addTag = async () => {
    const tag = newTag.trim();
    if (!tag || !contact) return;
    const token = getToken();
    if (!token) return;
    setTags((prev) => [...new Set([...prev, tag])]);
    setNewTag("");
    try {
      await addContactTag(token, contact.id, tag);
      onChanged();
    } catch {
      setTags((prev) => prev.filter((t) => t !== tag));
      Alert.alert("Tag failed", "Could not add the tag.");
    }
  };

  const removeTag = async (tag: string) => {
    if (!contact) return;
    const token = getToken();
    if (!token) return;
    setTags((prev) => prev.filter((t) => t !== tag));
    try {
      await removeContactTag(token, contact.id, tag);
      onChanged();
    } catch {
      setTags((prev) => [...prev, tag]);
      Alert.alert("Tag failed", "Could not remove the tag.");
    }
  };

  const renderForm = () => (
    <ScrollView
      className="px-5"
      contentContainerStyle={{ paddingBottom: 28 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-4 pt-2">
        <TextField
          label="Email"
          required
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholder="name@example.com"
        />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <TextField label="First name" value={firstName} onChangeText={setFirstName} />
          </View>
          <View className="flex-1">
            <TextField label="Last name" value={lastName} onChangeText={setLastName} />
          </View>
        </View>
        <TextField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <TextField label="Company" value={companyName} onChangeText={setCompanyName} />
          </View>
          <View className="flex-1">
            <TextField label="Job title" value={jobTitle} onChangeText={setJobTitle} />
          </View>
        </View>
        <TextField label="Source" value={source} onChangeText={setSource} placeholder="e.g. Walk-in" />

        <Text className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 mt-1">
          Address
        </Text>
        <TextField label="Street address" value={address} onChangeText={setAddress} />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <TextField label="City" value={city} onChangeText={setCity} />
          </View>
          <View className="flex-1">
            <TextField label="State" value={stateField} onChangeText={setStateField} />
          </View>
        </View>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <TextField label="ZIP / Postal code" value={zip} onChangeText={setZip} />
          </View>
          <View className="flex-1">
            <TextField label="Country" value={country} onChangeText={setCountry} />
          </View>
        </View>

        {mode === "create" && (
          <View>
            <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
              Tags
            </Text>
            {formTags.length > 0 && (
              <View className="flex-row flex-wrap mb-2">
                {formTags.map((t) => (
                  <Pressable
                    key={t}
                    onPress={() => setFormTags((prev) => prev.filter((x) => x !== t))}
                    className="flex-row items-center gap-1 bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-full mr-2 mb-2"
                  >
                    <Text className="text-xs font-medium text-[#0644C7] dark:text-blue-300">
                      {t}
                    </Text>
                    <Feather name="x" size={12} color={PRIMARY} />
                  </Pressable>
                ))}
              </View>
            )}
            <View className="flex-row items-center gap-2">
              <View className="flex-1 rounded-xl px-3.5 py-2.5 border border-gray-200 dark:border-neutral-800">
                <TextInput
                  value={newFormTag}
                  onChangeText={setNewFormTag}
                  placeholder="Add a tag"
                  placeholderTextColor="#9CA3AF"
                  onSubmitEditing={() => {
                    const t = newFormTag.trim();
                    if (t) setFormTags((prev) => [...new Set([...prev, t])]);
                    setNewFormTag("");
                  }}
                  className="text-sm text-gray-900 dark:text-white"
                  style={{ paddingVertical: 0 }}
                />
              </View>
              <Pressable
                onPress={() => {
                  const t = newFormTag.trim();
                  if (t) setFormTags((prev) => [...new Set([...prev, t])]);
                  setNewFormTag("");
                }}
                className="px-4 py-2.5 rounded-xl bg-[#0644C7]"
              >
                <Text className="text-sm font-semibold text-white">Add</Text>
              </Pressable>
            </View>
          </View>
        )}

        <TextField label="Notes" value={notes} onChangeText={setNotes} multiline />
        <ToggleRow label="Active" value={active} onValueChange={setActive} />
        <ToggleRow label="SMS consent" value={smsConsent} onValueChange={setSmsConsent} />

        <View className="flex-row gap-3 mt-2">
          <Pressable
            onPress={() => (contact ? setMode("view") : onClose())}
            disabled={busy}
            className="flex-1 items-center justify-center py-3.5 rounded-xl border border-gray-200 dark:border-neutral-700"
          >
            <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Cancel
            </Text>
          </Pressable>
          <Pressable
            onPress={save}
            disabled={busy}
            className="flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl bg-[#0644C7]"
          >
            {busy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text className="text-sm font-semibold text-white">
                {mode === "create" ? "Add customer" : "Save changes"}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      {mode === "menu" && contact && (
        <View className="px-4 pb-6">
          <View className="px-4 pb-2">
            <Text className="text-base font-bold text-gray-900 dark:text-white" numberOfLines={1}>
              {contact.name}
            </Text>
            {!!contact.email && (
              <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {contact.email}
              </Text>
            )}
          </View>
          <ActionRow icon="eye" label="View details" onPress={() => setMode("view")} />
          <ActionRow icon="edit-2" label="Edit" onPress={goEdit} />
          <ActionRow
            icon={contact.status === "active" ? "user-x" : "user-check"}
            label={contact.status === "active" ? "Set inactive" : "Set active"}
            onPress={toggleStatus}
          />
          <ActionRow icon="trash-2" label="Delete" danger onPress={confirmDelete} />
        </View>
      )}

      {mode === "view" && contact && (
        <ScrollView
          className="px-5"
          contentContainerStyle={{ paddingBottom: 28 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header: customer name as the main title + status badge. */}
          <View className="flex-row items-center justify-between mt-2 mb-1">
            <Text className="text-xl font-bold text-gray-900 dark:text-white flex-1 mr-2" numberOfLines={2}>
              {contact.name}
            </Text>
            <StatusBadge status={contact.status} />
          </View>

          <Section title="Personal Information">
            <Field label="First Name" value={contact.firstName} />
            <Field label="Last Name" value={contact.lastName} />
            <Field label="Email" value={contact.email} />
            <Field label="Phone" value={contact.phone} />
            <Field label="Date of Birth" value={fmtDate(contact.dateOfBirth)} />
            <Field label="SMS Consent">
              <Text
                className="text-sm font-semibold"
                style={{ color: contact.smsConsent ? "#16a34a" : "#6b7280" }}
              >
                {contact.smsConsent ? "Opted In" : "Not Opted In"}
              </Text>
            </Field>
          </Section>

          <Section title="Work Information">
            <Field label="Company" value={contact.companyName} />
            <Field label="Job Title" value={contact.jobTitle} />
            <Field label="Source" value={contact.source} />
            <Field label="Status">
              <View className="flex-row">
                <StatusBadge status={contact.status} />
              </View>
            </Field>
          </Section>

          <Section title="Address">
            <Field label="Street Address" value={contact.address} />
            <Field label="City" value={contact.city} />
            <Field label="State" value={contact.state} />
            <Field label="ZIP" value={contact.zip} />
            <Field label="Country" value={contact.country} />
          </Section>

          <Section title="Additional Information">
            <Field label="Location" value={contact.locationName} />
            <Field label="Created" value={fmtDateTime(contact.createdAt)} />
            <Field label="Last Updated" value={fmtDateTime(contact.updatedAt)} />
            {/* Tags render as chips; tap a chip to remove, add via the input. */}
            <Field label="Tags">
              {tags.length > 0 ? (
                <View className="flex-row flex-wrap">
                  {tags.map((t) => (
                    <Pressable
                      key={t}
                      onPress={() => removeTag(t)}
                      className="flex-row items-center gap-1 bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-full mr-2 mb-2"
                    >
                      <Text className="text-xs font-medium text-[#0644C7] dark:text-blue-300">
                        {t}
                      </Text>
                      <Feather name="x" size={12} color={PRIMARY} />
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Text className="text-sm font-semibold text-gray-900 dark:text-white">—</Text>
              )}
              <View className="flex-row items-center gap-2 mt-1">
                <View className="flex-1 rounded-xl px-3.5 py-2.5 border border-gray-200 dark:border-neutral-800">
                  <TextInput
                    value={newTag}
                    onChangeText={setNewTag}
                    placeholder="Add a tag"
                    placeholderTextColor="#9CA3AF"
                    onSubmitEditing={addTag}
                    className="text-sm text-gray-900 dark:text-white"
                    style={{ paddingVertical: 0 }}
                  />
                </View>
                <Pressable onPress={addTag} className="px-4 py-2.5 rounded-xl bg-[#0644C7]">
                  <Text className="text-sm font-semibold text-white">Add</Text>
                </Pressable>
              </View>
            </Field>
            <Field label="Notes" value={contact.notes} />
          </Section>

          <View className="flex-row gap-3 mt-6">
            <Pressable
              onPress={goEdit}
              className="flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl bg-[#0644C7]"
            >
              <Feather name="edit-2" size={16} color="#fff" />
              <Text className="text-sm font-semibold text-white">Edit</Text>
            </Pressable>
            <Pressable
              onPress={confirmDelete}
              className="w-12 items-center justify-center py-3.5 rounded-xl border border-red-200 dark:border-red-900/50"
            >
              <Feather name="trash-2" size={16} color="#dc2626" />
            </Pressable>
          </View>
        </ScrollView>
      )}

      {(mode === "edit" || mode === "create") && renderForm()}
    </BottomSheet>
  );
}
