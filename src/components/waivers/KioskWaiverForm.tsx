import { Feather } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import type { useStatusModal } from "../../lib/hooks/useStatusModal";
import {
  formatPhoneForDisplay,
  isCompletePhone,
  localPhoneDigits,
} from "../../lib/phone";
import {
  minorCapReached,
  type KioskForm,
  type KioskMinorInput,
  type KioskSubmission,
  type ReturningProfile,
} from "../../services/waiversService";
import { InputField } from "../ui/InputField";
import { KioskSavedSignerFields } from "../ui/KioskReturningPanel";
import { SignaturePad } from "../ui/SignaturePad";

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

/** The signer details a form starts with (booking prefill, or a saved profile). */
export type KioskSigner = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

/** Whatever the backend's `prefill` already knows about the signer. */
export function signerFromPrefill(prefill: Record<string, unknown>): KioskSigner {
  const p = prefill as Record<string, string | undefined>;
  return {
    firstName: p.adult_first_name || p.first_name || "",
    lastName: p.adult_last_name || p.last_name || "",
    email: p.adult_email || p.email || "",
    phone: p.adult_phone || p.phone || "",
  };
}

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

/**
 * Month/Day/Year entry for the signer's date of birth — shared by the
 * new-customer path and the returning-customer confirmation. Deliberately
 * never receives a value derived from a looked-up record: a returning
 * customer always starts these blank and types their own DOB.
 */
const DobFields = ({
  month,
  day,
  year,
  onMonth,
  onDay,
  onYear,
}: {
  month: string;
  day: string;
  year: string;
  onMonth: (v: string) => void;
  onDay: (v: string) => void;
  onYear: (v: string) => void;
}) => (
  <View className="flex-row gap-2">
    <View className="flex-1">
      <TextInput
        value={month}
        onChangeText={(t) => onMonth(t.replace(/\D/g, "").slice(0, 2))}
        placeholder="Month"
        placeholderTextColor="#9CA3AF"
        keyboardType="number-pad"
        className="rounded-lg border border-gray-200 px-3 py-3 text-sm text-gray-900 dark:border-neutral-700 dark:text-white"
      />
    </View>
    <View className="flex-1">
      <TextInput
        value={day}
        onChangeText={(t) => onDay(t.replace(/\D/g, "").slice(0, 2))}
        placeholder="Day"
        placeholderTextColor="#9CA3AF"
        keyboardType="number-pad"
        className="rounded-lg border border-gray-200 px-3 py-3 text-sm text-gray-900 dark:border-neutral-700 dark:text-white"
      />
    </View>
    <View className="flex-1">
      <TextInput
        value={year}
        onChangeText={(t) => onYear(t.replace(/\D/g, "").slice(0, 4))}
        placeholder="Year"
        placeholderTextColor="#9CA3AF"
        keyboardType="number-pad"
        className="rounded-lg border border-gray-200 px-3 py-3 text-sm text-gray-900 dark:border-neutral-700 dark:text-white"
      />
    </View>
  </View>
);

