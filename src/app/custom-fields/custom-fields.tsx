import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useMemo, useState } from "react";
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

import { BottomSheet } from "../../components/ui/BottomSheet";
import {
  CheckboxRow,
  FieldLabel,
  SelectField,
  TextField,
  type SelectOption,
} from "../../components/ui/FormControls";
import { TargetingPicker } from "../../components/ui/TargetingPicker";
import {
  EMPTY_TARGETING,
  targetingPayload,
  targetingSummary,
  type TargetingValue,
} from "../../components/ui/TargetingSelector";
import { useAsyncList } from "../../lib/hooks/useAsyncList";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  createCustomField,
  deleteCustomField,
  fetchCustomFields,
  updateCustomField,
  type CustomFieldAudience,
  type CustomFieldInput,
  type CustomFieldRow,
} from "../../services/customFieldsService";

const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

/** Same wording as the web page's "Who sees it" dropdown. */
const AUDIENCE_OPTIONS: SelectOption[] = [
  { label: "Customers and staff", value: "both" },
  { label: "Customers only", value: "customer" },
  { label: "Staff only", value: "admin" },
];

const AUDIENCE_LABELS: Record<CustomFieldAudience, string> = {
  both: "Customers and staff",
  customer: "Customers only",
  admin: "Staff only",
};

/** The row's targeting columns in the shared selector's shape. */
const asTargeting = (field: CustomFieldRow): TargetingValue => ({
  locationIds: field.locationIds,
  packageIds: field.packageIds,
  attractionIds: field.attractionIds,
  eventIds: field.eventIds,
});

/** One question in the list — mirrors the web row (label, badges, scope). */
const FieldCard = ({
  field,
  canWrite,
  busy,
  onEdit,
  onDelete,
}: {
  field: CustomFieldRow;
  canWrite: boolean;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) => (
  <View className="flex-row items-start gap-3 px-4 py-4 border-b border-gray-100 dark:border-neutral-800">
    <View className="flex-1">
      <View className="flex-row items-center flex-wrap gap-2">
        <Text className="text-sm font-semibold text-gray-900 dark:text-white">
          {field.label}
        </Text>
        {field.isRequired && (
          <View className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30">
            <Text className="text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">
              Required
            </Text>
          </View>
        )}
        {!field.isActive && (
          <View className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-neutral-800">
            <Text className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Off
            </Text>
          </View>
        )}
      </View>
      {!!field.helpText && (
        <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {field.helpText}
        </Text>
      )}
      <Text className="text-xs text-gray-500 dark:text-gray-400 mt-1">
        {targetingSummary(asTargeting(field))}
      </Text>
      <Text className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
        {AUDIENCE_LABELS[field.audience]}
      </Text>
    </View>

    {/* A question that covers more venues than this manager runs is read-only
        for them — the backend refuses the write, so we don't offer it. */}
    {!canWrite || !field.canManage ? (
      <View className="shrink-0 px-2 py-1 rounded bg-gray-100 dark:bg-neutral-800">
        <Text className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {canWrite ? "Company-wide" : "View only"}
        </Text>
      </View>
    ) : busy ? (
      <ActivityIndicator size="small" color={PRIMARY} />
    ) : (
      <View className="flex-row items-center gap-2 shrink-0">
        <Pressable
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${field.label}`}
          className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-neutral-800 items-center justify-center active:opacity-70"
        >
          <Feather name="edit-2" size={15} color="#6B7280" />
        </Pressable>
        <Pressable
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${field.label}`}
          className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-900/30 items-center justify-center active:opacity-70"
        >
          <Feather name="trash-2" size={15} color="#EF4444" />
        </Pressable>
      </View>
    )}
  </View>
);

/**
 * Custom Fields — the extra checkboxes a purchase asks before it completes, and
 * which packages / attractions / events ask them. Same `/api/custom-fields`
 * endpoints as the web admin page; reading is open to any staff role, while
 * creating, editing and deleting are limited to company admins and location
 * managers (the backend enforces the same split).
 */
