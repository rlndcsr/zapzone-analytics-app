import { Feather } from "@expo/vector-icons";
import { Pressable, View } from "react-native";

const PRIMARY = "#0644C7";

/** Subtle lift for the active segment of the layout toggle. */
const TOGGLE_ACTIVE_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.08,
  shadowRadius: 2,
  elevation: 1,
} as const;

/** Presentation layout for a catalog list. Table is the default everywhere. */
export type ViewMode = "table" | "cards";

/**
 * Compact segmented Table / Cards switch shown on a list header row. Shared by
 * the Attractions and Bookings screens so the toggle looks and behaves
 * identically across the app.
 */
export function ViewToggle({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  return (
    <View className="flex-row items-center bg-gray-100 dark:bg-neutral-800 rounded-xl p-1">
      {(["table", "cards"] as const).map((m) => {
        const active = mode === m;
        return (
          <Pressable
            key={m}
            onPress={() => onChange(m)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={m === "table" ? "Table view" : "Card view"}
            className={`px-3 py-1.5 rounded-lg ${
              active ? "bg-white dark:bg-neutral-700" : ""
            }`}
            style={active ? TOGGLE_ACTIVE_SHADOW : undefined}
          >
            <Feather
              name={m === "table" ? "list" : "grid"}
              size={16}
              color={active ? PRIMARY : "#9CA3AF"}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
