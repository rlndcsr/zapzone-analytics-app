import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import * as WebBrowser from "expo-web-browser";

import { useLocationOptions } from "../../lib/hooks/useLocationOptions";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  buildTemplateKioskUrl,
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
  activeBg: string;
  activeText: string;
}[] = [
  { type: "booking", label: "Booking", activeBg: "bg-blue-100 dark:bg-blue-900/40", activeText: "text-blue-700 dark:text-blue-300" },
  { type: "attraction_purchase", label: "Attraction", activeBg: "bg-violet-100 dark:bg-violet-900/40", activeText: "text-violet-700 dark:text-violet-300" },
  { type: "event_purchase", label: "Event", activeBg: "bg-amber-100 dark:bg-amber-900/40", activeText: "text-amber-700 dark:text-amber-300" },
];

/** Map a purchase link type to the kiosk session source type. */
const SOURCE_BY_TAB: Record<PurchaseLinkType, KioskSourceType> = {
  booking: "booking",
  attraction_purchase: "attraction_purchase",
  event_purchase: "event_purchase",
};

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

  const [linkTab, setLinkTab] = useState<PurchaseLinkType>("booking");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PurchaseLink[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<PurchaseLink | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeTab = LINK_TABS.find((t) => t.type === linkTab)!;

  // Reset everything each time the sheet opens for a template.
  useEffect(() => {
    if (visible) {
      setMode("generic");
      setLocationId(null);
      setLinkTab("booking");
      setQuery("");
      setResults([]);
      setSelected(null);
      setError(null);
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
    return selected != null;
  };

  const openUrl = async (url: string) => {
    try {
      await WebBrowser.openBrowserAsync(url);
      onClose();
    } catch {
      setError("Could not open the kiosk. Please try again.");
    }
  };

  const launch = async () => {
    if (!template) return;
    setError(null);

    if (mode === "generic") {
      const resolvedLocation = isCompanyAdmin
        ? locationId
        : (user?.location_id ?? null);
      await openUrl(
        buildTemplateKioskUrl(template.id, {
          locationId: resolvedLocation,
          preview: isPreview,
        }),
      );
      return;
    }

    if (!selected) return;
    const token = getToken();
    if (!token) {
      setError("Not authenticated");
      return;
    }
    setLaunching(true);
    try {
      const session = await createKioskSession(
        token,
        SOURCE_BY_TAB[selected.type],
        selected.id,
        { templateId: template.id },
      );
      if (!session.kioskUrl) {
        throw new Error(session.status ?? "Failed to create session");
      }
      await openUrl(session.kioskUrl);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to launch kiosk session",
      );
    } finally {
      setLaunching(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Launch Kiosk">
      <ScrollView
        className="px-5"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {isPreview && (
          <View className="flex-row gap-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 rounded-xl px-3.5 py-3 mb-4">
            <Feather name="info" size={16} color="#D97706" />
            <Text className="flex-1 text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
              This template is not active — the kiosk opens in preview mode and
              submissions are blocked.
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
                <View className="rounded-xl border border-gray-200 dark:border-neutral-700 overflow-hidden">
                  {locations.length === 0 ? (
                    <View className="px-4 py-4 items-center">
                      <ActivityIndicator color={PRIMARY} />
                    </View>
                  ) : (
                    locations.map((loc, i) => {
                      const active = locationId === loc.id;
                      return (
                        <Pressable
                          key={loc.id}
                          onPress={() => setLocationId(loc.id)}
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
                    })
                  )}
                </View>
                {locationId == null && (
                  <Text className="text-xs text-amber-600 dark:text-amber-400 mt-1.5">
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
            <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
              Link to a purchase
            </Text>
            <View className="flex-row gap-1.5 mb-2.5">
              {LINK_TABS.map((tab) => {
                const active = linkTab === tab.type;
                return (
                  <Pressable
                    key={tab.type}
                    onPress={() => changeTab(tab.type)}
                    className={`px-3.5 py-1.5 rounded-full ${
                      active ? tab.activeBg : "bg-gray-100 dark:bg-neutral-800"
                    }`}
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        active
                          ? tab.activeText
                          : "text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      {tab.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {selected ? (
              <View className="flex-row items-center justify-between rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-900/20 px-3 py-2.5">
                <View className="flex-row items-center gap-2 flex-1 mr-2">
                  <View className={`px-2 py-0.5 rounded-full ${activeTab.activeBg}`}>
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
                >
                  <Feather name="x" size={16} color="#9CA3AF" />
                </Pressable>
              </View>
            ) : (
              <>
                <View className="flex-row items-center gap-2 rounded-full border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 h-12">
                  <Feather name="search" size={16} color="#9CA3AF" />
                  <TextInput
                    value={query}
                    onChangeText={changeQuery}
                    placeholder={`Search ${activeTab.label.toLowerCase()} by ref # or guest name…`}
                    placeholderTextColor="#9CA3AF"
                    autoCapitalize="none"
                    className="flex-1 text-sm text-gray-900 dark:text-white"
                    style={{ paddingVertical: 0 }}
                  />
                  {searching && <ActivityIndicator size="small" color="#9CA3AF" />}
                </View>

                {results.length > 0 && (
                  <View className="mt-2 rounded-xl border border-gray-200 dark:border-neutral-700 overflow-hidden">
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
                        <View className={`px-2 py-0.5 rounded-full ${activeTab.activeBg}`}>
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

                {!searching && query.trim().length > 0 && results.length === 0 && (
                  <Text className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                    No results — try a different name, email, or ref #.
                  </Text>
                )}
              </>
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
