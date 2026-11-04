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

import {
  canChangeOnlineAvailability,
  DUPLICATE_STAYED_ONLINE,
  duplicateBackendOnlyNote,
} from "../../lib/packages/onlineAvailability";
import { monthlyPatternLabel } from "../../lib/packages/scheduleDays";
import {
  packageDurationMinutes,
  startCadenceLabel,
} from "../../lib/packages/scheduleSlots";
import { requestErrorMessage } from "../../lib/requestError";
import { getCurrentUser, getToken } from "../../lib/session";
import { formatDuration, formatTimeRange } from "../../lib/time";
import { normalizeCategory } from "../../lib/venueCategories";
import {
  deletePackage,
  duplicatePackage,
  fetchPackageDetail,
  type PackageDetail,
  type PackageRow,
} from "../../services/packagesService";
import { BackendOnlyBadge } from "./BackendOnly";
import { BottomSheet } from "./BottomSheet";
import { SelectField } from "./FormControls";

const PRIMARY = "#0644C7";

type Mode = "view" | "duplicate";
export type LocationOption = { id: number; name: string };

const money = (n: number | null): string =>
  n == null ? "—" : `$${n.toFixed(2)}`;

/** The web page's `capitalize` class: first letter upper-cased ("regular" → "Regular"). */
const capitalize = (s: string): string =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

/* --- Local presentational helpers (mirrors the web PackageDetails page) ---- */

/** Section heading, one per block ("Description", "Package Details", …). */
const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <Text className="text-base font-bold text-gray-900 dark:text-white mt-6 mb-3">
    {children}
  </Text>
);

/** Half-width labelled fact with a tinted icon tile (the Package Details grid). */
const DetailTile = ({
  icon,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  value: string;
}) => (
  <View className="w-1/2 flex-row items-start gap-2.5 mb-4 pr-2">
    <View className="w-8 h-8 rounded-lg bg-[#0644C7]/10 items-center justify-center">
      <Feather name={icon} size={15} color={PRIMARY} />
    </View>
    <View className="flex-1">
      <Text className="text-[11px] text-gray-500 dark:text-gray-400">
        {label}
      </Text>
      <Text className="text-[13px] font-medium text-gray-900 dark:text-white">
        {value}
      </Text>
    </View>
  </View>
);

/** Tinted list card: name on the left, an optional accessory on the right. */
const InfoCard = ({
  left,
  right,
  tone = "primary",
}: {
  left: string;
  right?: React.ReactNode;
  tone?: "primary" | "neutral";
}) => (
  <View
    className={`flex-row items-start justify-between gap-3 rounded-xl border p-3.5 mb-2 ${
      tone === "primary"
        ? "bg-blue-50 border-blue-100 dark:bg-blue-900/20 dark:border-blue-900/40"
        : "bg-gray-50 border-gray-200 dark:bg-neutral-800 dark:border-neutral-700"
    }`}
  >
    <Text className="flex-1 text-sm font-medium text-gray-900 dark:text-white">
      {left}
    </Text>
    {right}
  </View>
);

