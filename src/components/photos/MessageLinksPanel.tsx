import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from "react-native";

import { getToken } from "../../lib/session";
import {
  createMessageLink,
  deleteMessageLink,
  fetchMessageLinks,
  setMessageLinkUrl,
  updateMessageLink,
  type PhotoMessageLink,
  type PhotoMessageLinks,
} from "../../services/photosService";

type Notify = (message: string, type: "success" | "error" | "info") => void;

type LinkDraft = { label: string; defaultUrl: string; urls: Record<number, string> };

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const errorMessage = (e: unknown, fallback: string): string =>
  e instanceof Error && e.message ? e.message : fallback;

const draftFor = (link: PhotoMessageLink): LinkDraft => ({
  label: link.label,
  defaultUrl: link.defaultUrl ?? "",
  urls: Object.fromEntries(link.urls.map((row) => [row.locationId, row.url])),
});

/** Inline code chip for a {{placeholder}}. */
function Code({ children }: { children: string }) {
  return (
    <Text className="rounded bg-gray-100 px-1 text-xs text-gray-700 dark:bg-neutral-800 dark:text-gray-200">
      {children}
    </Text>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  disabled = false,
  url = false,
  maxLength,
}: {
  label?: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  url?: boolean;
  maxLength?: number;
}) {
  return (
    <View>
      {!!label && (
        <Text className="mb-1 text-sm text-gray-700 dark:text-gray-200">{label}</Text>
      )}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        editable={!disabled}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        maxLength={maxLength}
        keyboardType={url ? "url" : "default"}
        autoCapitalize={url ? "none" : "sentences"}
        autoCorrect={!url}
        accessibilityLabel={label}
        className={`rounded-xl border border-gray-100 px-4 py-3.5 text-sm dark:border-neutral-800 ${
          disabled
            ? "bg-gray-50 text-gray-500 dark:bg-neutral-800 dark:text-gray-400"
            : "bg-white text-gray-900 dark:bg-neutral-900 dark:text-white"
        }`}
      />
    </View>
  );
}

function ActionButton({
  label,
  icon,
  onPress,
  loading,
  disabled,
}: {
  label: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  onPress: () => void;
  loading: boolean;
  disabled: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`flex-row items-center justify-center gap-2 self-start rounded-xl bg-[#0644C7] px-4 py-2.5 ${
        disabled ? "opacity-60" : "active:opacity-90"
      }`}
      accessibilityRole="button"
    >
      {loading ? (
        <ActivityIndicator size="small" color="#FFFFFF" />
      ) : (
        <Feather name={icon} size={14} color="#FFFFFF" />
      )}
      <Text className="text-sm font-semibold text-white">{label}</Text>
    </Pressable>
  );
}

/**
 * Photos → Settings "Links for photo messages" (web: components/admin/photos/
 * MessageLinksPanel). Company admins add, rename and remove links; everyone
 * who can open settings sets their own locations' addresses.
 */
