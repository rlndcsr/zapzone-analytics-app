import { Feather } from "@expo/vector-icons";
import { Text, View } from "react-native";

/** The amber "Needs review" pill of the web's Returning Customers page. */
export function ReviewBadge() {
  return (
    <View className="flex-row items-center gap-1 self-start rounded-full bg-amber-100 px-2 py-0.5 dark:bg-amber-900/30">
      <Feather name="alert-triangle" size={11} color="#B45309" />
      <Text className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
        Needs review
      </Text>
    </View>
  );
}
