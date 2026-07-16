import { Feather } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  deleteWaiver,
  fetchWaiverDetail,
  SOURCE_LABELS,
  type WaiverDetail,
} from "../../services/waiversService";
import { apiUrl } from "../../lib/api";
import { getToken } from "../../lib/session";
import { BottomSheet } from "./BottomSheet";
import { StatusBadge } from "./StatusBadge";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(`${dateStr.substring(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function marketingLabel(status: WaiverDetail["marketingConsentStatus"]): string {
  return status === "opted_in"
    ? "Opted in"
    : status === "withdrawn"
      ? "Withdrawn"
      : "Not opted in";
}

/** Section heading (icon + uppercase label + hairline). */
const SectionHeader = ({
  icon,
  title,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  title: string;
}) => (
  <View className="mt-5 mb-2">
    <View className="flex-row items-center gap-2 pb-2 border-b border-gray-100 dark:border-neutral-800">
      <Feather name={icon} size={14} color="#6B7280" />
      <Text className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        {title}
      </Text>
    </View>
  </View>
);

/** One labelled value in the two-column info grid. */
const Info = ({ label, value }: { label: string; value: string }) => (
  <View className="w-1/2 mb-3 pr-3">
    <Text className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-0.5">
      {label}
    </Text>
    <Text className="text-sm text-gray-900 dark:text-white" numberOfLines={2}>
      {value}
    </Text>
  </View>
);

/** One acknowledgment line with a Yes/Agreed pill. */
const Ack = ({
  label,
  value,
  good,
}: {
  label: string;
  value: string;
  good: boolean;
}) => (
  <View className="flex-row items-center justify-between py-2 border-b border-gray-100 dark:border-neutral-800">
    <Text className="text-sm text-gray-600 dark:text-gray-300">{label}</Text>
    {good ? (
      <View className="bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 rounded">
        <Text className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
          {value}
        </Text>
      </View>
    ) : (
      <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
        {value}
      </Text>
    )}
  </View>
);

type Props = {
  waiverId: number | null;
  visible: boolean;
  onClose: () => void;
  onChanged: () => void;
  /** Whether the current role may delete (company admin, per settings). */
  canDelete: boolean;
};

/**
 * View one waiver record (GET /waivers/{id}) — participant, visit, minors,
 * consents, the legal body, and the electronic signature. Print downloads the
 * exact server-generated PDF the web admin prints (GET /waivers/{id}/print) and
 * opens the native print dialog on it, so mobile keeps no separate template.
 * Admins can soft-delete with a reason.
 */
export function WaiverDetailSheet({
  waiverId,
  visible,
  onClose,
  onChanged,
  canDelete,
}: Props) {
  const [detail, setDetail] = useState<WaiverDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [reason, setReason] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!visible || waiverId == null) return;
    let active = true;
    const controller = new AbortController();
    setDetail(null);
    setError(null);
    setConfirmingDelete(false);
    setReason("");
    setLoading(true);
    const token = getToken();
    if (!token) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }
    fetchWaiverDetail(token, waiverId, controller.signal)
      .then((d) => {
        if (active) setDetail(d);
      })
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : "Failed to load waiver");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [visible, waiverId]);

  const runDelete = async () => {
    if (waiverId == null) return;
    const token = getToken();
    if (!token) {
      Alert.alert("Not authenticated");
      return;
    }
    setDeleting(true);
    try {
      await deleteWaiver(token, waiverId, reason.trim());
      onChanged();
      onClose();
    } catch (e) {
      Alert.alert(
        "Delete failed",
        e instanceof Error ? e.message : "Could not delete this waiver.",
      );
    } finally {
      setDeleting(false);
    }
  };

  const runPrint = async () => {
    if (!detail) return;
    const token = getToken();
    if (!token) {
      Alert.alert("Not authenticated");
      return;
    }
    setPrinting(true);
    try {
      const FileSystem = await import("expo-file-system/legacy");
      const Print = await import("expo-print");
      // Fetch the exact PDF the web admin prints — the backend renders the full
      // waiver document (Dompdf) at GET /api/waivers/{id}/print. We download it
      // with the Sanctum bearer token, then open the native print dialog on the
      // PDF itself rather than rendering our own (previously shortened) layout.
      const dest = `${FileSystem.cacheDirectory}waiver-${detail.id}.pdf`;
      const { uri, status } = await FileSystem.downloadAsync(
        apiUrl(`/api/waivers/${detail.id}/print`),
        dest,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (status !== 200) {
        Alert.alert(
          "Print unavailable",
          status === 403
            ? "You don't have permission to print this waiver."
            : `Could not generate the waiver PDF (error ${status}).`,
        );
        return;
      }
      await Print.printAsync({ uri });
    } catch (e) {
      Alert.alert(
        "Print failed",
        e instanceof Error ? e.message : "Could not open the print dialog.",
      );
    } finally {
      setPrinting(false);
    }
  };

  const linked = detail
    ? detail.bookingReference
      ? `Booking ${detail.bookingReference}`
      : detail.eventName
        ? `Event · ${detail.eventName}`
        : detail.attractionPurchaseId
          ? `Attraction purchase #${detail.attractionPurchaseId}`
          : "—"
    : "—";

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Waiver Details">
      <ScrollView className="px-6" showsVerticalScrollIndicator={false}>
        {loading && (
          <View className="items-center py-10">
            <ActivityIndicator color="#0644C7" />
          </View>
        )}

        {!loading && error && (
          <View className="bg-red-50 border border-red-100 rounded-2xl p-5 my-4">
            <Text className="text-red-600 font-semibold">Something went wrong</Text>
            <Text className="text-red-500 text-sm mt-1">{error}</Text>
          </View>
        )}

        {!loading && detail && (
          <>
            {/* Title */}
            <View className="flex-row items-center gap-2 flex-wrap">
              <Text className="text-xl font-bold text-gray-900 dark:text-white">
                {detail.adultName}
              </Text>
              <StatusBadge status={detail.status} />
              {/* Check-in badge — mirrors the web admin: driven purely by the
                  truthiness of checked_in_at (no separate boolean field). */}
              {detail.checkedInAt ? (
                <View className="flex-row items-center gap-1 px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                  <Feather name="user-check" size={11} color="#047857" />
                  <Text className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                    Checked In
                  </Text>
                </View>
              ) : (
                <View className="px-2 py-1 rounded-full bg-gray-100 dark:bg-neutral-800">
                  <Text className="text-[10px] font-semibold text-gray-500 dark:text-gray-400">
                    Not Checked In
                  </Text>
                </View>
              )}
            </View>
            <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 mb-1">
              {detail.templateTitle ?? "Waiver"} · Waiver #{detail.id}
            </Text>

            {/* Participant / Guardian */}
            <SectionHeader icon="users" title="Participant / Guardian" />
            <View className="flex-row flex-wrap">
              <Info label="Full Name" value={detail.adultName} />
              <Info label="Date of Birth" value={formatDate(detail.adultDob)} />
              <Info label="Email" value={detail.adultEmail ?? "—"} />
              <Info label="Phone" value={detail.adultPhone ?? "—"} />
            </View>

            {/* Visit Details */}
            <SectionHeader icon="link" title="Visit Details" />
            <View className="flex-row flex-wrap">
              <Info label="Location" value={detail.locationName ?? "—"} />
              <Info label="Visit Date" value={formatDate(detail.selectedDate)} />
              <Info label="Linked To" value={linked} />
              <Info
                label="Source"
                value={SOURCE_LABELS[detail.source] ?? detail.source}
              />
              <Info label="Submitted" value={formatDateTime(detail.submittedAt)} />
            </View>

            {/* Minor Participants */}
            {detail.minors.length > 0 && (
              <>
                <SectionHeader
                  icon="users"
                  title={`Minor Participants (${detail.minors.length})`}
                />
                <View className="bg-gray-50 dark:bg-neutral-800 rounded-xl border border-gray-100 dark:border-neutral-700">
                  {detail.minors.map((m, i) => (
                    <View
                      key={m.id ?? i}
                      className={`flex-row items-center justify-between px-3.5 py-3 ${
                        i < detail.minors.length - 1
                          ? "border-b border-gray-100 dark:border-neutral-700"
                          : ""
                      }`}
                    >
                      <Text
                        className="text-sm font-medium text-gray-800 dark:text-gray-100 flex-1 mr-2"
                        numberOfLines={1}
                      >
                        {`${m.firstName} ${m.lastName}`.trim() || "—"}
                      </Text>
                      <Text className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDate(m.dateOfBirth)}
                        {m.relationship ? ` · ${m.relationship}` : ""}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* Waiver Agreement */}
            <SectionHeader icon="file-text" title="Waiver Agreement" />
            <View className="bg-gray-50 dark:bg-neutral-800 rounded-xl border border-gray-100 dark:border-neutral-700 p-4 max-h-56">
              {detail.renderedBody ? (
                <ScrollView nestedScrollEnabled showsVerticalScrollIndicator>
                  <Text className="text-xs leading-5 text-gray-600 dark:text-gray-300">
                    {detail.renderedBody}
                  </Text>
                </ScrollView>
              ) : (
                <Text className="text-xs text-gray-400 dark:text-gray-500">
                  No waiver text on file.
                </Text>
              )}
            </View>

            {/* Acknowledgment & Signature */}
            <SectionHeader icon="shield" title="Acknowledgment & Signature" />
            <View className="bg-gray-50 dark:bg-neutral-800 rounded-xl border border-gray-100 dark:border-neutral-700 px-3.5 pt-1 pb-3">
              <Ack
                label="Agreement accepted"
                value={detail.agreementAccepted ? "Yes" : "No"}
                good={detail.agreementAccepted}
              />
              <Ack
                label="Electronic consent"
                value={detail.electronicConsentAccepted ? "Yes" : "No"}
                good={detail.electronicConsentAccepted}
              />
              <Ack
                label="Photo / video release"
                value={
                  detail.photoVideoConsent == null
                    ? "—"
                    : detail.photoVideoConsent
                      ? "Agreed"
                      : "Declined"
                }
                good={detail.photoVideoConsent === true}
              />
              <Ack
                label="Marketing consent"
                value={marketingLabel(detail.marketingConsentStatus)}
                good={detail.marketingConsentStatus === "opted_in"}
              />
              <Text className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mt-3">
                Signed electronically by
              </Text>
              <Text className="text-base font-bold text-gray-900 dark:text-white">
                {detail.typedLegalName ?? detail.adultName}
              </Text>
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                {formatDateTime(detail.submittedAt)}
              </Text>
            </View>

            {/* Delete (admin only) */}
            {canDelete && (
              <View className="mt-4">
                {!confirmingDelete ? (
                  <Pressable
                    onPress={() => setConfirmingDelete(true)}
                    className="h-12 flex-row items-center justify-center gap-2 rounded-full border border-red-200 dark:border-red-900/40 active:opacity-80"
                  >
                    <Feather name="trash-2" size={16} color="#DC2626" />
                    <Text className="text-sm font-semibold text-red-600">
                      Delete waiver
                    </Text>
                  </Pressable>
                ) : (
                  <View className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-2xl p-4">
                    <Text className="text-sm font-semibold text-red-700 dark:text-red-400 mb-2">
                      Delete this waiver?
                    </Text>
                    <TextInput
                      value={reason}
                      onChangeText={setReason}
                      placeholder="Reason (recorded in the deletion log)"
                      placeholderTextColor="#9CA3AF"
                      multiline
                      className="bg-white dark:bg-neutral-900 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white border border-red-100 dark:border-red-900/30 min-h-[64px]"
                    />
                    <View className="flex-row gap-3 mt-3">
                      <Pressable
                        onPress={() => setConfirmingDelete(false)}
                        disabled={deleting}
                        className="flex-1 h-11 items-center justify-center rounded-full border border-gray-200 dark:border-neutral-700"
                      >
                        <Text className="text-sm font-medium text-gray-600 dark:text-gray-300">
                          Cancel
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={runDelete}
                        disabled={deleting}
                        className="flex-1 h-11 flex-row items-center justify-center rounded-full bg-red-600 active:opacity-90"
                      >
                        {deleting ? (
                          <ActivityIndicator color="#FFFFFF" />
                        ) : (
                          <Text className="text-sm font-semibold text-white">
                            Delete
                          </Text>
                        )}
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Footer: Close · Print */}
            <View className="flex-row gap-3 mt-5 mb-8">
              <Pressable
                onPress={onClose}
                className="flex-1 items-center justify-center py-3.5 rounded-xl border border-gray-200 dark:border-neutral-700"
              >
                <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  Close
                </Text>
              </Pressable>
              <Pressable
                onPress={runPrint}
                disabled={printing}
                className="flex-1 flex-row items-center justify-center gap-2 bg-[#0644C7] py-3.5 rounded-xl active:opacity-90"
              >
                {printing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Feather name="printer" size={16} color="#FFFFFF" />
                    <Text className="text-sm font-semibold text-white">Print</Text>
                  </>
                )}
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </BottomSheet>
  );
}
