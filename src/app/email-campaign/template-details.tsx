import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { StatusBadge } from "../../components/ui/StatusBadge";
import { mediaUrl } from "../../lib/api";
import { extractImageSrcs, htmlToPlainText } from "../../lib/htmlText";
import { getToken } from "../../lib/session";
import {
  fetchEmailTemplateDetail,
  type EmailTemplateDetail,
} from "../../services/emailService";

const PRIMARY = "#0644C7";
const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const TemplateDetails = () => {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const headerIcon = scheme === "dark" ? "#FFFFFF" : "#111827";

  const { id } = useLocalSearchParams<{ id?: string }>();
  const templateId = id ? Number(id) : null;

  const [detail, setDetail] = useState<EmailTemplateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    if (templateId == null || Number.isNaN(templateId)) {
      setError("Template not found");
      setLoading(false);
      return;
    }
    const token = getToken();
    if (!token) {
      setError("Not signed in");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const d = await fetchEmailTemplateDetail(token, templateId);
      setDetail(d);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load template");
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  // Header mirrors the other details screens (back chevron + centered title).
  const Header = () => (
    <View className="bg-white dark:bg-neutral-900 pt-12 pb-5 px-5 w-full border-b border-gray-100 dark:border-neutral-800">
      <View className="flex-row items-center justify-between">
        <Pressable
          onPress={() => router.back()}
          className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Feather name="chevron-left" size={20} color={headerIcon} />
        </Pressable>
        <View className="items-center flex-1 mx-2">
          <Text className="text-gray-900 dark:text-white text-lg font-bold">
            Template Details
          </Text>
          {!!detail && (
            <Text
              className="text-xs text-gray-400 dark:text-gray-500"
              numberOfLines={1}
            >
              {detail.name}
            </Text>
          )}
        </View>
        <View style={{ width: 36 }} />
      </View>
    </View>
  );

  if (loading) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-black">
        <Header />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={PRIMARY} />
        </View>
      </View>
    );
  }

  if (error || !detail) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-black">
        <Header />
        <View className="flex-1 items-center justify-center px-8">
          <Feather name="alert-circle" size={36} color="#EF4444" />
          <Text className="text-sm text-gray-600 dark:text-gray-300 mt-3 text-center">
            {error ?? "Template not found"}
          </Text>
          <Pressable
            onPress={() => router.back()}
            className="mt-4 px-5 py-2.5 rounded-xl bg-[#0644C7]"
          >
            <Text className="text-sm font-semibold text-white">Back to Templates</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const bodyText = htmlToPlainText(detail.body);
  const images = extractImageSrcs(detail.body)
    .map((src) => mediaUrl(src))
    .filter((u): u is string => !!u);

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <Header />
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
      >
        {/* Name + status */}
        <View
          className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mb-4 shadow-sm"
          style={CARD_SHADOW}
        >
          <View className="flex-row items-start justify-between gap-3">
            <Text className="text-xl font-bold text-gray-900 dark:text-white flex-1">
              {detail.name}
            </Text>
            <StatusBadge status={detail.status} />
          </View>
          {!!detail.category && (
            <View className="flex-row mt-2">
              <View className="bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-md">
                <Text className="text-xs font-medium text-[#0644C7] dark:text-blue-300">
                  {detail.category}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Template Preview */}
        <View
          className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mb-4 shadow-sm"
          style={CARD_SHADOW}
        >
          <View className="flex-row items-center gap-2 mb-4">
            <View className="w-8 h-8 rounded-lg bg-[#0644C7]/10 items-center justify-center">
              <Feather name="eye" size={16} color={PRIMARY} />
            </View>
            <Text className="text-base font-bold text-gray-900 dark:text-white">
              Template Preview
            </Text>
          </View>

          {/* Subject */}
          <Text className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
            Subject
          </Text>
          <Text className="text-sm font-medium text-gray-900 dark:text-white">
            {detail.subject || "—"}
          </Text>

          {/* Body */}
          <View className="mt-4">
            <Text className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
              Body
            </Text>
            <View className="rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/50 p-4">
              {bodyText ? (
                <Text className="text-sm leading-6 text-gray-700 dark:text-gray-200">
                  {bodyText}
                </Text>
              ) : (
                <Text className="text-sm italic text-gray-400 dark:text-gray-500">
                  No body content
                </Text>
              )}
            </View>
          </View>

          {/* Images embedded in the body */}
          {images.length > 0 && (
            <View className="mt-4">
              <Text className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
                Images
              </Text>
              <View className="gap-3">
                {images.map((uri, i) => (
                  <Image
                    key={`${uri}-${i}`}
                    source={{ uri }}
                    style={{ width: "100%", height: 180, borderRadius: 12 }}
                    contentFit="contain"
                    transition={150}
                  />
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Actions */}
        <View className="flex-row gap-3 mt-1">
          <Pressable
            onPress={() => router.back()}
            className="flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 active:opacity-70"
            accessibilityRole="button"
          >
            <Feather name="x" size={16} color="#374151" />
            <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Close
            </Text>
          </Pressable>
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/email-campaign/create-template",
                params: { id: String(detail.id) },
              })
            }
            className="flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl bg-[#0644C7] active:opacity-90"
            accessibilityRole="button"
          >
            <Feather name="edit-2" size={16} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-white">Edit Template</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
};

export default TemplateDetails;
