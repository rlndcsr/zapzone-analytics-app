import { Feather } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { getToken } from "../../lib/session";
import {
  deletePackage,
  duplicatePackage,
  fetchPackageDetail,
  updatePackage,
  type PackageDetail,
  type PackageRow,
  type UpdatePackageInput,
} from "../../services/packagesService";
import { BottomSheet } from "./BottomSheet";
import {
  SelectField,
  TextField,
  ToggleRow,
  type SelectOption,
} from "./FormControls";
import { StatusBadge } from "./StatusBadge";

const PRIMARY = "#0644C7";

type Mode = "menu" | "view" | "edit" | "duplicate";
export type LocationOption = { id: number; name: string };

const DURATION_UNITS: SelectOption[] = [
  { label: "Hours", value: "hours" },
  { label: "Minutes", value: "minutes" },
  { label: "Hours and minutes", value: "hours and minutes" },
];

const money = (n: number | null): string =>
  n == null ? "—" : `$${n.toFixed(2)}`;

const parseNum = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const parseIntOrNull = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
};

/* --- Local presentational helpers (per-module convention) ----------------- */

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

const ListLine = ({ left, right }: { left: string; right?: string }) => (
  <View className="flex-row items-center justify-between py-1.5 border-b border-gray-100 dark:border-neutral-800">
    <Text className="text-sm text-gray-700 dark:text-gray-200 flex-1 mr-2">
      {left}
    </Text>
    {!!right && (
      <Text className="text-sm font-medium text-gray-900 dark:text-white">
        {right}
      </Text>
    )}
  </View>
);

type Props = {
  visible: boolean;
  pkg: PackageRow | null;
  /** Company admins can duplicate to another location; others are locked to theirs. */
  isCompanyAdmin: boolean;
  /** {id,name} options for the duplicate destination (derived from the list). */
  locationOptions: LocationOption[];
  onClose: () => void;
  /** Refetch the list after any mutation so cards reflect the new state. */
  onChanged: () => void;
};

/**
 * Per-package actions hub — the mobile equivalent of the web admin's row buttons
 * (View / Edit / Duplicate / Delete). Everything lives in ONE BottomSheet that
 * swaps between menu / view / edit / duplicate content, so two native Modals are
 * never stacked (which crashes Android's new architecture). Reuses the same
 * endpoints as the web: GET/PUT/POST/DELETE /api/packages/{id}.
 */
