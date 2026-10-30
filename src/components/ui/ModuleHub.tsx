import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";
import { type ComponentProps, type ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { canSwitchLocation } from "../../lib/location/staffLocation";
import { getCurrentUser } from "../../lib/session";
import { LocationWorkspaceSelector } from "./LocationWorkspaceSelector";

type FeatherIconName = ComponentProps<typeof Feather>["name"];

/** For an icon Feather lacks (e.g. the Escape Rooms door); replaces `icon`. */
type RenderIcon = (color: string, size: number) => ReactNode;

export type HubQuickLink = {
  icon: FeatherIconName;
  renderIcon?: RenderIcon;
  label: string;
  route: string;
};

export type HubModule = {
  icon: FeatherIconName;
  renderIcon?: RenderIcon;
  title: string;
  description: string;
  tags: string[];
  /** Flat accent for the icon tile, arrow and CTA — no gradients. */
  accent: string;
  route: string;
};

/** Shortcuts visible at once; any beyond this scroll sideways. */
const MAX_VISIBLE_LINKS = 4;
const LINK_GAP = 8;
const SCREEN_GUTTER = 20;
const LABEL_LINE_HEIGHT = 14;

const QuickLink = ({
  icon,
  renderIcon,
  label,
  route,
  width,
}: HubQuickLink & { width?: number }) => (
  <Pressable
    onPress={() => router.push(route as never)}
    accessibilityRole="button"
    accessibilityLabel={label}
    className={`${width ? "" : "flex-1 "}items-center py-3.5 px-1 rounded-2xl bg-white dark:bg-neutral-900 border border-gray-100 dark:border-neutral-800 active:opacity-70`}
    style={width ? { width } : undefined}
  >
    <View className="w-10 h-10 rounded-full items-center justify-center bg-[#0644C7]/10">
      {renderIcon ? (
        renderIcon("#0644C7", 18)
      ) : (
        <Feather name={icon} size={18} color="#0644C7" />
      )}
    </View>
    {/* A fixed three-line box, text centred, so long labels like "Create
        Special Pricing" show in full and every button is the same height —
        the swipe row doesn't stretch its children to match. */}
    <View
      className="mt-2 w-full justify-center"
      style={{ height: LABEL_LINE_HEIGHT * 3 }}
    >
      <Text
        numberOfLines={3}
        className="text-[11px] font-semibold text-center text-gray-800 dark:text-gray-100"
        style={{ lineHeight: LABEL_LINE_HEIGHT }}
      >
        {label}
      </Text>
    </View>
  </Pressable>
);

const ModuleCard = ({ item }: { item: HubModule }) => (
  <Pressable
    onPress={() => router.push(item.route as never)}
    accessibilityRole="button"
    accessibilityLabel={item.title}
    accessibilityHint={item.description}
    className="flex-1 bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800 active:opacity-70"
    style={{
      minHeight: 230,
      shadowColor: "#424242",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 6,
      elevation: 1,
    }}
  >
    <View className="flex-row items-start justify-between">
      <View
        className="w-12 h-12 rounded-xl items-center justify-center"
        style={{ backgroundColor: `${item.accent}14` }}
      >
        {item.renderIcon ? (
          item.renderIcon(item.accent, 22)
        ) : (
          <Feather name={item.icon} size={22} color={item.accent} />
        )}
      </View>
      <View
        className="w-8 h-8 rounded-full items-center justify-center"
        style={{ backgroundColor: `${item.accent}14` }}
      >
        <Feather name="arrow-up-right" size={16} color={item.accent} />
      </View>
    </View>

    <View className="flex-1 justify-end mt-3">
      <Text
        numberOfLines={2}
        className="text-base font-bold text-gray-900 dark:text-white leading-tight"
      >
        {item.title}
      </Text>
      <Text className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-snug">
        {item.description}
      </Text>
      <View className="flex-row flex-wrap gap-1 mt-2.5">
        {item.tags.map((tag) => (
          <View
            key={tag}
            className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-neutral-800"
          >
            <Text className="text-[10px] font-medium text-gray-600 dark:text-gray-300">
              {tag}
            </Text>
          </View>
        ))}
      </View>
    </View>

    {/* Explicit call to action so it's clear the card opens a screen. */}
    <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
      <Text className="text-xs font-semibold" style={{ color: item.accent }}>
        View details
      </Text>
      <Feather name="chevron-right" size={16} color={item.accent} />
    </View>
  </Pressable>
);

/**
 * A module's landing screen: intro, a row of one-tap shortcuts, then the
 * module cards in a two-column grid stretched to fill the screen. Used by the
 * Attractions and Events hubs; the data screens live behind the cards.
 */
export const ModuleHubScreen = ({
  title,
  heading,
  intro,
  quickLinks,
  modules,
}: {
  title: string;
  heading: string;
  intro: string;
  quickLinks: HubQuickLink[];
  modules: HubModule[];
}) => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  const { width: screenWidth } = useWindowDimensions();
  const user = getCurrentUser();
  const showLocation =
    user?.role === "company_admin" || canSwitchLocation(user);

  // More than four shortcuts: size each so exactly four fit, and swipe for
  // the rest, snapping one shortcut at a time.
  const swipeLinks = quickLinks.length > MAX_VISIBLE_LINKS;
  const linkWidth =
    (screenWidth -
      SCREEN_GUTTER * 2 -
      LINK_GAP * (MAX_VISIBLE_LINKS - 1)) /
    MAX_VISIBLE_LINKS;

  const rows: HubModule[][] = [];
  for (let i = 0; i < modules.length; i += 2) {
    rows.push(modules.slice(i, i + 2));
  }
  const stretchRows = rows.length > 1;

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
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
            {title}
          </Text>
          {/* Spacer keeps the title centred against the back button. */}
          <View className="w-9" />
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: SCREEN_GUTTER,
          paddingTop: 24,
          paddingBottom: insets.bottom + 24,
        }}
      >
        <Text className="text-xs font-semibold uppercase tracking-widest text-[#0644C7] dark:text-blue-400">
          {title}
        </Text>
        <Text className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
          {heading}
        </Text>
        <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
          {intro}
        </Text>

        {/* Global workspace location selector, above the shortcuts. Same
            visibility rule as the selector itself, so users who can't switch
            don't get an empty gap. */}
        {showLocation && (
          <View className="mt-6">
            <LocationWorkspaceSelector />
          </View>
        )}

        {quickLinks.length > 0 && (
          <>
            <View className="flex-row items-center justify-between mt-6 mb-2.5">
              <Text className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Shortcuts
              </Text>
              {swipeLinks && (
                <View className="flex-row items-center gap-1">
                  <Text className="text-[11px] text-gray-400 dark:text-gray-500">
                    Swipe for more
                  </Text>
                  <Feather name="chevrons-right" size={12} color="#9CA3AF" />
                </View>
              )}
            </View>
            {swipeLinks ? (
              // Bleeds to the screen edges so cards scroll out past the gutter.
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={linkWidth + LINK_GAP}
                decelerationRate="fast"
                // ScrollView defaults to flexGrow: 1; without this the row soaks
                // up spare height (e.g. Pricing's single module row) and
                // stretches every shortcut.
                style={{ flexGrow: 0, marginHorizontal: -SCREEN_GUTTER }}
                contentContainerStyle={{
                  paddingHorizontal: SCREEN_GUTTER,
                  gap: LINK_GAP,
                }}
              >
                {quickLinks.map((link) => (
                  <QuickLink key={link.label} {...link} width={linkWidth} />
                ))}
              </ScrollView>
            ) : (
              <View className="flex-row" style={{ gap: LINK_GAP }}>
                {quickLinks.map((link) => (
                  <QuickLink key={link.label} {...link} />
                ))}
              </View>
            )}
          </>
        )}

        <Text className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mt-6 mb-2.5">
          Modules
        </Text>
        {/* Two per row; with two or more rows each row stretches so the cards
            fill the height. A single row keeps its natural height rather than
            turning into two very tall cards. */}
        <View className={stretchRows ? "flex-1" : ""} style={{ gap: 12 }}>
          {rows.map((row) => (
            <View
              key={row[0].route}
              className={stretchRows ? "flex-1 flex-row" : "flex-row"}
              style={{ gap: 12 }}
            >
              {row.map((item) => (
                <ModuleCard key={item.route} item={item} />
              ))}
              {/* An odd last card keeps half width instead of stretching. */}
              {row.length === 1 && <View className="flex-1" />}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};
