import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { webUrl } from "../../lib/api";
import { getToken } from "../../lib/session";
import { buildLocationSlug, createSlugWithId } from "../../lib/slug";
import {
  deleteAttraction,
  duplicateAttraction,
  fetchAttractionDetail,
  updateAttraction,
  type AttractionDetail,
  type AttractionRow,
  type UpdateAttractionInput,
} from "../../services/attractionsService";
import { BottomSheet } from "./BottomSheet";
import {
  SelectField,
  TextField,
  ToggleRow,
  type SelectOption,
} from "./FormControls";
import { StatusBadge } from "./StatusBadge";

const PRIMARY = "#0644C7";

type Mode = "menu" | "view" | "edit";

const PRICING_TYPES: SelectOption[] = [
  { label: "Per Person", value: "per_person" },
  { label: "Per Group", value: "per_group" },
  { label: "Per Hour", value: "per_hour" },
  { label: "Per Game", value: "per_game" },
  { label: "Fixed Price", value: "fixed" },
];

const DURATION_UNITS: SelectOption[] = [
  { label: "Minutes", value: "minutes" },
  { label: "Hours", value: "hours" },
];

const PRICING_SUFFIX: Record<string, string> = {
  per_person: "/person",
  per_group: "/group",
  per_hour: "/hour",
};

const pricingLabel = (value: string): string =>
  PRICING_TYPES.find((p) => p.value === value)?.label ?? value;

