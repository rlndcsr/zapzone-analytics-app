import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "../../components/ui/BottomSheet";
import { InputField } from "../../components/ui/InputField";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import { markWaiversStale } from "../../lib/hooks/useWaivers";
import { getToken } from "../../lib/session";
import {
  assignWaiver,
  fetchTemplates,
  searchPurchaseLinks,
  type PurchaseLink,
  type PurchaseLinkType,
  type WaiverTemplate,
} from "../../services/waiversService";

const PRIMARY = "#0644C7";

/** The three link tabs + their pill colors (mirrors the web AssignWaiverModal). */
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

/** Local date as YYYY-MM-DD (backend `selected_date`). */
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function prettyDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return ymd(d);
}

const Section = ({
  icon,
  title,
  children,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  children: React.ReactNode;
}) => (
  <View className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mb-4 shadow-sm">
    <View className="flex-row items-center gap-2 mb-4">
      <Feather name={icon} size={16} color={PRIMARY} />
      <Text className="text-base font-bold text-gray-900 dark:text-white">
        {title}
      </Text>
    </View>
    {children}
  </View>
);

const CreateWaiver = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  const [templates, setTemplates] = useState<WaiverTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState<string | null>(null);

  const [templateId, setTemplateId] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState(ymd(new Date()));
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [activityName, setActivityName] = useState("");

  const [templateSheet, setTemplateSheet] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ template?: string; contact?: string }>({});
  const submitLock = useRef(false);

  // Link to purchase (optional) — ties the waiver to a specific transaction.
  const [linkTab, setLinkTab] = useState<PurchaseLinkType>("booking");
  const [linkQuery, setLinkQuery] = useState("");
  const [linkResults, setLinkResults] = useState<PurchaseLink[]>([]);
  const [linkSearching, setLinkSearching] = useState(false);
  const [selectedLink, setSelectedLink] = useState<PurchaseLink | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeTab = LINK_TABS.find((t) => t.type === linkTab)!;

  const runSearch = useCallback((tab: PurchaseLinkType, q: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) {
      setLinkResults([]);
      setLinkSearching(false);
      return;
    }
    setLinkSearching(true);
    searchTimer.current = setTimeout(async () => {
      const token = getToken();
      if (!token) {
        setLinkSearching(false);
        return;
      }
      try {
        const rows = await searchPurchaseLinks(token, tab, q);
        setLinkResults(rows);
      } catch {
        setLinkResults([]);
      } finally {
        setLinkSearching(false);
      }
    }, 350);
  }, []);

  const changeLinkTab = (tab: PurchaseLinkType) => {
    setLinkTab(tab);
    setLinkQuery("");
    setLinkResults([]);
    setSelectedLink(null);
  };

  const changeLinkQuery = (q: string) => {
    setLinkQuery(q);
    setSelectedLink(null);
    runSearch(linkTab, q);
  };

  const selectLink = (r: PurchaseLink) => {
    setSelectedLink(r);
    setLinkResults([]);
    setLinkQuery("");
    if (r.date) setSelectedDate(r.date);
  };

  const clearLink = () => {
    setSelectedLink(null);
    setLinkQuery("");
    setLinkResults([]);
  };

  // Cancel any pending debounce on unmount.
  useEffect(() => () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
  }, []);

  // Load active templates to assign from (mirrors the web AssignWaiverModal).
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const token = getToken();
    if (!token) {
      setTemplatesError("Not authenticated");
      setTemplatesLoading(false);
      return;
    }
    fetchTemplates(token, { status: "active" }, controller.signal)
      .then((list) => {
        if (!active) return;
        setTemplates(list);
        if (list.length === 1) setTemplateId(list[0].id);
      })
      .catch((e) => {
        if (active)
          setTemplatesError(
            e instanceof Error ? e.message : "Failed to load templates",
          );
      })
      .finally(() => {
        if (active) setTemplatesLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const selectedTemplate = templates.find((t) => t.id === templateId) ?? null;

  const submit = async () => {
    const nextErrors: typeof errors = {};
    if (templateId == null) nextErrors.template = "Select a waiver template.";
    if (!email.trim() && !phone.trim())
      nextErrors.contact = "Enter a guardian email or phone number.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    if (submitLock.current) return;
    submitLock.current = true;

    const token = getToken();
    if (!token) {
      Alert.alert("Not authenticated");
      submitLock.current = false;
      return;
    }

    setSubmitting(true);
    try {
      await assignWaiver(token, {
        waiverTemplateId: templateId!,
        selectedDate,
        adultEmail: email,
        adultPhone: phone,
        activityName,
        bookingId:
          selectedLink?.type === "booking" ? selectedLink.id : undefined,
        attractionPurchaseId:
          selectedLink?.type === "attraction_purchase"
            ? selectedLink.id
            : undefined,
        eventId:
          selectedLink?.type === "event_purchase"
            ? selectedLink.eventId
            : undefined,
      });
      markWaiversStale();
      Alert.alert("Waiver assigned", "The signing link has been sent.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert(
        "Could not assign waiver",
        e instanceof Error ? e.message : "Please try again.",
      );
    } finally {
      setSubmitting(false);
      submitLock.current = false;
    }
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
            Assign Waiver
          </Text>
          <View style={{ width: 36 }} />
        </View>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        >
          <Section icon="file-text" title="Waiver Template">
            <Text className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
              Template
            </Text>
            <Pressable
              onPress={() => setTemplateSheet(true)}
              disabled={templatesLoading}
              className={`h-14 flex-row items-center justify-between rounded-full border bg-white dark:bg-neutral-900 px-5 ${
                errors.template
                  ? "border-red-400"
                  : "border-gray-200 dark:border-neutral-700"
              }`}
            >
              <Text
                className={`text-base flex-1 ${
                  selectedTemplate
                    ? "text-gray-900 dark:text-white"
                    : "text-gray-400"
                }`}
                numberOfLines={1}
              >
                {templatesLoading
                  ? "Loading templates..."
                  : selectedTemplate
                    ? selectedTemplate.title
                    : "Select a template"}
              </Text>
              <Feather name="chevron-down" size={18} color="#9CA3AF" />
            </Pressable>
            {errors.template && (
              <Text className="ml-4 mt-1.5 text-xs text-red-500">
                {errors.template}
              </Text>
            )}
            {templatesError && (
              <Text className="ml-4 mt-1.5 text-xs text-red-500">
                {templatesError}
              </Text>
            )}

            {/* Link to purchase (optional) */}
            <Text className="mt-4 text-sm font-medium text-gray-700 dark:text-gray-200">
              Link to purchase{" "}
              <Text className="text-gray-400 dark:text-gray-500 font-normal">
                (optional)
              </Text>
            </Text>
            <Text className="mt-0.5 mb-2.5 text-xs text-gray-400 dark:text-gray-500">
              Ties this waiver to a specific transaction.
            </Text>

            <View className="flex-row gap-1.5 mb-2.5">
              {LINK_TABS.map((tab) => {
                const active = linkTab === tab.type;
                return (
                  <Pressable
                    key={tab.type}
                    onPress={() => changeLinkTab(tab.type)}
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

            {selectedLink ? (
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
                      {selectedLink.name}
                    </Text>
                    {!!selectedLink.sub && (
                      <Text
                        className="text-xs text-gray-400 dark:text-gray-500"
                        numberOfLines={1}
                      >
                        {selectedLink.sub}
                      </Text>
                    )}
                  </View>
                </View>
                <Pressable onPress={clearLink} hitSlop={8}>
                  <Feather name="x" size={16} color="#9CA3AF" />
                </Pressable>
              </View>
            ) : (
              <>
                <View className="flex-row items-center gap-2 rounded-full border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 h-12">
                  <Feather name="search" size={16} color="#9CA3AF" />
                  <TextInput
                    value={linkQuery}
                    onChangeText={changeLinkQuery}
                    placeholder={`Search ${activeTab.label.toLowerCase()} by ref # or guest name…`}
                    placeholderTextColor="#9CA3AF"
                    autoCapitalize="none"
                    className="flex-1 text-sm text-gray-900 dark:text-white"
                    style={{ paddingVertical: 0 }}
                  />
                  {linkSearching && (
                    <ActivityIndicator size="small" color="#9CA3AF" />
                  )}
                </View>

                {linkResults.length > 0 && (
                  <View className="mt-2 rounded-xl border border-gray-200 dark:border-neutral-700 overflow-hidden">
                    {linkResults.map((r, i) => (
                      <Pressable
                        key={`${r.type}-${r.id}-${i}`}
                        onPress={() => selectLink(r)}
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

                {!linkSearching &&
                  linkQuery.trim().length > 0 &&
                  linkResults.length === 0 && (
                    <Text className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                      No matches found.
                    </Text>
                  )}
              </>
            )}

            {/* Visit date */}
            <Text className="mt-4 mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
              Visit date
            </Text>
            <View className="flex-row items-center gap-3">
              <Pressable
                onPress={() => setSelectedDate((d) => shiftDate(d, -1))}
                className="h-12 w-12 items-center justify-center rounded-full border border-gray-200 dark:border-neutral-700"
              >
                <Feather name="chevron-left" size={18} color={headerIcon} />
              </Pressable>
              <View className="flex-1 h-12 items-center justify-center rounded-full bg-gray-50 dark:bg-neutral-800">
                <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                  {prettyDate(selectedDate)}
                </Text>
              </View>
              <Pressable
                onPress={() => setSelectedDate((d) => shiftDate(d, 1))}
                className="h-12 w-12 items-center justify-center rounded-full border border-gray-200 dark:border-neutral-700"
              >
                <Feather name="chevron-right" size={18} color={headerIcon} />
              </Pressable>
            </View>
            <Pressable
              onPress={() => setSelectedDate(ymd(new Date()))}
              className="mt-2 self-start"
            >
              <Text className="text-xs font-medium text-blue-600 dark:text-blue-400">
                Reset to today
              </Text>
            </Pressable>
          </Section>

          <Section icon="user" title="Guardian Contact">
            <Text className="mb-3 text-xs text-gray-500 dark:text-gray-400">
              Enter an email or phone number — the signing link is sent there.
            </Text>
            <InputField
              label="Email"
              icon="mail"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                if (errors.contact) setErrors((e) => ({ ...e, contact: undefined }));
              }}
              placeholder="guardian@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              containerClassName="mb-4"
            />
            <InputField
              label="Phone"
              icon="phone"
              value={phone}
              onChangeText={(t) => {
                setPhone(t);
                if (errors.contact) setErrors((e) => ({ ...e, contact: undefined }));
              }}
              placeholder="(555) 123-4567"
              keyboardType="phone-pad"
              error={errors.contact}
            />
          </Section>

          <Section icon="tag" title="Activity (optional)">
            <InputField
              label="Activity name"
              icon="tag"
              value={activityName}
              onChangeText={setActivityName}
              placeholder="e.g. Trampoline session"
            />
          </Section>
        </ScrollView>

        {/* Sticky footer */}
        <View
          className="bg-white dark:bg-neutral-900 border-t border-gray-100 dark:border-neutral-800 px-5 pt-4"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          <Text className="text-xs text-gray-400 dark:text-gray-500 text-center mb-3">
            A waiver link will be sent by email and/or SMS.
          </Text>
          <View className="flex-row items-center gap-3">
            <Pressable
              onPress={() => router.back()}
              disabled={submitting}
              className="flex-1 h-14 items-center justify-center rounded-full border border-gray-200 dark:border-neutral-700 active:opacity-80"
            >
              <Text className="text-base font-semibold text-gray-700 dark:text-gray-200">
                Cancel
              </Text>
            </Pressable>
            <View className="flex-1">
              <PrimaryButton
                label="Assign & Send"
                onPress={submit}
                loading={submitting}
                disabled={templatesLoading}
              />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Template picker */}
      <BottomSheet
        visible={templateSheet}
        onClose={() => setTemplateSheet(false)}
        title="Select Template"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {templates.length === 0 ? (
            <View className="px-4 py-8 items-center">
              <Text className="text-gray-500 dark:text-gray-400 text-sm text-center">
                No active templates. Create one under Templates first.
              </Text>
            </View>
          ) : (
            templates.map((t) => {
              const isSelected = templateId === t.id;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => {
                    setTemplateId(t.id);
                    setTemplateSheet(false);
                    setErrors((e) => ({ ...e, template: undefined }));
                  }}
                  className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
                    isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                  }`}
                >
                  <Text
                    className={`text-base font-medium flex-1 mr-2 ${
                      isSelected
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-gray-700 dark:text-gray-200"
                    }`}
                    numberOfLines={1}
                  >
                    {t.title}
                  </Text>
                  {isSelected && (
                    <View className="w-6 h-6 rounded-full bg-blue-500 items-center justify-center">
                      <Feather name="check" size={14} color="#FFFFFF" />
                    </View>
                  )}
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </BottomSheet>
    </View>
  );
};

export default CreateWaiver;