export function PackageActionsSheet({
  visible,
  pkg,
  isCompanyAdmin,
  locationOptions,
  onClose,
  onChanged,
}: Props) {
  const [mode, setMode] = useState<Mode>("menu");
  const [detail, setDetail] = useState<PackageDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Edit form fields (core scalars only; relations/schedules/image are read-only).
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [pricePerAdditional, setPricePerAdditional] = useState("");
  const [minParticipants, setMinParticipants] = useState("");
  const [maxParticipants, setMaxParticipants] = useState("");
  const [duration, setDuration] = useState("");
  const [durationUnit, setDurationUnit] = useState("hours");
  const [bookingWindowDays, setBookingWindowDays] = useState("");
  const [minNotice, setMinNotice] = useState("");
  const [partialPct, setPartialPct] = useState("");
  const [partialFixed, setPartialFixed] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [displayOrder, setDisplayOrder] = useState("");
  const [hasGoh, setHasGoh] = useState(false);
  const [isActive, setIsActive] = useState(true);

  // Duplicate destination location.
  const [dupLocationId, setDupLocationId] = useState<number | null>(null);

  const reqRef = useRef(0);
  const seededRef = useRef<number | null>(null);

  // Reset to the menu whenever the sheet (re)opens for a package.
  useEffect(() => {
    if (visible) {
      setMode("menu");
      setDetail(null);
      setError(null);
      setBusy(false);
      seededRef.current = null;
    }
  }, [visible]);

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
      const d = await fetchPackageDetail(token, id);
      if (rid === reqRef.current) setDetail(d);
    } catch (err) {
      if (rid === reqRef.current) {
        setError(
          err instanceof Error ? err.message : "Failed to load package",
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

  const seedForm = useCallback((d: PackageDetail) => {
    setName(d.name);
    setDescription(d.description);
    setCategory(d.category);
    setPrice(String(d.price));
    setPricePerAdditional(
      d.pricePerAdditional != null ? String(d.pricePerAdditional) : "",
    );
    setMinParticipants(
      d.minParticipants != null ? String(d.minParticipants) : "",
    );
    setMaxParticipants(
      d.maxParticipants != null ? String(d.maxParticipants) : "",
    );
    setDuration(d.duration != null ? String(d.duration) : "");
    setDurationUnit(d.durationUnit || "hours");
    setBookingWindowDays(
      d.bookingWindowDays != null ? String(d.bookingWindowDays) : "",
    );
    setMinNotice(
      d.minBookingNoticeHours != null ? String(d.minBookingNoticeHours) : "",
    );
    setPartialPct(
      d.partialPaymentPercentage != null
        ? String(d.partialPaymentPercentage)
        : "",
    );
    setPartialFixed(
      d.partialPaymentFixed != null ? String(d.partialPaymentFixed) : "",
    );
    setCustomerNotes(d.customerNotes);
    setDisplayOrder(String(d.displayOrder));
    setHasGoh(d.hasGuestOfHonor);
    setIsActive(d.isActive);
  }, []);

  // Seed the edit form once the detail for this package has loaded.
  useEffect(() => {
    if (mode === "edit" && detail && seededRef.current !== detail.id) {
      seedForm(detail);
      seededRef.current = detail.id;
    }
  }, [mode, detail, seedForm]);

  if (!pkg) {
    return (
      <BottomSheet visible={visible} onClose={onClose} title="Package actions">
        <View className="px-5 py-10 items-center">
          <ActivityIndicator color={PRIMARY} />
        </View>
      </BottomSheet>
    );
  }

  const title =
    mode === "view"
      ? "Package details"
      : mode === "edit"
        ? "Edit package"
        : mode === "duplicate"
          ? "Duplicate package"
          : "Package actions";

  /* --- Actions ------------------------------------------------------------ */

  const goView = () => {
    setMode("view");
    ensureDetail(pkg.id);
  };
  const goEdit = () => {
    setMode("edit");
    ensureDetail(pkg.id);
  };
  const goDuplicate = () => {
    setDupLocationId(pkg.locationId ?? null);
    setMode("duplicate");
  };

  const confirmDelete = () => {
    Alert.alert(
      "Delete package",
      "Are you sure you want to delete this package? This action cannot be undone.",
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
              await deletePackage(token, pkg.id);
              onChanged();
              onClose();
            } catch (err) {
              Alert.alert(
                "Delete failed",
                err instanceof Error ? err.message : "Could not delete package.",
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
    // Validation mirrors the web EditPackage form.
    if (!name.trim()) return Alert.alert("Missing name", "Package name is required.");
    if (!category.trim())
      return Alert.alert("Missing category", "Please enter a category.");
    const priceNum = parseNum(price);
    if (priceNum == null || priceNum < 0)
      return Alert.alert("Invalid price", "Please enter a valid price.");
    const minP = parseIntOrNull(minParticipants);
    if (minParticipants.trim() && (minP == null || minP < 1))
      return Alert.alert("Invalid participants", "Min participants must be at least 1.");
    const maxP = parseIntOrNull(maxParticipants);
    if (maxParticipants.trim() && (maxP == null || maxP < 1))
      return Alert.alert("Invalid participants", "Max participants must be at least 1.");
    const ppa = parseNum(pricePerAdditional);
    if (pricePerAdditional.trim() && (ppa == null || ppa < 0))
      return Alert.alert(
        "Invalid price",
        "Price per additional participant must be 0 or more.",
      );
    const dur = parseNum(duration);
    if (
      durationUnit !== "hours and minutes" &&
      duration.trim() &&
      (dur == null || dur < 1)
    )
      return Alert.alert("Invalid duration", "Please enter a valid duration.");
    const pct = parseIntOrNull(partialPct);
    if (partialPct.trim() && (pct == null || pct < 0 || pct > 100))
      return Alert.alert(
        "Invalid deposit",
        "Partial payment percentage must be between 0 and 100.",
      );

    const token = getToken();
    if (!token) return Alert.alert("Not signed in", "Please sign in again.");

    const input: UpdatePackageInput = {
      name: name.trim(),
      description: description.trim(),
      category: category.trim(),
      price: priceNum,
      pricePerAdditional: ppa,
      minParticipants: minP,
      maxParticipants: maxP,
      duration: dur,
      durationUnit,
      bookingWindowDays: parseIntOrNull(bookingWindowDays),
      minBookingNoticeHours: parseIntOrNull(minNotice),
      hasGuestOfHonor: hasGoh,
      partialPaymentPercentage: pct,
      partialPaymentFixed: parseNum(partialFixed),
      customerNotes: customerNotes.trim(),
      displayOrder: parseIntOrNull(displayOrder),
      isActive,
    };

    setBusy(true);
    try {
      await updatePackage(token, pkg.id, input);
      onChanged();
      seededRef.current = null;
      await loadDetail(pkg.id);
      setMode("view");
    } catch (err) {
      Alert.alert(
        "Update failed",
        err instanceof Error ? err.message : "Could not update package.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDuplicate = async () => {
    const token = getToken();
    if (!token) return Alert.alert("Not signed in", "Please sign in again.");
    setBusy(true);
    try {
      await duplicatePackage(token, pkg.id, dupLocationId);
      onChanged();
      onClose();
      Alert.alert("Duplicated", `"${pkg.name}" was duplicated (inactive).`);
    } catch (err) {
      Alert.alert(
        "Duplicate failed",
        err instanceof Error ? err.message : "Could not duplicate package.",
      );
    } finally {
      setBusy(false);
    }
  };

  /* --- Render -------------------------------------------------------------- */

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      {mode === "menu" && (
        <View className="px-4 pb-6">
          <View className="px-4 pb-2">
            <Text
              className="text-base font-bold text-gray-900 dark:text-white"
              numberOfLines={1}
            >
              {pkg.name}
            </Text>
            {!!pkg.locationName && (
              <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {pkg.locationName}
              </Text>
            )}
          </View>
          <ActionRow icon="eye" label="View details" onPress={goView} />
          <ActionRow icon="edit-2" label="Edit package" onPress={goEdit} />
          <ActionRow
            icon="copy"
            label="Duplicate"
            hint="Creates an inactive copy"
            onPress={goDuplicate}
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
                <StatusBadge status={detail.isActive ? "active" : "inactive"} />
                {!!detail.packageType && (
                  <View className="bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-full">
                    <Text className="text-[10px] font-semibold text-[#0644C7] dark:text-blue-300 capitalize">
                      {detail.packageType}
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

              {detail.features.length > 0 && (
                <>
                  <SectionTitle>Features</SectionTitle>
                  {detail.features.map((f, i) => (
                    <View key={i} className="flex-row items-start gap-2 py-0.5">
                      <Feather
                        name="check"
                        size={14}
                        color="#16A34A"
                        style={{ marginTop: 3 }}
                      />
                      <Text className="text-sm text-gray-700 dark:text-gray-200 flex-1">
                        {f}
                      </Text>
                    </View>
                  ))}
                </>
              )}

              <SectionTitle>Details</SectionTitle>
              <Row label="Category" value={detail.category} />
              <Row label="Base price" value={money(detail.price)} />
              {detail.pricePerAdditional != null && (
                <Row
                  label="Per additional"
                  value={money(detail.pricePerAdditional)}
                />
              )}
              {(detail.minParticipants != null ||
                detail.maxParticipants != null) && (
                <Row
                  label="Participants"
                  value={`${detail.minParticipants ?? 1}–${detail.maxParticipants ?? "∞"}`}
                />
              )}
              {detail.duration != null && (
                <Row
                  label="Duration"
                  value={`${detail.duration} ${detail.durationUnit}`}
                />
              )}
              {detail.partialPaymentPercentage != null &&
                detail.partialPaymentPercentage > 0 && (
                  <Row
                    label="Deposit"
                    value={`${detail.partialPaymentPercentage}%`}
                  />
                )}
              {detail.partialPaymentFixed != null &&
                detail.partialPaymentFixed > 0 && (
                  <Row
                    label="Deposit (fixed)"
                    value={money(detail.partialPaymentFixed)}
                  />
                )}
              {detail.bookingWindowDays != null && (
                <Row
                  label="Booking window"
                  value={`${detail.bookingWindowDays} days`}
                />
              )}
              {detail.minBookingNoticeHours != null && (
                <Row
                  label="Min. notice"
                  value={`${detail.minBookingNoticeHours} h`}
                />
              )}
              <Row
                label="Guest of honor"
                value={detail.hasGuestOfHonor ? "Yes" : "No"}
              />
              {!!detail.locationName && (
                <Row label="Location" value={detail.locationName} />
              )}
              <Row label="Display order" value={String(detail.displayOrder)} />

              {detail.attractions.length > 0 && (
                <>
                  <SectionTitle>
                    Attractions ({detail.attractions.length})
                  </SectionTitle>
                  {detail.attractions.map((a) => (
                    <ListLine key={a.id} left={a.name} right={money(a.price)} />
                  ))}
                </>
              )}

              {detail.addOns.length > 0 && (
                <>
                  <SectionTitle>Add-ons ({detail.addOns.length})</SectionTitle>
                  {detail.addOns.map((a) => (
                    <ListLine key={a.id} left={a.name} right={money(a.price)} />
                  ))}
                </>
              )}

              {detail.rooms.length > 0 && (
                <>
                  <SectionTitle>Spaces ({detail.rooms.length})</SectionTitle>
                  {detail.rooms.map((r) => (
                    <ListLine
                      key={r.id}
                      left={r.name}
                      right={r.capacity != null ? `${r.capacity} cap` : undefined}
                    />
                  ))}
                </>
              )}

              {detail.promos.length > 0 && (
                <>
                  <SectionTitle>Promos ({detail.promos.length})</SectionTitle>
                  {detail.promos.map((p) => (
                    <ListLine key={p.id} left={p.name || p.code} />
                  ))}
                </>
              )}

              {detail.giftCards.length > 0 && (
                <>
                  <SectionTitle>
                    Gift cards ({detail.giftCards.length})
                  </SectionTitle>
                  {detail.giftCards.map((g) => (
                    <ListLine key={g.id} left={g.code} />
                  ))}
                </>
              )}

              {detail.schedules.length > 0 && (
                <>
                  <SectionTitle>Availability</SectionTitle>
                  {detail.schedules.map((s) => (
                    <View
                      key={s.id}
                      className="py-2 border-b border-gray-100 dark:border-neutral-800"
                    >
                      <View className="flex-row items-center justify-between">
                        <Text className="text-sm font-medium text-gray-800 dark:text-gray-100 capitalize">
                          {s.availabilityType}
                        </Text>
                        <Text className="text-xs text-gray-500 dark:text-gray-400">
                          {s.timeSlotStart && s.timeSlotEnd
                            ? `${s.timeSlotStart}–${s.timeSlotEnd}`
                            : ""}
                          {s.timeSlotInterval
                            ? ` · ${s.timeSlotInterval}m`
                            : ""}
                        </Text>
                      </View>
                      {s.dayConfiguration.length > 0 && (
                        <Text className="text-xs text-gray-500 dark:text-gray-400 mt-1 capitalize">
                          {s.dayConfiguration.join(", ")}
                        </Text>
                      )}
                    </View>
                  ))}
                </>
              )}

              {!!detail.customerNotes && (
                <>
                  <SectionTitle>Customer notes</SectionTitle>
                  <Text className="text-sm text-gray-700 dark:text-gray-200 leading-5">
                    {detail.customerNotes}
                  </Text>
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
                  onPress={goDuplicate}
                  className="flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl border border-gray-200 dark:border-neutral-700"
                >
                  <Feather name="copy" size={16} color="#374151" />
                  <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Duplicate
                  </Text>
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
                placeholder="Package name"
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
                placeholder="e.g. Birthday"
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
                  <TextField
                    label="Per additional"
                    value={pricePerAdditional}
                    onChangeText={setPricePerAdditional}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                  />
                </View>
              </View>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <TextField
                    label="Min participants"
                    value={minParticipants}
                    onChangeText={setMinParticipants}
                    keyboardType="number-pad"
                    placeholder="1"
                  />
                </View>
                <View className="flex-1">
                  <TextField
                    label="Max participants"
                    value={maxParticipants}
                    onChangeText={setMaxParticipants}
                    keyboardType="number-pad"
                    placeholder="—"
                  />
                </View>
              </View>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <TextField
                    label="Duration"
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
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <TextField
                    label="Booking window (days)"
                    value={bookingWindowDays}
                    onChangeText={setBookingWindowDays}
                    keyboardType="number-pad"
                    placeholder="—"
                  />
                </View>
                <View className="flex-1">
                  <TextField
                    label="Min. notice (hours)"
                    value={minNotice}
                    onChangeText={setMinNotice}
                    keyboardType="number-pad"
                    placeholder="—"
                  />
                </View>
              </View>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <TextField
                    label="Deposit %"
                    value={partialPct}
                    onChangeText={setPartialPct}
                    keyboardType="number-pad"
                    placeholder="0"
                  />
                </View>
                <View className="flex-1">
                  <TextField
                    label="Deposit (fixed)"
                    value={partialFixed}
                    onChangeText={setPartialFixed}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                  />
                </View>
              </View>
              <TextField
                label="Display order"
                value={displayOrder}
                onChangeText={setDisplayOrder}
                keyboardType="number-pad"
                placeholder="0"
              />
              <TextField
                label="Customer notes"
                value={customerNotes}
                onChangeText={setCustomerNotes}
                placeholder="Notes shown to customers"
                multiline
              />
              <ToggleRow
                label="Has guest of honor"
                value={hasGoh}
                onValueChange={setHasGoh}
              />
              <ToggleRow label="Active" value={isActive} onValueChange={setIsActive} />

              <Text className="text-xs text-gray-400 dark:text-gray-500">
                Attractions, add-ons, spaces, schedules and images are managed on
                the web admin.
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

      {mode === "duplicate" && (
        <View className="px-5 pb-8 pt-2">
          <Text className="text-sm text-gray-500 dark:text-gray-400">
            Duplicating
          </Text>
          <Text className="text-base font-bold text-gray-900 dark:text-white mt-0.5 mb-4">
            {pkg.name}
          </Text>

          {isCompanyAdmin && locationOptions.length > 1 ? (
            <SelectField
              label="Destination location"
              value={dupLocationId}
              options={locationOptions.map((l) => ({
                label: l.name,
                value: l.id,
              }))}
              onSelect={(v) => setDupLocationId(Number(v))}
            />
          ) : (
            <View>
              <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                Destination location
              </Text>
              <View className="rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800">
                <Text className="text-sm text-gray-700 dark:text-gray-200">
                  {pkg.locationName || "Your location"}
                </Text>
              </View>
            </View>
          )}

          <Text className="text-xs text-gray-400 dark:text-gray-500 mt-3">
            The copy is created as inactive, named “{pkg.name} (Copy)”.
          </Text>

          <View className="flex-row gap-3 mt-6">
            <Pressable
              onPress={() => setMode("menu")}
              disabled={busy}
              className="flex-1 items-center justify-center py-3.5 rounded-xl border border-gray-200 dark:border-neutral-700"
            >
              <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={handleDuplicate}
              disabled={busy}
              className="flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl bg-[#0644C7]"
            >
              {busy ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text className="text-sm font-semibold text-white">
                  Duplicate
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      )}
    </BottomSheet>
  );
}