const money = (n: number): string =>
  `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const parseNum = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** Public purchase URL — same shape the web ManageAttractions "Copy Link" builds. */
const buildPurchaseLink = (a: AttractionRow): string =>
  webUrl(
    `/purchase/attraction/${buildLocationSlug(a.locationName, a.locationId)}/${createSlugWithId(a.name, a.id)}`,
  );

/* --- Local presentational helpers (matches PackageActionsSheet convention) -- */

const ActionRow = ({
  icon,
  label,
  hint,
  danger = false,
  busy = false,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  hint?: string;
  danger?: boolean;
  busy?: boolean;
  onPress: () => void;
}) => {
  const color = danger ? "#dc2626" : "#374151";
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
      className="flex-row items-center gap-3 px-4 py-3.5 rounded-xl mb-1"
    >
      <View className="w-9 h-9 rounded-xl items-center justify-center bg-gray-100 dark:bg-neutral-800">
        {busy ? (
          <ActivityIndicator size="small" color={color} />
        ) : (
          <Feather name={icon} size={18} color={color} />
        )}
      </View>
      <View className="flex-1">
        <Text
          className="text-base font-medium text-gray-800 dark:text-gray-100"
          style={danger ? { color } : undefined}
        >
          {label}
        </Text>
        {!!hint && (
          <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {hint}
          </Text>
        )}
      </View>
    </Pressable>
  );
};

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <Text className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 mt-5 mb-2">
    {children}
  </Text>
);

const Row = ({ label, value }: { label: string; value: string }) => (
  <View className="flex-row items-start justify-between py-1.5">
    <Text className="text-sm text-gray-500 dark:text-gray-400 mr-3">
      {label}
    </Text>
    <Text className="text-sm font-medium text-gray-900 dark:text-white flex-1 text-right">
      {value}
    </Text>
  </View>
);

type Props = {
  visible: boolean;
  attraction: AttractionRow | null;
  onClose: () => void;
  /** Refetch the list after any mutation so cards reflect the new state. */
  onChanged: () => void;
};

/**
 * Per-attraction actions hub — the mobile equivalent of the web admin's row
 * buttons (Copy Link / Open Link / View / Edit / Duplicate / Delete). Everything
 * lives in ONE BottomSheet that swaps between menu / view / edit content, so two
 * native Modals are never stacked. Reuses the same endpoints as the web:
 * GET/PUT/DELETE /api/attractions/{id} and POST /api/attractions (duplicate).
 * Mirrors the sibling PackageActionsSheet.
 */
export function AttractionActionsSheet({
  visible,
  attraction,
  onClose,
  onChanged,
}: Props) {
  const [mode, setMode] = useState<Mode>("menu");
  const [detail, setDetail] = useState<AttractionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  // Edit form fields (core scalars; availability/images/add-ons are preserved
  // from the loaded detail and managed on the web admin).
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [pricingType, setPricingType] = useState("per_person");
  const [maxCapacity, setMaxCapacity] = useState("");
  const [displayCapacity, setDisplayCapacity] = useState(true);
  const [duration, setDuration] = useState("");
  const [durationUnit, setDurationUnit] = useState("minutes");
  const [displayOrder, setDisplayOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);

  const reqRef = useRef(0);
  const seededRef = useRef<number | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset to the menu whenever the sheet (re)opens for an attraction.
  useEffect(() => {
    if (visible) {
      setMode("menu");
      setDetail(null);
      setError(null);
      setBusy(false);
      setCopied(false);
      setDuplicating(false);
      seededRef.current = null;
    }
  }, [visible]);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const loadDetail = useCallback(async (id: number) => {
    const token = getToken();
    if (!token) {
      setError("Not signed in");
      return;
    }
    const rid = ++reqRef.current;
    setLoading(true);
    setError(null);
    try {
      const d = await fetchAttractionDetail(token, id);
      if (rid === reqRef.current) setDetail(d);
    } catch (err) {
      if (rid === reqRef.current) {
        setError(
          err instanceof Error ? err.message : "Failed to load attraction",
        );
      }
    } finally {
      if (rid === reqRef.current) setLoading(false);
    }
  }, []);

  const ensureDetail = useCallback(
    (id: number) => {
      if (!detail || detail.id !== id) loadDetail(id);
    },
    [detail, loadDetail],
  );

  const seedForm = useCallback((d: AttractionDetail) => {
    setName(d.name);
    setDescription(d.description);
    setCategory(d.category);
    setPrice(String(d.price));
    setPricingType(d.pricingType || "per_person");
    setMaxCapacity(String(d.maxCapacity));
    setDisplayCapacity(d.displayCapacityToCustomers);
    setDuration(d.duration != null ? String(d.duration) : "");
    setDurationUnit(d.durationUnit === "hours" ? "hours" : "minutes");
    setDisplayOrder(String(d.displayOrder));
    setIsActive(d.status === "active");
  }, []);

  // Seed the edit form once the detail for this attraction has loaded.
  useEffect(() => {
    if (mode === "edit" && detail && seededRef.current !== detail.id) {
      seedForm(detail);
      seededRef.current = detail.id;
    }
  }, [mode, detail, seedForm]);

  if (!attraction) {
    return (
      <BottomSheet visible={visible} onClose={onClose} title="Attraction actions">
        <View className="px-5 py-10 items-center">
          <ActivityIndicator color={PRIMARY} />
        </View>
      </BottomSheet>
    );
  }

  const title =
    mode === "view"
      ? "Attraction details"
      : mode === "edit"
        ? "Edit attraction"
        : "Attraction actions";

  const purchaseLink = buildPurchaseLink(attraction);

  /* --- Actions ------------------------------------------------------------ */

  const goView = () => {
    setMode("view");
    ensureDetail(attraction.id);
  };
  const goEdit = () => {
    setMode("edit");
    ensureDetail(attraction.id);
  };

  const handleCopyLink = async () => {
    await Clipboard.setStringAsync(purchaseLink);
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2000);
  };

  // Opens the in-app customer purchase page for this attraction (the internal
  // equivalent of the web `/purchase/attraction/...` route) instead of an
  // external browser. Passes the attraction id + slug so the screen can load
  // the record and mirror the public purchase URL.
  const handleViewPurchasePage = () => {
    const slug = createSlugWithId(attraction.name, attraction.id);
    onClose();
    router.push({
      pathname: "/attractions/purchase-page",
      params: { id: String(attraction.id), slug },
    });
  };

  const handleDuplicate = async () => {
    const token = getToken();
    if (!token) return Alert.alert("Not signed in", "Please sign in again.");
    setDuplicating(true);
    try {
      await duplicateAttraction(token, attraction.id);
      onChanged();
      onClose();
      Alert.alert(
        "Duplicated",
        `"${attraction.name}" was duplicated (inactive copy).`,
      );
    } catch (err) {
      Alert.alert(
        "Duplicate failed",
        err instanceof Error ? err.message : "Could not duplicate attraction.",
      );
    } finally {
      setDuplicating(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      "Delete attraction",
      "Are you sure you want to delete this attraction? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const token = getToken();
            if (!token) {
              Alert.alert("Not signed in", "Please sign in again.");
              return;
            }
            setBusy(true);
            try {
              await deleteAttraction(token, attraction.id);
              onChanged();
              onClose();
            } catch (err) {
              Alert.alert(
                "Delete failed",
                err instanceof Error
                  ? err.message
                  : "Could not delete attraction.",
              );
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const handleSave = async () => {
    // Validation mirrors the web EditAttraction form.
    if (!name.trim())
      return Alert.alert("Missing name", "Attraction name is required.");
    if (!category.trim())
      return Alert.alert("Missing category", "Please enter a category.");
    const priceNum = parseNum(price);
    if (priceNum == null || priceNum < 0)
      return Alert.alert("Invalid price", "Please enter a valid price.");
    const capNum = parseNum(maxCapacity);
    if (capNum == null || capNum < 1)
      return Alert.alert(
        "Invalid capacity",
        "Capacity must be at least 1.",
      );

    const token = getToken();
    if (!token) return Alert.alert("Not signed in", "Please sign in again.");
    if (!detail) return;

    const durationNum = parseNum(duration) ?? 0;

    // Full payload like the web: send edited scalars, preserve availability /
    // images / add-ons from the loaded detail so nothing is wiped.
    const input: UpdateAttractionInput = {
      location_id: detail.locationId ?? undefined,
      name: name.trim(),
      description: description.trim(),
      category: category.trim(),
      price: priceNum,
      pricing_type: pricingType,
      max_capacity: Math.round(capNum),
      duration: durationNum,
      duration_unit: durationUnit === "hours" ? "hours" : "minutes",
      availability: detail.availability,
      image: detail.images.length > 0 ? detail.images : undefined,
      is_active: isActive,
      addon_ids: detail.addOns.map((a) => a.id),
      add_ons_order: detail.addOnsOrder,
      display_capacity_to_customers: displayCapacity,
      display_order: parseNum(displayOrder) ?? 0,
    };

    setBusy(true);
    try {
      await updateAttraction(token, attraction.id, input);
      onChanged();
      seededRef.current = null;
      await loadDetail(attraction.id);
      setMode("view");
    } catch (err) {
      Alert.alert(
        "Update failed",
        err instanceof Error ? err.message : "Could not update attraction.",
      );
    } finally {
      setBusy(false);
    }
  };

  /* --- Render -------------------------------------------------------------- */

  const suffix = PRICING_SUFFIX[detail?.pricingType ?? attraction.pricingType] ?? "";

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      {mode === "menu" && (
        <View className="px-4 pb-6">
          <View className="px-4 pb-2">
            <Text
              className="text-base font-bold text-gray-900 dark:text-white"
              numberOfLines={1}
            >
              {attraction.name}
            </Text>
            {!!attraction.locationName && (
              <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {attraction.locationName}
              </Text>
            )}
          </View>
          <ActionRow
            icon={copied ? "check" : "link"}
            label={copied ? "Link copied" : "Copy link"}
            hint="Public purchase URL"
            onPress={handleCopyLink}
          />
          <ActionRow
            icon="shopping-cart"
            label="View purchase page"
            hint="Open the in-app purchase page"
            onPress={handleViewPurchasePage}
          />
          <ActionRow icon="eye" label="View details" onPress={goView} />
          <ActionRow icon="edit-2" label="Edit attraction" onPress={goEdit} />
          <ActionRow
            icon="copy"
            label="Duplicate"
            hint="Creates an inactive copy"
            busy={duplicating}
            onPress={handleDuplicate}
          />
          <ActionRow
            icon="trash-2"
            label="Delete"
            danger
            busy={busy}
            onPress={confirmDelete}
          />
        </View>
      )}

      {mode === "view" && (
        <ScrollView
          className="px-5"
          contentContainerStyle={{ paddingBottom: 28 }}
          showsVerticalScrollIndicator={false}
        >
          {loading && (
            <View className="py-10 items-center">
              <ActivityIndicator color={PRIMARY} />
            </View>
          )}
          {!loading && error && (
            <View className="bg-red-50 dark:bg-red-900/20 rounded-2xl p-4 my-3">
              <Text className="text-sm text-red-600 dark:text-red-300">
                {error}
              </Text>
            </View>
          )}
          {!loading && !error && detail && (
            <>
              <View className="flex-row items-center gap-2 mt-2">
                <StatusBadge status={detail.status} />
                {detail.name.includes("(Copy)") && (
                  <View className="flex-row items-center gap-1 px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40">
                    <Feather name="copy" size={10} color="#B45309" />
                    <Text className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                      Copy
                    </Text>
                  </View>
                )}
              </View>

              {!!detail.description && (
                <>
                  <SectionTitle>Description</SectionTitle>
                  <Text className="text-sm text-gray-700 dark:text-gray-200 leading-5">
                    {detail.description}
                  </Text>
                </>
              )}

              <SectionTitle>Details</SectionTitle>
              <Row label="Category" value={detail.category} />
              <Row
                label="Price"
                value={`${money(detail.price)}${suffix ? ` ${suffix}` : ""}`}
              />
              <Row label="Pricing type" value={pricingLabel(detail.pricingType)} />
              <Row
                label="Capacity"
                value={`${detail.maxCapacity} people${
                  detail.displayCapacityToCustomers ? "" : " (hidden)"
                }`}
              />
              <Row
                label="Duration"
                value={
                  detail.duration
                    ? `${detail.duration} ${detail.durationUnit}`
                    : "Unlimited"
                }
              />
              {!!detail.locationName && (
                <Row label="Location" value={detail.locationName} />
              )}
              <Row label="Display order" value={String(detail.displayOrder)} />

              {detail.addOns.length > 0 && (
                <>
                  <SectionTitle>Add-ons ({detail.addOns.length})</SectionTitle>
                  {detail.addOns.map((a) => (
                    <View
                      key={a.id}
                      className="flex-row items-center justify-between py-1.5 border-b border-gray-100 dark:border-neutral-800"
                    >
                      <Text className="text-sm text-gray-700 dark:text-gray-200 flex-1 mr-2">
                        {a.name}
                      </Text>
                      <Text className="text-sm font-medium text-gray-900 dark:text-white">
                        {money(a.price)}
                      </Text>
                    </View>
                  ))}
                </>
              )}

              {detail.availability.length > 0 && (
                <>
                  <SectionTitle>Availability</SectionTitle>
                  {detail.availability.map((s, i) => (
                    <View
                      key={i}
                      className="py-2 border-b border-gray-100 dark:border-neutral-800"
                    >
                      <View className="flex-row items-center justify-between">
                        <Text className="text-sm font-medium text-gray-800 dark:text-gray-100">
                          {s.start_time}–{s.end_time}
                        </Text>
                      </View>
                      {s.days.length > 0 && (
                        <Text className="text-xs text-gray-500 dark:text-gray-400 mt-1 capitalize">
                          {s.days.join(", ")}
                        </Text>
                      )}
                    </View>
                  ))}
                </>
              )}

              {/* Footer actions */}
              <View className="flex-row gap-3 mt-6">
                <Pressable
                  onPress={goEdit}
                  className="flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl bg-[#0644C7]"
                >
                  <Feather name="edit-2" size={16} color="#fff" />
                  <Text className="text-sm font-semibold text-white">Edit</Text>
                </Pressable>
                <Pressable
                  onPress={handleDuplicate}
                  disabled={duplicating}
                  className="flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl border border-gray-200 dark:border-neutral-700"
                >
                  {duplicating ? (
                    <ActivityIndicator size="small" color="#374151" />
                  ) : (
                    <>
                      <Feather name="copy" size={16} color="#374151" />
                      <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                        Duplicate
                      </Text>
                    </>
                  )}
                </Pressable>
                <Pressable
                  onPress={confirmDelete}
                  className="w-12 items-center justify-center py-3.5 rounded-xl border border-red-200 dark:border-red-900/50"
                >
                  <Feather name="trash-2" size={16} color="#dc2626" />
                </Pressable>
              </View>
            </>
          )}
        </ScrollView>
      )}

      {mode === "edit" && (
        <ScrollView
          className="px-5"
          contentContainerStyle={{ paddingBottom: 28 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {loading && !detail ? (
            <View className="py-10 items-center">
              <ActivityIndicator color={PRIMARY} />
            </View>
          ) : (
            <View className="gap-4 pt-2">
              <TextField
                label="Name"
                required
                value={name}
                onChangeText={setName}
                placeholder="Attraction name"
              />
              <TextField
                label="Description"
                value={description}
                onChangeText={setDescription}
                placeholder="Description"
                multiline
              />
              <TextField
                label="Category"
                required
                value={category}
                onChangeText={setCategory}
                placeholder="e.g. Arcade"
              />
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <TextField
                    label="Price"
                    required
                    value={price}
                    onChangeText={setPrice}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                  />
                </View>
                <View className="flex-1">
                  <SelectField
                    label="Pricing type"
                    value={pricingType}
                    options={PRICING_TYPES}
                    onSelect={(v) => setPricingType(String(v))}
                  />
                </View>
              </View>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <TextField
                    label="Max capacity"
                    required
                    value={maxCapacity}
                    onChangeText={setMaxCapacity}
                    keyboardType="number-pad"
                    placeholder="10"
                  />
                </View>
                <View className="flex-1">
                  <TextField
                    label="Display order"
                    value={displayOrder}
                    onChangeText={setDisplayOrder}
                    keyboardType="number-pad"
                    placeholder="0"
                  />
                </View>
              </View>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <TextField
                    label="Duration (0 = unlimited)"
                    value={duration}
                    onChangeText={setDuration}
                    keyboardType="decimal-pad"
                    placeholder="0"
                  />
                </View>
                <View className="flex-1">
                  <SelectField
                    label="Unit"
                    value={durationUnit}
                    options={DURATION_UNITS}
                    onSelect={(v) => setDurationUnit(String(v))}
                  />
                </View>
              </View>
              <ToggleRow
                label="Display capacity to customers"
                value={displayCapacity}
                onValueChange={setDisplayCapacity}
              />
              <ToggleRow
                label="Active"
                value={isActive}
                onValueChange={setIsActive}
              />

              <Text className="text-xs text-gray-400 dark:text-gray-500">
                Availability, images and add-ons are managed on the web admin.
              </Text>

              <View className="flex-row gap-3 mt-2">
                <Pressable
                  onPress={() => setMode(detail ? "view" : "menu")}
                  disabled={busy}
                  className="flex-1 items-center justify-center py-3.5 rounded-xl border border-gray-200 dark:border-neutral-700"
                >
                  <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleSave}
                  disabled={busy}
                  className="flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl bg-[#0644C7]"
                >
                  {busy ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text className="text-sm font-semibold text-white">
                      Save changes
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </BottomSheet>
  );
}
