import { Pressable, ScrollView, Text, View } from "react-native";
import { suggestEmails } from "../../lib/emailDomains";

export function EmailSuggestions({
  value,
  onSelect,
  suppressed = false,
  extraDomains,
  limit,
  className = "",
}: {
  value: string;
  onSelect: (email: string) => void;
  suppressed?: boolean;
  extraDomains?: string[];
  limit?: number;
  className?: string;
}) {
  const suggestions = suppressed
    ? []
    : suggestEmails(value, { extraDomains, limit });

  if (suggestions.length === 0) return null;

  // A correction means the domain is already wrong rather than half-typed, which
  // is worth saying out loud — the web labels that list the same way.
  const correcting = suggestions.some((s) => s.kind === "correction");

  return (
    <View className={`mt-1.5 ${className}`}>
      {correcting ? (
        <Text className="mb-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
          Did you mean
        </Text>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingRight: 4, gap: 8 }}
        className="-mx-1 px-1"
      >
        {suggestions.map((suggestion) => (
          <Pressable
            key={suggestion.domain}
            onPress={() => onSelect(suggestion.email)}
            accessibilityRole="button"
            accessibilityLabel={`Use ${suggestion.email}`}
            className="rounded-full border border-gray-200 bg-white px-3.5 py-1.5 active:opacity-70 dark:border-neutral-700 dark:bg-neutral-900"
          >
            <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
              @{suggestion.domain}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
