import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { InputField } from "../../components/ui/InputField";
import { KioskAdModal } from "../../components/ui/KioskAdModal";
import {
  KioskReturningPanel,
  KioskSavedSignerFields,
} from "../../components/ui/KioskReturningPanel";
import { SignaturePad } from "../../components/ui/SignaturePad";
import { StatusModal } from "../../components/ui/StatusModal";
import { useStatusModal } from "../../lib/hooks/useStatusModal";
import { markWaiversStale } from "../../lib/hooks/useWaivers";
import { getToken } from "../../lib/session";
import {
  fetchKioskForm,
  fetchTemplateKioskForm,
  fetchTemplateKioskPreview,
  minorCapReached,
  submitKioskWaiver,
  submitTemplateKioskWaiver,
  type KioskAd,
  type KioskForm,
  type KioskMinorInput,
  type ReturningProfile,
} from "../../services/waiversService";

const PRIMARY = "#0644C7";

/** How a minor relates to the signer — the web's own list. */
const RELATIONSHIPS = [
  "Parent",
  "Legal Guardian",
  "Grandparent",
  "Aunt / Uncle",
  "Sibling",
  "Authorized Adult",
];

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Three-part date entry to YYYY-MM-DD, or "" until all three are set. */
function toIsoDate(y: string, m: string, d: string): string {
  if (!y || !m || !d) return "";
  return `${y}-${pad2(Number(m))}-${pad2(Number(d))}`;
}

type DraftMinor = {
  key: number;
  firstName: string;
  lastName: string;
  year: string;
  month: string;
  day: string;
  relationship: string;
};

