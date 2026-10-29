import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "../../components/ui/BottomSheet";
import { HeaderAction } from "../../components/ui/EmailComposerKit";
import { CheckboxRow } from "../../components/ui/FormControls";
import {
  SkeletonBlock,
  usePulse,
} from "../../components/ui/skeleton/SkeletonBlock";
import { getToken } from "../../lib/session";
import {
  groupSmsNotifications,
  SMS_MERGE_FIELDS,
  smsBodyOf,
  smsCharCount,
  smsSegmentLabel,
  smsSegments,
  smsTriggerLabel,
  withListFields,
} from "../../lib/sms/smsText";
import {
  fetchSmsNotifications,
  fetchSmsOptions,
  resetSmsNotification,
  seedSmsDefaults,
  sendTestSms,
  toggleSmsNotification,
  updateSmsNotification,
  type SmsNotification,
  type SmsOptions,
} from "../../services/smsNotificationService";

// Mobile port of the web admin's SMS Notifications page
// (zappoint src/pages/admin/sms/SmsNotifications.tsx): the same templates from
// /api/sms-notifications, grouped by segment, each with Active/Off and Edit.

const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const errorText = (err: unknown, fallback: string) =>
  err instanceof Error && err.message ? err.message : fallback;

const segmentsLabel = (n: number) => `${n} SMS segment${n === 1 ? "" : "s"}`;

