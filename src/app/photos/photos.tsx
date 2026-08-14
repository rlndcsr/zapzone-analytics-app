import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";
import { type ComponentProps } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LocationWorkspaceSelector } from "../../components/ui/LocationWorkspaceSelector";
import { NavTileCard } from "../../components/ui/NavTileCard";
import { getCurrentUser } from "../../lib/session";

type ComponentIconName = ComponentProps<typeof Feather>["name"];

type PhotoNavRow = {
  icon: ComponentIconName;
  title: string;
  desc: string;
  cta: string;
  route: string;
  managerOnly?: boolean;
  pending?: boolean;
};

/** Labels, descriptions and order all follow the web admin's Photos section.
 *  Descriptions are kept to the two lines the square tile shows. */
const NAV_ROWS: PhotoNavRow[] = [
  {
    icon: "camera",
    title: "Take Photos",
    desc: "Capture and send customer photos",
    cta: "Open Camera",
    route: "/photos/capture",
  },
  {
    icon: "image",
    title: "Photo Library",
    desc: "Browse, download and resend",
    cta: "View Library",
    route: "/photos/library",
  },
  {
    icon: "monitor",
    title: "Slideshow Queue",
    desc: "What the venue screen is showing",
    cta: "Manage Queue",
    route: "/photos/slideshow-queue",
  },
  {
    icon: "layers",
    title: "Overlays",
    desc: "Branded frame applied to photos",
    cta: "Manage Overlays",
    route: "/photos/overlays",
    managerOnly: true,
  },
  {
    icon: "send",
    title: "Delivery Log",
    desc: "Every email and SMS photo link",
    cta: "View Log",
    route: "/photos/delivery-log",
  },
  {
    icon: "bar-chart-2",
    title: "Photo Reports",
    desc: "Capture, delivery, QR and kiosk stats",
    cta: "View Reports",
    route: "/photos/reports",
    managerOnly: true,
  },
  {
    icon: "settings",
    title: "Photo Settings",
    desc: "Passcodes, date layer and retention",
    cta: "Open Settings",
    route: "/photos/settings",
    managerOnly: true,
  },
];

export default function PhotosScreen() {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  const role = getCurrentUser()?.role;
  const canManageSubModules =
    role === "company_admin" || role === "location_manager";

  const rows = NAV_ROWS.filter(
    (row) => !row.managerOnly || canManageSubModules,
  );

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <View className="w-full border-b border-gray-100 bg-white px-5 pb-5 pt-12 dark:border-neutral-800 dark:bg-neutral-900">
        <View className="flex-row items-center justify-between">
          <Pressable
            onPress={() => router.back()}
            className="rounded-full bg-gray-100 p-2 dark:bg-neutral-800"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Feather name="chevron-left" size={20} color={headerIcon} />
          </Pressable>
          <Text className="text-lg font-bold text-gray-900 dark:text-white">
            Photos
          </Text>
          <View style={{ width: 36 }} />
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <View className="mt-5 px-5">
          <Text className="mb-5 text-sm text-gray-500 dark:text-gray-400">
            Capture, deliver and display customer photos.
          </Text>

          {/* Global workspace location selector (company-admin only). */}
          <View className="mb-5">
            <LocationWorkspaceSelector />
          </View>

          {/* Sub-page shortcuts — a 2-column grid of square cards. */}
          <View className="-mx-1.5 mb-2 flex-row flex-wrap">
            {rows.map((row) => (
              <View key={row.route} className="mb-3 w-1/2 px-1.5">
                <NavTileCard
                  icon={row.icon}
                  title={row.title}
                  desc={row.desc}
                  cta={row.cta}
                  disabled={row.pending}
                  badge={row.pending ? "Coming soon" : undefined}
                  onPress={() => router.push(row.route as never)}
                />
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
