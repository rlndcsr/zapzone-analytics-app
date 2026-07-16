import { Feather } from "@expo/vector-icons";
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

import { getToken } from "../../lib/session";
import {
  deletePackage,
  duplicatePackage,
  fetchPackageDetail,
  type PackageDetail,
  type PackageRow,
} from "../../services/packagesService";
import { BottomSheet } from "./BottomSheet";
import { SelectField } from "./FormControls";
import { StatusBadge } from "./StatusBadge";

const PRIMARY = "#0644C7";

type Mode = "view" | "duplicate";
export type LocationOption = { id: number; name: string };

const money = (n: number | null): string =>
  n == null ? "—" : `$${n.toFixed(2)}`;

// Availability time formatting — mirrors the web admin's utils/timeFormat.ts so
// the details view reads identically ("16:30:00" → "4:30 PM").
const convertTo12Hour = (time24: string | null): string => {
  if (!time24) return "";
  const [hourStr, minuteStr] = time24.substring(0, 5).split(":");
  let hour = parseInt(hourStr, 10);
  if (Number.isNaN(hour)) return time24;
  const minute = minuteStr || "00";
  const period = hour >= 12 ? "PM" : "AM";
  if (hour === 0) hour = 12;
  else if (hour > 12) hour = hour - 12;
  return `${hour}:${minute} ${period}`;
};

/** "4:30 PM - 9:00 PM" (mirrors the web admin's formatTimeRange). */
const formatTimeRange = (
  start: string | null,
  end: string | null,
): string => {
  if (!start || !end) return "";
  return `${convertTo12Hour(start)} - ${convertTo12Hour(end)}`;
};

/* --- Local presentational helpers (per-module convention) ----------------- */

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
 * Per-package detail sheet — opens straight into the package details (View) with
 * footer actions. Edit opens the full-screen Edit Package screen (web parity);
 * Duplicate/Delete run inline. One BottomSheet swaps between view / duplicate
 * content, so two native Modals are never stacked (which crashes Android's new
 * architecture). Reuses the same endpoints as the web: GET/POST/DELETE
 * /api/packages/{id} (edit uses PUT from the dedicated screen).
 */
export function PackageActionsSheet({
  visible,
  pkg,
  isCompanyAdmin,
  locationOptions,
  onClose,
  onChanged,
}: Props) {
  const [mode, setMode] = useState<Mode>("view");
  const [detail, setDetail] = useState<PackageDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Duplicate destination location.
  const [dupLocationId, setDupLocationId] = useState<number | null>(null);

  const reqRef = useRef(0);

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

  // Open straight into the details view and load the selected package's detail
  // immediately. Keyed on the package id so switching packages reloads, but a
  // same-package list refetch (onChanged) doesn't.
  const pkgId = pkg?.id;
  useEffect(() => {
    if (visible && pkgId != null) {
      setMode("view");
      setDetail(null);
      setError(null);
      setBusy(false);
      loadDetail(pkgId);
    }
  }, [visible, pkgId, loadDetail]);

  if (!pkg) {
    return (
      <BottomSheet visible={visible} onClose={onClose} title="Package actions">
        <View className="px-5 py-10 items-center">
          <ActivityIndicator color={PRIMARY} />
        </View>
      </BottomSheet>
    );
  }

  const title = mode === "view" ? "Package details" : "Duplicate package";

  /* --- Actions ------------------------------------------------------------ */

  // Edit is a full-screen experience (all sections, like the web admin). Close
  // the sheet and navigate; the list refetches on focus via the stale flag the
  // edit screen sets on save.
  const goEdit = () => {
    onClose();
    router.push(`/packages/edit-packages?id=${pkg.id}`);
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
              {/* Title header — package name as the primary heading with the
                  category beneath it, mirroring the web admin's PackageDetails. */}
              <Text className="text-xl font-bold text-gray-900 dark:text-white mt-2">
                {detail.name}
              </Text>
              <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {detail.category || "No category"}
              </Text>

              <View className="flex-row items-center gap-2 mt-3">
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
                            ? formatTimeRange(s.timeSlotStart, s.timeSlotEnd)
                            : ""}
                          {s.timeSlotInterval
                            ? ` (${s.timeSlotInterval} min intervals)`
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
              onPress={() => setMode("view")}
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