/** Green "Active" / grey "Inactive" pill, as used on each schedule card. */
const ActivePill = ({ active }: { active: boolean }) => (
  <View
    className={`px-2.5 py-1 rounded-full ${
      active
        ? "bg-green-100 dark:bg-green-900/40"
        : "bg-gray-100 dark:bg-neutral-800"
    }`}
  >
    <Text
      className={`text-[10px] font-semibold ${
        active
          ? "text-green-700 dark:text-green-300"
          : "text-gray-500 dark:text-gray-400"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </Text>
  </View>
);

type Props = {
  visible: boolean;
  pkg: PackageRow | null;
  /** Content to open on: the details (default) or straight to the duplicate form. */
  initialMode?: Mode;
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
  initialMode = "view",
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

  // Open on the requested content (details by default, or the duplicate form
  // when the card's copy action opened us) and load the selected package's
  // detail immediately. Keyed on the package id so switching packages reloads,
  // but a same-package list refetch (onChanged) doesn't.
  const pkgId = pkg?.id;
  const pkgLocationId = pkg?.locationId ?? null;
  useEffect(() => {
    if (visible && pkgId != null) {
      setMode(initialMode);
      setDupLocationId(pkgLocationId);
      setDetail(null);
      setError(null);
      setBusy(false);
      loadDetail(pkgId);
    }
  }, [visible, pkgId, pkgLocationId, initialMode, loadDetail]);

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
                requestErrorMessage(err, "Could not delete package."),
              );
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  // A manager's or admin's copy of a backend-only package stays backend only.
  const canChangeOnline = canChangeOnlineAvailability(getCurrentUser()?.role);
  const sourceBackendOnly = (detail?.availableOnline ?? pkg.availableOnline) === false;

  const handleDuplicate = async () => {
    const token = getToken();
    if (!token) return Alert.alert("Not signed in", "Please sign in again.");
    setBusy(true);
    try {
      const { copyStayedOnline } = await duplicatePackage(
        token,
        pkg.id,
        dupLocationId,
        canChangeOnline,
      );
      onChanged();
      onClose();
      Alert.alert(
        "Duplicated",
        `"${pkg.name}" was duplicated (inactive).${
          copyStayedOnline ? `\n\n${DUPLICATE_STAYED_ONLINE}` : ""
        }`,
      );
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
              {/* Header — the web page's title block: name, category, then the
                  status / Backend only pills beside Edit and Delete. Duplicate
                  is the app's own extra (the web page has no copy button). */}
              <Text className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
                {detail.name}
              </Text>
              <Text className="text-sm text-gray-600 dark:text-gray-400 mt-1.5">
                {normalizeCategory(detail.category) || "No category"}
              </Text>
              <View className="flex-row flex-wrap items-center gap-2 mt-3">
                <View
                  className={`px-3 py-1.5 rounded-full ${
                    detail.isActive
                      ? "bg-green-100 dark:bg-green-900/40"
                      : "bg-gray-100 dark:bg-neutral-800"
                  }`}
                >
                  <Text
                    className={`text-xs font-medium ${
                      detail.isActive
                        ? "text-green-800 dark:text-green-300"
                        : "text-gray-800 dark:text-gray-200"
                    }`}
                  >
                    {detail.isActive ? "Active" : "Inactive"}
                  </Text>
                </View>
                {detail.availableOnline === false && (
                  <BackendOnlyBadge isActive={detail.isActive} />
                )}
              </View>
              <View className="flex-row gap-2 mt-3">
                <Pressable
                  onPress={goEdit}
                  className="flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl bg-[#0644C7] active:opacity-90"
                  accessibilityRole="button"
                >
                  <Feather name="edit" size={15} color="#fff" />
                  <Text className="text-sm font-semibold text-white">Edit</Text>
                </Pressable>
                <Pressable
                  onPress={confirmDelete}
                  disabled={busy}
                  className={`flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl bg-red-600 ${
                    busy ? "opacity-60" : "active:opacity-90"
                  }`}
                  accessibilityRole="button"
                >
                  <Feather name="trash-2" size={15} color="#fff" />
                  <Text className="text-sm font-semibold text-white">
                    Delete
                  </Text>
                </Pressable>
                <Pressable
                  onPress={goDuplicate}
                  className="flex-row items-center justify-center gap-2 px-4 py-3 rounded-xl border border-gray-200 dark:border-neutral-700 active:opacity-70"
                  accessibilityRole="button"
                  accessibilityLabel="Duplicate package"
                >
                  <Feather name="copy" size={15} color="#374151" />
                </Pressable>
              </View>

              {/* Description — always shown, with the web's fallback text. */}
              <SectionTitle>Description</SectionTitle>
              <Text className="text-sm text-gray-700 dark:text-gray-200 leading-6">
                {detail.description || "No description provided"}
              </Text>

              {detail.features.length > 0 && (
                <>
                  <SectionTitle>Features</SectionTitle>
                  {detail.features.map((f, i) => (
                    <View key={i} className="flex-row items-start gap-2.5 py-1">
                      <View
                        className="w-1.5 h-1.5 rounded-full bg-gray-400"
                        style={{ marginTop: 7 }}
                      />
                      <Text className="text-sm text-gray-700 dark:text-gray-200 flex-1 leading-5">
                        {f}
                      </Text>
                    </View>
                  ))}
                </>
              )}

              {/* Package Details — the web page's grid, field for field and in
                  its order. Visibility follows the web's truthiness checks:
                  decimal fields arrive as strings ("0.00" still shows), while
                  an integer 0 (max participants) hides. */}
              <SectionTitle>Package Details</SectionTitle>
              <View className="flex-row flex-wrap">
                <DetailTile
                  icon="tag"
                  label="Category"
                  value={normalizeCategory(detail.category) || "No category"}
                />
                {!!detail.packageType && (
                  <DetailTile
                    icon="tag"
                    label="Package Type"
                    value={capitalize(detail.packageType)}
                  />
                )}
                <DetailTile
                  icon="dollar-sign"
                  label="Base Price"
                  value={money(detail.price)}
                />
                {detail.pricePerAdditional != null && (
                  <DetailTile
                    icon="dollar-sign"
                    label="Price Per Additional"
                    value={money(detail.pricePerAdditional)}
                  />
                )}
                {!!detail.maxParticipants && (
                  <DetailTile
                    icon="users"
                    label="Max Participants"
                    value={`${detail.maxParticipants} people`}
                  />
                )}
                {detail.duration != null && (
                  <DetailTile
                    icon="clock"
                    label="Duration"
                    value={formatDuration(detail.duration, detail.durationUnit)}
                  />
                )}
                {!!detail.locationName && (
                  <DetailTile
                    icon="map-pin"
                    label="Location"
                    value={detail.locationName}
                  />
                )}
                {!!detail.createdAt && (
                  <DetailTile
                    icon="calendar"
                    label="Created"
                    // The web's toLocaleDateString(): "12/13/2025".
                    value={new Date(detail.createdAt).toLocaleDateString("en-US")}
                  />
                )}
              </View>

              {detail.schedules.length > 0 && (
                <>
                  <SectionTitle>Availability Schedules</SectionTitle>
                  {detail.schedules.map((s, i) => (
                    <View
                      key={s.id}
                      className="rounded-xl border border-blue-100 bg-blue-50 p-3.5 mb-2 dark:border-blue-900/40 dark:bg-blue-900/20"
                    >
                      <View className="flex-row items-start justify-between mb-2.5">
                        <View className="flex-row items-center gap-2">
                          <Feather name="calendar" size={15} color={PRIMARY} />
                          <Text className="text-sm font-bold text-gray-900 dark:text-white">
                            Schedule {i + 1}
                          </Text>
                        </View>
                        <ActivePill active={s.isActive} />
                      </View>

                      {s.dayConfiguration.length > 0 ? (
                        <View className="flex-row flex-wrap gap-1.5 mb-2">
                          {s.dayConfiguration.map((day) => (
                            <View
                              key={day}
                              className="bg-[#0644C7] rounded px-2 py-1"
                            >
                              <Text className="text-[10px] font-semibold text-white capitalize">
                                {s.availabilityType === "monthly"
                                  ? monthlyPatternLabel(day)
                                  : day}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : s.availabilityType === "daily" ? (
                        // A daily schedule carries no day list (web PackageDetails, 4d165ce).
                        <View className="flex-row mb-2">
                          <View className="bg-[#0644C7] rounded px-2 py-1">
                            <Text className="text-[10px] font-semibold text-white">
                              Every day
                            </Text>
                          </View>
                        </View>
                      ) : null}

                      <View className="flex-row items-center gap-2">
                        <Feather name="clock" size={13} color={PRIMARY} />
                        <Text className="text-xs font-medium text-gray-700 dark:text-gray-200">
                          {s.timeSlotStart && s.timeSlotEnd
                            ? formatTimeRange(s.timeSlotStart, s.timeSlotEnd)
                            : s.availabilityType}
                        </Text>
                        {!!s.timeSlotInterval && (
                          <Text className="text-[11px] text-gray-500 dark:text-gray-400">
                            (
                            {startCadenceLabel({
                              start: s.timeSlotStart,
                              end: s.timeSlotEnd,
                              intervalMinutes: s.timeSlotInterval,
                              durationMinutes: packageDurationMinutes(
                                detail.duration,
                                detail.durationUnit,
                              ),
                            })}
                            )
                          </Text>
                        )}
                      </View>
                    </View>
                  ))}
                </>
              )}

              {detail.rooms.length > 0 && (
                <>
                  <SectionTitle>Available Spaces</SectionTitle>
                  {detail.rooms.map((r) => (
                    <InfoCard
                      key={r.id}
                      left={r.name}
                      right={
                        r.capacity ? (
                          <View className="flex-row items-center gap-1">
                            <Feather name="users" size={13} color={PRIMARY} />
                            <Text className="text-sm font-semibold text-[#0644C7] dark:text-blue-300">
                              {r.capacity}
                            </Text>
                          </View>
                        ) : undefined
                      }
                    />
                  ))}
                </>
              )}

              {detail.attractions.length > 0 && (
                <>
                  <SectionTitle>Included Attractions</SectionTitle>
                  {detail.attractions.map((a) => (
                    <InfoCard
                      key={a.id}
                      tone="neutral"
                      left={a.name}
                      right={
                        a.price != null ? (
                          <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                            {money(a.price)}
                          </Text>
                        ) : undefined
                      }
                    />
                  ))}
                </>
              )}

              {detail.addOns.length > 0 && (
                <>
                  <SectionTitle>Available Add-ons</SectionTitle>
                  {detail.addOns.map((a) => (
                    <InfoCard
                      key={a.id}
                      left={a.name}
                      right={
                        a.price != null ? (
                          <Text className="text-sm font-semibold text-[#0644C7] dark:text-blue-300">
                            {money(a.price)}
                          </Text>
                        ) : undefined
                      }
                    />
                  ))}
                </>
              )}

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

          {sourceBackendOnly && (
            <Text className="text-xs text-amber-700 dark:text-amber-500 mt-3">
              {duplicateBackendOnlyNote(canChangeOnline)}
            </Text>
          )}

          {dupLocationId != null && Number(dupLocationId) !== Number(pkg.locationId) && (
            <Text className="text-xs text-amber-700 dark:text-amber-500 mt-3">
              Spaces, add-ons and attractions belong to a location, so the copy
              starts with none of them. Everything else — pricing, schedules,
              images — is copied. Pick that location&apos;s own spaces on the copy.
            </Text>
          )}

          <Text className="text-xs text-gray-400 dark:text-gray-500 mt-3">
            The copy is created as inactive, named “{pkg.name} (Copy)”.
          </Text>

          <View className="flex-row gap-3 mt-6">
            <Pressable
              // Opened straight into Duplicate (the card's copy action) → Cancel
              // dismisses; reached from the details → Cancel goes back to them.
              onPress={() => (initialMode === "duplicate" ? onClose() : setMode("view"))}
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
