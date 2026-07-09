import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { QrScannerView } from "../../components/checkin/QrScannerView";
import { SelectField } from "../../components/ui/FormControls";
import { getCurrentUser, getToken } from "../../lib/session";
import { fetchLocations, type LocationOption } from "../../services/locationsService";
import {
  checkInMembership,
  scanMembership,
  type CheckInResult,
  type ScanResult,
} from "../../services/membershipsService";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const PRIMARY = "#0644C7";

const MembershipCheckIn = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const headerIcon = scheme === "dark" ? "#fff" : "#111";

  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [locationId, setLocationId] = useState<number | null>(
    getCurrentUser()?.location_id ?? null,
  );

  const [scannerActive, setScannerActive] = useState(false);
  const [manualToken, setManualToken] = useState("");

  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [submitting, setSubmitting] = useState<CheckInResult | null>(null);
  const [recorded, setRecorded] = useState<CheckInResult | null>(null);

  // Load the check-in location options.
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetchLocations(token)
      .then((locs) => {
        setLocations(locs);
        setLocationId((prev) => prev ?? locs[0]?.id ?? null);
      })
      .catch(() => setLocations([]));
  }, []);

  const runScan = useCallback(
    async (raw: string) => {
      const value = raw.trim();
      if (!value) return;
      const token = getToken();
      if (!token) return;
      setScannerActive(false);
      setScanning(true);
      setScanError(null);
      setResult(null);
      setRecorded(null);
      try {
        setResult(await scanMembership(token, value, locationId ?? undefined));
      } catch (err) {
        setScanError(err instanceof Error ? err.message : "Scan failed");
      } finally {
        setScanning(false);
      }
    },
    [locationId],
  );

  const record = async (outcome: CheckInResult) => {
    const token = getToken();
    if (!token || !result) return;
    setSubmitting(outcome);
    try {
      await checkInMembership(token, result.membershipId, {
        result: outcome,
        locationId: locationId ?? undefined,
        overrideNote: outcome === "override" ? "Manual override by staff" : undefined,
      });
      setRecorded(outcome);
    } catch (err) {
      Alert.alert(
        "Check-in failed",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setSubmitting(null);
    }
  };

  const reset = () => {
    setResult(null);
    setScanError(null);
    setRecorded(null);
    setManualToken("");
  };

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
            Membership Check-In
          </Text>
          <View style={{ width: 36 }} />
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <View className="px-5 gap-4">
          {/* Intro */}
          <View
            className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mt-6"
            style={CARD_SHADOW}
          >
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Membership Check-In
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Scan a member QR code or paste a token to verify eligibility.
            </Text>
          </View>

          {/* Check-in location */}
          {locations.length > 0 && (
            <SelectField
              label="Check-in location"
              value={locationId}
              options={locations.map((l) => ({ label: l.name, value: l.id }))}
              onSelect={(v) => setLocationId(Number(v))}
            />
          )}

          {/* Scanner */}
          <View
            className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800"
            style={CARD_SHADOW}
          >
            <View className="flex-row items-center gap-2 mb-3">
              <Feather name="maximize" size={16} color={PRIMARY} />
              <Text className="text-base font-bold text-gray-900 dark:text-white">
                Scanner
              </Text>
            </View>

            {scannerActive ? (
              <QrScannerView active={!scanning} onScan={runScan} />
            ) : (
              <View className="aspect-square w-full items-center justify-center rounded-3xl border border-dashed border-gray-200 bg-gray-50 dark:border-neutral-700 dark:bg-neutral-800">
                <View className="w-14 h-14 rounded-2xl bg-[#0644C7]/10 items-center justify-center">
                  <Feather name="camera" size={26} color={PRIMARY} />
                </View>
                <Text className="text-sm text-gray-500 dark:text-gray-400 mt-3 text-center px-6">
                  Start the camera to scan a member QR code.
                </Text>
              </View>
            )}

            <Pressable
              onPress={() => setScannerActive((v) => !v)}
              className={`flex-row items-center justify-center gap-2 py-3.5 rounded-xl mt-3 ${
                scannerActive ? "bg-gray-200 dark:bg-neutral-800" : "bg-[#0644C7]"
              }`}
            >
              <Feather
                name={scannerActive ? "x" : "camera"}
                size={16}
                color={scannerActive ? "#374151" : "#FFFFFF"}
              />
              <Text
                className={`text-sm font-semibold ${
                  scannerActive ? "text-gray-700 dark:text-gray-200" : "text-white"
                }`}
              >
                {scannerActive ? "Stop Scanner" : "Start Camera Scanner"}
              </Text>
            </Pressable>

            {/* Manual token */}
            <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mt-4 mb-2">
              Manual Token
            </Text>
            <View className="flex-row gap-2">
              <TextInput
                value={manualToken}
                onChangeText={setManualToken}
                placeholder="mbr_..."
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={() => runScan(manualToken)}
                className="flex-1 bg-white dark:bg-neutral-900 rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-800 text-sm text-gray-900 dark:text-white"
              />
              <Pressable
                onPress={() => runScan(manualToken)}
                disabled={!manualToken.trim() || scanning}
                className={`items-center justify-center px-5 rounded-xl ${
                  !manualToken.trim() || scanning
                    ? "bg-gray-200 dark:bg-neutral-800"
                    : "bg-[#0644C7]"
                }`}
              >
                {scanning ? (
                  <ActivityIndicator size="small" color={PRIMARY} />
                ) : (
                  <Text
                    className={`text-sm font-semibold ${
                      !manualToken.trim() ? "text-gray-400" : "text-white"
                    }`}
                  >
                    Scan
                  </Text>
                )}
              </Pressable>
            </View>
          </View>

          {/* Result */}
          <ResultPanel
            scanning={scanning}
            error={scanError}
            result={result}
            recorded={recorded}
            submitting={submitting}
            onRecord={record}
            onReset={reset}
          />
        </View>
      </ScrollView>
    </View>
  );
};

