import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { bulkOrderNotice } from "../../lib/bulkOrder";

/**
 * "Part of bulk order — line N" with a View order action, shown on an individual
 * purchase that belongs to a ticket order. Renders nothing for a standalone one.
 */
export function BulkOrderNotice({
  ticketOrderId,
  linePosition,
}: {
  ticketOrderId: number | null;
  linePosition: number | null;
}) {
  const notice = bulkOrderNotice(ticketOrderId, linePosition);
  if (!notice) return null;

  return (
    <View className="mb-4 flex-row items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 dark:border-blue-900/40 dark:bg-blue-900/20">
      <Text className="flex-1 text-sm text-blue-900 dark:text-blue-200">
        <Text className="font-bold">{notice.title}</Text>
        {notice.lineSuffix}
      </Text>
      <Pressable
        onPress={() => router.push(notice.route)}
        accessibilityRole="button"
        accessibilityLabel="View order"
        className="shrink-0 flex-row items-center gap-1.5 rounded-lg bg-[#0644C7] px-3 py-2.5 active:opacity-90"
      >
        <Text className="text-xs font-semibold text-white" numberOfLines={1}>
          View order
        </Text>
        <Feather name="arrow-right" size={14} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}
