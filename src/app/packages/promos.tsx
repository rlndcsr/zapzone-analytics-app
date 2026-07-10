import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fetchPromoList, type PromoRow } from "../../services/promosService";
import { useAsyncList } from "../../lib/hooks/useAsyncList";

const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

function discountLabel(promo: PromoRow): string {
  if (promo.discountType === "percentage" || promo.discountType === "percent") {
    return `${promo.discountValue}% off`;
  }
  return `$${promo.discountValue.toFixed(2)} off`;
}

const PromoCard = ({ promo }: { promo: PromoRow }) => (
  <View
    className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3 border border-gray-100 dark:border-neutral-800"
    style={CARD_SHADOW}
  >
    <View className="flex-row items-start justify-between mb-2">
      <View className="flex-1 mr-3">
        <View className="flex-row items-center gap-2">
          <Feather name="tag" size={14} color={PRIMARY} />
          <Text
            className="text-base font-bold text-gray-900 dark:text-white"
            numberOfLines={1}
          >
            {promo.code}
          </Text>
        </View>
        {promo.name !== promo.code && (
          <Text
            className="text-xs text-gray-500 dark:text-gray-400 mt-0.5"
            numberOfLines={1}
          >
            {promo.name}
          </Text>
        )}
      </View>
      <View
        className={`px-2.5 py-1 rounded-full ${
          promo.isActive
            ? "bg-green-50 dark:bg-green-900/30"
            : "bg-gray-100 dark:bg-neutral-800"
        }`}
      >
        <Text
          className={`text-[11px] font-semibold ${
            promo.isActive
              ? "text-green-600 dark:text-green-400"
              : "text-gray-500 dark:text-gray-400"
          }`}
        >
          {promo.isActive ? "Active" : "Inactive"}
        </Text>
      </View>
    </View>

    <View className="flex-row items-center justify-between pt-3 border-t border-gray-100 dark:border-neutral-800">
      <View className="bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-lg">
        <Text className="text-xs font-semibold text-[#0644C7] dark:text-blue-300">
          {discountLabel(promo)}
        </Text>
      </View>
      <Text className="text-xs text-gray-400 dark:text-gray-500">
        {promo.usageLimit != null
          ? `${promo.usedCount}/${promo.usageLimit} used`
          : `${promo.usedCount} used`}
      </Text>
    </View>
  </View>
);

const Promos = () => {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#ffffff" : "#000000";
  const insets = useSafeAreaInsets();

  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const loader = useCallback(
    ({ token }: { token: string }) => fetchPromoList(token),
    [],
  );
  const { data: promos, loading, error, refetch } = useAsyncList(loader);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return promos;
    return promos.filter(
      (p) =>
        p.code.toLowerCase().includes(term) ||
        p.name.toLowerCase().includes(term),
    );
  }, [promos, search]);

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header */}
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
          <Text className="text-gray-900 dark:text-white text-lg font-bold">
            Promo Codes
          </Text>
          <View style={{ width: 36 }} />
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={PRIMARY}
            colors={[PRIMARY]}
          />
        }
      >
        <View className="px-5">
          {/* Intro */}
          <View className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mt-6 mb-4 shadow-sm">
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Promo Codes
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Create and manage promotional codes
            </Text>
          </View>

          {/* Create */}
          <Pressable
            onPress={() =>
              Alert.alert(
                "Create Promo Code",
                "Promo codes can be created on the web dashboard.",
              )
            }
            className="flex-row items-center justify-center gap-2 bg-[#0644C7] px-4 py-3.5 rounded-xl active:opacity-90 mb-4"
          >
            <Feather name="plus" size={16} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-white">
              Create Promo Code
            </Text>
          </Pressable>

          {/* Search */}
          <View className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-800 mb-4">
            <Feather name="search" size={18} color="#9CA3AF" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search promo codes..."
              placeholderTextColor="#9CA3AF"
              className="flex-1 text-sm text-gray-900 dark:text-white"
              style={{ paddingVertical: 0 }}
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <Feather name="x" size={16} color="#9CA3AF" />
              </Pressable>
            )}
          </View>

          {!loading && !error && (
            <Text className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              Showing {filtered.length}{" "}
              {filtered.length === 1 ? "promo code" : "promo codes"}
            </Text>
          )}

          {/* States */}
          {loading ? (
            <View className="py-16 items-center">
              <ActivityIndicator color={PRIMARY} />
            </View>
          ) : error ? (
            <View className="bg-red-50 border border-red-100 rounded-2xl p-5">
              <Text className="text-red-600 font-semibold">
                Something went wrong
              </Text>
              <Text className="text-red-500 text-sm mt-1">{error}</Text>
            </View>
          ) : filtered.length === 0 ? (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl p-8 items-center shadow-sm">
              <View className="w-16 h-16 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center mb-3">
                <Feather name="tag" size={26} color="#9CA3AF" />
              </View>
              <Text className="text-gray-700 dark:text-gray-200 font-semibold text-lg">
                No promo codes found
              </Text>
              <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1">
                {promos.length === 0
                  ? "Create your first promo code to get started."
                  : "Try a different search."}
              </Text>
            </View>
          ) : (
            filtered.map((promo) => <PromoCard key={promo.id} promo={promo} />)
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default Promos;
