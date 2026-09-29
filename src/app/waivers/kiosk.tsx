import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
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

import { KioskAdModal } from "../../components/ui/KioskAdModal";
import { WaiverSuccessModal } from "../../components/ui/WaiverSuccessModal";
import { KioskReturningPanel } from "../../components/ui/KioskReturningPanel";
import { StaffReturnControl } from "../../components/ui/StaffReturnControl";
import { StatusModal } from "../../components/ui/StatusModal";
import {
  KioskWaiverForm,
  signerFromPrefill,
  type KioskSigner,
} from "../../components/waivers/KioskWaiverForm";
import { useStatusModal } from "../../lib/hooks/useStatusModal";
import { markWaiversStale } from "../../lib/hooks/useWaivers";
import { getToken } from "../../lib/session";
import {
  fetchKioskForm,
  fetchTemplateKioskForm,
  fetchTemplateKioskPreview,
  submitKioskWaiver,
  submitTemplateKioskWaiver,
  type KioskAd,
  type KioskForm,
  type KioskSubmission,
  type ReturningProfile,
} from "../../services/waiversService";

const PRIMARY = "#0644C7";

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
        <StaffReturnControl />

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

/**
 * The waiver kiosk, run inside the app.
 *
 * Previously this opened the web kiosk in a browser. It now addresses the same
 * public endpoints directly — `GET /waivers/access/{token}` for the template
 * and prefill, `POST …/submit` to sign — so the customer never leaves the app
 * and staff never hand over a browser session. Nothing about the contract
 * changed; only who renders the form. The form itself is `KioskWaiverForm`,
 * shared with the escape-room check-in.
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

  /** What the booking already told us about the signer (empty for a walk-in). */
  const [prefillSigner, setPrefillSigner] = useState<KioskSigner | null>(null);
  /** A returning guest's saved details, which fill the (read-only) fields. */
  const [profileSigner, setProfileSigner] = useState<KioskSigner | null>(null);
  /** The name the ad greets, from the submission that produced it. */
  const [signerFirstName, setSignerFirstName] = useState("");

  const [phase, setPhase] = useState<"start" | "lookup" | "form">("form");
  const [profile, setProfile] = useState<ReturningProfile | null>(null);
  const [selectedDependentIds, setSelectedDependentIds] = useState<number[]>(
    [],
  );
  /** From the lookup response; held only for the active flow, never
   *  persisted, cleared on any reset. Sent back on a returning submission. */
  const [lookupToken, setLookupToken] = useState<string | null>(null);

  /** The ad the submission came back with, held until the guest dismisses it. */
  const [ad, setAd] = useState<KioskAd | null>(null);
  const [adWaiverId, setAdWaiverId] = useState<number | null>(null);
  /** The just-signed waiver's own code, shown as a take-home QR either way. */
  const [successReference, setSuccessReference] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

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
        setPrefillSigner(signerFromPrefill(data.prefill));
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

  const handleSubmit = async (signed: KioskSubmission) => {
    if (!form || submitting) return;
    if (!token && templateId == null) return;

    setSubmitting(true);
    setSignerFirstName(signed.adult_first_name);
    try {
      const submission: KioskSubmission = {
        ...signed,
        // Returning customers: the server re-reads the signer from the saved
        // record and merges these dependents with any new ones in `minors`.
        // The adult_* fields still travel because validation requires them —
        // they are simply overwritten server-side.
        ...(profile
          ? {
              waiver_profile_id: profile.id,
              selected_dependent_ids: selectedDependentIds,
              ...(lookupToken ? { lookup_token: lookupToken } : {}),
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
      // original success modal exactly as before. Either way, a take-home
      // check-in QR rides along when the server returned a reference.
      if (result.ad) {
        setAd(result.ad);
        setAdWaiverId(result.id);
        setSuccessReference(result.referenceNumber);
        return;
      }
      if (result.referenceNumber) {
        setSuccessReference(result.referenceNumber);
        setShowSuccess(true);
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
              New Guest
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setPhase("lookup")}
            className="rounded-xl border-2 border-blue-200 bg-white py-5 active:opacity-80 dark:border-blue-900/50 dark:bg-neutral-900"
            accessibilityRole="button"
          >
            <Text className="text-center text-lg font-semibold text-[#0644C7] dark:text-blue-300">
              Returning Guest
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
            : "Returning guest"
        }
        insets={insets}
      >
        <KioskReturningPanel
          templateId={templateId!}
          profile={profile}
          maxMinors={form.maxMinors}
          dependentsEnabled={form.minorSectionEnabled && form.maxMinors > 0}
          onFound={(found, token) => {
            setProfile(found);
            setLookupToken(token);
          }}
          onContinue={({ profile: found, selectedDependentIds: ids }) => {
            // The signer's saved details fill the (read-only) form fields.
            // DOB is deliberately left blank — it is never disclosed from the
            // looked-up record; the signer confirms it themselves below.
            setProfileSigner({
              firstName: found.firstName,
              lastName: found.lastName,
              email: found.email ?? "",
              phone: found.phone ?? "",
            });
            setSelectedDependentIds(ids);
            setPhase("form");
          }}
          onNewCustomer={() => {
            setProfile(null);
            setProfileSigner(null);
            setLookupToken(null);
            setSelectedDependentIds([]);
            setPhase("form");
          }}
          onCancel={() => {
            setProfile(null);
            setProfileSigner(null);
            setLookupToken(null);
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
              control is small, sits above the banner rather than in it, and
              only answers a deliberate hold. */}
          <StaffReturnControl />

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

          <KioskWaiverForm
            form={form}
            status={status}
            submitting={submitting}
            onSubmit={(signed) => void handleSubmit(signed)}
            initialSigner={(profile && profileSigner) || prefillSigner || undefined}
            profile={profile}
            selectedDependentIds={selectedDependentIds}
            openedAt={openedAt}
            submitBlocked={
              isPreview
                ? {
                    title: "Preview only",
                    message:
                      "This template is not active yet, so it cannot be signed. Activate it to take waivers.",
                  }
                : null
            }
          />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* The post-waiver ad beat. Only mounts when the submission came back
          with one; dismissing it leaves the kiosk exactly where the plain
          success modal would have. */}
      <KioskAdModal
        visible={!!ad}
        ad={ad}
        waiverId={adWaiverId}
        signerFirstName={signerFirstName.trim() || null}
        waiverReference={successReference}
        closeLabel="Done"
        closingText="Closing"
        onClose={() => {
          setAd(null);
          setAdWaiverId(null);
          setSuccessReference(null);
          router.back();
        }}
      />

      <WaiverSuccessModal
        visible={showSuccess}
        waiverReference={successReference}
        onClose={() => {
          setShowSuccess(false);
          setSuccessReference(null);
          router.back();
        }}
      />

      <StatusModal {...status.props} />
    </View>
  );
};

export default WaiverKiosk;
