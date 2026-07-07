import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState, type ComponentProps } from "react";
import {
  Alert,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "../../components/ui/BottomSheet";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

type ComponentIconName = ComponentProps<typeof Feather>["name"];

const Packages = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const headerIcon = scheme === "dark" ? "#fff" : "#111";

  const [showMoreSheet, setShowMoreSheet] = useState(false);

  // Animation values
  const spinValue = useRef(new Animated.Value(0)).current;
  const pulseValue = useRef(new Animated.Value(1)).current;
  const translateYValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Floating animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(translateYValue, {
          toValue: -10,
          duration: 1500,
          easing: Easing.ease,
          useNativeDriver: true,
        }),
        Animated.timing(translateYValue, {
          toValue: 0,
          duration: 1500,
          easing: Easing.ease,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [spinValue, pulseValue, translateYValue]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  // Mirrors the web "More" action menu; these management actions arrive in a
  // future release, so they're shown but not yet actionable.
  const moreActions: { label: string; icon: ComponentIconName }[] = [
    { label: "Import Packages", icon: "upload" },
    { label: "Export Packages", icon: "download" },
  ];

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header - Unchanged */}
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
            Packages
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
          {/* Overview intro */}
          <View
            className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mt-6 mb-5 shadow-sm"
            style={CARD_SHADOW}
          >
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Manage Packages
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Browse and manage your available packages
            </Text>
          </View>

          {/* More + Create Package (mirrors the web header controls) */}
          <View className="flex-row gap-3 mb-5">
            <Pressable
              onPress={() => setShowMoreSheet(true)}
              className="flex-1 flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800"
            >
              <Feather name="more-horizontal" size={16} color="#6B7280" />
              <Text
                className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1"
                numberOfLines={1}
              >
                More
              </Text>
              <Feather name="chevron-down" size={14} color="#9CA3AF" />
            </Pressable>

            <Pressable
              onPress={() =>
                Alert.alert(
                  "Coming Soon",
                  "Package creation arrives in a future update.",
                )
              }
              className="flex-1 flex-row items-center justify-center gap-2 bg-[#0644C7] px-4 py-3.5 rounded-xl active:opacity-90"
              accessibilityRole="button"
              accessibilityLabel="Create package"
            >
              <Feather name="plus" size={16} color="#FFFFFF" />
              <Text className="text-xs font-semibold text-white" numberOfLines={1}>
                Create Package
              </Text>
            </Pressable>
          </View>

          {/* Coming soon */}
          <View
            className="bg-white dark:bg-neutral-900 rounded-2xl p-8 items-center shadow-sm"
            style={CARD_SHADOW}
          >
            {/* Animated Package Icon */}
            <Animated.View
              style={{
                transform: [
                  { rotate: spin },
                  { scale: pulseValue },
                  { translateY: translateYValue },
                ],
              }}
              className="mb-8 mt-4"
            >
              <Feather
                name="package"
                size={80}
                color={scheme === "dark" ? "#fff" : "#111"}
              />
            </Animated.View>

            {/* Coming Soon Message */}
            <Text className="text-3xl font-bold text-gray-900 dark:text-white mb-3 text-center">
              Coming Soon!
            </Text>
            <Text className="text-base text-gray-600 dark:text-gray-400 text-center max-w-xs">
              We are working hard to bring you exciting new packages. Stay
              tuned for updates!
            </Text>

            {/* Animated Progress Indicator */}
            <View className="mt-8 mb-4 flex-row items-center justify-center space-x-2">
              {[0, 1, 2].map((index) => (
                <Animated.View
                  key={index}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: scheme === "dark" ? "#fff" : "#111",
                    transform: [
                      {
                        scale: pulseValue.interpolate({
                          inputRange: [1, 1.2],
                          outputRange: [1 - index * 0.2, 1.2 - index * 0.2],
                        }),
                      },
                    ],
                    opacity: pulseValue.interpolate({
                      inputRange: [1, 1.2],
                      outputRange: [0.5 + index * 0.25, 1],
                    }),
                  }}
                />
              ))}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* More actions (matches the web action menu; wired in a future release) */}
      <BottomSheet
        visible={showMoreSheet}
        onClose={() => setShowMoreSheet(false)}
        title="More"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {moreActions.map((action) => (
            <View
              key={action.label}
              className="flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 opacity-60"
            >
              <View className="flex-row items-center gap-3 flex-1 mr-2">
                <Feather name={action.icon} size={18} color="#6B7280" />
                <Text className="text-base font-medium text-gray-700 dark:text-gray-200">
                  {action.label}
                </Text>
              </View>
              <View className="bg-gray-100 dark:bg-neutral-800 px-2.5 py-0.5 rounded-full">
                <Text className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                  Soon
                </Text>
              </View>
            </View>
          ))}
          <Text className="text-xs text-gray-400 dark:text-gray-500 px-4 mt-2">
            Management actions arrive in a future update.
          </Text>
        </ScrollView>
      </BottomSheet>
    </View>
  );
};

export default Packages;
