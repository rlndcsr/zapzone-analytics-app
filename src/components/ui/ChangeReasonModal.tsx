import { Feather } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { getToken } from "../../lib/session";
import { fetchChangeReasonOptions } from "../../services/bookingsService";
import { BottomSheet } from "./BottomSheet";

const FALLBACK_PRESETS = [
  "Customer requested a change",
  "Customer requested cancellation",
  "Scheduling conflict",
  "Room or equipment unavailable",
  "Staff booking error corrected",
  "Weather or closure",
  "Customer no-show",
  "Price or discount adjustment",
  "Duplicate booking removed",
];

const MIN_LENGTH = 3;

let cachedPresets: string[] | null = null;

type Props = {
  visible: boolean;
  summary?: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
};

export function ChangeReasonModal({
  visible,
  summary,
  destructive,
  onCancel,
  onConfirm,
}: Props) {
  const [presets, setPresets] = useState<string[]>(
    cachedPresets ?? FALLBACK_PRESETS,
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSelected(null);
    setDetail("");
    setTouched(false);
    if (cachedPresets) return;
    const token = getToken();
    if (!token) return;
    fetchChangeReasonOptions(token)
      .then((res) => {
        if (res.presets.length > 0) {
          cachedPresets = res.presets;
          setPresets(res.presets);
        }
      })
      .catch(() => {});
  }, [visible]);

  const reason = (() => {
    const extra = detail.trim();
    if (selected && extra) return `${selected} — ${extra}`;
    if (selected) return selected;
    return extra;
  })();

  const tooShort = reason.length > 0 && reason.length < MIN_LENGTH;
  const canSubmit = reason.length >= MIN_LENGTH;

  const submit = () => {
    setTouched(true);
    if (!canSubmit) return;
    onConfirm(reason);
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onCancel}
      title="Why are you making this change?"
    >
      <View className="px-5 pb-6">
        <Text className="mb-4 text-xs text-gray-500 dark:text-gray-400">
          Recorded permanently in this booking&apos;s change history. It cannot
          be edited or removed later.
        </Text>

        {!!summary && (
          <View className="mb-4 rounded-lg bg-gray-50 dark:bg-neutral-800 px-3 py-2">
            <Text className="text-xs text-gray-700 dark:text-gray-300">
              {summary}
            </Text>
          </View>
        )}

        <View className="mb-3 flex-row flex-wrap gap-1.5">
          {presets.map((preset) => {
            const on = selected === preset;
            return (
              <Pressable
                key={preset}
                onPress={() => setSelected(on ? null : preset)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                className={`rounded-full border px-2.5 py-1.5 ${
                  on
                    ? "border-[#0644C7] bg-[#0644C7]"
                    : "border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
                }`}
              >
                <Text
                  className={`text-xs font-medium ${
                    on ? "text-white" : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  {preset}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text className="mb-1.5 text-xs font-medium text-gray-700 dark:text-gray-200">
          {selected ? "Add any detail (optional)" : "Reason"}
        </Text>
        <View
          className={`rounded-lg border bg-white dark:bg-neutral-900 px-3 py-2.5 ${
            touched && !canSubmit
              ? "border-red-300 dark:border-red-900/60"
              : "border-gray-200 dark:border-neutral-700"
          }`}
        >
          <TextInput
            value={detail}
            onChangeText={setDetail}
            onBlur={() => setTouched(true)}
            placeholder={
              selected
                ? "e.g. moved to the 4pm slot at the guest's request"
                : "Describe why this change is being made"
            }
            placeholderTextColor="#9CA3AF"
            multiline
            textAlignVertical="top"
            className="min-h-[64px] text-sm text-gray-900 dark:text-white"
          />
        </View>

        {touched && reason.length === 0 && (
          <Text className="mt-1.5 text-xs text-red-600 dark:text-red-400">
            Pick a reason above or type one to continue.
          </Text>
        )}
        {touched && tooShort && (
          <Text className="mt-1.5 text-xs text-red-600 dark:text-red-400">
            Please give a slightly more specific reason.
          </Text>
        )}

        <View className="mt-5 flex-row justify-end gap-2">
          <Pressable
            onPress={onCancel}
            className="h-11 items-center justify-center rounded-lg border border-gray-300 dark:border-neutral-700 px-4"
          >
            <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Cancel
            </Text>
          </Pressable>
          <Pressable
            onPress={submit}
            disabled={!canSubmit}
            className={`h-11 flex-row items-center justify-center gap-2 rounded-lg px-4 ${
              !canSubmit ? "opacity-40" : "active:opacity-90"
            } ${destructive ? "bg-red-600" : "bg-[#0644C7]"}`}
          >
            {destructive && (
              <Feather name="alert-triangle" size={14} color="#FFFFFF" />
            )}
            <Text className="text-sm font-semibold text-white">
              {destructive ? "Confirm and record" : "Save change"}
            </Text>
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
}

export default ChangeReasonModal;
