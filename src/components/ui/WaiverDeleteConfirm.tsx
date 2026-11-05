import { Feather } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { getToken } from "../../lib/session";
import {
  submitWaiverDeletion,
  waiverDeleteSubject,
  type WaiverDeleteResult,
} from "../../lib/waivers/waiverDeletion";
import { deleteWaiver } from "../../services/waiversService";
import { BottomSheet } from "./BottomSheet";

export function WaiverDeleteConfirm({
  adultName,
  reason,
  onReasonChange,
  deleting,
  onCancel,
  onConfirm,
  framed = true,
}: {
  adultName: string | null | undefined;
  reason: string;
  onReasonChange: (text: string) => void;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  /** Bordered card for inline use; off inside a sheet that has its own title. */
  framed?: boolean;
}) {
  return (
    <View
      className={
        framed
          ? "rounded-2xl border border-red-100 dark:border-red-900/40 bg-white dark:bg-neutral-900 p-4"
          : ""
      }
    >
      {framed && (
        <View className="flex-row items-center gap-2.5 mb-2">
          <View className="w-8 h-8 rounded-full bg-red-50 dark:bg-red-900/30 items-center justify-center">
            <Feather name="trash-2" size={15} color="#DC2626" />
          </View>
          <Text className="text-base font-semibold text-gray-900 dark:text-white">
            Delete Waiver?
          </Text>
        </View>
      )}
      <Text className="text-sm text-gray-600 dark:text-gray-300">
        Are you sure you want to delete the waiver for{" "}
        <Text className="font-semibold text-gray-900 dark:text-white">
          {waiverDeleteSubject(adultName)}
        </Text>
        ? It is recorded in the deletion log. You may optionally give a reason.
      </Text>

      <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-4 mb-1.5">
        Deletion Reason (Optional)
      </Text>
      <TextInput
        value={reason}
        onChangeText={onReasonChange}
        editable={!deleting}
        placeholder="Enter a reason for deleting this waiver..."
        placeholderTextColor="#9CA3AF"
        multiline
        textAlignVertical="top"
        accessibilityLabel="Deletion reason, optional"
        className="rounded-xl px-3.5 py-3 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 min-h-[76px]"
      />

      <View className="flex-row gap-3 mt-4">
        <Pressable
          onPress={onCancel}
          disabled={deleting}
          className={`flex-1 h-11 items-center justify-center rounded-xl border border-gray-200 dark:border-neutral-700 ${
            deleting ? "opacity-50" : "active:opacity-70"
          }`}
          accessibilityRole="button"
        >
          <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            Cancel
          </Text>
        </Pressable>
        <Pressable
          onPress={onConfirm}
          disabled={deleting}
          className={`flex-1 h-11 flex-row items-center justify-center gap-2 rounded-xl bg-red-600 ${
            deleting ? "opacity-70" : "active:opacity-90"
          }`}
          accessibilityRole="button"
          accessibilityState={{ disabled: deleting, busy: deleting }}
        >
          {deleting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Feather name="trash-2" size={15} color="#FFFFFF" />
          )}
          <Text className="text-sm font-semibold text-white">
            {deleting ? "Deleting…" : "Delete Waiver"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * The feedback both entry points give for a finished attempt. A "busy" result
 * is a duplicate tap and says nothing.
 */
export function announceWaiverDeleteResult(
  result: WaiverDeleteResult,
  adultName: string | null | undefined,
): void {
  if (result.status === "deleted") {
    Alert.alert(
      "Waiver deleted",
      `The waiver for ${waiverDeleteSubject(adultName)} was deleted and recorded in the deletion log.`,
    );
  } else if (result.status === "failed") {
    Alert.alert("Delete failed", result.message);
  } else if (result.status === "unauthenticated") {
    Alert.alert("Not signed in", "Please sign in again to delete.");
  }
}

type DeleteTarget = { id: number; adultName: string | null };

/**
 * Table-row deletion: the same confirmation as the detail sheet, in a sheet of
 * its own. It stays open (and can't be dismissed) while the request runs.
 */
export function WaiverDeleteSheet({
  waiver,
  onClose,
  onDeleted,
  onBusyChange,
}: {
  waiver: DeleteTarget | null;
  onClose: () => void;
  onDeleted: (waiver: DeleteTarget) => void;
  /** Lets the screen mark the row as busy while the request runs. */
  onBusyChange?: (id: number | null) => void;
}) {
  const [reason, setReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const lock = useRef(false);
  // Keep the last waiver so the sheet keeps its text while it slides away.
  const last = useRef<DeleteTarget | null>(waiver);
  if (waiver) last.current = waiver;
  const shown = waiver ?? last.current;

  // A fresh, empty reason for each waiver the sheet is opened for.
  const waiverId = waiver?.id ?? null;
  useEffect(() => {
    if (waiverId != null) setReason("");
  }, [waiverId]);

  const confirm = async () => {
    if (!shown || lock.current) return;
    const target = shown;
    setDeleting(true);
    onBusyChange?.(target.id);
    const result = await submitWaiverDeletion({
      token: getToken(),
      waiverId: target.id,
      reason,
      lock,
      remove: deleteWaiver,
    });
    setDeleting(false);
    onBusyChange?.(null);
    if (result.status === "busy") return;
    if (result.status === "deleted") {
      onClose();
      onDeleted(target);
    }
    announceWaiverDeleteResult(result, target.adultName);
  };

  return (
    <BottomSheet
      visible={waiver !== null}
      onClose={() => (deleting ? undefined : onClose())}
      title="Delete Waiver?"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          className="px-6"
          contentContainerStyle={{ paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <WaiverDeleteConfirm
            framed={false}
            adultName={shown?.adultName}
            reason={reason}
            onReasonChange={setReason}
            deleting={deleting}
            onCancel={onClose}
            onConfirm={() => void confirm()}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}
