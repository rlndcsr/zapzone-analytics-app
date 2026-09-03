import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { useLocationOptions } from "../../lib/hooks/useLocationOptions";
import { fetchAttractions } from "../../services/attractionsService";
import { fetchPackages } from "../../services/packagesService";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  createKioskSession,
  searchPurchaseLinks,
  type KioskSourceType,
  type PurchaseLink,
  type PurchaseLinkType,
  type WaiverTemplate,
} from "../../services/waiversService";
import { BottomSheet } from "./BottomSheet";

const PRIMARY = "#0644C7";

const LINK_TABS: {
  type: PurchaseLinkType;
  label: string;
  /** What linking this kind of record fills in for the customer. */
  hint: string;
  activeBg: string;
  activeText: string;
}[] = [
  { type: "booking", label: "Booking", hint: "Prefills customer name, package & date", activeBg: "bg-blue-100 dark:bg-blue-900/40", activeText: "text-blue-700 dark:text-blue-300" },
  { type: "attraction_purchase", label: "Attraction Purchase", hint: "Prefills customer & attraction from a purchase", activeBg: "bg-violet-100 dark:bg-violet-900/40", activeText: "text-violet-700 dark:text-violet-300" },
  { type: "event_purchase", label: "Event Purchase", hint: "Prefills customer & event from a purchase", activeBg: "bg-amber-100 dark:bg-amber-900/40", activeText: "text-amber-700 dark:text-amber-300" },
];

/** Map a purchase link type to the kiosk session source type. */
const SOURCE_BY_TAB: Record<PurchaseLinkType, KioskSourceType> = {
  booking: "booking",
  attraction_purchase: "attraction_purchase",
  event_purchase: "event_purchase",
};

/** Activity links — pre-select what the customer is doing, not who they are. */
type ActivityType = "package" | "attraction";

const ACTIVITY_TYPES: { type: ActivityType; label: string; hint: string }[] = [
  {
    type: "package",
    label: "Package",
    hint: "Pre-selects activity only — customer fills their own info",
  },
  { type: "attraction", label: "Attraction", hint: "Pre-selects attraction only" },
];

/** One selectable activity, flattened from the package / attraction lists. */
type ActivityOption = { id: number; name: string; sub?: string };