const CustomFields = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  const role = getCurrentUser()?.role;
  const canWrite = role === "company_admin" || role === "location_manager";

  const loader = useCallback(
    ({ token, signal }: { token: string; signal?: AbortSignal }) =>
      fetchCustomFields(token, signal),
    [],
  );
  const { data: fields, loading, error, refetch } = useAsyncList(loader);

  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  // Editor state. `editing` null with the sheet open = creating a new one.
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CustomFieldRow | null>(null);
  const [label, setLabel] = useState("");
  const [helpText, setHelpText] = useState("");
  const [audience, setAudience] = useState<CustomFieldAudience>("both");
  const [isRequired, setIsRequired] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [targeting, setTargeting] = useState<TargetingValue>(EMPTY_TARGETING);
  const [saving, setSaving] = useState(false);

  const activeCount = useMemo(
    () => fields.filter((f) => f.isActive).length,
    [fields],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const openCreate = () => {
    setEditing(null);
    setLabel("");
    setHelpText("");
    setAudience("both");
    setIsRequired(false);
    setIsActive(true);
    setTargeting(EMPTY_TARGETING);
    setShowForm(true);
  };

  const openEdit = (field: CustomFieldRow) => {
    setEditing(field);
    setLabel(field.label);
    setHelpText(field.helpText);
    setAudience(field.audience);
    setIsRequired(field.isRequired);
    setIsActive(field.isActive);
    setTargeting(asTargeting(field));
    setShowForm(true);
  };

  const save = async () => {
    if (!label.trim()) {
      Alert.alert("Label needed", "Give the checkbox a label first.");
      return;
    }
    const token = getToken();
    if (!token) {
      Alert.alert("Not signed in", "Please sign in again to save.");
      return;
    }

    setSaving(true);
    try {
      const body: CustomFieldInput = {
        label: label.trim(),
        help_text: helpText.trim() || null,
        is_required: isRequired,
        audience,
        is_active: isActive,
        // On create, an unrestricted dimension is left out entirely; on edit it
        // must be sent as an empty array, or clearing a restriction is ignored
        // (the backend only rewrites the keys the request carries).
        ...(editing
          ? {
              location_ids: targeting.locationIds,
              package_ids: targeting.packageIds,
              attraction_ids: targeting.attractionIds,
              event_ids: targeting.eventIds,
            }
          : targetingPayload(targeting)),
      };

      if (editing) await updateCustomField(token, editing.id, body);
      else await createCustomField(token, body);

      setShowForm(false);
      await refetch();
    } catch (err) {
      Alert.alert(
        editing ? "Could not save changes" : "Could not add that checkbox",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (field: CustomFieldRow) => {
    Alert.alert(
      "Remove checkbox",
      `Remove "${field.label}"? Answers already collected are kept.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            const token = getToken();
            if (!token) {
              Alert.alert("Not signed in", "Please sign in again to remove.");
              return;
            }
            setBusyId(field.id);
            try {
              await deleteCustomField(token, field.id);
              await refetch();
            } catch (err) {
              Alert.alert(
                "Could not remove that checkbox",
                err instanceof Error ? err.message : "Please try again.",
              );
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  };

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header */}
      <View className="bg-white dark:bg-neutral-900 pt-12 pb-5 px-5 w-full border-b border-gray-100 dark:border-neutral-800">
        <View className="flex-row items-center justify-between">
          <Pressable
            onPress={() => router.back()}
            className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Feather name="chevron-left" size={20} color={headerIcon} />
          </Pressable>
          <Text className="text-gray-900 dark:text-white text-lg font-bold">
            Custom Fields
          </Text>
          <View style={{ width: 36 }} />
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={PRIMARY}
            colors={[PRIMARY]}
          />
        }
      >
        <View className="px-5">
          {/* Heading block — plain on the page background, with the compact
              "Add checkbox" button to its right, as on the web page. The button
              drops under the copy on narrow screens, which is what the web's
              own flex-col → sm:flex-row does. */}
          <View className="mt-6 mb-4">
            <Text className="text-2xl font-bold text-gray-900 dark:text-white">
              Custom Fields
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Extra checkboxes shown at checkout. Pick which packages,
              attractions or events ask them.
            </Text>

            {canWrite && (
              <Pressable
                onPress={openCreate}
                className="flex-row items-center justify-center gap-2 mt-4 bg-[#0644C7] px-4 py-3.5 rounded-xl active:opacity-90"
                accessibilityRole="button"
                accessibilityLabel="Add checkbox"
              >
                <Feather name="plus" size={16} color="#FFFFFF" />
                {/* numberOfLines + shrink-0: in a row, RN otherwise squeezes the
                    label against the icon and breaks it onto a second line. */}
                <Text
                  numberOfLines={1}
                  className="shrink-0 text-sm font-semibold text-white"
                >
                  Add checkbox
                </Text>
              </Pressable>
            )}
          </View>

          {/* List card: count header, then rows / empty / error. */}
          <View
            className="bg-white dark:bg-neutral-900 rounded-2xl overflow-hidden border border-gray-100 dark:border-neutral-800 shadow-sm"
            style={CARD_SHADOW}
          >
            <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-neutral-800">
              <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                {fields.length} field{fields.length === 1 ? "" : "s"}
              </Text>
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                {activeCount} active
              </Text>
            </View>

            {loading ? (
              <View className="py-16 items-center">
                <ActivityIndicator color={PRIMARY} />
              </View>
            ) : error ? (
              <View className="p-5">
                <Text className="text-red-600 font-semibold">
                  Could not load custom fields
                </Text>
                <Text className="text-red-500 text-sm mt-1">{error}</Text>
              </View>
            ) : fields.length === 0 ? (
              <View className="px-6 py-12 items-center">
                <Feather name="check-square" size={34} color="#D1D5DB" />
                <Text className="text-gray-700 dark:text-gray-200 font-semibold mt-3">
                  No custom fields yet
                </Text>
                <Text className="text-sm text-gray-500 dark:text-gray-400 text-center mt-1">
                  {canWrite
                    ? "Add a checkbox to ask something extra before a purchase completes."
                    : "A company admin can add checkboxes that ask something extra before a purchase completes."}
                </Text>
              </View>
            ) : (
              fields.map((field) => (
                <FieldCard
                  key={field.id}
                  field={field}
                  canWrite={canWrite}
                  busy={busyId === field.id}
                  onEdit={() => openEdit(field)}
                  onDelete={() => confirmDelete(field)}
                />
              ))
            )}
          </View>
        </View>
      </ScrollView>

      {/* Add / Edit checkbox */}
      <BottomSheet
        visible={showForm}
        onClose={() => !saving && setShowForm(false)}
        title={editing ? "Edit checkbox" : "Add checkbox"}
      >
        <ScrollView
          className="px-5 pb-6"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-4">
            <TextField
              label="Checkbox label"
              required
              value={label}
              onChangeText={setLabel}
              maxLength={255}
              placeholder="I have read the safety rules"
              hint="Exactly what the guest or staff member reads."
            />
            <TextField
              label="Helper text"
              value={helpText}
              onChangeText={setHelpText}
              maxLength={255}
              placeholder="Optional line under the checkbox"
            />
            <SelectField
              label="Who sees it"
              value={audience}
              options={AUDIENCE_OPTIONS}
              onSelect={(v) => setAudience(v as CustomFieldAudience)}
              disabled={saving}
            />

            <View className="gap-3">
              <CheckboxRow
                label="Must be ticked to continue"
                checked={isRequired}
                onToggle={() => setIsRequired((v) => !v)}
              />
              <CheckboxRow
                label="Active"
                checked={isActive}
                onToggle={() => setIsActive((v) => !v)}
              />
            </View>

            <View className="pt-1 border-t border-gray-100 dark:border-neutral-800">
              <FieldLabel className="mt-4">Where it appears</FieldLabel>
              <Text className="text-xs text-gray-400 dark:text-gray-500 -mt-1 mb-3">
                Tick venues to limit where it appears; the lists below then show
                only what those venues sell.
              </Text>
              <TargetingPicker
                value={targeting}
                onChange={setTargeting}
                disabled={saving}
              />
            </View>

            <Pressable
              onPress={save}
              disabled={saving}
              className="flex-row items-center justify-center gap-2 bg-[#0644C7] py-3.5 rounded-xl active:opacity-90"
              accessibilityRole="button"
              accessibilityLabel={editing ? "Save changes" : "Add checkbox"}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text
                  numberOfLines={1}
                  className="shrink-0 text-sm font-semibold text-white"
                >
                  {editing ? "Save changes" : "Add checkbox"}
                </Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => !saving && setShowForm(false)}
              disabled={saving}
              className="items-center justify-center py-3.5 rounded-xl border border-gray-200 dark:border-neutral-700 active:opacity-70"
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text
                numberOfLines={1}
                className="text-sm font-semibold text-gray-700 dark:text-gray-200"
              >
                Cancel
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </BottomSheet>
    </View>
  );
};

export default CustomFields;
