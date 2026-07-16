import { View, Text, Pressable, ScrollView, TextInput } from "react-native";
import { Feather } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Pagination } from "../../components/ui/Pagination";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const PRIMARY = "#0644C7";

const CustomPackages = () => {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#ffffff" : "#000000";
  const insets = useSafeAreaInsets();

  const [search, setSearch] = useState("");

  // Custom package data
  const customPackage = {
    id: 1,
    name: "ARCADE PARTY",
    location: "Brighton | Zap Zone",
    date: "Dec 13, 2025",
    description:
      "Our Arcade Party Package is the ultimate way to celebrate! Host...",
    tags: ["Holiday", "Birthday"],
    price: 200.0,
    capacity: 20,
  };

  const customPackages = [customPackage];

  // Client-side pagination over the custom package list.
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const paged = useMemo(
    () => customPackages.slice((page - 1) * perPage, page * perPage),
    [customPackages, page, perPage],
  );

  // Reset to the first page whenever the page size changes.
  useEffect(() => {
    setPage(1);
  }, [perPage]);

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
            Custom Packages
          </Text>
          <View style={{ width: 36 }} />
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <View className="px-5">
          {/* Header Section */}
          <View className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mt-6 mb-4 shadow-sm">
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Custom Packages
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Holiday, special, seasonal, and promotional packages
            </Text>
          </View>

          {/* Create Button */}
          <Pressable
            onPress={() =>
              router.push("/packages/create-packages?type=custom")
            }
            className="flex-row items-center justify-center gap-2 bg-[#0644C7] px-4 py-3.5 rounded-xl active:opacity-90 mb-4"
            accessibilityRole="button"
            accessibilityLabel="Create custom package"
          >
            <Feather name="plus" size={16} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-white">
              Create Custom Package
            </Text>
          </Pressable>

          {/* Search Bar */}
          <View className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-800 mb-4">
            <Feather name="search" size={18} color="#9CA3AF" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search packages..."
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

          {/* Filter Chips */}
          <View className="flex-row flex-wrap gap-2 pb-4">
            <View className="bg-white dark:bg-neutral-900 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-neutral-800">
              <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
                All Types
              </Text>
            </View>
            <View className="bg-white dark:bg-neutral-900 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-neutral-800">
              <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
                All Categories
              </Text>
            </View>
            <View className="bg-white dark:bg-neutral-900 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-neutral-800">
              <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
                All Locations
              </Text>
            </View>
            <View className="bg-white dark:bg-neutral-900 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-neutral-800">
              <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
                Sort: Name
              </Text>
            </View>
          </View>

          {/* Custom Package Cards */}
          {paged.map((pkg) => (
            <View
              key={pkg.id}
              className="bg-white dark:bg-neutral-900 rounded-2xl p-5 border border-gray-100 dark:border-neutral-800 mb-4"
              style={CARD_SHADOW}
            >
              {/* Title */}
              <Text className="text-lg font-bold text-gray-900 dark:text-white mb-3">
                {pkg.name}
              </Text>

              {/* Location */}
              <View className="flex-row items-center gap-1.5 mb-1.5">
                <Feather name="map-pin" size={14} color="#9CA3AF" />
                <Text className="text-sm text-gray-500 dark:text-gray-400">
                  {pkg.location}
                </Text>
              </View>

              {/* Date */}
              <View className="flex-row items-center gap-1.5 mb-3">
                <Feather name="calendar" size={14} color="#9CA3AF" />
                <Text className="text-sm text-gray-500 dark:text-gray-400">
                  {pkg.date}
                </Text>
              </View>

              {/* Description */}
              <Text className="text-sm text-gray-700 dark:text-gray-200 mb-4 leading-5">
                {pkg.description}
              </Text>

              {/* Tags */}
              <View className="flex-row flex-wrap gap-2 mb-4">
                {pkg.tags.map((tag) => (
                  <View
                    key={tag}
                    className="bg-blue-50 dark:bg-blue-900/30 px-3 py-1 rounded-md border border-blue-100 dark:border-blue-800"
                  >
                    <Text className="text-xs font-medium text-[#0644C7] dark:text-blue-300">
                      {tag}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Price and Capacity */}
              <View className="flex-row items-center justify-between pt-4 border-t border-gray-100 dark:border-neutral-800">
                <Text className="text-2xl font-bold text-gray-900 dark:text-white">
                  ${pkg.price.toFixed(2)}
                </Text>
                <View className="flex-row items-center gap-1.5">
                  <Feather name="users" size={16} color="#9CA3AF" />
                  <Text className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    {pkg.capacity}
                  </Text>
                </View>
              </View>
            </View>
          ))}

          {/* Bottom Count */}
          <Text className="text-sm text-gray-500 dark:text-gray-400 mt-5 mb-3">
            Showing 1 of 1 custom package
          </Text>

          <Pagination
            page={page}
            perPage={perPage}
            total={customPackages.length}
            onPageChange={setPage}
            onPerPageChange={setPerPage}
          />
        </View>
      </ScrollView>
    </View>
  );
};

export default CustomPackages;