/** A field label with the web's red required marker. */
const Label = ({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) => (
  <Text className="mb-1.5 text-sm font-semibold text-gray-800 dark:text-gray-100">
    {children}
    {required ? <Text className="text-red-500"> *</Text> : null}
  </Text>
);

const KioskShell = ({
  title,
  subtitle,
  insets,
  children,
}: {
  title: string;
  subtitle: string;
  insets: { top: number; bottom: number };
  children: React.ReactNode;
}) => (
  <View className="flex-1 bg-gray-50 dark:bg-black">
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          padding: 16,
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 32,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          className="mb-3 flex-row items-center gap-1.5 self-start rounded-full bg-white px-3 py-2 active:opacity-70 dark:bg-neutral-900"
          accessibilityRole="button"
          accessibilityLabel="Leave the kiosk"
        >
          <Feather name="chevron-left" size={16} color="#374151" />
          <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            Back
          </Text>
        </Pressable>

        <View className="mb-4 items-center rounded-2xl bg-[#1D3FCF] px-5 py-7">
          <View className="mb-3 h-12 w-12 items-center justify-center rounded-xl bg-white/15">
            <Feather name="file-text" size={22} color="#FFFFFF" />
          </View>
          <Text className="text-center text-lg font-bold text-white">
            {title}
          </Text>
          <Text className="mt-1 text-center text-sm text-white/80">
            {subtitle}
          </Text>
        </View>

        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  </View>
);

/** White card with a titled header, matching the web's panels. */
const Panel = ({
  title,
  subtitle,
  right,
  children,
}: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <View className="mb-4 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
    {title ? (
      <View className="flex-row items-center gap-2 border-b border-gray-100 px-4 py-3.5 dark:border-neutral-800">
        <View className="flex-1">
          <Text className="text-base font-bold text-gray-900 dark:text-white">
            {title}
          </Text>
          {subtitle ? (
            <Text className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
    ) : null}
    <View className="p-4">{children}</View>
  </View>
);

/** Square checkbox + tappable label, as on the web consent rows. */
const CheckRow = ({
  checked,
  onToggle,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) => (
  <Pressable
    onPress={onToggle}
    className="flex-row items-start gap-3 py-2 active:opacity-70"
    accessibilityRole="checkbox"
    accessibilityState={{ checked }}
  >
    <Feather
      name={checked ? "check-square" : "square"}
      size={20}
      color={checked ? PRIMARY : "#9CA3AF"}
      style={{ marginTop: 1 }}
    />
    <Text className="flex-1 text-sm leading-5 text-gray-700 dark:text-gray-200">
      {children}
    </Text>
  </Pressable>
);

/**
 * The waiver kiosk, run inside the app.
 *
 * Previously this opened the web kiosk in a browser. It now addresses the same
 * public endpoints directly — `GET /waivers/access/{token}` for the template
 * and prefill, `POST …/submit` to sign — so the customer never leaves the app
 * and staff never hand over a browser session. Nothing about the contract
 * changed; only who renders the form.
 */
const WaiverKiosk = () => {
  const insets = useSafeAreaInsets();
  /**
   * Two ways in, matching the two the Launch Kiosk sheet offers:
   *  - `token`      — a session bound to a booking/purchase, with prefill;
   *  - `templateId` — a generic walk-in against a template, no prefill.
   * `locationId` only applies to the walk-in case, deciding whose venue details
   * appear in the body and which location the waiver is filed against.
   */
  const {
    token,
    templateId: templateIdParam,
    locationId: locationIdParam,
    preview: previewParam,
  } = useLocalSearchParams<{
    token?: string;
    templateId?: string;
    locationId?: string;
    preview?: string;
  }>();

  const templateId = templateIdParam ? Number(templateIdParam) : null;
  const locationId = locationIdParam ? Number(locationIdParam) : null;
  /** A draft template: read-only, served by the staff preview endpoint. */
  const isPreview = previewParam === "1";
  const status = useStatusModal();

  const [form, setForm] = useState<KioskForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Signer
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dobYear, setDobYear] = useState("");
  const [dobMonth, setDobMonth] = useState("");
  const [dobDay, setDobDay] = useState("");

  const [minors, setMinors] = useState<DraftMinor[]>([]);
  const [minorKey, setMinorKey] = useState(1);

  const [phase, setPhase] = useState<"start" | "lookup" | "form">("form");
  const [profile, setProfile] = useState<ReturningProfile | null>(null);
  const [selectedDependentIds, setSelectedDependentIds] = useState<number[]>(
    [],
  );

  /** The ad the submission came back with, held until the guest dismisses it. */
  const [ad, setAd] = useState<KioskAd | null>(null);
  const [adWaiverId, setAdWaiverId] = useState<number | null>(null);

  // Sign & agree
  const [typedName, setTypedName] = useState("");
  /** Optional drawn signature as an SVG data URI; null when the pad is empty. */
  const [signature, setSignature] = useState<string | null>(null);
  const [marketingConsent, setMarketingConsent] = useState(true);
  const [photoConsent, setPhotoConsent] = useState(true);
  const [electronicConsent, setElectronicConsent] = useState(false);
  const [agreed, setAgreed] = useState(false);

  // How long the body was on screen — the API records it as read_seconds.
  const [openedAt] = useState(() => Date.now());

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!token && templateId == null) {
        setLoadError("This kiosk was opened without a template or session.");
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const data = token
          ? await fetchKioskForm(token, signal)
          : isPreview
            ? await fetchTemplateKioskPreview(
                getToken() ?? "",
                templateId!,
                signal,
              )
            : await fetchTemplateKioskForm(templateId!, { locationId, signal });
        if (signal?.aborted) return;
        setForm(data);
        setLoadError(null);

        // The New/Returning choice only exists where the company has turned the
        // flow on, and only for a walk-in: a session-addressed kiosk was opened
        // for a known booking, so there is nobody to look up.
        setPhase(
          data.settings.returningEnabled && !token && !isPreview
            ? "start"
            : "form",
        );

        // Seed whatever the booking already told us about the signer. A
        // walk-in has no prefill, so this leaves the form empty.
        const p = data.prefill as Record<string, string | undefined>;
        setFirstName((v) => v || p.adult_first_name || p.first_name || "");
        setLastName((v) => v || p.adult_last_name || p.last_name || "");
        setEmail((v) => v || p.adult_email || p.email || "");
        setPhone((v) => v || p.adult_phone || p.phone || "");
      } catch (e) {
        if (signal?.aborted) return;
        setLoadError(
          e instanceof Error ? e.message : "Could not load this waiver.",
        );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [token, templateId, locationId, isPreview],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const bullets = useMemo(
    () =>
      (form?.highlightPoints ?? "")
        .split(/\r?\n/)
        .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
        .filter(Boolean),
    [form],
  );

  const addMinor = () => {
    if (!form) return;
    // Saved dependents already joining today count against the same cap the
    // backend applies to the merged list.
    if (
      minorCapReached(
        form.maxMinors,
        selectedDependentIds.length,
        minors.length,
      )
    ) {
      status.info(
        "Minor limit reached",
        `This waiver covers up to ${form.maxMinors} children.`,
      );
      return;
    }
    setMinors((prev) => [
      ...prev,
      {
        key: minorKey,
        firstName: "",
        lastName: "",
        year: "",
        month: "",
        day: "",
        relationship: "",
      },
    ]);
    setMinorKey((k) => k + 1);
  };

  const patchMinor = (key: number, patch: Partial<DraftMinor>) =>
    setMinors((prev) =>
      prev.map((m) => (m.key === key ? { ...m, ...patch } : m)),
    );

  /** The first thing wrong with the form, in reading order, or null. */
  const firstProblem = (): string | null => {
    if (!firstName.trim()) return "Enter the signer's first name.";
    if (!lastName.trim()) return "Enter the signer's last name.";
    if (!email.trim()) return "Enter an email address.";
    if (!phone.trim()) return "Enter a phone number.";
    if (!toIsoDate(dobYear, dobMonth, dobDay))
      return "Enter the signer's full date of birth.";
    for (const m of minors) {
      if (!m.firstName.trim() || !m.lastName.trim())
        return "Every child needs a first and last name.";
      if (!toIsoDate(m.year, m.month, m.day))
        return "Every child needs a full date of birth.";
      if (!m.relationship)
        return "Choose how each child is related to the signer.";
    }
    if (!typedName.trim()) return "Type the signer's full legal name.";
    if (form?.electronicConsentEnabled && !electronicConsent)
      return "The electronic signature consent must be accepted.";
    if (!agreed) return "The waiver terms must be accepted.";
    return null;
  };

  const handleSubmit = async () => {
    if (!form || submitting) return;
    if (!token && templateId == null) return;
    if (isPreview) {
      status.info(
        "Preview only",
        "This template is not active yet, so it cannot be signed. Activate it to take waivers.",
      );
      return;
    }
    const problem = firstProblem();
    if (problem) {
      status.error("Check the form", problem);
      return;
    }

    setSubmitting(true);
    try {
      const submission = {
        adult_first_name: firstName.trim(),
        adult_last_name: lastName.trim(),
        adult_email: email.trim(),
        adult_phone: phone.trim(),
        adult_dob: toIsoDate(dobYear, dobMonth, dobDay),
        typed_legal_name: typedName.trim(),
        signature_image: signature,
        agreement_accepted: true,
        electronic_consent_accepted: form.electronicConsentEnabled
          ? electronicConsent
          : undefined,
        photo_video_consent: form.photoVideoReleaseEnabled
          ? photoConsent
          : undefined,
        marketing_consent: form.marketingConsentEnabled
          ? marketingConsent
          : undefined,
        minors: minors.map<KioskMinorInput>((m) => ({
          first_name: m.firstName.trim(),
          last_name: m.lastName.trim(),
          date_of_birth: toIsoDate(m.year, m.month, m.day),
          relationship: m.relationship,
        })),
        read_seconds: Math.max(0, Math.round((Date.now() - openedAt) / 1000)),
        // Returning customers: the server re-reads the signer from the saved
        // record and merges these dependents with any new ones in `minors`.
        // The adult_* fields above still travel because validation requires
        // them — they are simply overwritten server-side.
        ...(profile
          ? {
              waiver_profile_id: profile.id,
              selected_dependent_ids: selectedDependentIds,
            }
          : {}),
      };

      // A session fills the waiver it was created for; a walk-in creates a
      // fresh one against the template.
      const result = token
        ? await submitKioskWaiver(token, submission, { kiosk: true })
        : await submitTemplateKioskWaiver(templateId!, submission, {
            locationId,
          });
      markWaiversStale();

      // An ad takes over the confirmation; without one the kiosk keeps its
      // original success modal exactly as before.
      if (result.ad) {
        setAd(result.ad);
        setAdWaiverId(result.id);
        return;
      }
      status.show({
        variant: "success",
        title: "Waiver Signed",
        message: "Thank you! The waiver has been recorded.",
        confirmLabel: "Done",
        onConfirm: () => router.back(),
      });
    } catch (e) {
      status.error(
        "Could not submit",
        e instanceof Error
          ? e.message
          : "Please check the details and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  /* --- states ----------------------------------------------------------- */

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 dark:bg-black">
        <ActivityIndicator color={PRIMARY} />
      </View>
    );
  }

  if (loadError || !form) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 px-8 dark:bg-black">
        <Feather name="alert-circle" size={40} color="#EF4444" />
        <Text className="mt-3 text-center text-sm text-gray-600 dark:text-gray-300">
          {loadError ?? "Could not load this waiver."}
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-4 rounded-xl bg-[#0644C7] px-5 py-2.5"
          accessibilityRole="button"
        >
          <Text className="text-sm font-semibold text-white">Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (form.alreadyCompleted) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 px-8 dark:bg-black">
        <Feather name="check-circle" size={40} color="#059669" />
        <Text className="mt-3 text-lg font-bold text-gray-900 dark:text-white">
          Already signed
        </Text>
        <Text className="mt-1 text-center text-sm text-gray-600 dark:text-gray-300">
          This waiver has already been completed for the booking date.
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-4 rounded-xl bg-[#0644C7] px-5 py-2.5"
          accessibilityRole="button"
        >
          <Text className="text-sm font-semibold text-white">Done</Text>
        </Pressable>
      </View>
    );
  }

  /* --- returning-customer phases ---------------------------------------- */

  if (phase === "start") {
    return (
      <KioskShell
        title={form.title}
        subtitle="Welcome! Choose an option to begin"
        insets={insets}
      >
        <View className="mb-4 gap-3">
          <Pressable
            onPress={() => setPhase("form")}
            className="rounded-xl bg-[#1D3FCF] py-5 active:opacity-90"
            accessibilityRole="button"
          >
            <Text className="text-center text-lg font-semibold text-white">
              New Customer
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setPhase("lookup")}
            className="rounded-xl border-2 border-blue-200 bg-white py-5 active:opacity-80 dark:border-blue-900/50 dark:bg-neutral-900"
            accessibilityRole="button"
          >
            <Text className="text-center text-lg font-semibold text-[#0644C7] dark:text-blue-300">
              Returning Customer
            </Text>
          </Pressable>
        </View>
      </KioskShell>
    );
  }

  if (phase === "lookup") {
    return (
      <KioskShell
        title={form.title}
        subtitle={
          profile
            ? "Please review your saved information"
            : "Returning customer"
        }
        insets={insets}
      >
        <KioskReturningPanel
          templateId={templateId!}
          profile={profile}
          maxMinors={form.maxMinors}
          dependentsEnabled={form.minorSectionEnabled && form.maxMinors > 0}
          onFound={setProfile}
          onContinue={({ profile: found, selectedDependentIds: ids }) => {
            // The signer's saved details fill the (read-only) form fields;
            // validation still requires them and the server rewrites them from
            // the same record on submit.
            setFirstName(found.firstName);
            setLastName(found.lastName);
            setEmail(found.email ?? "");
            setPhone(found.phone ?? "");
            const [y, m, d] = (found.dateOfBirth ?? "").split("-");
            setDobYear(y ?? "");
            setDobMonth(m ?? "");
            setDobDay(d ?? "");
            setSelectedDependentIds(ids);
            setPhase("form");
          }}
          onNewCustomer={() => {
            setProfile(null);
            setSelectedDependentIds([]);
            setPhase("form");
          }}
          onCancel={() => {
            setProfile(null);
            setSelectedDependentIds([]);
            setPhase("start");
          }}
        />
      </KioskShell>
    );
  }

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            padding: 16,
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 32,
          }}
        >
          {/* Blue banner — the web's header block. */}
          {/* Staff need a way out — a customer mid-signature does not, so the
              control is small and sits above the banner rather than in it. */}
          <Pressable
            onPress={() => router.back()}
            className="mb-3 flex-row items-center gap-1.5 self-start rounded-full bg-white px-3 py-2 active:opacity-70 dark:bg-neutral-900"
            accessibilityRole="button"
            accessibilityLabel="Leave the kiosk"
          >
            <Feather name="chevron-left" size={16} color="#374151" />
            <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Back
            </Text>
          </Pressable>

          <View className="mb-4 items-center rounded-2xl bg-[#1D3FCF] px-5 py-7">
            <View className="mb-3 h-12 w-12 items-center justify-center rounded-xl bg-white/15">
              <Feather name="file-text" size={22} color="#FFFFFF" />
            </View>
            <Text className="text-center text-lg font-bold text-white">
              {form.title}
            </Text>
            <Text className="mt-1 text-center text-sm text-white/80">
              Please complete the waiver below to continue
            </Text>
          </View>

          {bullets.length > 0 && (
            <View className="mb-4 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 dark:border-blue-900/40 dark:bg-blue-900/20">
              <Text className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200">
                Please note
              </Text>
              {bullets.map((b, i) => (
                <View key={i} className="mb-1.5 flex-row gap-2">
                  <Text className="text-sm text-[#2563EB]">•</Text>
                  <Text className="flex-1 text-sm leading-5 text-[#2563EB] dark:text-blue-300">
                    {b}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* A returning guest signs under the record the server will re-read
              anyway, so their details are shown rather than offered for edit. */}
          {profile && (
            <Panel title="Your Information">
              <KioskSavedSignerFields profile={profile} />
            </Panel>
          )}

          {!profile && (
            <Panel title="Your Information">
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Label required>First Name</Label>
                  <InputField
                    label=""
                    value={firstName}
                    onChangeText={setFirstName}
                    autoCapitalize="words"
                    containerClassName="mb-3"
                  />
                </View>
                <View className="flex-1">
                  <Label required>Last Name</Label>
                  <InputField
                    label=""
                    value={lastName}
                    onChangeText={setLastName}
                    autoCapitalize="words"
                    containerClassName="mb-3"
                  />
                </View>
              </View>

              <Label required>Email</Label>
              <InputField
                label=""
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                containerClassName="mb-3"
              />

              <Label required>Phone</Label>
              <InputField
                label=""
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                containerClassName="mb-3"
              />

              <Label required>Date of Birth</Label>
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <TextInput
                    value={dobMonth}
                    onChangeText={(t) =>
                      setDobMonth(t.replace(/\D/g, "").slice(0, 2))
                    }
                    placeholder="Month"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="number-pad"
                    className="rounded-lg border border-gray-200 px-3 py-3 text-sm text-gray-900 dark:border-neutral-700 dark:text-white"
                  />
                </View>
                <View className="flex-1">
                  <TextInput
                    value={dobDay}
                    onChangeText={(t) =>
                      setDobDay(t.replace(/\D/g, "").slice(0, 2))
                    }
                    placeholder="Day"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="number-pad"
                    className="rounded-lg border border-gray-200 px-3 py-3 text-sm text-gray-900 dark:border-neutral-700 dark:text-white"
                  />
                </View>
                <View className="flex-1">
                  <TextInput
                    value={dobYear}
                    onChangeText={(t) =>
                      setDobYear(t.replace(/\D/g, "").slice(0, 4))
                    }
                    placeholder="Year"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="number-pad"
                    className="rounded-lg border border-gray-200 px-3 py-3 text-sm text-gray-900 dark:border-neutral-700 dark:text-white"
                  />
                </View>
              </View>
              <Text className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                The signer must be 18 or over.
              </Text>
            </Panel>
          )}

          {form.minorSectionEnabled && (
            <Panel
              title="Minors"
              subtitle={`Add any children you are signing for (up to ${form.maxMinors}).`}
              right={
                <Pressable
                  onPress={addMinor}
                  className="rounded-lg bg-blue-50 px-3 py-2 active:opacity-80 dark:bg-blue-900/30"
                  accessibilityRole="button"
                >
                  <Text className="text-xs font-semibold text-[#0644C7] dark:text-blue-300">
                    + Add Minor
                  </Text>
                </Pressable>
              }
            >
              {minors.length === 0 ? (
                <Text className="py-4 text-center text-sm text-gray-400 dark:text-gray-500">
                  No minors added.
                </Text>
              ) : (
                minors.map((m, idx) => (
                  <View
                    key={m.key}
                    className="mb-3 rounded-xl border border-gray-200 p-3 dark:border-neutral-700"
                  >
                    <View className="mb-2 flex-row items-center justify-between">
                      <Text className="text-sm font-bold text-gray-900 dark:text-white">
                        Child {idx + 1}
                      </Text>
                      <Pressable
                        onPress={() =>
                          setMinors((prev) =>
                            prev.filter((x) => x.key !== m.key),
                          )
                        }
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove child ${idx + 1}`}
                      >
                        <Feather name="trash-2" size={16} color="#dc2626" />
                      </Pressable>
                    </View>

                    <View className="flex-row gap-2">
                      <View className="flex-1">
                        <TextInput
                          value={m.firstName}
                          onChangeText={(t) =>
                            patchMinor(m.key, { firstName: t })
                          }
                          placeholder="First name"
                          placeholderTextColor="#9CA3AF"
                          className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 dark:border-neutral-700 dark:text-white"
                        />
                      </View>
                      <View className="flex-1">
                        <TextInput
                          value={m.lastName}
                          onChangeText={(t) =>
                            patchMinor(m.key, { lastName: t })
                          }
                          placeholder="Last name"
                          placeholderTextColor="#9CA3AF"
                          className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 dark:border-neutral-700 dark:text-white"
                        />
                      </View>
                    </View>

                    <View className="mt-2 flex-row gap-2">
                      <View className="flex-1">
                        <TextInput
                          value={m.month}
                          onChangeText={(t) =>
                            patchMinor(m.key, {
                              month: t.replace(/\D/g, "").slice(0, 2),
                            })
                          }
                          placeholder="MM"
                          placeholderTextColor="#9CA3AF"
                          keyboardType="number-pad"
                          className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 dark:border-neutral-700 dark:text-white"
                        />
                      </View>
                      <View className="flex-1">
                        <TextInput
                          value={m.day}
                          onChangeText={(t) =>
                            patchMinor(m.key, {
                              day: t.replace(/\D/g, "").slice(0, 2),
                            })
                          }
                          placeholder="DD"
                          placeholderTextColor="#9CA3AF"
                          keyboardType="number-pad"
                          className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 dark:border-neutral-700 dark:text-white"
                        />
                      </View>
                      <View className="flex-1">
                        <TextInput
                          value={m.year}
                          onChangeText={(t) =>
                            patchMinor(m.key, {
                              year: t.replace(/\D/g, "").slice(0, 4),
                            })
                          }
                          placeholder="YYYY"
                          placeholderTextColor="#9CA3AF"
                          keyboardType="number-pad"
                          className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 dark:border-neutral-700 dark:text-white"
                        />
                      </View>
                    </View>

                    <Text className="mb-1.5 mt-3 text-xs font-medium text-gray-600 dark:text-gray-300">
                      Relationship to signer
                    </Text>
                    <View className="flex-row flex-wrap">
                      {RELATIONSHIPS.map((r) => {
                        const on = m.relationship === r;
                        return (
                          <Pressable
                            key={r}
                            onPress={() =>
                              patchMinor(m.key, { relationship: r })
                            }
                            className={`mb-2 mr-2 rounded-lg border px-3 py-1.5 active:opacity-80 ${
                              on
                                ? "border-[#0644C7] bg-[#0644C7]"
                                : "border-gray-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
                            }`}
                            accessibilityRole="button"
                            accessibilityState={{ selected: on }}
                          >
                            <Text
                              className={`text-xs ${
                                on
                                  ? "font-semibold text-white"
                                  : "text-gray-700 dark:text-gray-200"
                              }`}
                            >
                              {r}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ))
              )}
            </Panel>
          )}

          {/* The legal body, scrollable in place as on the web. */}
          <Panel
            title={form.title}
            right={
              form.version != null ? (
                <Text className="text-xs font-semibold text-[#0644C7] dark:text-blue-300">
                  v{form.version}
                </Text>
              ) : undefined
            }
          >
            <ScrollView
              nestedScrollEnabled
              style={{ maxHeight: 260 }}
              className="rounded-lg"
              showsVerticalScrollIndicator
            >
              <Text className="text-sm leading-6 text-gray-700 dark:text-gray-200">
                {form.body}
              </Text>
            </ScrollView>
          </Panel>

          <Panel title="Sign & Agree">
            <Label required>Type your full legal name</Label>
            <InputField
              label=""
              value={typedName}
              onChangeText={setTypedName}
              placeholder="Full legal name"
              autoCapitalize="words"
              containerClassName="mb-1"
            />
            <Text className="mb-4 text-xs text-gray-500 dark:text-gray-400">
              Typing your name serves as your electronic signature for this
              agreement.
            </Text>

            <Label>
              Signature{" "}
              <Text className="font-normal text-gray-500">(optional)</Text>
            </Label>
            <View className="mb-4">
              <SignaturePad onChange={setSignature} />
            </View>

            {form.marketingConsentEnabled && (
              <View className="mb-3 rounded-xl border border-gray-200 p-3 dark:border-neutral-700">
                <Text className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                  Stay in touch
                </Text>
                {!!form.marketingHelperText && (
                  <Text className="mb-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                    {form.marketingHelperText}
                  </Text>
                )}
                <CheckRow
                  checked={marketingConsent}
                  onToggle={() => setMarketingConsent((v) => !v)}
                >
                  {form.marketingConsentText || "Yes, keep me updated."}
                </CheckRow>
              </View>
            )}

            {form.photoVideoReleaseEnabled && (
              <View className="mb-1 border-t border-gray-100 pt-2 dark:border-neutral-800">
                <CheckRow
                  checked={photoConsent}
                  onToggle={() => setPhotoConsent((v) => !v)}
                >
                  {form.photoVideoReleaseText ||
                    "I agree to the photo and video release."}
                </CheckRow>
              </View>
            )}

            {form.electronicConsentEnabled && (
              <View className="border-t border-gray-100 pt-2 dark:border-neutral-800">
                <CheckRow
                  checked={electronicConsent}
                  onToggle={() => setElectronicConsent((v) => !v)}
                >
                  I agree that my electronic signature is the legal equivalent
                  of my handwritten signature. *
                </CheckRow>
              </View>
            )}

            <View className="border-t border-gray-100 pt-2 dark:border-neutral-800">
              <CheckRow checked={agreed} onToggle={() => setAgreed((v) => !v)}>
                I have read, understand, and agree to the terms of this waiver.
                *
              </CheckRow>
            </View>
          </Panel>

          <Pressable
            onPress={handleSubmit}
            disabled={submitting}
            className="mb-3 flex-row items-center justify-center gap-2 rounded-xl bg-[#1D3FCF] py-4 active:opacity-90"
            accessibilityRole="button"
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text className="text-base font-bold text-white">
                Sign &amp; Submit Waiver
              </Text>
            )}
          </Pressable>

          <Text className="text-center text-xs text-gray-400 dark:text-gray-500">
            Powered by ZapZone
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* The post-waiver ad beat. Only mounts when the submission came back
          with one; dismissing it leaves the kiosk exactly where the plain
          success modal would have. */}
      <KioskAdModal
        visible={!!ad}
        ad={ad}
        waiverId={adWaiverId}
        signerFirstName={firstName.trim() || null}
        closeLabel="Done"
        closingText="Closing"
        onClose={() => {
          setAd(null);
          setAdWaiverId(null);
          router.back();
        }}
      />

      <StatusModal {...status.props} />
    </View>
  );
};

export default WaiverKiosk;
