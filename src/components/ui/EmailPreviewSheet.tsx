import { Feather } from "@expo/vector-icons";
import { ActivityIndicator, Dimensions, Pressable, ScrollView, Text, View } from "react-native";

import { BottomSheet } from "./BottomSheet";
import { HtmlBody } from "./HtmlBody";

const PRIMARY = "#0644C7";

/**
 * The web's email preview modal as a sheet: Subject, then the Body rendered as
 * the email shows it, with the caller's buttons underneath.
 */
export function EmailPreviewSheet({
  visible,
  onClose,
  title,
  subtitle,
  loading = false,
  error = null,
  onRetry,
  subject,
  body,
  footer,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  subject: string;
  body: string;
  footer: React.ReactNode;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title} subtitle={subtitle}>
      {loading ? (
        <View className="items-center justify-center py-16">
          <ActivityIndicator size="large" color={PRIMARY} />
        </View>
      ) : error ? (
        <View className="items-center px-8 py-12">
          <Feather name="alert-circle" size={32} color="#EF4444" />
          <Text className="text-sm text-gray-600 dark:text-gray-300 mt-3 text-center">{error}</Text>
          {!!onRetry && (
            <Pressable onPress={onRetry} className="mt-4 px-5 py-2.5 rounded-xl bg-[#0644C7]">
              <Text className="text-sm font-semibold text-white">Retry</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <ScrollView
          style={{ maxHeight: Dimensions.get("window").height * 0.65 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12 }}
        >
          <Text className="text-sm font-medium text-gray-500 dark:text-gray-400">Subject</Text>
          <Text className="text-sm text-gray-900 dark:text-white mt-1 mb-4">
            {subject || "(No subject)"}
          </Text>
          <Text className="text-sm font-medium text-gray-500 dark:text-gray-400">Body</Text>
          {/* An email is designed on white, so the body stays on a light page in dark mode too. */}
          <View className="mt-2 rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50 p-4">
            <HtmlBody html={body} />
          </View>
        </ScrollView>
      )}
      {/* The sheet already pads for the home indicator. */}
      <View className="flex-row justify-end gap-3 px-5 pt-3 pb-3 border-t border-gray-200 dark:border-neutral-800">
        {footer}
      </View>
    </BottomSheet>
  );
}
