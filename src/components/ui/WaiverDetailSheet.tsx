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
import { getToken } from "../../lib/session";
import { BottomSheet } from "./BottomSheet";
import { StatusBadge } from "./StatusBadge";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(`${dateStr.substring(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <View className="flex-row items-start justify-between py-2 border-b border-gray-100 dark:border-neutral-800">
    <Text className="text-sm text-gray-500 dark:text-gray-400">{label}</Text>
    <Text
      className="text-sm font-medium text-gray-900 dark:text-white flex-1 text-right ml-4"
      numberOfLines={2}
    >
      {value}
    </Text>
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
 * View one waiver record (GET /waivers/{id}) — adult, minors, consents, the
 * linked purchase, and the rendered legal body. Admins can soft-delete with an
 * audit reason (DELETE /waivers/{id}), mirroring the web DeleteWaiverModal.
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

  const linkedTo = (() => {
    if (!detail) return null;
    if (detail.bookingReference) return `Booking #${detail.bookingReference}`;
    if (detail.bookingId) return `Booking #${detail.bookingId}`;
    if (detail.eventName) return `Event · ${detail.eventName}`;
    if (detail.attractionPurchaseId)
      return `Attraction purchase #${detail.attractionPurchaseId}`;
    return null;
  })();

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Waiver Details">
      <ScrollView className="px-6 pb-8" showsVerticalScrollIndicator={false}>
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
            <View className="flex-row items-center justify-between mb-3">
              <Text
                className="text-xl font-bold text-gray-900 dark:text-white flex-1 mr-3"
                numberOfLines={1}
              >
                {detail.adultName}
              </Text>
              <StatusBadge status={detail.status} />
            </View>

            <View className="mb-4">
              {detail.adultEmail && <Row label="Email" value={detail.adultEmail} />}
              {detail.adultPhone && <Row label="Phone" value={detail.adultPhone} />}
              <Row label="Visit date" value={formatDate(detail.selectedDate)} />
              <Row label="Template" value={detail.templateTitle ?? "—"} />
              {detail.locationName && (
                <Row label="Location" value={detail.locationName} />
              )}
              {linkedTo && <Row label="Linked to" value={linkedTo} />}
              <Row label="Source" value={SOURCE_LABELS[detail.source] ?? detail.source} />
              <Row
                label="Marketing"
                value={
                  detail.marketingConsentStatus === "opted_in"
                    ? "Opted in"
                    : detail.marketingConsentStatus === "withdrawn"
                      ? "Withdrawn"
                      : "Not opted in"
                }
              />
              <Row label="Submitted" value={formatDateTime(detail.submittedAt)} />
            </View>

            {/* Minors */}
            {detail.minors.length > 0 && (
              <View className="mb-4">
                <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                  Minors ({detail.minors.length})
                </Text>
                {detail.minors.map((m, i) => (
                  <View
                    key={m.id ?? i}
                    className="flex-row items-center gap-2 py-1.5"
                  >
                    <Feather name="user" size={14} color="#9CA3AF" />
                    <Text className="text-sm text-gray-700 dark:text-gray-200">
                      {`${m.firstName} ${m.lastName}`.trim() || "—"}
                      {m.relationship ? ` · ${m.relationship}` : ""}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Rendered legal body */}
            {!!detail.renderedBody && (
              <View className="mb-4">
                <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                  Waiver text
                </Text>
                <View className="bg-gray-50 dark:bg-neutral-800 rounded-xl p-4 max-h-64">
                  <ScrollView nestedScrollEnabled showsVerticalScrollIndicator>
                    <Text className="text-xs leading-5 text-gray-600 dark:text-gray-300">
                      {detail.renderedBody}
                    </Text>
                  </ScrollView>
                </View>
              </View>
            )}

            {/* Delete (admin only) */}
            {canDelete && (
              <View className="mt-2">
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
          </>
        )}
      </ScrollView>
    </BottomSheet>
  );
}