const ModeCard = ({
  title,
  desc,
  active,
  onPress,
}: {
  title: string;
  desc: string;
  active: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    className={`flex-1 rounded-2xl border-2 p-4 ${
      active
        ? "border-[#0644C7] bg-blue-50 dark:bg-blue-900/20"
        : "border-gray-200 dark:border-neutral-700"
    }`}
  >
    <Text className="text-sm font-semibold text-gray-900 dark:text-white">
      {title}
    </Text>
    <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
      {desc}
    </Text>
  </Pressable>
);

/**
 * "Launch Kiosk" sheet for a waiver template — mirrors the web KioskSessionModal.
 * Generic mode opens the template's public kiosk URL; prefilled mode binds the
 * session to a booking / attraction / event purchase, then opens that URL.
 */
export function LaunchKioskSheet({
  template,
  visible,
  onClose,
}: {
  template: WaiverTemplate | null;
  visible: boolean;
  onClose: () => void;
}) {
  const user = getCurrentUser();
  const isCompanyAdmin = user?.role === "company_admin";
  const { locations } = useLocationOptions();

  const [mode, setMode] = useState<"generic" | "bound">("generic");
  const [locationId, setLocationId] = useState<number | null>(null);
  const [locationOpen, setLocationOpen] = useState(false);

  const [linkTab, setLinkTab] = useState<PurchaseLinkType>("booking");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PurchaseLink[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<PurchaseLink | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Activity link, the alternative to a purchase in prefilled mode. */
  const [activityType, setActivityType] = useState<ActivityType | null>(null);
  const [activityPick, setActivityPick] = useState<ActivityOption | null>(null);
  const [activities, setActivities] = useState<ActivityOption[]>([]);
  const [activityOpen, setActivityOpen] = useState(false);
  const [loadingActivities, setLoadingActivities] = useState(false);

  /**
   * Load the chosen activity list. Scoped to the same location the kiosk will
   * be filed against, so staff are not offered another venue's packages.
   */
  useEffect(() => {
    if (!activityType) {
      setActivities([]);
      return;
    }
    const token = getToken();
    // fetchAttractions requires a user id for its own scoping, so both
    // branches wait until the session is known.
    if (!token || user?.id == null) return;
    let active = true;
    setLoadingActivities(true);
    const locId =
      (isCompanyAdmin ? locationId : user?.location_id) ?? undefined;

    (activityType === "package"
      ? fetchPackages({ token, userId: user?.id, locationId: locId }).then(
          (rows) =>
            rows.map((r) => ({ id: r.id, name: r.name, sub: r.locationName })),
        )
      : fetchAttractions({ token, userId: user.id, locationId: locId }).then(
          (rows) =>
            rows.map((r) => ({ id: r.id, name: r.name, sub: r.locationName })),
        )
    )
      .then((opts) => {
        if (active) setActivities(opts);
      })
      .catch(() => {
        if (active) setActivities([]);
      })
      .finally(() => {
        if (active) setLoadingActivities(false);
      });

    return () => {
      active = false;
    };
  }, [activityType, isCompanyAdmin, locationId, user?.id, user?.location_id]);

  const activeTab = LINK_TABS.find((t) => t.type === linkTab)!;

  // Reset everything each time the sheet opens for a template.
  useEffect(() => {
    if (visible) {
      setMode("generic");
      setLocationId(null);
      setLocationOpen(false);
      setLinkTab("booking");
      setQuery("");
      setResults([]);
      setSelected(null);
      setError(null);
      setActivityType(null);
      setActivityPick(null);
      setActivityOpen(false);
    }
  }, [visible, template?.id]);

  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    [],
  );

  const runSearch = useCallback((tab: PurchaseLinkType, q: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      const token = getToken();
      if (!token) {
        setSearching(false);
        return;
      }
      try {
        setResults(await searchPurchaseLinks(token, tab, q));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
  }, []);

  const changeTab = (tab: PurchaseLinkType) => {
    setLinkTab(tab);
    setQuery("");
    setResults([]);
    setSelected(null);
  };

  const changeQuery = (q: string) => {
    setQuery(q);
    setSelected(null);
    runSearch(linkTab, q);
  };

  const isPreview = !!template && template.status !== "active";

  const canLaunch = () => {
    if (mode === "generic") return !isCompanyAdmin || locationId != null;
    // Either a purchase or an activity is enough to bind the session.
    return selected != null || activityPick != null;
  };

  /**
   * Open the kiosk in the app rather than in a browser — the customer stays
   * inside the app and staff never hand over a browser session. Both modes end
   * up on the same screen; only how it is addressed differs.
   */
  const launch = async () => {
    if (!template) return;
    setError(null);

    if (mode === "generic") {
      const resolvedLocation = isCompanyAdmin
        ? locationId
        : (user?.location_id ?? null);
      onClose();
      router.push({
        pathname: "/waivers/kiosk",
        params: {
          templateId: String(template.id),
          ...(resolvedLocation != null
            ? { locationId: String(resolvedLocation) }
            : {}),
          // A draft has no public kiosk route; the screen reads it through the
          // staff preview endpoint instead and refuses to submit.
          ...(isPreview ? { preview: "1" } : {}),
        },
      });
      return;
    }

    // A purchase binds the customer too; an activity binds only what they are
    // doing, leaving them to fill their own details.
    const source: { type: KioskSourceType; id: number } | null = selected
      ? { type: SOURCE_BY_TAB[selected.type], id: selected.id }
      : activityType && activityPick
        ? { type: activityType, id: activityPick.id }
        : null;
    if (!source) return;

    const token = getToken();
    if (!token) {
      setError("Not authenticated");
      return;
    }
    setLaunching(true);
    try {
      const session = await createKioskSession(
        token,
        source.type,
        source.id,
        { templateId: template.id },
      );
      if (session.alreadyCompleted) {
        setError("This waiver has already been completed for the booking date.");
        return;
      }
      // The kiosk screen addresses the public endpoints by token, so a session
      // whose URL cannot be parsed is a hard stop rather than a blank form.
      if (!session.accessToken) {
        throw new Error(session.status ?? "Failed to create session");
      }
      onClose();
      router.push({
        pathname: "/waivers/kiosk",
        params: { token: session.accessToken },
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to launch kiosk session",
      );
    } finally {
      setLaunching(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={isPreview ? "Launch Kiosk — Preview mode" : "Launch Kiosk"}
    >
      <ScrollView
        className="px-5"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {isPreview && (
          <View className="mb-4 flex-row gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 dark:border-amber-900/40 dark:bg-amber-900/20">
            <Feather name="info" size={16} color="#D97706" />
            <Text className="flex-1 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
              This template is <Text className="font-bold">not active</Text> —
              the kiosk will open in preview mode and submissions will be
              blocked. Activate the template from the templates list to accept
              real waivers.
            </Text>
          </View>
        )}

        {/* Mode toggle */}
        <View className="flex-row gap-3 mb-4">
          <ModeCard
            title="Generic walk-in"
            desc="Customer fills all their own info"
            active={mode === "generic"}
            onPress={() => setMode("generic")}
          />
          <ModeCard
            title="Prefilled session"
            desc="Link to a booking, purchase, or activity"
            active={mode === "bound"}
            onPress={() => setMode("bound")}
          />
        </View>

        {mode === "generic" ? (
          <View>
            <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
              Location
            </Text>
            {isCompanyAdmin ? (
              <>
                {/* A select rather than an always-open list, matching the web —
                    a company can run a lot of venues. */}
                <Pressable
                  onPress={() => setLocationOpen((v) => !v)}
                  className="h-12 flex-row items-center justify-between rounded-lg border border-gray-200 bg-white px-3.5 active:opacity-80 dark:border-neutral-700 dark:bg-neutral-900"
                  accessibilityRole="button"
                  accessibilityState={{ expanded: locationOpen }}
                >
                  <Text
                    className={`flex-1 text-sm ${
                      locationId != null
                        ? "text-gray-900 dark:text-white"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                    numberOfLines={1}
                  >
                    {locations.find((l) => l.id === locationId)?.name ??
                      "— select a location —"}
                  </Text>
                  <Feather
                    name={locationOpen ? "chevron-up" : "chevron-down"}
                    size={16}
                    color="#6B7280"
                  />
                </Pressable>

                {locationOpen && (
                  <View className="mt-1 overflow-hidden rounded-lg border border-gray-200 dark:border-neutral-700">
                    {locations.length === 0 ? (
                      <View className="items-center px-4 py-4">
                        <ActivityIndicator color={PRIMARY} />
                      </View>
                    ) : (
                      <ScrollView
                        nestedScrollEnabled
                        style={{ maxHeight: 240 }}
                        keyboardShouldPersistTaps="handled"
                      >
                        {locations.map((loc, i) => {
                          const active = locationId === loc.id;
                          return (
                            <Pressable
                              key={loc.id}
                              onPress={() => {
                                setLocationId(loc.id);
                                setLocationOpen(false);
                              }}
                              className={`flex-row items-center gap-2.5 px-3 py-2.5 ${
                                i > 0
                                  ? "border-t border-gray-100 dark:border-neutral-800"
                                  : ""
                              } ${active ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}
                            >
                              <Feather name="map-pin" size={14} color={PRIMARY} />
                              <Text
                                className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-100"
                                numberOfLines={1}
                              >
                                {loc.name}
                              </Text>
                              {active && (
                                <Feather name="check" size={16} color={PRIMARY} />
                              )}
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    )}
                  </View>
                )}

                {locationId == null && (
                  <Text className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
                    Select a location — waivers from this kiosk will be
                    associated with it.
                  </Text>
                )}
              </>
            ) : (
              <View className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800">
                <Text className="text-sm text-gray-700 dark:text-gray-200">
                  Waivers from this kiosk are associated with your location.
                </Text>
              </View>
            )}
          </View>
        ) : (
          <View>
            <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Link to a purchase
            </Text>

            {/* Stacked rows rather than pills: each says what it prefills, which
                is the actual difference between them. */}
            {LINK_TABS.map((tab) => {
              const active = linkTab === tab.type && !activityType;
              return (
                <Pressable
                  key={tab.type}
                  onPress={() => {
                    setActivityType(null);
                    setActivityPick(null);
                    changeTab(tab.type);
                  }}
                  className={`mb-2 flex-row items-center gap-2.5 rounded-xl border px-3 py-3 active:opacity-80 ${
                    active
                      ? "border-[#0644C7] bg-blue-50 dark:bg-blue-900/20"
                      : "border-gray-200 dark:border-neutral-700"
                  }`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <View className={`rounded-full px-2.5 py-1 ${tab.activeBg}`}>
                    <Text className={`text-[11px] font-semibold ${tab.activeText}`}>
                      {tab.label}
                    </Text>
                  </View>
                  <Text
                    className="flex-1 text-xs text-gray-600 dark:text-gray-300"
                    numberOfLines={2}
                  >
                    {tab.hint}
                  </Text>
                  {active && (
                    <Feather name="chevron-right" size={16} color={PRIMARY} />
                  )}
                </Pressable>
              );
            })}

            {!activityType &&
              (selected ? (
                <View className="mt-1 flex-row items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 dark:border-blue-900/50 dark:bg-blue-900/20">
                  <View className="mr-2 flex-1 flex-row items-center gap-2">
                    <View className={`rounded-full px-2 py-0.5 ${activeTab.activeBg}`}>
                      <Text className={`text-[11px] font-semibold ${activeTab.activeText}`}>
                        {activeTab.label}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text
                        className="text-sm font-medium text-gray-900 dark:text-white"
                        numberOfLines={1}
                      >
                        {selected.name}
                      </Text>
                      {!!selected.sub && (
                        <Text
                          className="text-xs text-gray-400 dark:text-gray-500"
                          numberOfLines={1}
                        >
                          {selected.sub}
                        </Text>
                      )}
                    </View>
                  </View>
                  <Pressable
                    onPress={() => {
                      setSelected(null);
                      setQuery("");
                      setResults([]);
                    }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Clear selection"
                  >
                    <Feather name="x" size={16} color="#9CA3AF" />
                  </Pressable>
                </View>
              ) : (
                <>
                  <View className="mt-1 h-12 flex-row items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 dark:border-neutral-700 dark:bg-neutral-900">
                    <Feather name="search" size={16} color="#9CA3AF" />
                    <TextInput
                      value={query}
                      onChangeText={changeQuery}
                      placeholder="Ref #, guest name, or email…"
                      placeholderTextColor="#9CA3AF"
                      autoCapitalize="none"
                      className="flex-1 text-sm text-gray-900 dark:text-white"
                      style={{ paddingVertical: 0 }}
                    />
                    {searching && (
                      <ActivityIndicator size="small" color="#9CA3AF" />
                    )}
                  </View>
                  <Text className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                    Start typing to search — name, email, or reference number.
                  </Text>

                  {results.length > 0 && (
                    <View className="mt-2 overflow-hidden rounded-xl border border-gray-200 dark:border-neutral-700">
                      {results.map((r, i) => (
                        <Pressable
                          key={`${r.type}-${r.id}-${i}`}
                          onPress={() => {
                            setSelected(r);
                            setResults([]);
                            setQuery("");
                          }}
                          className={`flex-row items-center gap-2.5 px-3 py-2.5 active:bg-gray-50 dark:active:bg-neutral-800 ${
                            i > 0
                              ? "border-t border-gray-100 dark:border-neutral-800"
                              : ""
                          }`}
                        >
                          <View className={`rounded-full px-2 py-0.5 ${activeTab.activeBg}`}>
                            <Text className={`text-[11px] font-semibold ${activeTab.activeText}`}>
                              {activeTab.label}
                            </Text>
                          </View>
                          <View className="flex-1">
                            <Text
                              className="text-sm font-medium text-gray-900 dark:text-white"
                              numberOfLines={1}
                            >
                              {r.name}
                            </Text>
                            {!!r.sub && (
                              <Text
                                className="text-xs text-gray-400 dark:text-gray-500"
                                numberOfLines={1}
                              >
                                {r.sub}
                              </Text>
                            )}
                          </View>
                          <Feather name="chevron-right" size={16} color="#D1D5DB" />
                        </Pressable>
                      ))}
                    </View>
                  )}

                  {!searching &&
                    query.trim().length > 0 &&
                    results.length === 0 && (
                      <Text className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                        No results — try a different name, email, or ref #.
                      </Text>
                    )}
                </>
              ))}

            {/* Activity link — pre-selects what they are doing without naming
                who is doing it, so the customer still fills their own details. */}
            <Text className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Or link to an activity (no customer prefill)
            </Text>
            {ACTIVITY_TYPES.map((a) => {
              const active = activityType === a.type;
              return (
                <Pressable
                  key={a.type}
                  onPress={() => {
                    setSelected(null);
                    setQuery("");
                    setResults([]);
                    setActivityType(active ? null : a.type);
                    setActivityPick(null);
                  }}
                  className={`mb-2 flex-row items-center gap-2 rounded-xl border px-3 py-3 active:opacity-80 ${
                    active
                      ? "border-[#0644C7] bg-blue-50 dark:bg-blue-900/20"
                      : "border-gray-200 dark:border-neutral-700"
                  }`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text className="text-sm font-bold text-gray-900 dark:text-white">
                    {a.label}
                  </Text>
                  <Text
                    className="flex-1 text-xs text-gray-500 dark:text-gray-400"
                    numberOfLines={2}
                  >
                    {a.hint}
                  </Text>
                  {active && (
                    <Feather name="check" size={16} color={PRIMARY} />
                  )}
                </Pressable>
              );
            })}

            {activityType && (
              <View>
                {/* A select, as on the web — the list can run to dozens of
                    packages across locations, so it stays collapsed until
                    asked for. */}
                <Pressable
                  onPress={() => setActivityOpen((v) => !v)}
                  className="h-12 flex-row items-center justify-between rounded-lg border border-[#0644C7] bg-white px-3.5 active:opacity-80 dark:bg-neutral-900"
                  accessibilityRole="button"
                  accessibilityState={{ expanded: activityOpen }}
                >
                  <Text
                    className={`flex-1 text-sm ${
                      activityPick
                        ? "text-gray-900 dark:text-white"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                    numberOfLines={1}
                  >
                    {activityPick
                      ? activityPick.name
                      : `— select ${activityType === "package" ? "a package" : "an attraction"} —`}
                  </Text>
                  <Feather
                    name={activityOpen ? "chevron-up" : "chevron-down"}
                    size={16}
                    color="#6B7280"
                  />
                </Pressable>

                {activityOpen && (
                  <View className="mt-1 overflow-hidden rounded-lg border border-gray-200 dark:border-neutral-700">
                    {loadingActivities ? (
                      <View className="items-center py-4">
                        <ActivityIndicator color={PRIMARY} />
                      </View>
                    ) : activities.length === 0 ? (
                      <Text className="px-3 py-4 text-center text-xs text-gray-400 dark:text-gray-500">
                        Nothing available to link.
                      </Text>
                    ) : (
                      <ScrollView
                        nestedScrollEnabled
                        style={{ maxHeight: 260 }}
                        keyboardShouldPersistTaps="handled"
                      >
                        {activities.map((opt, i) => {
                          const on = activityPick?.id === opt.id;
                          return (
                            <Pressable
                              key={opt.id}
                              onPress={() => {
                                setActivityPick(opt);
                                setActivityOpen(false);
                              }}
                              className={`flex-row items-center gap-2 px-3 py-2.5 ${
                                i > 0
                                  ? "border-t border-gray-100 dark:border-neutral-800"
                                  : ""
                              } ${on ? "bg-[#0644C7]" : ""}`}
                            >
                              <Text
                                className={`flex-1 text-sm ${
                                  on
                                    ? "font-semibold text-white"
                                    : "text-[#0644C7] dark:text-blue-300"
                                }`}
                                numberOfLines={1}
                              >
                                {opt.name}
                              </Text>
                              {/* Two locations can run a package of the same
                                  name, so the venue disambiguates them. */}
                              {!!opt.sub && (
                                <Text
                                  className={`text-[11px] ${
                                    on ? "text-white/80" : "text-gray-400"
                                  }`}
                                  numberOfLines={1}
                                >
                                  {opt.sub}
                                </Text>
                              )}
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    )}
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {error && (
          <View className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40 rounded-xl px-3 py-2.5">
            <Text className="text-xs text-red-600 dark:text-red-400">{error}</Text>
          </View>
        )}

        <View className="flex-row items-center gap-3 mt-6">
          <Pressable
            onPress={onClose}
            disabled={launching}
            className="flex-1 h-12 items-center justify-center rounded-xl border border-gray-200 dark:border-neutral-700 active:opacity-80"
          >
            <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Cancel
            </Text>
          </Pressable>
          <Pressable
            onPress={launch}
            disabled={!canLaunch() || launching}
            className="flex-1 h-12 flex-row items-center justify-center gap-2 rounded-xl bg-[#0644C7] active:opacity-90"
            style={!canLaunch() || launching ? { opacity: 0.5 } : undefined}
          >
            {launching ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Feather name="tablet" size={16} color="#FFFFFF" />
            )}
            <Text className="text-sm font-semibold text-white">Open Kiosk</Text>
          </Pressable>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}