/** White card with a titled header, matching the web's panels. */
export const Panel = ({
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

type Props = {
  form: KioskForm;
  /** The host screen's status modal — form problems are reported through it. */
  status: ReturnType<typeof useStatusModal>;
  submitting: boolean;
  /** Called with a validated submission; the host sends it wherever it goes. */
  onSubmit: (submission: KioskSubmission) => void;
  initialSigner?: KioskSigner;
  /** A returning guest: their saved details are shown instead of edited. */
  profile?: ReturningProfile | null;
  /** Saved dependents joining — they count against the minor cap. */
  selectedDependentIds?: number[];
  /** When the guest first saw the waiver; sent back as `read_seconds`. */
  openedAt?: number;
  /** Refuses to submit with this message (e.g. a draft template preview). */
  submitBlocked?: { title: string; message: string } | null;
};

/**
 * The native waiver form the in-app kiosks render: signer, minors, the legal
 * body and Sign & Agree. It validates in reading order and hands a complete
 * `KioskSubmission` to its host, which knows the endpoint — the waiver kiosk
 * (session or walk-in) and the escape-room check-in both use it. Remount it
 * (change its key) to clear it for the next guest.
 */
export function KioskWaiverForm({
  form,
  status,
  submitting,
  onSubmit,
  initialSigner,
  profile = null,
  selectedDependentIds = [],
  openedAt: openedAtProp,
  submitBlocked = null,
}: Props) {
  // Signer
  const [firstName, setFirstName] = useState(initialSigner?.firstName ?? "");
  const [lastName, setLastName] = useState(initialSigner?.lastName ?? "");
  const [email, setEmail] = useState(initialSigner?.email ?? "");
  const [phone, setPhone] = useState(initialSigner?.phone ?? "");
  const [dobYear, setDobYear] = useState("");
  const [dobMonth, setDobMonth] = useState("");
  const [dobDay, setDobDay] = useState("");

  const [minors, setMinors] = useState<DraftMinor[]>([]);
  const [minorKey, setMinorKey] = useState(1);

  // Sign & agree
  const [typedName, setTypedName] = useState("");
  /** Optional drawn signature as an SVG data URI; null when the pad is empty. */
  const [signature, setSignature] = useState<string | null>(null);
  const [marketingConsent, setMarketingConsent] = useState(true);
  const [photoConsent, setPhotoConsent] = useState(true);
  const [electronicConsent, setElectronicConsent] = useState(false);
  const [agreed, setAgreed] = useState(false);

  // How long the body was on screen — the API records it as read_seconds.
  const [mountedAt] = useState(() => Date.now());
  const openedAt = openedAtProp ?? mountedAt;

  const bullets = useMemo(
    () =>
      (form.highlightPoints ?? "")
        .split(/\r?\n/)
        .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
        .filter(Boolean),
    [form],
  );

  const addMinor = () => {
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
    // A returning guest's phone is the masked one on file, which they cannot edit.
    if (!profile && !isCompletePhone(phone)) return "Enter a 10-digit phone number";
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
    if (form.electronicConsentEnabled && !electronicConsent)
      return "The electronic signature consent must be accepted.";
    if (!agreed) return "The waiver terms must be accepted.";
    return null;
  };

  const handleSubmit = () => {
    if (submitting) return;
    if (submitBlocked) {
      status.info(submitBlocked.title, submitBlocked.message);
      return;
    }
    const problem = firstProblem();
    if (problem) {
      status.error("Check the form", problem);
      return;
    }

    onSubmit({
      adult_first_name: firstName.trim(),
      adult_last_name: lastName.trim(),
      adult_email: email.trim(),
      adult_phone: profile
        ? phone.trim()
        : localPhoneDigits(phone) || phone.trim(),
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
    });
  };

  return (
    <>
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
          anyway, so their details are shown rather than offered for edit —
          except DOB, which is never disclosed from the saved record and
          must be confirmed by typing it in below. */}
      {profile && (
        <Panel title="Your Information">
          <KioskSavedSignerFields profile={profile} dobConfirmationRequired />
          <Label required>Confirm Your Date of Birth</Label>
          <DobFields
            month={dobMonth}
            day={dobDay}
            year={dobYear}
            onMonth={setDobMonth}
            onDay={setDobDay}
            onYear={setDobYear}
          />
          <Text className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            The signer must be 18 or over.
          </Text>
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
            onBlur={() => setPhone((current) => formatPhoneForDisplay(current) || current)}
            placeholder="(555) 123-4567"
            keyboardType="phone-pad"
            containerClassName="mb-3"
          />

          <Label required>Date of Birth</Label>
          <DobFields
            month={dobMonth}
            day={dobDay}
            year={dobYear}
            onMonth={setDobMonth}
            onDay={setDobDay}
            onYear={setDobYear}
          />
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
    </>
  );
}
