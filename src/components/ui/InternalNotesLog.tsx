import { History, Lock, Pencil, Plus, StickyNote } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { patchCachedBooking } from "../../lib/bookings/bookingListCache";
import { getToken } from "../../lib/session";
import {
  addInternalNote,
  fetchInternalNotes,
  updateInternalNote,
  type InternalNote,
} from "../../services/bookingsService";
import { SheetSelect, type SheetSelectOption } from "./SheetSelect";

const AMBER = "#B45309";
const GRAY = "#6B7280";

const formatWhen = (iso: string | null): string => {
  if (!iso) return "Date unknown";
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "Date unknown";

  return when.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const messageOf = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;

const INPUT_CLASS =
  "rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-gray-900 dark:text-white";

export type InternalNotesLogProps = {
  bookingId: number;
  /** Tighter spacing for the detail sheets, which are already dense. */
  compact?: boolean;
  /**
   * The booking's rebuilt digest, so a caller holding a copy of this booking can refresh its own
   * state the moment a note is saved instead of on the next fetch.
   */
  onNoteSaved?: (summary: string | null) => void;
};

/**
 * A booking's internal log: every note on it, who wrote it and when.
 *
 * Any employee who can open the booking can correct any note — shifts hand over, and whoever spots
 * a mistake is rarely the one who made it. What is permanent is the record, not the wording: the
 * version an edit replaces is kept and shown under the note, and nothing is ever deleted.
 *
 * Two rules the web arrived at the hard way, kept explicit here:
 *
 *  - It reads nothing from the cache. The notes always come from the API, so the log is never shown
 *    from a stale copy of itself.
 *  - It writes to the cache only after a successful save, never when the panel opens. The write is
 *    a MERGE of one field, because the save response describes a note, not a booking — replacing
 *    the cached row with it would blank the name, the date and the package.
 */
export function InternalNotesLog({
  bookingId,
  compact = false,
  onNoteSaved,
}: InternalNotesLogProps) {
  const [notes, setNotes] = useState<InternalNote[]>([]);
  const [categories, setCategories] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [showHistoryFor, setShowHistoryFor] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    (async () => {
      setLoading(true);
      setError(null);

      const token = getToken();
      if (!token) {
        if (active) {
          setError("Not authenticated");
          setLoading(false);
        }
        return;
      }

      try {
        const result = await fetchInternalNotes(
          token,
          bookingId,
          controller.signal,
        );
        if (!active) return;
        setNotes(result.notes);
        setCategories(result.categories);
      } catch {
        if (active) setError("Could not load the notes for this booking.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [bookingId]);

  /**
   * Put the server's own digest everywhere this booking is held: the caller's state, and the
   * cached list row the schedules and Manage Bookings paint from. Without the cache write the note
   * is saved but gone again on the next reload, which reads as the save having failed.
   */
  const publishSummary = useCallback(
    (summary: string | null | undefined) => {
      if (summary === undefined) return;
      onNoteSaved?.(summary);

      try {
        patchCachedBooking(bookingId, { internalNotes: summary });
      } catch {
        // the note is already saved; a stale badge elsewhere is not worth failing the save over
      }
    },
    [bookingId, onNoteSaved],
  );

  const save = async () => {
    const text = body.trim();
    if (!text || saving) return;

    const token = getToken();
    if (!token) {
      setError("Not authenticated");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const { note, summary } = await addInternalNote(
        token,
        bookingId,
        text,
        category || null,
      );
      setNotes((current) => [note, ...current]);
      setBody("");
      setCategory("");
      setAdding(false);
      publishSummary(summary);
    } catch (err) {
      setError(messageOf(err, "The note could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (note: InternalNote) => {
    setEditingId(note.id);
    setEditBody(note.body);
    setEditCategory(note.category ?? "");
    setError(null);
  };

  const saveEdit = async (noteId: number) => {
    const text = editBody.trim();
    if (!text || saving) return;

    const token = getToken();
    if (!token) {
      setError("Not authenticated");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const { note, summary } = await updateInternalNote(
        token,
        bookingId,
        noteId,
        text,
        editCategory || null,
      );
      setNotes((current) => current.map((n) => (n.id === noteId ? note : n)));
      setEditingId(null);
      publishSummary(summary);
    } catch (err) {
      setError(messageOf(err, "The change could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  const categoryOptions: SheetSelectOption[] = Object.entries(categories).map(
    ([value, label]) => ({ value, label }),
  );

  return (
    <View className={compact ? "gap-2" : "gap-3"}>
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-row items-center gap-1.5">
          <StickyNote size={16} color={AMBER} />
          <Text className="text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-200">
            Internal notes
          </Text>
        </View>

        {!adding && (
          <Pressable
            onPress={() => setAdding(true)}
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
            accessibilityRole="button"
            accessibilityLabel="Add internal note"
            className="min-h-[36px] flex-row items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 dark:border-amber-900/50 dark:bg-amber-900/20"
          >
            <Plus size={14} color={AMBER} />
            <Text className="text-xs font-semibold text-amber-800 dark:text-amber-300">
              Add note
            </Text>
          </Pressable>
        )}
      </View>

      <View className="flex-row items-start gap-1.5">
        <View className="pt-0.5">
          <Lock size={12} color={GRAY} />
        </View>
        <Text className="flex-1 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
          Staff only — never shown to the guest. Anyone here can correct a note; the version it
          replaces is kept with their name on it, and nothing is ever deleted.
        </Text>
      </View>

      {adding && (
        <View className="gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/50 dark:bg-amber-900/10">
          <SheetSelect
            title="What is this about?"
            placeholder="What is this about? (optional)"
            value={category || null}
            options={categoryOptions}
            onSelect={(value) => setCategory(String(value))}
          />

          <TextInput
            value={body}
            onChangeText={setBody}
            multiline
            maxLength={5000}
            textAlignVertical="top"
            placeholder="What happened, and anything the next shift needs to know."
            placeholderTextColor="#9CA3AF"
            className={`${INPUT_CLASS} min-h-[88px]`}
          />

          <View className="flex-row items-center justify-end gap-2">
            <Pressable
              onPress={() => {
                setAdding(false);
                setBody("");
                setCategory("");
                setError(null);
              }}
              style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
              className="min-h-[36px] items-center justify-center rounded-lg px-3"
            >
              <Text className="text-xs font-medium text-gray-600 dark:text-gray-300">
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void save()}
              disabled={saving || body.trim() === ""}
              style={({ pressed }) => (pressed ? { opacity: 0.9 } : null)}
              className={`min-h-[36px] flex-row items-center justify-center gap-2 rounded-lg bg-amber-600 px-3 ${
                saving || body.trim() === "" ? "opacity-50" : ""
              }`}
            >
              {saving && <ActivityIndicator size="small" color="#FFFFFF" />}
              <Text className="text-xs font-semibold text-white">
                {saving ? "Saving…" : "Save note"}
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {error && (
        <View className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 dark:border-red-900/50 dark:bg-red-900/20">
          <Text className="text-xs text-red-700 dark:text-red-300">{error}</Text>
        </View>
      )}

      {loading ? (
        <Text className="text-xs text-gray-400 dark:text-gray-500">
          Loading notes…
        </Text>
      ) : notes.length === 0 ? (
        <Text className="text-xs text-gray-400 dark:text-gray-500">
          No internal notes on this booking yet.
        </Text>
      ) : (
        <View className={compact ? "gap-1.5" : "gap-2"}>
          {notes.map((note) => (
            <View
              key={note.id}
              className="rounded-lg border border-gray-200 bg-white p-2.5 dark:border-neutral-700 dark:bg-neutral-900"
            >
              <View className="mb-1 flex-row flex-wrap items-center gap-x-2 gap-y-0.5">
                <Text className="text-xs font-semibold text-gray-900 dark:text-white">
                  {note.employeeName}
                </Text>
                <Text className="text-[11px] text-gray-500 dark:text-gray-400">
                  {formatWhen(note.createdAt)}
                </Text>
                {!!note.categoryLabel && (
                  <View className="rounded-full bg-amber-100 px-1.5 py-px dark:bg-amber-900/40">
                    <Text className="text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                      {note.categoryLabel}
                    </Text>
                  </View>
                )}
                {!!note.editedAt && (
                  <Text className="text-[10px] italic text-gray-400 dark:text-gray-500">
                    edited {formatWhen(note.editedAt)}
                    {note.editedByName ? ` by ${note.editedByName}` : ""}
                  </Text>
                )}

                <View className="ml-auto flex-row items-center gap-1">
                  {note.revisions.length > 0 && (
                    <Pressable
                      onPress={() =>
                        setShowHistoryFor((current) =>
                          current === note.id ? null : note.id,
                        )
                      }
                      style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
                      className="min-h-[28px] flex-row items-center gap-1 rounded px-1.5"
                    >
                      <History size={12} color={GRAY} />
                      <Text className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                        {showHistoryFor === note.id
                          ? "Hide"
                          : `${note.revisions.length} earlier`}
                      </Text>
                    </Pressable>
                  )}
                  {note.canEdit && editingId !== note.id && (
                    <Pressable
                      onPress={() => startEdit(note)}
                      style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
                      className="min-h-[28px] flex-row items-center gap-1 rounded px-1.5"
                    >
                      <Pencil size={12} color={AMBER} />
                      <Text className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                        Edit
                      </Text>
                    </Pressable>
                  )}
                </View>
              </View>

              {editingId === note.id ? (
                <View className="gap-2">
                  <SheetSelect
                    title="What is this about?"
                    placeholder="What is this about? (optional)"
                    value={editCategory || null}
                    options={categoryOptions}
                    onSelect={(value) => setEditCategory(String(value))}
                  />

                  <TextInput
                    value={editBody}
                    onChangeText={setEditBody}
                    multiline
                    maxLength={5000}
                    textAlignVertical="top"
                    placeholderTextColor="#9CA3AF"
                    className={`${INPUT_CLASS} min-h-[88px]`}
                  />

                  <Text className="text-[10px] text-gray-500 dark:text-gray-400">
                    The version you are replacing is kept, with your name on the change.
                  </Text>

                  <View className="flex-row items-center justify-end gap-2">
                    <Pressable
                      onPress={() => {
                        setEditingId(null);
                        setError(null);
                      }}
                      style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
                      className="min-h-[36px] items-center justify-center rounded-lg px-3"
                    >
                      <Text className="text-xs font-medium text-gray-600 dark:text-gray-300">
                        Cancel
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void saveEdit(note.id)}
                      disabled={saving || editBody.trim() === ""}
                      style={({ pressed }) => (pressed ? { opacity: 0.9 } : null)}
                      className={`min-h-[36px] flex-row items-center justify-center gap-2 rounded-lg bg-amber-600 px-3 ${
                        saving || editBody.trim() === "" ? "opacity-50" : ""
                      }`}
                    >
                      {saving && <ActivityIndicator size="small" color="#FFFFFF" />}
                      <Text className="text-xs font-semibold text-white">
                        {saving ? "Saving…" : "Save change"}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Text className="text-sm leading-snug text-gray-700 dark:text-gray-200">
                  {note.body}
                </Text>
              )}

              {showHistoryFor === note.id && note.revisions.length > 0 && (
                <View className="mt-2 gap-1.5 border-l-2 border-gray-200 pl-2.5 dark:border-neutral-700">
                  {note.revisions.map((revision) => (
                    <View key={revision.id}>
                      <Text className="text-[10px] text-gray-500 dark:text-gray-400">
                        Replaced {formatWhen(revision.createdAt)} by{" "}
                        {revision.editedByName ?? "someone"}
                        {revision.categoryLabel
                          ? ` · was ${revision.categoryLabel}`
                          : ""}
                      </Text>
                      <Text className="text-xs leading-snug text-gray-500 line-through dark:text-gray-400">
                        {revision.body}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export default InternalNotesLog;