/* ------------------------------------------------------------------ */
/* Result panel                                                        */
/* ------------------------------------------------------------------ */

function ResultPanel({
  scanning,
  error,
  result,
  recorded,
  submitting,
  onRecord,
  onReset,
}: {
  scanning: boolean;
  error: string | null;
  result: ScanResult | null;
  recorded: CheckInResult | null;
  submitting: CheckInResult | null;
  onRecord: (r: CheckInResult) => void;
  onReset: () => void;
}) {
  // Recorded confirmation banner.
  if (recorded) {
    const allowed = recorded === "allowed";
    return (
      <View
        className={`rounded-2xl p-6 items-center border ${
          allowed
            ? "bg-green-50 border-green-100 dark:bg-green-900/20 dark:border-green-900/40"
            : "bg-red-50 border-red-100 dark:bg-red-900/20 dark:border-red-900/40"
        }`}
      >
        <Feather
          name={allowed ? "check-circle" : "x-circle"}
          size={40}
          color={allowed ? "#16A34A" : "#DC2626"}
        />
        <Text
          className={`text-lg font-bold mt-3 ${
            allowed
              ? "text-green-700 dark:text-green-400"
              : "text-red-700 dark:text-red-400"
          }`}
        >
          {allowed
            ? "Entry recorded"
            : recorded === "override"
              ? "Override recorded"
              : "Entry denied"}
        </Text>
        {result && (
          <Text className="text-sm text-gray-600 dark:text-gray-300 mt-1">
            {result.memberName}
          </Text>
        )}
        <Pressable
          onPress={onReset}
          className="flex-row items-center gap-2 bg-[#0644C7] px-5 py-3 rounded-xl mt-5 active:opacity-90"
        >
          <Feather name="maximize" size={15} color="#FFFFFF" />
          <Text className="text-sm font-semibold text-white">New scan</Text>
        </Pressable>
      </View>
    );
  }

  if (scanning) {
    return (
      <View
        className="bg-white dark:bg-neutral-900 rounded-2xl p-10 items-center border border-gray-100 dark:border-neutral-800"
        style={CARD_SHADOW}
      >
        <ActivityIndicator size="large" color={PRIMARY} />
        <Text className="text-sm text-gray-500 dark:text-gray-400 mt-3">
          Looking up membership…
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="rounded-2xl p-6 items-center border bg-red-50 border-red-100 dark:bg-red-900/20 dark:border-red-900/40">
        <Feather name="alert-circle" size={36} color="#DC2626" />
        <Text className="text-base font-bold text-red-700 dark:text-red-400 mt-3">
          {error}
        </Text>
        <Text className="text-sm text-gray-600 dark:text-gray-300 mt-1 text-center">
          Check the token and try again.
        </Text>
      </View>
    );
  }

  if (!result) {
    return (
      <View
        className="bg-white dark:bg-neutral-900 rounded-2xl p-10 items-center border border-gray-100 dark:border-neutral-800"
        style={CARD_SHADOW}
      >
        <View className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-900/30 items-center justify-center">
          <Feather name="maximize" size={28} color={PRIMARY} />
        </View>
        <Text className="text-base font-bold text-gray-900 dark:text-white mt-4">
          Waiting for a scan
        </Text>
        <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1 text-center">
          Member details and an eligibility check appear here once a QR code is
          scanned or a token is submitted.
        </Text>
      </View>
    );
  }

  // Scanned member + eligibility.
  const eligible = result.eligible;
  return (
    <View
      className="bg-white dark:bg-neutral-900 rounded-2xl p-5 border border-gray-100 dark:border-neutral-800"
      style={CARD_SHADOW}
    >
      {/* Member */}
      <Text className="text-lg font-bold text-gray-900 dark:text-white">
        {result.memberName}
      </Text>
      {!!result.email && (
        <Text className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          {result.email}
        </Text>
      )}
      {!!result.holderName && result.holderName !== result.memberName && (
        <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Pass holder: {result.holderName}
        </Text>
      )}

      {/* Eligibility banner */}
      <View
        className={`flex-row items-center gap-2 rounded-xl px-3.5 py-3 mt-4 ${
          eligible ? "bg-green-50 dark:bg-green-900/20" : "bg-red-50 dark:bg-red-900/20"
        }`}
      >
        <Feather
          name={eligible ? "check-circle" : "x-circle"}
          size={18}
          color={eligible ? "#16A34A" : "#DC2626"}
        />
        <Text
          className={`text-sm font-semibold flex-1 ${
            eligible
              ? "text-green-700 dark:text-green-400"
              : "text-red-700 dark:text-red-400"
          }`}
        >
          {eligible ? "Eligible for entry" : result.reason || "Not eligible"}
        </Text>
      </View>

      {/* Details */}
      <View className="mt-4 gap-2">
        <DetailRow label="Plan" value={result.planName} />
        <DetailRow label="Status" value={result.status} />
        {result.homeLocationName && (
          <DetailRow label="Home location" value={result.homeLocationName} />
        )}
        <DetailRow
          label="Visits remaining"
          value={
            result.visitsRemaining == null
              ? "Unlimited"
              : String(result.visitsRemaining)
          }
        />
        <DetailRow label="Visits today" value={String(result.visitsToday)} />
      </View>

      {/* Passes */}
      {result.passes.length > 0 && (
        <View className="mt-4">
          <Text className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
            Passes
          </Text>
          {result.passes.map((p, i) => (
            <View
              key={`${p.benefitId}-${i}`}
              className="flex-row items-center justify-between py-1.5"
            >
              <Text className="text-sm text-gray-700 dark:text-gray-200">
                {p.label}
              </Text>
              <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                {p.remaining == null ? "—" : `${p.remaining} left`}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Photo required warning */}
      {result.photoRequired && (
        <View className="flex-row items-center gap-2 bg-amber-50 dark:bg-amber-900/20 rounded-xl px-3.5 py-2.5 mt-4">
          <Feather name="camera" size={15} color="#D97706" />
          <Text className="text-xs text-amber-700 dark:text-amber-400 flex-1">
            A member photo is required before this membership can be used.
          </Text>
        </View>
      )}

      {/* Actions */}
      <View className="flex-row gap-3 mt-5">
        <Pressable
          onPress={() => onRecord("denied")}
          disabled={submitting != null}
          className="flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl border border-red-200 dark:border-red-900/50"
        >
          {submitting === "denied" ? (
            <ActivityIndicator size="small" color="#DC2626" />
          ) : (
            <Feather name="x" size={16} color="#DC2626" />
          )}
          <Text className="text-sm font-semibold text-red-600 dark:text-red-400">
            Deny
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onRecord(eligible ? "allowed" : "override")}
          disabled={submitting != null}
          className={`flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl ${
            eligible ? "bg-[#0644C7]" : "bg-amber-500"
          }`}
        >
          {submitting === "allowed" || submitting === "override" ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Feather name="check" size={16} color="#FFFFFF" />
          )}
          <Text className="text-sm font-semibold text-white">
            {eligible ? "Allow entry" : "Override"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-sm text-gray-500 dark:text-gray-400">{label}</Text>
      <Text className="text-sm font-medium text-gray-900 dark:text-white capitalize">
        {value}
      </Text>
    </View>
  );
}

export default MembershipCheckIn;
