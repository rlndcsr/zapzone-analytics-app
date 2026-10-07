import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";
import {
  type ComponentProps,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CenterModal } from "../../components/ui/CenterModal";
import { Toast, type ToastType } from "../../components/ui/Toast";
import { useTransientAlert } from "../../lib/hooks/useTransientAlert";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  canManageStaffPins,
  DEFAULT_IDLE_SECONDS,
  DEFAULT_PIN_LENGTH,
  matchesStaffSearch,
  MAX_IDLE_SECONDS,
  MIN_IDLE_SECONDS,
  parseIdleSeconds,
  staffRoleLabel,
  validateStaffPin,
} from "../../lib/staffPins";
import {
  clearStaffPin,
  fetchStaffPinLength,
  fetchStaffPinRoster,
  fetchStaffTerminals,
  issueStaffPin,
  revokeStaffTerminal,
  unlockStaffPin,
  updateStaffTerminal,
  type StaffPinRosterEntry,
  type StaffTerminal,
} from "../../services/staffPinService";

const PRIMARY = "#0644C7";

// the number-pad keyboard can push Save below the fold on short phones
const MAX_MODAL_HEIGHT = Dimensions.get("window").height * 0.85;

type ToastState = { message: string; type: ToastType };

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/* ------------------------------------------------------------ small pieces -- */

