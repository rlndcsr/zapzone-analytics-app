import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "../../components/ui/BottomSheet";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  createGlobalNote,
  deleteGlobalNote,
  fetchGlobalNotes,
  toggleGlobalNoteStatus,
  updateGlobalNote,
  type GlobalNote,
} from "../../services/globalNotesService";
import { fetchPackages, type PackageRow } from "../../services/packagesService";

const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const inputClass =
  "border border-gray-200 dark:border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-white bg-white dark:bg-neutral-900";

type FormState = {
  id: number | null;
  title: string;
  content: string;
  isActive: boolean;
  global: boolean;
  packageIds: number[];
};

const emptyForm = (): FormState => ({
  id: null,
  title: "",
  content: "",
  isActive: true,
  global: true,
  packageIds: [],
});

const GlobalNotesScreen = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  const [notes, setNotes] = useState<GlobalNote[]>([]);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    const token = getToken();
    if (!token) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const [n, p] = await Promise.all([
        fetchGlobalNotes(token, signal),
        fetchPackages({ token, userId: getCurrentUser()?.id }).catch(() => []),
      ]);
      setNotes(n);
      setPackages(p);
    } catch (e) {
      if (signal?.aborted) return;
      setError(e instanceof Error ? e.message : "Failed to load global notes.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const openCreate = () => {
    setForm(emptyForm());
    setFormOpen(true);
  };

  const openEdit = (note: GlobalNote) => {
    setForm({
      id: note.id,
      title: note.title,
      content: note.content,
      isActive: note.isActive,
      global: note.packageIds.length === 0,
      packageIds: note.packageIds,
    });
    setFormOpen(true);
  };

  const togglePackage = (id: number) =>
    setForm((f) => ({
      ...f,
      packageIds: f.packageIds.includes(id)
        ? f.packageIds.filter((x) => x !== id)
        : [...f.packageIds, id],
    }));

  const save = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    const content = form.content.trim();
    if (!content) {
      Alert.alert("Content required", "Please enter the note content.");
      return;
    }
    if (!form.global && form.packageIds.length === 0) {
      Alert.alert(
        "Select packages",
        "Choose at least one package, or switch to a global note.",
      );
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim() || undefined,
        content,
        is_active: form.isActive,
        package_ids: form.global ? [] : form.packageIds,
      };
      if (form.id != null) {
        await updateGlobalNote(token, form.id, payload);
      } else {
        await createGlobalNote(token, payload);
      }
      setFormOpen(false);
      await load();
    } catch (e) {
      Alert.alert(
        "Save failed",
        e instanceof Error ? e.message : "Could not save the note.",
      );
    } finally {
      setSaving(false);
    }
  }, [form, load]);

  const toggleStatus = useCallback(
    async (note: GlobalNote) => {
      const token = getToken();
      if (!token) return;
      setBusyId(note.id);
      try {
        await toggleGlobalNoteStatus(token, note.id);
        setNotes((prev) =>
          prev.map((n) =>
            n.id === note.id ? { ...n, isActive: !n.isActive } : n,
          ),
        );
      } catch (e) {
        Alert.alert(
          "Update failed",
          e instanceof Error ? e.message : "Could not update the note.",
        );
      } finally {
        setBusyId(null);
      }
    },
    [],
  );

  const confirmDelete = useCallback(
    (note: GlobalNote) => {
      Alert.alert("Delete note", `Delete "${note.title || "this note"}"?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const token = getToken();
            if (!token) return;
            setBusyId(note.id);
            try {
              await deleteGlobalNote(token, note.id);
              setNotes((prev) => prev.filter((n) => n.id !== note.id));
            } catch (e) {
              Alert.alert(
                "Delete failed",
                e instanceof Error ? e.message : "Could not delete the note.",
              );
            } finally {
              setBusyId(null);
            }
          },
        },
      ]);
    },
    [],
  );

  const scopeLabel = (note: GlobalNote) =>
    note.packageIds.length === 0
      ? "All packages"
      : note.packageNames.length > 0
        ? note.packageNames.join(", ")
        : `${note.packageIds.length} package(s)`;

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header */}
      <View
        className="bg-white dark:bg-neutral-900 px-5 pb-4 border-b border-gray-100 dark:border-neutral-800"
        style={{ paddingTop: insets.top + 12 }}
      >
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            className="rounded-full bg-gray-100 dark:bg-neutral-800 p-2"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Feather name="chevron-left" size={20} color={headerIcon} />
          </Pressable>
          <View className="flex-1">
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Global Notes
            </Text>
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              Customer-facing notes shown during booking
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <Pressable
          onPress={openCreate}
          className="flex-row items-center justify-center gap-2 bg-[#0644C7] py-3.5 rounded-xl active:opacity-90 mb-4"
        >
          <Feather name="plus" size={16} color="#FFFFFF" />
          <Text className="text-sm font-semibold text-white">Add Note</Text>
        </Pressable>

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
        ) : notes.length === 0 ? (
          <View className="items-center py-16">
            <Feather name="file-text" size={40} color="#D1D5DB" />
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-3">
              No global notes yet
            </Text>
          </View>
        ) : (
          notes.map((note) => (
            <View
              key={note.id}
              className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3 border border-gray-100 dark:border-neutral-800"
              style={CARD_SHADOW}
            >
              <View className="flex-row items-start justify-between">
                <View className="flex-1 mr-2">
                  {!!note.title && (
                    <Text className="text-base font-bold text-gray-900 dark:text-white">
                      {note.title}
                    </Text>
                  )}
                  <Text
                    className="text-sm text-gray-700 dark:text-gray-200 mt-0.5"
                    numberOfLines={3}
                  >
                    {note.content}
                  </Text>
                </View>
                <Pressable
                  onPress={() => toggleStatus(note)}
                  disabled={busyId === note.id}
                  className={`flex-row items-center gap-1 px-2.5 py-1 rounded-full ${
                    note.isActive
                      ? "bg-green-50 dark:bg-green-900/30"
                      : "bg-gray-100 dark:bg-neutral-800"
                  }`}
                >
                  {busyId === note.id ? (
                    <ActivityIndicator
                      size="small"
                      color={note.isActive ? "#16A34A" : "#9CA3AF"}
                    />
                  ) : (
                    <Feather
                      name="power"
                      size={11}
                      color={note.isActive ? "#16A34A" : "#9CA3AF"}
                    />
                  )}
                  <Text
                    className={`text-xs font-semibold ${
                      note.isActive
                        ? "text-green-600 dark:text-green-400"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    {note.isActive ? "Active" : "Inactive"}
                  </Text>
                </Pressable>
              </View>

              <View className="flex-row items-center gap-1.5 mt-3">
                <Feather
                  name={note.packageIds.length === 0 ? "globe" : "package"}
                  size={13}
                  color="#9CA3AF"
                />
                <Text
                  className="text-xs text-gray-500 dark:text-gray-400 flex-1"
                  numberOfLines={1}
                >
                  {scopeLabel(note)}
                </Text>
              </View>

              <View className="flex-row items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
                <Pressable
                  onPress={() => openEdit(note)}
                  className="flex-row items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 dark:bg-neutral-800 active:opacity-70"
                >
                  <Feather name="edit-2" size={14} color="#6B7280" />
                  <Text className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                    Edit
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => confirmDelete(note)}
                  className="flex-row items-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/30 active:opacity-70"
                >
                  <Feather name="trash-2" size={14} color="#EF4444" />
                  <Text className="text-xs font-semibold text-red-600">
                    Delete
                  </Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Create / edit form */}
      <BottomSheet
        visible={formOpen}
        onClose={() => (saving ? undefined : setFormOpen(false))}
        title={form.id != null ? "Edit Note" : "Add Note"}
      >
        <ScrollView
          className="px-5"
          contentContainerStyle={{ paddingBottom: 28 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-4 pt-2">
            <View>
              <Text className="mb-1.5 text-xs font-medium text-gray-600 dark:text-gray-300">
                Title (optional)
              </Text>
              <TextInput
                value={form.title}
                onChangeText={(v) => setForm((f) => ({ ...f, title: v }))}
                placeholder="e.g. Processing fee notice"
                placeholderTextColor="#9CA3AF"
                className={inputClass}
              />
            </View>
            <View>
              <Text className="mb-1.5 text-xs font-medium text-gray-600 dark:text-gray-300">
                Content *
              </Text>
              <TextInput
                value={form.content}
                onChangeText={(v) => setForm((f) => ({ ...f, content: v }))}
                placeholder="Note shown to the customer…"
                placeholderTextColor="#9CA3AF"
                multiline
                textAlignVertical="top"
                className={`${inputClass} min-h-[90px]`}
              />
            </View>

            <View className="flex-row items-center justify-between">
              <Text className="text-sm text-gray-700 dark:text-gray-200">
                Active
              </Text>
              <Switch
                value={form.isActive}
                onValueChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                trackColor={{ true: PRIMARY }}
              />
            </View>

            <View className="flex-row items-center justify-between">
              <View className="flex-1 mr-3">
                <Text className="text-sm text-gray-700 dark:text-gray-200">
                  Apply to all packages
                </Text>
                <Text className="text-[11px] text-gray-400 dark:text-gray-500">
                  Off to target specific packages
                </Text>
              </View>
              <Switch
                value={form.global}
                onValueChange={(v) => setForm((f) => ({ ...f, global: v }))}
                trackColor={{ true: PRIMARY }}
              />
            </View>

            {!form.global && (
              <View>
                <Text className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">
                  Packages ({form.packageIds.length} selected)
                </Text>
                <View className="rounded-xl border border-gray-200 dark:border-neutral-700 overflow-hidden">
                  {packages.length === 0 ? (
                    <Text className="text-sm text-gray-400 px-4 py-3">
                      No packages available.
                    </Text>
                  ) : (
                    packages.map((p, i) => {
                      const on = form.packageIds.includes(p.id);
                      return (
                        <Pressable
                          key={p.id}
                          onPress={() => togglePackage(p.id)}
                          className={`flex-row items-center gap-3 px-4 py-3 ${
                            i < packages.length - 1
                              ? "border-b border-gray-100 dark:border-neutral-800"
                              : ""
                          }`}
                        >
                          <View
                            className={`w-5 h-5 rounded border items-center justify-center ${
                              on
                                ? "bg-[#0644C7] border-[#0644C7]"
                                : "border-gray-300 dark:border-neutral-600"
                            }`}
                          >
                            {on && (
                              <Feather name="check" size={13} color="#FFFFFF" />
                            )}
                          </View>
                          <Text
                            className="text-sm text-gray-800 dark:text-gray-100 flex-1"
                            numberOfLines={1}
                          >
                            {p.name}
                          </Text>
                        </Pressable>
                      );
                    })
                  )}
                </View>
              </View>
            )}

            <Pressable
              onPress={save}
              disabled={saving}
              className={`mt-2 h-12 rounded-xl items-center justify-center flex-row gap-2 ${
                saving ? "bg-[#0644C7]/60" : "bg-[#0644C7]"
              }`}
            >
              {saving && <ActivityIndicator color="#FFFFFF" size="small" />}
              <Text className="text-white font-semibold text-base">
                {form.id != null ? "Save Changes" : "Add Note"}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </BottomSheet>
    </View>
  );
};

export default GlobalNotesScreen;
