import { Feather } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { COUNTRIES } from "../../lib/countries";
import { BottomSheet } from "./BottomSheet";

const PRIMARY = "#0644C7";

/**
 * Country selector for billing addresses — the sheet equivalent of the web
 * purchase page's type-to-search country field. Filters by name (same
 * `includes` match the web uses) and reports the 2-letter code.
 */
export function CountryPickerSheet({
  visible,
  value,
  onClose,
  onSelect,
}: {
  visible: boolean;
  /** Currently selected 2-letter country code, if any. */
  value: string;
  onClose: () => void;
  onSelect: (code: string) => void;
}) {
  const [search, setSearch] = useState("");

  const results = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return COUNTRIES;
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(term));
  }, [search]);

  const close = () => {
    setSearch("");
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={close} title="Select Country">
      <View className="px-5 pb-3">
        <View className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3 rounded-xl border border-gray-200 dark:border-neutral-700">
          <Feather name="search" size={16} color="#9CA3AF" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Type to search countries..."
            placeholderTextColor="#9CA3AF"
            autoCapitalize="none"
            className="flex-1 text-sm text-gray-900 dark:text-white"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Feather name="x" size={16} color="#9CA3AF" />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView
        className="px-4 pb-6"
        style={{ maxHeight: 360 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {results.length === 0 ? (
          <Text className="text-sm text-gray-400 px-4 py-4 text-center">
            No countries found
          </Text>
        ) : (
          results.map((country) => {
            const isSelected = country.code === value;
            return (
              <Pressable
                key={country.code}
                onPress={() => {
                  onSelect(country.code);
                  setSearch("");
                  onClose();
                }}
                className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
                  isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                }`}
              >
                <Text
                  className={`text-base font-medium flex-1 mr-2 ${
                    isSelected
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-gray-700 dark:text-gray-200"
                  }`}
                  numberOfLines={1}
                >
                  {country.name}
                </Text>
                {isSelected && <Feather name="check" size={16} color={PRIMARY} />}
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </BottomSheet>
  );
}
