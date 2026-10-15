import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  ErrorText,
  FormButton,
  PRIMARY,
  Section,
} from "../../components/ui/attractionFormKit";
import { TextField } from "../../components/ui/FormControls";
import { Toast, type ToastType } from "../../components/ui/Toast";
import { ReviewBadge } from "../../components/waivers/ReviewBadge";
import { formatDateTimeET } from "../../lib/date/venueTime";
import { getToken } from "../../lib/session";
import {
  activeDependentCount,
  canSaveDependent,
  canSaveProfile,
  dateOfBirthError,
  dependentDraftOf,
  dependentMeta,
  dependentPayload,
  EMPTY_DEPENDENT,
  profileFormOf,
  profilePayload,
  recordName,
  recordSubtitle,
  REVIEW_NOTICE_TITLE,
  reviewNoticeBody,
  sharedPhoneLine,
  sourceLabel,
  statusWord,
  type DependentDraft,
  type ProfileForm,
  type ReturningCustomerDependent,
  type ReturningCustomerHistoryEntry,
  type ReturningCustomerView,
} from "../../lib/waivers/returningCustomers";
import { markReturningCustomersStale } from "../../lib/waivers/returningCustomersStale";
import {
  addReturningCustomerDependent,
  fetchReturningCustomer,
  retireReturningCustomerDependent,
  updateReturningCustomer,
  updateReturningCustomerDependent,
} from "../../services/waiverProfilesService";

const EMPTY_FORM: ProfileForm = {
  firstName: "",
  lastName: "",
  email: "",
  dateOfBirth: "",
  phone: "",
};

const messageOf = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;

/** Label over value, "—" when missing — the web modal's `Field`. */
const Field = ({ label, value }: { label: string; value: string | null }) => (
  <View>
    <Text className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
      {label}
    </Text>
    <Text className="mt-0.5 text-sm font-medium text-gray-900 dark:text-white">
      {value ?? "—"}
    </Text>
  </View>
);

const Pill = ({ tone, children }: { tone: "gray" | "blue" | "emerald"; children: React.ReactNode }) => {
  const wrap = {
    gray: "bg-gray-100 dark:bg-neutral-800",
    blue: "bg-blue-100 dark:bg-blue-900/30",
    emerald: "bg-emerald-100 dark:bg-emerald-900/30",
  }[tone];
  return (
    <View className={`flex-row items-center gap-1 rounded-full px-2 py-0.5 ${wrap}`}>
      {children}
    </View>
  );
};