const SmsNotifications = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const headerIcon = scheme === "dark" ? "#fff" : "#111";

  const [items, setItems] = useState<SmsNotification[]>([]);
  const [options, setOptions] = useState<SmsOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  // Kept after closing, so the sheet keeps its title through the exit animation.
  const [editing, setEditing] = useState<SmsNotification | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }
    try {
      const [list, opts] = await Promise.all([
        fetchSmsNotifications(token),
        fetchSmsOptions(token),
      ]);
      setItems(list);
      setOptions(opts);
      setError(null);
    } catch (err) {
      setError(errorText(err, "Failed to load SMS notifications"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const groups = useMemo(() => groupSmsNotifications(items), [items]);

  const replaceItem = useCallback((updated: SmsNotification) => {
    setItems((prev) =>
      prev.map((x) => (x.id === updated.id ? withListFields(updated) : x)),
    );
  }, []);

  const handleSync = async () => {
    const token = getToken();
    if (!token || syncing) return;
    setSyncing(true);
    try {
      await seedSmsDefaults(token);
      await load();
      Alert.alert("Synced", "Default SMS templates synced.");
    } catch (err) {
      Alert.alert("Sync failed", errorText(err, "Could not sync the defaults."));
    } finally {
      setSyncing(false);
    }
  };

  const handleToggle = async (n: SmsNotification) => {
    const token = getToken();
    if (!token || togglingId !== null) return;
    setTogglingId(n.id);
    try {
      const updated = await toggleSmsNotification(token, n.id);
      setItems((prev) =>
        prev.map((x) =>
          x.id === n.id ? { ...x, is_active: updated.is_active } : x,
        ),
      );
    } catch (err) {
      Alert.alert("Error", errorText(err, "Failed to toggle"));
    } finally {
      setTogglingId(null);
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
            SMS Notifications
          </Text>
          <Pressable
            onPress={onRefresh}
            className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
            accessibilityRole="button"
            accessibilityLabel="Refresh"
          >
            <Feather name="refresh-cw" size={18} color={headerIcon} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View className="px-5 gap-4">
          {/* Intro */}
          <View
            className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mt-6"
            style={CARD_SHADOW}
          >
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              SMS Notifications
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Automated text messages for parties, attractions, and events
            </Text>
            <Text className="text-xs text-gray-400 dark:text-gray-500 mt-2 leading-relaxed">
              Text-message templates that fire automatically alongside the
              matching email. Edit the wording; merge fields like{" "}
              {"{{customer_first_name}}"} are filled in when sent.
            </Text>
          </View>

          <Pressable
            onPress={handleSync}
            disabled={syncing}
            className={`flex-row items-center justify-center gap-2 py-3.5 rounded-xl border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 ${
              syncing ? "opacity-50" : "active:opacity-80"
            }`}
            accessibilityRole="button"
          >
            {syncing ? (
              <ActivityIndicator size="small" color={PRIMARY} />
            ) : (
              <Feather name="refresh-ccw" size={16} color={PRIMARY} />
            )}
            <Text className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              Sync Defaults
            </Text>
          </Pressable>

          {options && !options.sms_configured && (
            <View className="flex-row items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-900/20 p-4">
              <Feather name="alert-triangle" size={18} color="#D97706" />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  SMS sending is not configured yet.
                </Text>
                <Text className="text-xs text-amber-800 dark:text-amber-300 mt-0.5 leading-relaxed">
                  Templates can be edited now, but messages will only be
                  delivered once text messaging is set up on the server.
                </Text>
              </View>
            </View>
          )}

          {loading && items.length === 0 ? (
            <SmsListSkeleton />
          ) : error && items.length === 0 ? (
            <View className="items-center py-10">
              <Feather name="alert-circle" size={36} color="#EF4444" />
              <Text className="text-sm text-gray-600 dark:text-gray-300 mt-3 text-center">
                {error}
              </Text>
              <Pressable
                onPress={() => {
                  setLoading(true);
                  load();
                }}
                className="mt-4 px-5 py-2.5 rounded-xl bg-[#0644C7]"
              >
                <Text className="text-sm font-semibold text-white">Retry</Text>
              </Pressable>
            </View>
          ) : items.length === 0 ? (
            <View className="items-center py-12 bg-white dark:bg-neutral-900 rounded-2xl border border-gray-100 dark:border-neutral-800">
              <Feather name="message-square" size={36} color="#D1D5DB" />
              <Text className="text-sm text-gray-500 dark:text-gray-400 mt-3 mb-4">
                No SMS templates yet.
              </Text>
              <Pressable
                onPress={handleSync}
                disabled={syncing}
                className="flex-row items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0644C7]"
              >
                <Feather name="refresh-ccw" size={14} color="#FFFFFF" />
                <Text className="text-sm font-semibold text-white">
                  Sync Default Templates
                </Text>
              </Pressable>
            </View>
          ) : (
            groups.map(({ segment, items: list }) => (
              <View key={segment}>
                <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2 px-1">
                  {smsSegmentLabel(segment)}
                </Text>
                <View
                  className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-100 dark:border-neutral-800 overflow-hidden"
                  style={CARD_SHADOW}
                >
                  {list.map((n, index) => (
                    <SmsRow
                      key={n.id}
                      notification={n}
                      triggerLabel={smsTriggerLabel(options, n.trigger_type)}
                      isLast={index === list.length - 1}
                      toggling={togglingId === n.id}
                      onToggle={() => handleToggle(n)}
                      onEdit={() => {
                        setEditing(n);
                        setEditOpen(true);
                      }}
                    />
                  ))}
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <SmsEditSheet
        visible={editOpen}
        notification={editing}
        options={options}
        onClose={() => setEditOpen(false)}
        onSaved={(updated) => {
          replaceItem(updated);
          setEditOpen(false);
          Alert.alert("Saved", "SMS template saved.");
        }}
        onReset={replaceItem}
      />
    </View>
  );
};

function SmsRow({
  notification: n,
  triggerLabel,
  isLast,
  toggling,
  onToggle,
  onEdit,
}: {
  notification: SmsNotification;
  triggerLabel: string;
  isLast: boolean;
  toggling: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const body = smsBodyOf(n);
  const segs = smsSegments(body);
  return (
    <View
      className={`flex-row gap-3 p-4 ${
        isLast ? "" : "border-b border-gray-100 dark:border-neutral-800"
      }`}
    >
      <View className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/30 items-center justify-center">
        <Feather name="message-square" size={17} color={PRIMARY} />
      </View>
      <View className="flex-1 min-w-0">
        <Text className="text-sm font-semibold text-gray-900 dark:text-white">
          {n.name}
        </Text>
        <View className="flex-row flex-wrap gap-1.5 mt-1">
          <View className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-neutral-800">
            <Text className="text-[10px] text-gray-600 dark:text-gray-300">
              {triggerLabel}
            </Text>
          </View>
          {n.is_body_customized && (
            <View className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30">
              <Text className="text-[10px] text-amber-700 dark:text-amber-300">
                Customized
              </Text>
            </View>
          )}
        </View>
        <Text
          className="text-xs text-gray-500 dark:text-gray-400 mt-1.5"
          numberOfLines={2}
        >
          {body}
        </Text>
        <Text className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
          {smsCharCount(body)} chars · {segmentsLabel(segs)}
        </Text>

        <View className="flex-row items-center justify-end gap-2 mt-2.5">
          <Pressable
            onPress={onToggle}
            disabled={toggling}
            accessibilityRole="switch"
            accessibilityState={{ checked: n.is_active }}
            accessibilityLabel={`${n.name}: ${n.is_active ? "active" : "off"}`}
            className={`flex-row items-center gap-1 px-2.5 py-1.5 rounded-full ${
              n.is_active
                ? "bg-blue-100 dark:bg-blue-900/40"
                : "bg-gray-100 dark:bg-neutral-800"
            } ${toggling ? "opacity-50" : "active:opacity-80"}`}
          >
            {toggling ? (
              <ActivityIndicator
                size="small"
                color={n.is_active ? PRIMARY : "#6B7280"}
              />
            ) : (
              <Feather
                name="power"
                size={12}
                color={n.is_active ? PRIMARY : "#6B7280"}
              />
            )}
            <Text
              className={`text-xs font-medium ${
                n.is_active
                  ? "text-blue-700 dark:text-blue-300"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              {n.is_active ? "Active" : "Off"}
            </Text>
          </Pressable>
          <Pressable
            onPress={onEdit}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${n.name}`}
            className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 active:opacity-80"
          >
            <Feather name="edit-2" size={12} color="#374151" />
            <Text className="text-xs font-semibold text-gray-700 dark:text-gray-200">
              Edit
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function SmsListSkeleton() {
  const pulse = usePulse();
  return (
    <View>
      <SkeletonBlock pulse={pulse} className="h-3 w-28 mb-3 ml-1" />
      <View className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-100 dark:border-neutral-800">
        {Array.from({ length: 4 }).map((_, i) => (
          <View
            key={i}
            className={`flex-row gap-3 p-4 ${
              i === 3 ? "" : "border-b border-gray-100 dark:border-neutral-800"
            }`}
          >
            <SkeletonBlock pulse={pulse} className="w-9 h-9 rounded-lg" />
            <View className="flex-1 gap-2">
              <SkeletonBlock pulse={pulse} className="h-4 w-3/5" />
              <SkeletonBlock pulse={pulse} className="h-3 w-2/5" />
              <SkeletonBlock pulse={pulse} className="h-3 w-full" />
              <SkeletonBlock pulse={pulse} className="h-3 w-1/3" />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Edit one template — the web's EditModal, as a bottom sheet. */
function SmsEditSheet({
  visible,
  notification,
  options,
  onClose,
  onSaved,
  onReset,
}: {
  visible: boolean;
  notification: SmsNotification | null;
  options: SmsOptions | null;
  onClose: () => void;
  onSaved: (updated: SmsNotification) => void;
  onReset: (updated: SmsNotification) => void;
}) {
  const [body, setBody] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testing, setTesting] = useState(false);

  // Start from the template every time the sheet opens, so a cancelled edit
  // never comes back when the same template is reopened.
  useEffect(() => {
    if (!visible || !notification) return;
    setBody(smsBodyOf(notification));
    setRecipients(notification.recipient_types ?? []);
    setActive(notification.is_active);
    setTestPhone("");
  }, [visible, notification]);

  const smsConfigured = !!options?.sms_configured;
  const recipientTypes = options?.recipient_types ?? {};
  const segs = smsSegments(body);
  const chars = smsCharCount(body);
  const isCustomized =
    !!notification?.is_default && body !== (notification.default_body ?? "");

  const toggleRecipient = (key: string) =>
    setRecipients((prev) =>
      prev.includes(key) ? prev.filter((r) => r !== key) : [...prev, key],
    );

  const save = async () => {
    const token = getToken();
    if (!notification || !token || saving) return;
    // The server refuses an empty recipient list (min:1) — say so up front.
    if (recipients.length === 0) {
      Alert.alert("Pick a recipient", "Choose at least one recipient.");
      return;
    }
    setSaving(true);
    try {
      const updated = await updateSmsNotification(token, notification.id, {
        body,
        recipient_types: recipients,
        is_active: active,
      });
      onSaved(updated);
    } catch (err) {
      Alert.alert("Save failed", errorText(err, "Could not save the template."));
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    const token = getToken();
    if (!notification || !token || saving) return;
    setSaving(true);
    try {
      const updated = await resetSmsNotification(token, notification.id);
      setBody(updated.default_body ?? "");
      onReset(updated);
    } catch (err) {
      Alert.alert("Reset failed", errorText(err, "Could not reset the template."));
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    const token = getToken();
    const phone = testPhone.trim();
    if (!notification || !token || !phone || testing) return;
    setTesting(true);
    try {
      const res = await sendTestSms(token, notification.id, phone);
      Alert.alert(res.success ? "Test sent" : "Test failed", res.message);
    } catch (err) {
      Alert.alert("Test failed", errorText(err, "Failed to send test SMS."));
    } finally {
      setTesting(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={notification?.name ?? "Edit SMS"}
      subtitle={notification?.description ?? undefined}
    >
      <ScrollView
        className="px-5"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 16 }}
      >
        {/* Message */}
        <Text className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
          Message
        </Text>
        <TextInput
          value={body}
          onChangeText={setBody}
          multiline
          textAlignVertical="top"
          placeholder="Write the text message…"
          placeholderTextColor="#9CA3AF"
          className="bg-white dark:bg-neutral-900 rounded-xl px-3.5 border border-gray-200 dark:border-neutral-700 text-sm text-gray-900 dark:text-white"
          style={{ minHeight: 110, paddingVertical: 10 }}
        />
        <View className="flex-row items-center justify-between mt-1.5">
          <Text
            className={`flex-1 text-[11px] ${
              segs > 2
                ? "text-amber-600 font-medium"
                : "text-gray-400 dark:text-gray-500"
            }`}
          >
            {chars} chars · {segs} segment{segs === 1 ? "" : "s"}
            {segs > 1 ? " (multi-part — costs more)" : ""}
          </Text>
          {isCustomized && (
            <Pressable
              onPress={reset}
              disabled={saving}
              className="flex-row items-center gap-1 ml-2"
              accessibilityRole="button"
            >
              <Feather name="rotate-ccw" size={11} color="#6B7280" />
              <Text className="text-[11px] text-gray-500 dark:text-gray-400">
                Reset to default
              </Text>
            </Pressable>
          )}
        </View>

        {/* Merge fields */}
        <Text className="text-xs font-semibold text-gray-700 dark:text-gray-300 mt-4 mb-1.5">
          Insert merge field
        </Text>
        <View className="flex-row flex-wrap gap-1.5">
          {SMS_MERGE_FIELDS.map((f) => (
            <Pressable
              key={f}
              onPress={() => setBody((b) => `${b}${f}`)}
              className="px-2 py-1 rounded-md border border-gray-200 dark:border-neutral-700 active:opacity-70"
            >
              <Text className="text-[11px] text-gray-600 dark:text-gray-300">
                {f}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Recipients */}
        <Text className="text-xs font-semibold text-gray-700 dark:text-gray-300 mt-4 mb-1.5">
          Recipients
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {Object.entries(recipientTypes).map(([key, label]) => {
            const on = recipients.includes(key);
            return (
              <Pressable
                key={key}
                onPress={() => toggleRecipient(key)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                className={`px-3 py-2 rounded-lg border ${
                  on
                    ? "border-blue-400 bg-blue-50 dark:bg-blue-900/30"
                    : "border-gray-200 dark:border-neutral-700"
                }`}
              >
                <Text
                  className={`text-xs ${
                    on
                      ? "text-blue-700 dark:text-blue-300"
                      : "text-gray-600 dark:text-gray-300"
                  }`}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View className="mt-4">
          <CheckboxRow
            label={
              <Text className="text-sm text-gray-700 dark:text-gray-200">
                Active
              </Text>
            }
            checked={active}
            onToggle={() => setActive((a) => !a)}
          />
        </View>

        {/* Send a test */}
        <View className="border-t border-gray-100 dark:border-neutral-800 mt-4 pt-4">
          <Text className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
            Send a test
          </Text>
          <View className="flex-row gap-2">
            <TextInput
              value={testPhone}
              onChangeText={setTestPhone}
              editable={smsConfigured}
              keyboardType="phone-pad"
              placeholder={
                smsConfigured ? "+1 555 010 2030" : "SMS not configured"
              }
              placeholderTextColor="#9CA3AF"
              className={`flex-1 rounded-xl px-3.5 border border-gray-200 dark:border-neutral-700 text-sm text-gray-900 dark:text-white ${
                smsConfigured
                  ? "bg-white dark:bg-neutral-900"
                  : "bg-gray-50 dark:bg-neutral-800"
              }`}
              style={{ paddingVertical: 10 }}
            />
            <Pressable
              onPress={test}
              disabled={!smsConfigured || !testPhone.trim() || testing}
              className={`flex-row items-center gap-1.5 px-4 rounded-xl border border-gray-300 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800 ${
                !smsConfigured || !testPhone.trim() || testing
                  ? "opacity-50"
                  : "active:opacity-80"
              }`}
            >
              {testing ? (
                <ActivityIndicator size="small" color="#374151" />
              ) : (
                <Feather name="send" size={14} color="#374151" />
              )}
              <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Test
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Cancel / Save */}
        <View className="flex-row gap-3 mt-5">
          <HeaderAction label="Cancel" block disabled={saving} onPress={onClose} />
          <HeaderAction
            label="Save"
            icon="check"
            variant="primary"
            block
            loading={saving}
            onPress={save}
          />
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

export default SmsNotifications;
