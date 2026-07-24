import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "../../components/ui/BottomSheet";
import { primeWaiverSettings } from "../../lib/hooks/useWaiverSettings";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  fetchWaiverSettings,
  updateWaiverSettings,
  type DuplicateRule,
  type WaiverSettings,
} from "../../services/waiversService";

const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const DUPLICATE_OPTIONS: { label: string; value: DuplicateRule }[] = [
  { label: "Block duplicates", value: "none" },
  { label: "Manager-assigned only", value: "manager_only" },
  { label: "Allow duplicates", value: "allow" },
];

/** Numeric fields tracked with a string buffer so the input can be blanked. */
type NumKey =
  | "defaultValidityDays"
  | "defaultExpirationDays"
  | "reminderWindowHours"
  | "searchAutoRefreshSeconds"
  | "kioskInactivityTimeoutSeconds";

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <View
    className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mb-4 border border-gray-100 dark:border-neutral-800"
    style={CARD_SHADOW}
  >
    <Text className="text-sm font-bold text-gray-900 dark:text-white mb-4">
      {title}
    </Text>
    {children}
  </View>
);

const CheckRow = ({
  label,
  hint,
  value,
  disabled,
  onToggle,
}: {
  label: string;
  hint?: string;
  value: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) => (
  <Pressable
    onPress={disabled ? undefined : onToggle}
    disabled={disabled}
    className="flex-row items-start gap-3 py-2"
    accessibilityRole="checkbox"
    accessibilityState={{ checked: value, disabled }}
  >
    <View
      className={`w-5 h-5 rounded-md items-center justify-center mt-0.5 ${
        value
          ? "bg-[#0644C7]"
          : "border-2 border-gray-300 dark:border-neutral-600"
      } ${disabled ? "opacity-50" : ""}`}
    >
      {value && <Feather name="check" size={13} color="#FFFFFF" />}
    </View>
    <View className="flex-1">
      <Text className="text-sm text-gray-800 dark:text-gray-100">{label}</Text>
      {!!hint && (
        <Text className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
          {hint}
        </Text>
      )}
    </View>
  </Pressable>
);

const WaiverSettingsScreen = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  const canEdit = getCurrentUser()?.role === "company_admin";

  const [settings, setSettings] = useState<WaiverSettings | null>(null);
  const [numText, setNumText] = useState<Record<NumKey, string>>({
    defaultValidityDays: "",
    defaultExpirationDays: "",
    reminderWindowHours: "",
    searchAutoRefreshSeconds: "",
    kioskInactivityTimeoutSeconds: "",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [ruleSheet, setRuleSheet] = useState(false);

  useEffect(() => {
    let active = true;
    const token = getToken();
    if (!token) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }
    fetchWaiverSettings(token)
      .then((s) => {
        if (!active) return;
        setSettings(s);
        setNumText({
          defaultValidityDays: s.defaultValidityDays?.toString() ?? "",
          defaultExpirationDays: s.defaultExpirationDays?.toString() ?? "",
          reminderWindowHours: s.reminderWindowHours.toString(),
          searchAutoRefreshSeconds: s.searchAutoRefreshSeconds.toString(),
          kioskInactivityTimeoutSeconds:
            s.kioskInactivityTimeoutSeconds.toString(),
        });
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load settings"),
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const set = <K extends keyof WaiverSettings>(
    key: K,
    value: WaiverSettings[K],
  ) => setSettings((s) => (s ? { ...s, [key]: value } : s));

  // Edit a numeric field: keep the raw text (so it can be blank) and mirror the
  // parsed value into settings. `allowNull` fields become null when blank;
  // required ones fall back to 0.
  const editNum = (key: NumKey, text: string, allowNull: boolean) => {
    const cleaned = text.replace(/[^0-9]/g, "");
    setNumText((n) => ({ ...n, [key]: cleaned }));
    const parsed = cleaned === "" ? (allowNull ? null : 0) : Number(cleaned);
    set(key, parsed as WaiverSettings[NumKey]);
  };

  const save = async () => {
    if (!settings) return;
    const token = getToken();
    if (!token) {
      Alert.alert("Not authenticated");
      return;
    }
    setSaving(true);
    try {
      const next = await updateWaiverSettings(token, settings);
      setSettings(next);
      primeWaiverSettings(next);
      Alert.alert("Settings saved", "Your waiver defaults have been updated.");
    } catch (e) {
      Alert.alert(
        "Could not save settings",
        e instanceof Error ? e.message : "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const ruleLabel = useMemo(
    () =>
      DUPLICATE_OPTIONS.find((o) => o.value === settings?.defaultDuplicateRule)
        ?.label ?? "Manager-assigned only",
    [settings?.defaultDuplicateRule],
  );

  const numberFieldClass =
    "bg-gray-50 dark:bg-neutral-800 rounded-xl px-3.5 py-3 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-neutral-700";

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header */}
      <View className="bg-white dark:bg-neutral-900 pt-12 pb-5 px-5 w-full border-b border-gray-100 dark:border-neutral-800">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3 flex-1 mr-3">
            <Pressable
              onPress={() => router.back()}
              className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Feather name="chevron-left" size={20} color={headerIcon} />
            </Pressable>
            <View className="flex-1">
              <Text className="text-gray-900 dark:text-white text-lg font-bold">
                Waiver Settings
              </Text>
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                Company-wide defaults for waivers.
              </Text>
            </View>
          </View>
          {canEdit && (
            <Pressable
              onPress={save}
              disabled={saving || loading}
              className="flex-row items-center gap-1.5 bg-[#0644C7] px-4 py-2.5 rounded-xl active:opacity-90"
              style={saving || loading ? { opacity: 0.6 } : undefined}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Feather name="save" size={15} color="#FFFFFF" />
              )}
              <Text className="text-sm font-semibold text-white">Save</Text>
            </Pressable>
          )}
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={PRIMARY} />
        </View>
      ) : error || !settings ? (
        <View className="px-5 pt-6">
          <View className="bg-red-50 border border-red-100 rounded-2xl p-5">
            <Text className="text-red-600 font-semibold">
              Something went wrong
            </Text>
            <Text className="text-red-500 text-sm mt-1">
              {error ?? "Settings unavailable."}
            </Text>
          </View>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
        >
          {!canEdit && (
            <View className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 rounded-2xl p-4 mb-4">
              <Text className="text-amber-700 dark:text-amber-300 text-sm">
                These settings are read-only. Only a company admin can change
                them.
              </Text>
            </View>
          )}

          {/* Validity & Duplicates */}
          <Section title="Validity & Duplicates">
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Text className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1.5">
                  Default validity (days)
                </Text>
                <TextInput
                  value={numText.defaultValidityDays}
                  onChangeText={(t) => editNum("defaultValidityDays", t, true)}
                  editable={canEdit}
                  keyboardType="number-pad"
                  placeholder="—"
                  placeholderTextColor="#9CA3AF"
                  className={numberFieldClass}
                />
              </View>
              <View className="flex-1">
                <Text className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1.5">
                  Default expiration (days)
                </Text>
                <TextInput
                  value={numText.defaultExpirationDays}
                  onChangeText={(t) => editNum("defaultExpirationDays", t, true)}
                  editable={canEdit}
                  keyboardType="number-pad"
                  placeholder="—"
                  placeholderTextColor="#9CA3AF"
                  className={numberFieldClass}
                />
              </View>
            </View>
            <Text className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5">
              Blank = no expiry
            </Text>

            <Text className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1.5 mt-4">
              Default duplicate rule
            </Text>
            <Pressable
              onPress={() => canEdit && setRuleSheet(true)}
              disabled={!canEdit}
              className="flex-row items-center justify-between rounded-xl px-3.5 py-3 bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700"
            >
              <Text className="text-sm text-gray-900 dark:text-white">
                {ruleLabel}
              </Text>
              <Feather name="chevron-down" size={16} color="#9CA3AF" />
            </Pressable>

            <View className="mt-3">
              <CheckRow
                label="Waivers expire after the validity period"
                value={settings.waiversExpire}
                disabled={!canEdit}
                onToggle={() => set("waiversExpire", !settings.waiversExpire)}
              />
              <CheckRow
                label="Require a new waiver when the legal text changes"
                value={settings.requireNewOnTextChange}
                disabled={!canEdit}
                onToggle={() =>
                  set("requireNewOnTextChange", !settings.requireNewOnTextChange)
                }
              />
            </View>
          </Section>

          {/* Reminders & Confirmations */}
          <Section title="Reminders & Confirmations">
            <Text className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1.5">
              Reminder window (hours)
            </Text>
            <TextInput
              value={numText.reminderWindowHours}
              onChangeText={(t) => editNum("reminderWindowHours", t, false)}
              editable={canEdit}
              keyboardType="number-pad"
              placeholder="24"
              placeholderTextColor="#9CA3AF"
              className={numberFieldClass}
            />
            <Text className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5">
              Send a reminder this long before the visit
            </Text>
            <View className="mt-3">
              <CheckRow
                label="Always include the waiver link in confirmation email/SMS"
                value={settings.alwaysIncludeLinkInConfirmation}
                disabled={!canEdit}
                onToggle={() =>
                  set(
                    "alwaysIncludeLinkInConfirmation",
                    !settings.alwaysIncludeLinkInConfirmation,
                  )
                }
              />
            </View>
          </Section>

          {/* Search & Kiosk */}
          <Section title="Search & Kiosk">
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Text className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1.5">
                  Search auto-refresh (s)
                </Text>
                <TextInput
                  value={numText.searchAutoRefreshSeconds}
                  onChangeText={(t) =>
                    editNum("searchAutoRefreshSeconds", t, false)
                  }
                  editable={canEdit}
                  keyboardType="number-pad"
                  placeholder="30"
                  placeholderTextColor="#9CA3AF"
                  className={numberFieldClass}
                />
              </View>
              <View className="flex-1">
                <Text className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1.5">
                  Kiosk inactivity reset (s)
                </Text>
                <TextInput
                  value={numText.kioskInactivityTimeoutSeconds}
                  onChangeText={(t) =>
                    editNum("kioskInactivityTimeoutSeconds", t, false)
                  }
                  editable={canEdit}
                  keyboardType="number-pad"
                  placeholder="60"
                  placeholderTextColor="#9CA3AF"
                  className={numberFieldClass}
                />
              </View>
            </View>
            <Text className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5">
              0 disables auto-refresh
            </Text>
            <View className="mt-3">
              <CheckRow
                label="Disable autofill in kiosk mode"
                hint="Recommended for shared iPads"
                value={settings.kioskDisableAutofill}
                disabled={!canEdit}
                onToggle={() =>
                  set("kioskDisableAutofill", !settings.kioskDisableAutofill)
                }
              />
            </View>
          </Section>

          {/* Permissions */}
          <Section title="Permissions">
            <CheckRow
              label="Allow admins to delete waivers"
              value={settings.adminDeleteEnabled}
              disabled={!canEdit}
              onToggle={() =>
                set("adminDeleteEnabled", !settings.adminDeleteEnabled)
              }
            />
            <CheckRow
              label="Allow managers to print & export"
              value={settings.managerPrintExportEnabled}
              disabled={!canEdit}
              onToggle={() =>
                set(
                  "managerPrintExportEnabled",
                  !settings.managerPrintExportEnabled,
                )
              }
            />
            <CheckRow
              label="Allow managers to build templates"
              value={settings.managerCanBuildTemplates}
              disabled={!canEdit}
              onToggle={() =>
                set(
                  "managerCanBuildTemplates",
                  !settings.managerCanBuildTemplates,
                )
              }
            />
            <CheckRow
              label="Allow managers to view the deletion log"
              value={settings.managerCanViewDeletionLog}
              disabled={!canEdit}
              onToggle={() =>
                set(
                  "managerCanViewDeletionLog",
                  !settings.managerCanViewDeletionLog,
                )
              }
            />
          </Section>

          {/* Marketing & CRM */}
          <Section title="Marketing & CRM">
            <CheckRow
              label="Enable marketing consent on waivers"
              value={settings.marketingConsentEnabled}
              disabled={!canEdit}
              onToggle={() =>
                set(
                  "marketingConsentEnabled",
                  !settings.marketingConsentEnabled,
                )
              }
            />
            <CheckRow
              label="Only sync to CRM when the guest opts in"
              value={settings.crmSyncOnlyWhenConsented}
              disabled={!canEdit}
              onToggle={() =>
                set(
                  "crmSyncOnlyWhenConsented",
                  !settings.crmSyncOnlyWhenConsented,
                )
              }
            />
            <CheckRow
              label="Never use minors' data for marketing"
              value={settings.minorMarketingDisabled}
              disabled={!canEdit}
              onToggle={() =>
                set("minorMarketingDisabled", !settings.minorMarketingDisabled)
              }
            />
          </Section>

          {canEdit && (
            <Pressable
              onPress={save}
              disabled={saving}
              className="flex-row items-center justify-center gap-2 bg-[#0644C7] py-3.5 rounded-xl active:opacity-90 mt-1"
              style={saving ? { opacity: 0.6 } : undefined}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Feather name="save" size={16} color="#FFFFFF" />
              )}
              <Text className="text-sm font-semibold text-white">
                Save Settings
              </Text>
            </Pressable>
          )}
        </ScrollView>
      )}

      {/* Duplicate rule picker */}
      <BottomSheet
        visible={ruleSheet}
        onClose={() => setRuleSheet(false)}
        title="Default duplicate rule"
      >
        <View className="px-4 pb-6">
          {DUPLICATE_OPTIONS.map((opt) => {
            const selected = settings?.defaultDuplicateRule === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => {
                  set("defaultDuplicateRule", opt.value);
                  setRuleSheet(false);
                }}
                className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
                  selected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                }`}
              >
                <Text
                  className={`text-base font-medium ${
                    selected
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  {opt.label}
                </Text>
                {selected && (
                  <View className="w-6 h-6 rounded-full bg-blue-500 items-center justify-center">
                    <Feather name="check" size={14} color="#FFFFFF" />
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>
    </View>
  );
};

export default WaiverSettingsScreen;