const HistoryEntry = ({ entry }: { entry: ReturningCustomerHistoryEntry }) => (
  <View className="mb-3 overflow-hidden rounded-xl border border-gray-100 dark:border-neutral-800">
    <View className="flex-row flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-800/60">
      <Text className="shrink text-sm font-semibold text-gray-900 dark:text-white">
        {entry.submittedAt ? formatDateTimeET(entry.submittedAt) : "Not submitted"}
        <Text className="text-xs font-normal text-gray-500 dark:text-gray-400">
          {` · Waiver #${entry.id}`}
        </Text>
      </Text>
      <View className="flex-row flex-wrap items-center gap-1.5">
        {entry.status !== "completed" && (
          <Pill tone="gray">
            <Text className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
              {statusWord(entry.status)}
            </Text>
          </Pill>
        )}
        {entry.newDependentsCount > 0 && (
          <Pill tone="blue">
            <Text className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">
              {entry.newDependentsCount} new
            </Text>
          </Pill>
        )}
        {entry.hasSignature && (
          <Pill tone="emerald">
            <Feather name="shield" size={11} color="#047857" />
            <Text className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
              Signed
            </Text>
          </Pill>
        )}
      </View>
    </View>
    <View className="gap-3 px-3 py-2.5">
      <View className="flex-row flex-wrap" style={{ rowGap: 8 }}>
        {(
          [
            ["Waiver", entry.templateTitle],
            ["Version", entry.version != null ? `v${entry.version}` : null],
            ["Location", entry.locationName],
            ["Signed by", entry.typedLegalName],
            ["Source", sourceLabel(entry.source)],
            [
              "Checked in",
              entry.checkedInAt ? formatDateTimeET(entry.checkedInAt) : "Not checked in",
            ],
          ] as const
        ).map(([label, value]) => (
          <View key={label} className="w-1/2 pr-3">
            <Field label={label} value={value} />
          </View>
        ))}
      </View>
      <View>
        <Text className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
          Dependents included ({entry.dependents.length})
        </Text>
        {entry.dependents.length === 0 ? (
          <Text className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Primary guest only
          </Text>
        ) : (
          <View className="mt-1 flex-row flex-wrap gap-1.5">
            {entry.dependents.map((d) => (
              <View
                key={d.id}
                accessibilityLabel={
                  d.wasNewThisVisit
                    ? `${d.name}, added to the record on this visit`
                    : `${d.name}, already on the record`
                }
                className={`flex-row items-center gap-1 rounded-full px-2 py-0.5 ${
                  d.wasNewThisVisit
                    ? "border border-blue-100 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-900/20"
                    : "bg-gray-100 dark:bg-neutral-800"
                }`}
              >
                <Text
                  className={`text-xs font-medium ${
                    d.wasNewThisVisit
                      ? "text-blue-700 dark:text-blue-300"
                      : "text-gray-700 dark:text-gray-300"
                  }`}
                >
                  {d.name}
                  {d.wasNewThisVisit && <Text className="font-semibold"> new</Text>}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  </View>
);

/** The four dependent inputs, shared by the add and edit forms. */
const DependentFields = ({
  draft,
  onChange,
}: {
  draft: DependentDraft;
  onChange: (next: DependentDraft) => void;
}) => {
  const dobError = dateOfBirthError(draft.dateOfBirth);
  return (
    <View className="gap-2.5">
      <TextField
        value={draft.firstName}
        onChangeText={(v) => onChange({ ...draft, firstName: v })}
        placeholder="First name"
        accessibilityLabel="Dependent first name"
      />
      <TextField
        value={draft.lastName}
        onChangeText={(v) => onChange({ ...draft, lastName: v })}
        placeholder="Last name"
        accessibilityLabel="Dependent last name"
      />
      <View>
        <TextField
          value={draft.dateOfBirth}
          onChangeText={(v) => onChange({ ...draft, dateOfBirth: v })}
          placeholder="Date of birth (YYYY-MM-DD)"
          autoCapitalize="none"
          keyboardType="numbers-and-punctuation"
          accessibilityLabel="Dependent date of birth"
        />
        <ErrorText error={dobError ?? undefined} />
      </View>
      <TextField
        value={draft.relationship}
        onChangeText={(v) => onChange({ ...draft, relationship: v })}
        placeholder="Relationship"
        accessibilityLabel="Dependent relationship"
      />
    </View>
  );
};

const SmallButton = ({
  label,
  onPress,
  primary = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    className={`rounded-lg px-4 py-2.5 ${
      primary
        ? "bg-[#0644C7]"
        : "border border-gray-300 bg-white dark:border-neutral-700 dark:bg-neutral-900"
    } ${disabled ? "opacity-50" : "active:opacity-80"}`}
  >
    <Text
      className={`text-sm font-semibold ${
        primary ? "text-white" : "text-gray-700 dark:text-gray-200"
      }`}
    >
      {label}
    </Text>
  </Pressable>
);

/**
 * One returning-customer record (web parity: WaiverProfiles.tsx's
 * ProfileDetailModal) — saved details, dependents, and every waiver signed
 * against it. A screen rather than a sheet: it holds two forms and a history
 * that can run long.
 */
const ReturningCustomerScreen = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  const params = useLocalSearchParams<{ id?: string }>();
  const profileId = Number(params.id);
  const validId = Number.isInteger(profileId) && profileId > 0;

  const [view, setView] = useState<ReturningCustomerView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM);
  const [savingProfile, setSavingProfile] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addDraft, setAddDraft] = useState<DependentDraft>(EMPTY_DEPENDENT);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<DependentDraft>(EMPTY_DEPENDENT);
  const [dependentBusy, setDependentBusy] = useState(false);
  const [dependentError, setDependentError] = useState<string | null>(null);

  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  // Only the newest read (or save that answers with the record) may fill the
  // screen, so a slow earlier answer can't put old details back.
  const viewRequestRef = useRef(0);

  const applyView = useCallback((next: ReturningCustomerView) => {
    setView(next);
    setForm(profileFormOf(next.profile));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const requestId = ++viewRequestRef.current;
    const isCurrent = () => requestId === viewRequestRef.current;
    if (!validId) {
      setLoadError("That customer record could not be loaded.");
      setLoading(false);
      return;
    }
    const token = getToken();
    if (!token) {
      setLoadError("Not authenticated");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    fetchReturningCustomer(token, profileId, controller.signal)
      .then((next) => {
        if (!isCurrent()) return;
        applyView(next);
        setLoadError(null);
      })
      .catch((err) => {
        if (isCurrent()) {
          setLoadError(messageOf(err, "Failed to load that customer record"));
        }
      })
      .finally(() => {
        if (isCurrent()) setLoading(false);
      });
    const requests = viewRequestRef;
    return () => {
      requests.current++;
      controller.abort();
    };
  }, [profileId, validId, applyView]);

  /** Re-read the record after a dependent change. Resolves false if that failed. */
  const reload = useCallback(
    async (token: string): Promise<boolean> => {
      const requestId = ++viewRequestRef.current;
      try {
        const next = await fetchReturningCustomer(token, profileId);
        if (requestId === viewRequestRef.current) applyView(next);
        return true;
      } catch {
        return false;
      }
    },
    [profileId, applyView],
  );

  const patchProfile = async (
    body: Parameters<typeof updateReturningCustomer>[2],
    success: string,
    onError: (message: string) => void,
    fallback: string,
  ) => {
    const token = getToken();
    if (!token) {
      onError("Not authenticated");
      return;
    }
    setSavingProfile(true);
    const requestId = ++viewRequestRef.current;
    try {
      const next = await updateReturningCustomer(token, profileId, body);
      if (requestId === viewRequestRef.current) applyView(next);
      markReturningCustomersStale();
      setToast({ message: success, type: "success" });
    } catch (err) {
      onError(messageOf(err, fallback));
    } finally {
      setSavingProfile(false);
    }
  };

  const saveProfile = () => {
    setFormError(null);
    void patchProfile(
      profilePayload(form),
      "Customer details saved",
      setFormError,
      "Those details could not be saved",
    );
  };

  const clearReview = () =>
    void patchProfile(
      { needs_staff_review: false },
      "Record marked as resolved. The kiosk lookup will find it again.",
      (message) => setToast({ message, type: "error" }),
      "That flag could not be cleared",
    );

  const runDependentAction = async (
    action: (token: string) => Promise<unknown>,
    message: string,
  ): Promise<boolean> => {
    const token = getToken();
    if (!token) {
      setDependentError("Not authenticated");
      return false;
    }
    setDependentError(null);
    setDependentBusy(true);
    try {
      await action(token);
    } catch (err) {
      setDependentError(messageOf(err, "That dependent could not be saved"));
      setDependentBusy(false);
      return false;
    }
    // The change is saved from here on — a failed re-read must not say otherwise.
    markReturningCustomersStale();
    const refreshed = await reload(token);
    setDependentBusy(false);
    setToast(
      refreshed
        ? { message, type: "success" }
        : {
            message: `${message}, but the record could not be re-read. Go back and open it again to see it.`,
            type: "info",
          },
    );
    return true;
  };

  const addDependent = async () => {
    const ok = await runDependentAction(
      (token) =>
        addReturningCustomerDependent(token, profileId, dependentPayload(addDraft)),
      "Dependent added to the record",
    );
    if (ok) {
      setAddDraft(EMPTY_DEPENDENT);
      setAddOpen(false);
    }
  };

  const saveDependent = async (dependent: ReturningCustomerDependent) => {
    const ok = await runDependentAction(
      (token) =>
        updateReturningCustomerDependent(token, dependent.id, dependentPayload(editDraft)),
      "Dependent updated",
    );
    if (ok) setEditingId(null);
  };

  const startEdit = (dependent: ReturningCustomerDependent) => {
    setDependentError(null);
    setEditingId(dependent.id);
    setEditDraft(dependentDraftOf(dependent));
  };

  const profile = view?.profile;
  const sharedPhone = view?.sharedPhoneProfiles ?? [];
  const profileDobError = dateOfBirthError(form.dateOfBirth);

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
            Customer Record
          </Text>
          <View style={{ width: 36 }} />
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={PRIMARY} />
        </View>
      ) : !view || !profile ? (
        <View className="flex-1 items-center justify-center px-8">
          <Feather name="alert-circle" size={40} color="#EF4444" />
          <Text className="mt-3 text-center text-sm text-gray-600 dark:text-gray-300">
            {loadError ?? "That customer record could not be loaded."}
          </Text>
          <Pressable
            onPress={() => router.back()}
            className="mt-4 rounded-xl bg-[#0644C7] px-5 py-2.5"
          >
            <Text className="text-sm font-semibold text-white">Go back</Text>
          </Pressable>
        </View>
      ) : (
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Who this is */}
            <View className="mb-4 rounded-2xl bg-white p-5 shadow-sm dark:bg-neutral-900">
              <View className="flex-row flex-wrap items-center gap-2">
                <Text className="shrink text-lg font-bold text-gray-900 dark:text-white">
                  {recordName(profile)}
                </Text>
                {profile.needsStaffReview && <ReviewBadge />}
              </View>
              <Text className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {recordSubtitle(profile)}
              </Text>
            </View>

            {(profile.needsStaffReview || sharedPhone.length > 0) && (
              <View className="mb-4 flex-row items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-900/20">
                <Feather name="alert-triangle" size={16} color="#D97706" style={{ marginTop: 2 }} />
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                    {REVIEW_NOTICE_TITLE}
                  </Text>
                  <Text className="mt-1 text-sm text-amber-900 dark:text-amber-200">
                    {reviewNoticeBody(sharedPhone.length)}
                  </Text>
                  {sharedPhone.map((other) => (
                    <Text
                      key={other.id}
                      className="mt-1.5 text-xs text-amber-900 dark:text-amber-200"
                    >
                      <Text className="font-semibold">{recordName({ id: other.id, fullName: other.name })}</Text>
                      {sharedPhoneLine(other)}
                    </Text>
                  ))}
                  {profile.needsStaffReview && (
                    <View className="mt-3 flex-row">
                      <SmallButton
                        label="Clear the flag"
                        onPress={clearReview}
                        disabled={savingProfile}
                      />
                    </View>
                  )}
                </View>
              </View>
            )}

            <Section icon="user" title="Saved customer details">
              <Text className="-mt-2 mb-4 text-xs text-gray-500 dark:text-gray-400">
                The kiosk shows these read-only. Anything wrong has to be corrected here.
              </Text>
              <View className="gap-4">
                <TextField
                  label="First name"
                  value={form.firstName}
                  onChangeText={(v) => setForm((f) => ({ ...f, firstName: v }))}
                />
                <TextField
                  label="Last name"
                  value={form.lastName}
                  onChangeText={(v) => setForm((f) => ({ ...f, lastName: v }))}
                />
                <TextField
                  label="Email"
                  value={form.email}
                  onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View>
                  <TextField
                    label="Date of birth"
                    value={form.dateOfBirth}
                    onChangeText={(v) => setForm((f) => ({ ...f, dateOfBirth: v }))}
                    placeholder="YYYY-MM-DD"
                    hint={profileDobError ? undefined : "Format: YYYY-MM-DD"}
                    autoCapitalize="none"
                    keyboardType="numbers-and-punctuation"
                  />
                  <ErrorText error={profileDobError ?? undefined} />
                </View>
                <TextField
                  label="Phone (lookup key)"
                  value={form.phone}
                  onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))}
                  keyboardType="phone-pad"
                  hint="This is how the guest finds themselves at the kiosk."
                />
                <Field label="Last seen at" value={profile.lastLocationName} />
              </View>
              {!!formError && (
                <Text className="mt-3 text-sm text-red-600 dark:text-red-400">{formError}</Text>
              )}
              <View className="mt-4 flex-row">
                <FormButton
                  label={savingProfile ? "Saving…" : "Save details"}
                  onPress={saveProfile}
                  disabled={savingProfile || !canSaveProfile(form)}
                />
              </View>
            </Section>

            <Section
              icon="users"
              title={`Saved dependents (${activeDependentCount(profile.dependents)})`}
              right={
                <Pressable
                  onPress={() => {
                    setDependentError(null);
                    setAddOpen((v) => !v);
                  }}
                  accessibilityRole="button"
                  className="flex-row items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 active:opacity-70 dark:border-neutral-700"
                >
                  <Feather name="user-plus" size={13} color={PRIMARY} />
                  <Text className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                    Add dependent
                  </Text>
                </Pressable>
              }
            >
              {addOpen && (
                <View className="mb-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-neutral-700 dark:bg-neutral-800/50">
                  <DependentFields draft={addDraft} onChange={setAddDraft} />
                  <View className="mt-3 flex-row justify-end gap-2">
                    <SmallButton
                      label="Cancel"
                      onPress={() => {
                        setAddOpen(false);
                        setAddDraft(EMPTY_DEPENDENT);
                      }}
                    />
                    <SmallButton
                      primary
                      label={dependentBusy ? "Saving…" : "Add"}
                      onPress={() => void addDependent()}
                      disabled={dependentBusy || !canSaveDependent(addDraft)}
                    />
                  </View>
                </View>
              )}

              {!!dependentError && (
                <Text className="mb-3 text-sm text-red-600 dark:text-red-400">
                  {dependentError}
                </Text>
              )}

              {profile.dependents.length === 0 ? (
                <Text className="text-sm text-gray-500 dark:text-gray-400">
                  No dependents on this record yet.
                </Text>
              ) : (
                <View className="rounded-xl border border-gray-100 dark:border-neutral-800">
                  {profile.dependents.map((dependent, i) => (
                    <View
                      key={dependent.id}
                      className={`px-3 py-2.5 ${
                        i > 0 ? "border-t border-gray-100 dark:border-neutral-800" : ""
                      }`}
                    >
                      {editingId === dependent.id ? (
                        <View>
                          <DependentFields draft={editDraft} onChange={setEditDraft} />
                          <View className="mt-3 flex-row justify-end gap-2">
                            <SmallButton label="Cancel" onPress={() => setEditingId(null)} />
                            <SmallButton
                              primary
                              label={dependentBusy ? "Saving…" : "Save"}
                              onPress={() => void saveDependent(dependent)}
                              disabled={dependentBusy || !canSaveDependent(editDraft)}
                            />
                          </View>
                        </View>
                      ) : (
                        <View className="flex-row items-center justify-between gap-2">
                          <View className="flex-1">
                            <View className="flex-row flex-wrap items-center gap-2">
                              <Text
                                className={`text-sm font-medium ${
                                  dependent.isActive
                                    ? "text-gray-900 dark:text-white"
                                    : "text-gray-400 line-through dark:text-gray-500"
                                }`}
                              >
                                {dependent.fullName}
                              </Text>
                              {!dependent.isActive && (
                                <Pill tone="gray">
                                  <Text className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                                    Retired
                                  </Text>
                                </Pill>
                              )}
                            </View>
                            <Text className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                              {dependentMeta(dependent)}
                            </Text>
                          </View>
                          <View className="flex-row items-center gap-1">
                            <Pressable
                              onPress={() => startEdit(dependent)}
                              hitSlop={6}
                              accessibilityRole="button"
                              accessibilityLabel={`Edit ${dependent.fullName}`}
                              className="rounded-lg p-2 active:bg-gray-100 dark:active:bg-neutral-800"
                            >
                              <Feather name="edit-2" size={16} color="#9CA3AF" />
                            </Pressable>
                            {dependent.isActive ? (
                              <Pressable
                                onPress={() =>
                                  void runDependentAction(
                                    (token) => retireReturningCustomerDependent(token, dependent.id),
                                    "Dependent retired",
                                  )
                                }
                                disabled={dependentBusy}
                                hitSlop={6}
                                accessibilityRole="button"
                                accessibilityLabel={`Retire ${dependent.fullName} — past waivers keep them`}
                                className={`rounded-lg p-2 active:bg-red-50 dark:active:bg-red-900/20 ${
                                  dependentBusy ? "opacity-50" : ""
                                }`}
                              >
                                <Feather name="user-x" size={16} color="#DC2626" />
                              </Pressable>
                            ) : (
                              <Pressable
                                onPress={() =>
                                  void runDependentAction(
                                    (token) =>
                                      updateReturningCustomerDependent(token, dependent.id, {
                                        is_active: true,
                                      }),
                                    "Dependent restored",
                                  )
                                }
                                disabled={dependentBusy}
                                hitSlop={6}
                                accessibilityRole="button"
                                accessibilityLabel={`Bring back ${dependent.fullName}`}
                                className={`rounded-lg p-2 active:bg-emerald-50 dark:active:bg-emerald-900/20 ${
                                  dependentBusy ? "opacity-50" : ""
                                }`}
                              >
                                <Feather name="rotate-ccw" size={16} color="#059669" />
                              </Pressable>
                            )}
                          </View>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}
              <Text className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                Retiring keeps the person on every waiver they were already on — it
                only takes them off the kiosk list.
              </Text>
            </Section>

            <Section icon="clock" title={`Submission history (${view.history.length})`}>
              {view.history.length === 0 ? (
                <Text className="text-sm text-gray-500 dark:text-gray-400">
                  No submissions recorded against this record yet.
                </Text>
              ) : (
                view.history.map((entry) => <HistoryEntry key={entry.id} entry={entry} />)
              )}
            </Section>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </View>
  );
};

export default ReturningCustomerScreen;