function SectionCard({
  icon,
  title,
  right,
  children,
}: {
  icon: ComponentProps<typeof Feather>["name"];
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mb-5 shadow-sm border border-gray-100 dark:border-neutral-800">
      <View className="flex-row items-center justify-between mb-4">
        <View className="flex-row items-center gap-2 flex-1">
          <Feather name={icon} size={18} color="#6B7280" />
          <Text className="text-base font-semibold text-gray-900 dark:text-white">
            {title}
          </Text>
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

function RowButton({
  label,
  icon,
  tone = "neutral",
  disabled,
  onPress,
}: {
  label: string;
  icon?: ComponentProps<typeof Feather>["name"];
  tone?: "neutral" | "danger";
  disabled?: boolean;
  onPress: () => void;
}) {
  const danger = tone === "danger";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      className={`h-9 flex-row items-center justify-center gap-1.5 rounded-lg border px-3 active:opacity-70 ${
        danger
          ? "border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950"
          : "border-gray-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
      } ${disabled ? "opacity-50" : ""}`}
    >
      {icon && (
        <Feather name={icon} size={14} color={danger ? "#E11D48" : "#374151"} />
      )}
      <Text
        className={`text-xs font-semibold ${
          danger ? "text-rose-600 dark:text-rose-400" : "text-gray-700 dark:text-gray-200"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function PinStatusChip({ entry }: { entry: StaffPinRosterEntry }) {
  if (entry.locked) {
    return (
      <View className="flex-row items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 dark:bg-amber-900/40">
        <Feather name="lock" size={11} color="#92400E" />
        <Text className="text-xs font-medium text-amber-800 dark:text-amber-300">
          Locked
        </Text>
      </View>
    );
  }
  if (entry.has_pin) {
    return (
      <View className="rounded-full bg-emerald-100 px-2 py-0.5 dark:bg-emerald-900/40">
        <Text className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
          Set
        </Text>
      </View>
    );
  }
  return <Text className="text-xs text-gray-500 dark:text-gray-400">Not set</Text>;
}

/* ------------------------------------------------------------- terminal row -- */

function TerminalRow({
  terminal,
  disabled,
  onSaveIdle,
  onToggleDisabled,
  onRemove,
}: {
  terminal: StaffTerminal;
  disabled: boolean;
  onSaveIdle: (seconds: number) => void;
  onToggleDisabled: (next: boolean) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState(
    String(terminal.idle_seconds ?? DEFAULT_IDLE_SECONDS),
  );
  const [error, setError] = useState<string | null>(null);
  const off = terminal.idle_disabled;

  const save = () => {
    const parsed = parseIdleSeconds(draft);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    onSaveIdle(parsed.seconds);
  };

  return (
    <View className="rounded-xl border border-gray-200 dark:border-neutral-700 p-4 mb-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="font-semibold text-gray-900 dark:text-white" numberOfLines={1}>
            {terminal.label}
          </Text>
          <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5" numberOfLines={1}>
            {terminal.location?.name ?? `Location ${terminal.location_id}`}
          </Text>
        </View>
        <RowButton label="Remove" tone="danger" disabled={disabled} onPress={onRemove} />
      </View>

      <Text className="text-xs font-medium text-gray-600 dark:text-gray-300 mt-4 mb-1">
        Lock after (seconds)
      </Text>
      <View className="flex-row items-center gap-2">
        <TextInput
          value={draft}
          onChangeText={(text) => {
            setDraft(text.replace(/\D/g, ""));
            setError(null);
          }}
          editable={!off && !disabled}
          keyboardType="number-pad"
          maxLength={4}
          placeholder={String(DEFAULT_IDLE_SECONDS)}
          placeholderTextColor="#9CA3AF"
          accessibilityLabel={`Lock ${terminal.label} after this many seconds`}
          className={`w-24 h-10 rounded-lg border border-gray-300 dark:border-neutral-700 px-3 text-sm ${
            off
              ? "bg-gray-100 text-gray-400 dark:bg-neutral-800 dark:text-gray-500"
              : "text-gray-900 dark:text-white"
          }`}
        />
        <RowButton label="Save" disabled={off || disabled} onPress={save} />
      </View>
      {error ? (
        <Text className="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-400">
          {error}
        </Text>
      ) : (
        <Text className="mt-1.5 text-[11px] text-gray-400 dark:text-gray-500">
          {MIN_IDLE_SECONDS}–{MAX_IDLE_SECONDS} seconds
        </Text>
      )}

      <View className="flex-row items-center gap-3 mt-3">
        <Switch
          value={off}
          onValueChange={onToggleDisabled}
          disabled={disabled}
          trackColor={{ false: "#D1D5DB", true: PRIMARY }}
          thumbColor="#FFFFFF"
          accessibilityLabel="Turn automatic logout off"
        />
        <Text className="flex-1 text-sm text-gray-700 dark:text-gray-200">
          Turn automatic logout off
        </Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ screen -- */

const StaffPins = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  const role = getCurrentUser()?.role;
  const allowed = canManageStaffPins(role);

  const [roster, setRoster] = useState<StaffPinRosterEntry[]>([]);
  const [terminals, setTerminals] = useState<StaffTerminal[]>([]);
  const [pinLength, setPinLength] = useState(DEFAULT_PIN_LENGTH);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // Like the web's `saving`: one change at a time, every action waits for it.
  const [busy, setBusy] = useState(false);
  const [toast, showToast] = useTransientAlert<ToastState>(3500);

  // The target outlives `pinOpen` so the dialog keeps its name while it animates out.
  const [pinTarget, setPinTarget] = useState<StaffPinRosterEntry | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinValue, setPinValue] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSaving, setPinSaving] = useState(false);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const [staff, devices] = await Promise.all([
        fetchStaffPinRoster(token),
        fetchStaffTerminals(token),
      ]);
      setRoster(staff);
      setTerminals(devices);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Could not load PIN settings."));
    }
    // The length only shapes the PIN box; a failure keeps the default.
    fetchStaffPinLength(token)
      .then(setPinLength)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!allowed) {
      setLoading(false);
      return;
    }
    void load().finally(() => setLoading(false));
  }, [allowed, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  /** Runs one change, reports it, then reloads — the web's `act`. */
  const act = useCallback(
    async (fn: (token: string) => Promise<unknown>, okText: string) => {
      const token = getToken();
      if (!token) return;
      setBusy(true);
      try {
        await fn(token);
        showToast({ message: okText, type: "success" });
        await load();
      } catch (err) {
        showToast({ message: errorMessage(err, "That did not work."), type: "error" });
      } finally {
        setBusy(false);
      }
    },
    [load, showToast],
  );

  const openPin = (entry: StaffPinRosterEntry) => {
    setPinTarget(entry);
    setPinValue("");
    setPinError(null);
    setPinOpen(true);
  };

  const submitPin = async () => {
    if (!pinTarget) return;
    const invalid = validateStaffPin(pinValue, pinLength);
    if (invalid) {
      setPinError(invalid);
      return;
    }
    const token = getToken();
    if (!token) return;
    setPinSaving(true);
    setPinError(null);
    try {
      await issueStaffPin(token, pinTarget.id, pinValue);
      showToast({ message: `PIN set for ${pinTarget.name}.`, type: "success" });
      setPinOpen(false);
      setPinValue("");
      await load();
    } catch (err) {
      // Shown inside the dialog, which would otherwise cover a toast.
      setPinError(errorMessage(err, "That did not work."));
    } finally {
      setPinSaving(false);
    }
  };

  const confirmRemovePin = (entry: StaffPinRosterEntry) => {
    Alert.alert(
      "Remove PIN",
      `Remove the PIN for ${entry.name}? They will not be able to sign in to a shared terminal until a new one is set.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () =>
            void act((t) => clearStaffPin(t, entry.id), `PIN removed for ${entry.name}.`),
        },
      ],
    );
  };

  const confirmRemoveTerminal = (terminal: StaffTerminal) => {
    Alert.alert(
      "Remove terminal",
      `"${terminal.label}" will ask for a full sign-in from now on.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () =>
            void act((t) => revokeStaffTerminal(t, terminal.id), `${terminal.label} removed.`),
        },
      ],
    );
  };

  const visibleRoster = useMemo(
    () => roster.filter((entry) => matchesStaffSearch(entry, search)),
    [roster, search],
  );

  const pinPlaceholder = "•".repeat(pinLength);

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header */}
      <View className="bg-white dark:bg-neutral-900 pt-12 pb-5 px-5 w-full relative overflow-hidden z-10 border-b border-gray-100 dark:border-neutral-800">
        <View className="flex-row items-center justify-between relative z-10">
          <Pressable
            onPress={() => router.back()}
            className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Feather name="chevron-left" size={20} color={headerIcon} />
          </Pressable>
          <Text className="text-gray-900 dark:text-white text-lg font-bold">
            Employee PINs
          </Text>
          <View style={{ width: 36 }} />
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={
          allowed ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={PRIMARY}
              colors={[PRIMARY]}
              progressBackgroundColor="#FFFFFF"
            />
          ) : undefined
        }
      >
        <View className="px-5">
          {/* Intro */}
          <View className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mt-6 mb-5 shadow-sm">
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Employee PINs & shared terminals
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Staff tap a PIN to identify themselves on a shared machine.
              Everything they do is recorded under their own name, and the
              terminal returns to the PIN screen when it is left alone.
            </Text>
          </View>

          {!allowed ? (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl p-5 shadow-sm">
              <Text className="text-sm text-gray-600 dark:text-gray-300">
                Only a location manager or administrator can manage employee PINs.
              </Text>
            </View>
          ) : loading ? (
            <View className="py-16 items-center">
              <ActivityIndicator color={PRIMARY} />
              <Text className="text-sm text-gray-500 dark:text-gray-400 mt-3">
                Loading…
              </Text>
            </View>
          ) : (
            <>
              {error && (
                <View className="bg-red-50 border border-red-100 rounded-2xl p-5 mb-5">
                  <Text className="text-red-600 font-semibold">Something went wrong</Text>
                  <Text className="text-red-500 text-sm mt-1">{error}</Text>
                </View>
              )}

              {/* This device — a phone running this app is never a shared
                  terminal; terminals are set up from the web admin on the
                  machine itself. */}
              <SectionCard icon="monitor" title="This device">
                <Text className="text-sm text-gray-600 dark:text-gray-300">
                  Shared terminals are set up from the web admin, on the
                  computer that will be shared (Employee PINs › This device).
                </Text>
                <Text className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                  Only devices set up there ever lock. A personal laptop or
                  phone is left alone.
                </Text>
              </SectionCard>

              {/* Employee PINs */}
              <SectionCard
                icon="key"
                title="Employee PINs"
                right={
                  <Pressable
                    onPress={() => void onRefresh()}
                    disabled={refreshing}
                    className="flex-row items-center gap-1 px-2 py-1 rounded-lg active:bg-gray-100 dark:active:bg-neutral-800"
                    accessibilityRole="button"
                    accessibilityLabel="Refresh"
                  >
                    <Feather name="refresh-cw" size={13} color={PRIMARY} />
                    <Text className="text-xs font-medium text-blue-600 dark:text-blue-400">
                      Refresh
                    </Text>
                  </Pressable>
                }
              >
                <View className="flex-row items-center gap-2 h-10 rounded-lg border border-gray-200 dark:border-neutral-700 px-3 mb-2">
                  <Feather name="search" size={15} color="#9CA3AF" />
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search by name or email"
                    placeholderTextColor="#9CA3AF"
                    autoCapitalize="none"
                    autoCorrect={false}
                    className="flex-1 text-sm text-gray-900 dark:text-white"
                  />
                  {!!search && (
                    <Pressable
                      onPress={() => setSearch("")}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Clear search"
                    >
                      <Feather name="x" size={15} color="#9CA3AF" />
                    </Pressable>
                  )}
                </View>

                {visibleRoster.map((entry) => (
                  <View
                    key={entry.id}
                    className="py-3 border-b border-gray-100 dark:border-neutral-800"
                  >
                    <View className="flex-row items-start justify-between gap-3">
                      <View className="flex-1">
                        <Text
                          className="font-medium text-gray-900 dark:text-white"
                          numberOfLines={1}
                        >
                          {entry.name}
                        </Text>
                        <Text
                          className="text-xs text-gray-500 dark:text-gray-400"
                          numberOfLines={1}
                        >
                          {entry.email}
                        </Text>
                        <Text className="text-xs text-gray-700 dark:text-gray-300 mt-1">
                          {staffRoleLabel(entry.role)}
                        </Text>
                      </View>
                      <PinStatusChip entry={entry} />
                    </View>

                    <View className="flex-row flex-wrap justify-end gap-2 mt-2">
                      <RowButton
                        label={entry.has_pin ? "Reset PIN" : "Set PIN"}
                        disabled={busy}
                        onPress={() => openPin(entry)}
                      />
                      {entry.locked && (
                        <RowButton
                          label="Unlock"
                          icon="unlock"
                          disabled={busy}
                          onPress={() =>
                            void act(
                              (t) => unlockStaffPin(t, entry.id),
                              `${entry.name} can use their PIN again.`,
                            )
                          }
                        />
                      )}
                      {entry.has_pin && (
                        <RowButton
                          label="Remove"
                          icon="trash-2"
                          tone="danger"
                          disabled={busy}
                          onPress={() => confirmRemovePin(entry)}
                        />
                      )}
                    </View>
                  </View>
                ))}

                {visibleRoster.length === 0 && (
                  <Text className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                    {roster.length === 0 ? "No staff to show." : "No staff match your search."}
                  </Text>
                )}
              </SectionCard>

              {/* Automatic logout */}
              <SectionCard icon="lock" title="Automatic logout">
                {terminals.length === 0 ? (
                  <Text className="text-sm text-gray-500 dark:text-gray-400">
                    No shared terminals have been set up yet.
                  </Text>
                ) : (
                  terminals.map((terminal) => (
                    <TerminalRow
                      // Remount after a reload so the box shows the saved value.
                      key={`${terminal.id}-${terminal.idle_seconds ?? "d"}-${terminal.idle_disabled}`}
                      terminal={terminal}
                      disabled={busy}
                      onSaveIdle={(seconds) =>
                        void act(
                          (t) => updateStaffTerminal(t, terminal.id, { idle_seconds: seconds }),
                          "Automatic logout time saved.",
                        )
                      }
                      onToggleDisabled={(next) =>
                        void act(
                          (t) => updateStaffTerminal(t, terminal.id, { idle_disabled: next }),
                          next ? "Automatic logout turned off." : "Automatic logout turned on.",
                        )
                      }
                      onRemove={() => confirmRemoveTerminal(terminal)}
                    />
                  ))
                )}

                <Text className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Turning automatic logout off applies to attendants. A manager
                  or administrator signed in with a PIN is always returned to
                  the PIN screen, so their access cannot be left open behind
                  them.
                </Text>
              </SectionCard>
            </>
          )}
        </View>
      </ScrollView>

      {/* Set / reset PIN */}
      <CenterModal
        visible={pinOpen}
        onClose={() => setPinOpen(false)}
        dismissable={!pinSaving}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ maxHeight: MAX_MODAL_HEIGHT }}
        >
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View className="rounded-3xl bg-white p-6 dark:bg-neutral-900">
              <Text className="text-lg font-bold text-gray-900 dark:text-white">
                {pinTarget?.has_pin ? "Reset" : "Set"} PIN for {pinTarget?.name}
              </Text>
              <Text className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Choose {pinLength} digits. Nobody can read it back afterwards,
                so write it down for them now.
              </Text>

              <TextInput
                autoFocus
                value={pinValue}
                onChangeText={(text) => {
                  setPinValue(text.replace(/\D/g, "").slice(0, pinLength));
                  setPinError(null);
                }}
                keyboardType="number-pad"
                maxLength={pinLength}
                placeholder={pinPlaceholder}
                placeholderTextColor="#9CA3AF"
                accessibilityLabel="New PIN"
                className="mt-4 rounded-xl border border-gray-300 px-3 py-3 text-center text-2xl tracking-[8px] text-gray-900 dark:border-neutral-700 dark:text-white"
              />

              {!!pinError && (
                <Text className="mt-2 text-sm font-medium text-rose-700 dark:text-rose-400">
                  {pinError}
                </Text>
              )}

              <View className="mt-5 flex-row justify-end gap-2">
                <Pressable
                  onPress={() => setPinOpen(false)}
                  disabled={pinSaving}
                  accessibilityRole="button"
                  className="h-11 items-center justify-center rounded-xl border border-gray-300 px-4 active:opacity-70 dark:border-neutral-700"
                >
                  <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => void submitPin()}
                  disabled={pinSaving}
                  accessibilityRole="button"
                  className={`h-11 flex-row items-center justify-center gap-2 rounded-xl bg-[#0644C7] px-4 active:opacity-80 ${
                    pinSaving ? "opacity-60" : ""
                  }`}
                >
                  {pinSaving && <ActivityIndicator size="small" color="#FFFFFF" />}
                  <Text className="text-sm font-semibold text-white">
                    {pinSaving ? "Saving…" : "Save PIN"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </CenterModal>

      {!!toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => showToast(null)} />
      )}
    </View>
  );
};

export default StaffPins;
