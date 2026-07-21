import { Feather } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { addContactTag, type ContactRow } from "../../services/contactsService";
import { getToken } from "../../lib/session";
import { BottomSheet } from "./BottomSheet";

/**
 * "Add Tag" sheet — mirrors the web contacts table's add-tag dialog. Free-text
 * input plus one-tap chips for the existing tags the contact doesn't already
 * have. Adds via POST /contacts/{id}/add-tag, then asks the parent to reload.
 */
export function AddTagSheet({
  contact,
  allTags,
  onClose,
  onAdded,
}: {
  /** The contact to tag, or null when the sheet is closed. */
  contact: ContactRow | null;
  /** All known tag names (for the "existing tags" quick-add chips). */
  allTags: string[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  // Reset the input each time the sheet opens for a (new) contact.
  useEffect(() => {
    if (contact) setValue("");
  }, [contact]);

  const existing = contact
    ? allTags.filter((t) => !contact.tags.includes(t)).sort()
    : [];

  const submit = async (raw: string) => {
    const tag = raw.trim();
    if (!contact || !tag) return;
    if (contact.tags.includes(tag)) {
      onClose();
      return;
    }
    const token = getToken();
    if (!token) {
      Alert.alert("Not signed in", "Please sign in again to add tags.");
      return;
    }
    setBusy(true);
    try {
      await addContactTag(token, contact.id, tag);
      onAdded();
      onClose();
    } catch (err) {
      Alert.alert(
        "Could not add tag",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={contact !== null} onClose={onClose} title="Add Tag">
      <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
        {!!contact && (
          <Text className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Add tag to {contact.name}
          </Text>
        )}

        <Text className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">
          Tag Name
        </Text>
        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder="Enter tag name..."
          placeholderTextColor="#9CA3AF"
          autoCapitalize="none"
          editable={!busy}
          onSubmitEditing={() => submit(value)}
          returnKeyType="done"
          className="bg-white dark:bg-neutral-900 rounded-xl px-3.5 py-3 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-neutral-700"
        />

        {existing.length > 0 && (
          <>
            <Text className="text-[11px] text-gray-400 dark:text-gray-500 mt-4 mb-1.5">
              Existing tags (tap to add):
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {existing.map((t) => (
                <Pressable
                  key={t}
                  disabled={busy}
                  onPress={() => submit(t)}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800 active:opacity-70"
                >
                  <Text className="text-xs font-medium text-gray-600 dark:text-gray-300">
                    {t}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {/* Cancel · Add Tag */}
        <View className="flex-row gap-3 mt-6">
          <Pressable
            onPress={onClose}
            disabled={busy}
            className="flex-1 items-center justify-center py-3.5 rounded-xl border border-gray-200 dark:border-neutral-700"
          >
            <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Cancel
            </Text>
          </Pressable>
          <Pressable
            onPress={() => submit(value)}
            disabled={busy || !value.trim()}
            className={`flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl ${
              busy || !value.trim() ? "bg-[#0644C7]/50" : "bg-[#0644C7] active:opacity-90"
            }`}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Feather name="plus" size={16} color="#FFFFFF" />
            )}
            <Text className="text-sm font-semibold text-white">Add Tag</Text>
          </Pressable>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}
