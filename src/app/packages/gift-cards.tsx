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

import {
  fetchGiftCardList,
  type GiftCardRow,
} from "../../services/giftCardsService";
import { useAsyncList } from "../../lib/hooks/useAsyncList";

const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

function valueLabel(card: GiftCardRow): string {
  if (card.discountType === "percentage" || card.discountType === "percent") {
    return `${card.value}%`;
  }
  return `$${card.value.toFixed(2)}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const GiftCardCard = ({ card }: { card: GiftCardRow }) => (
  <View
    className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3 border border-gray-100 dark:border-neutral-800"
    style={CARD_SHADOW}
  >
    <View className="flex-row items-start justify-between mb-2">
      <View className="flex-1 mr-3">
        <View className="flex-row items-center gap-2">
          <Feather name="gift" size={14} color={PRIMARY} />
          <Text
            className="text-base font-bold text-gray-900 dark:text-white"
            numberOfLines={1}
          >
            {card.code}
          </Text>
        </View>
        {!!formatDate(card.expiresAt) && (
          <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Expires {formatDate(card.expiresAt)}
          </Text>
        )}
      </View>
      <View
        className={`px-2.5 py-1 rounded-full ${
          card.isActive
            ? "bg-green-50 dark:bg-green-900/30"
            : "bg-gray-100 dark:bg-neutral-800"
        }`}
      >
        <Text
          className={`text-[11px] font-semibold ${
            card.isActive
              ? "text-green-600 dark:text-green-400"
              : "text-gray-500 dark:text-gray-400"
          }`}
        >
          {card.isActive ? "Active" : "Inactive"}
        </Text>
      </View>
    </View>

    <View className="flex-row items-center justify-between pt-3 border-t border-gray-100 dark:border-neutral-800">
      <View>
        <Text className="text-[11px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">
          Value
        </Text>
        <Text className="text-lg font-bold text-gray-900 dark:text-white">
          {valueLabel(card)}
        </Text>
      </View>
      {card.balance != null && (
        <View className="items-end">
          <Text className="text-[11px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            Balance
          </Text>
          <Text className="text-sm font-bold text-green-600 dark:text-green-400">
            ${card.balance.toFixed(2)}
          </Text>
        </View>
      )}
    </View>
  </View>
);

const GiftCards = () => {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#ffffff" : "#000000";
  const insets = useSafeAreaInsets();

  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const loader = useCallback(
    ({ token }: { token: string }) => fetchGiftCardList(token),
    [],
  );
  const { data: cards, loading, error, refetch } = useAsyncList(loader);

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
    if (!term) return cards;
    return cards.filter((c) => c.code.toLowerCase().includes(term));
  }, [cards, search]);

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
            Gift Cards
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
              Gift Cards
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Create and manage gift cards for your customers
            </Text>
          </View>

          {/* Create */}
          <Pressable
            onPress={() =>
              Alert.alert(
                "Create Gift Card",
                "Gift cards can be created on the web dashboard.",
              )
            }
            className="flex-row items-center justify-center gap-2 bg-[#0644C7] px-4 py-3.5 rounded-xl active:opacity-90 mb-4"
          >
            <Feather name="plus" size={16} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-white">
              Create Gift Card
            </Text>
          </Pressable>

          {/* Search */}
          <View className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-800 mb-4">
            <Feather name="search" size={18} color="#9CA3AF" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search gift cards by code..."
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
              {filtered.length === 1 ? "gift card" : "gift cards"}
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
                <Feather name="gift" size={26} color="#9CA3AF" />
              </View>
              <Text className="text-gray-700 dark:text-gray-200 font-semibold text-lg">
                No gift cards found
              </Text>
              <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1">
                {cards.length === 0
                  ? "Create your first gift card to get started."
                  : "Try a different search."}
              </Text>
            </View>
          ) : (
            filtered.map((card) => <GiftCardCard key={card.id} card={card} />)
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default GiftCards;