export function MessageLinksPanel({
  onNotify,
  onLinksChanged,
}: {
  onNotify: Notify;
  /** Lets the templates list show each link's {{link_…}} placeholder. */
  onLinksChanged: (links: PhotoMessageLink[]) => void;
}) {
  const [data, setData] = useState<PhotoMessageLinks | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, LinkDraft>>({});
  const [busyId, setBusyId] = useState<number | "new" | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");

  const apply = useCallback(
    (next: PhotoMessageLinks) => {
      setData(next);
      setDrafts(Object.fromEntries(next.links.map((link) => [link.id, draftFor(link)])));
      onLinksChanged(next.links);
    },
    [onLinksChanged],
  );

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const result = await fetchMessageLinks(token);
      if (!result) {
        setUnavailable(true);
        return;
      }
      apply(result);
    } catch (e) {
      onNotify(errorMessage(e, "The links could not be loaded."), "error");
    }
  }, [apply, onNotify]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (link: PhotoMessageLink) => {
    const token = getToken();
    const draft = drafts[link.id];
    if (!token || !data || !draft) return;
    setBusyId(link.id);
    try {
      if (
        data.canManageLinks &&
        (draft.label.trim() !== link.label || draft.defaultUrl.trim() !== (link.defaultUrl ?? ""))
      ) {
        await updateMessageLink(token, link.id, {
          label: draft.label.trim(),
          defaultUrl: draft.defaultUrl.trim() || null,
        });
      }
      for (const location of data.locations) {
        const before = link.urls.find((row) => row.locationId === location.id)?.url ?? "";
        const after = (draft.urls[location.id] ?? "").trim();
        if (after !== before) {
          await setMessageLinkUrl(token, link.id, location.id, after || null);
        }
      }
      onNotify(`Saved the ${draft.label.trim() || link.label} link.`, "success");
      await load();
    } catch (e) {
      onNotify(errorMessage(e, "That link could not be saved."), "error");
    } finally {
      setBusyId(null);
    }
  };

  const add = async () => {
    const token = getToken();
    if (!token || !newLabel.trim()) return;
    setBusyId("new");
    try {
      await createMessageLink(token, { label: newLabel.trim(), defaultUrl: newUrl.trim() || null });
      setNewLabel("");
      setNewUrl("");
      onNotify("Link added. Set each location's own address below if it differs.", "success");
      await load();
    } catch (e) {
      onNotify(errorMessage(e, "That link could not be added."), "error");
    } finally {
      setBusyId(null);
    }
  };

  const remove = (link: PhotoMessageLink) => {
    Alert.alert(
      `Remove the ${link.label} link?`,
      `Messages that use {{${link.variable}}} will show nothing in its place.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            const token = getToken();
            if (!token) return;
            setBusyId(link.id);
            try {
              await deleteMessageLink(token, link.id);
              onNotify("Link removed.", "info");
              await load();
            } catch (e) {
              onNotify(errorMessage(e, "That link could not be removed."), "error");
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  };

  if (unavailable) return null;

  return (
    <View
      className="mb-4 rounded-2xl border border-gray-100 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900"
      style={CARD_SHADOW}
    >
      <View className="flex-row items-center gap-2">
        <Feather name="link-2" size={18} color="#6B7280" />
        <Text className="font-semibold text-gray-900 dark:text-white">
          Links for photo messages
        </Text>
      </View>
      <Text className="mb-4 mt-1 text-sm text-gray-600 dark:text-gray-400">
        Add social media and other links once, then give each location its own address. In any
        photo message, <Code>{"{{links}}"}</Code> lists every link the location has, and a
        link&apos;s own name (for example <Code>{"{{link_instagram}}"}</Code>) gives just its
        address. A location without its own address uses the default.
      </Text>

      {data === null ? (
        <Text className="text-sm text-gray-500 dark:text-gray-400">Loading links…</Text>
      ) : (
        <View className="gap-3">
          {data.links.length === 0 && (
            <Text className="text-sm text-gray-500 dark:text-gray-400">No links yet.</Text>
          )}

          {data.links.map((link) => {
            const draft = drafts[link.id] ?? draftFor(link);
            const setDraft = (next: Partial<LinkDraft>) =>
              setDrafts((prev) => ({ ...prev, [link.id]: { ...draft, ...next } }));

            return (
              <View
                key={link.id}
                className="gap-3 rounded-xl border border-gray-100 p-4 dark:border-neutral-800"
              >
                <View className="flex-row flex-wrap items-center justify-between gap-2">
                  <Code>{`{{${link.variable}}}`}</Code>
                  {data.canManageLinks && (
                    <Pressable
                      onPress={() => remove(link)}
                      disabled={busyId !== null}
                      className={`flex-row items-center gap-1 rounded-lg px-2 py-1 ${
                        busyId !== null ? "opacity-40" : "active:opacity-70"
                      }`}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove the ${link.label} link`}
                    >
                      <Feather name="trash-2" size={13} color="#B91C1C" />
                      <Text className="text-xs text-red-700 dark:text-red-400">Remove</Text>
                    </Pressable>
                  )}
                </View>

                <Field
                  label="Name shown in messages"
                  value={draft.label}
                  onChangeText={(v) => setDraft({ label: v })}
                  disabled={!data.canManageLinks}
                  maxLength={80}
                />
                <Field
                  label="Default address"
                  value={draft.defaultUrl}
                  onChangeText={(v) => setDraft({ defaultUrl: v })}
                  disabled={!data.canManageLinks}
                  placeholder="https://"
                  url
                />

                {data.locations.length > 0 && (
                  <View className="gap-2">
                    <Text className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Address for each location
                    </Text>
                    {data.locations.map((location) => (
                      <View key={location.id} className="gap-1">
                        <Text
                          className="text-sm text-gray-700 dark:text-gray-200"
                          numberOfLines={1}
                        >
                          {location.name}
                        </Text>
                        <Field
                          value={draft.urls[location.id] ?? ""}
                          onChangeText={(v) =>
                            setDraft({ urls: { ...draft.urls, [location.id]: v } })
                          }
                          placeholder={
                            draft.defaultUrl ? `Uses the default: ${draft.defaultUrl}` : "https://"
                          }
                          url
                        />
                      </View>
                    ))}
                  </View>
                )}

                <ActionButton
                  label="Save link"
                  icon="save"
                  onPress={() => void save(link)}
                  loading={busyId === link.id}
                  disabled={busyId !== null}
                />
              </View>
            );
          })}

          {data.canManageLinks && data.links.length < data.maxLinks && (
            <View className="gap-3 rounded-xl border border-dashed border-gray-300 p-4 dark:border-neutral-700">
              <Text className="text-sm font-medium text-gray-900 dark:text-white">Add a link</Text>
              <Field
                label="Name, for example Instagram"
                value={newLabel}
                onChangeText={setNewLabel}
                maxLength={80}
              />
              <Field
                label="Default address (optional)"
                value={newUrl}
                onChangeText={setNewUrl}
                placeholder="https://"
                url
              />
              <ActionButton
                label="Add link"
                icon="plus"
                onPress={() => void add()}
                loading={busyId === "new"}
                disabled={busyId !== null || !newLabel.trim()}
              />
            </View>
          )}

          {!data.canManageLinks && (
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              Only company admins can add or rename links. You can set your location&apos;s
              addresses.
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
