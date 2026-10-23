import { Feather } from "@expo/vector-icons";
import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";

import {
  anyTextable,
  isRegistration,
  joinNames,
  longWeekday,
  receivingCount,
  recipientKey,
  sourceLabel,
  textOnlyRecipients,
} from "../../lib/photos/photoRecipients";
import { getToken } from "../../lib/session";
import {
  searchPhotoPeople,
  searchPhotoWaivers,
  type PhotoPeopleSearchResult,
  type PhotoRecipientMatch,
} from "../../services/photosService";

const MIN_QUERY = 2;
const MAX_QUERY = 120;

const errorMessage = (e: unknown, fallback: string): string =>
  e instanceof Error && e.message ? e.message : fallback;

/** Chip tones, matching the web picker's pills. */
const CHIP_TONES = {
  registration: {
    wrap: "bg-blue-100 dark:bg-blue-900/30",
    text: "text-blue-800 dark:text-blue-300",
  },
  waiver: {
    wrap: "bg-sky-100 dark:bg-sky-900/30",
    text: "text-sky-800 dark:text-sky-300",
  },
  amber: {
    wrap: "bg-amber-100 dark:bg-amber-900/30",
    text: "text-amber-800 dark:text-amber-300",
  },
  gray: {
    wrap: "bg-gray-100 dark:bg-neutral-800",
    text: "text-gray-700 dark:text-gray-300",
  },
  red: {
    wrap: "bg-red-100 dark:bg-red-900/30",
    text: "text-red-800 dark:text-red-300",
  },
  muted: {
    wrap: "bg-gray-200 dark:bg-neutral-700",
    text: "text-gray-700 dark:text-gray-200",
  },
} as const;

function Chip({
  label,
  tone,
  icon,
}: {
  label: string;
  tone: keyof typeof CHIP_TONES;
  icon?: React.ComponentProps<typeof Feather>["name"];
}) {
  const style = CHIP_TONES[tone];
  return (
    <View className={`flex-row items-center gap-1 rounded-full px-2 py-0.5 ${style.wrap}`}>
      {icon ? <Feather name={icon} size={11} color="#6B7280" /> : null}
      <Text className={`text-[11px] ${style.text}`}>{label}</Text>
    </View>
  );
}

function CheckBox({ checked }: { checked: boolean }) {
  return (
    <View
      className={`h-5 w-5 items-center justify-center rounded border-2 ${
        checked
          ? "border-[#0644C7] bg-[#0644C7]"
          : "border-gray-300 dark:border-neutral-600"
      }`}
    >
      {checked && <Feather name="check" size={13} color="#FFFFFF" />}
    </View>
  );
}

type Section = { key: string; title: string; rows: PhotoRecipientMatch[] };

/**
 * The one guest picker for sending a photo (web: components/admin/photos/
 * RecipientPicker): waivers plus the event registrants whose event runs on, or
 * a day either side of, the photo's operating day at its location.
 */
export function RecipientPicker({
  photoSessionId,
  locationId,
  variant,
  selected,
  onSelectedChange,
  textRegistrants,
  onTextRegistrantsChange,
  onError,
  heading,
}: {
  /** The session the photo belongs to; null searches waivers only. */
  photoSessionId: number | null;
  locationId: number | null;
  /** "capture" lists today's registrations; "library" the photo's own day. */
  variant: "capture" | "library";
  selected: PhotoRecipientMatch[];
  onSelectedChange: (next: PhotoRecipientMatch[]) => void;
  textRegistrants: boolean;
  onTextRegistrantsChange: (value: boolean) => void;
  onError: (message: string) => void;
  heading?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PhotoPeopleSearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const searchSeq = useRef(0);

  const term = query.trim();

  const runSearch = useCallback(async () => {
    const token = getToken();
    if (term.length < MIN_QUERY || !token) return;
    const seq = ++searchSeq.current;
    setSearching(true);
    setSearched(false);
    try {
      const found =
        photoSessionId != null
          ? await searchPhotoPeople(token, term, photoSessionId, locationId)
          : {
              referenceDay: null,
              waivers: (await searchPhotoWaivers(token, term, locationId)).map((row) => ({
                ...row,
                kind: "waiver" as const,
              })),
              registrations: [],
            };
      if (seq !== searchSeq.current) return;
      setResults(found);
      setSearched(true);
    } catch (e) {
      if (seq === searchSeq.current) onError(errorMessage(e, "The search failed."));
    } finally {
      if (seq === searchSeq.current) setSearching(false);
    }
  }, [locationId, onError, photoSessionId, term]);

  const selectedKeys = useMemo(() => new Set(selected.map(recipientKey)), [selected]);

  const toggle = useCallback(
    (row: PhotoRecipientMatch) => {
      const key = recipientKey(row);
      const next = selectedKeys.has(key)
        ? selected.filter((item) => recipientKey(item) !== key)
        : [...selected, row];
      onSelectedChange(next);
      // Nobody left who could be texted, so the opt-in can't stay on.
      if (!anyTextable(next)) onTextRegistrantsChange(false);
    },
    [onSelectedChange, onTextRegistrantsChange, selected, selectedKeys],
  );

  const sections = useMemo<Section[]>(() => {
    if (!results) return [];
    const list: Section[] = [
      {
        key: "photo-day",
        title: variant === "capture" ? "Today's event registrations" : "Event registrations on the photo's day",
        rows: results.registrations.filter((row) => row.coversPhotoDay),
      },
      { key: "waivers", title: "Waivers", rows: results.waivers },
      {
        key: "other-days",
        title: "Other event registrations",
        rows: results.registrations.filter((row) => !row.coversPhotoDay),
      },
    ];
    return list.filter((section) => section.rows.length > 0);
  }, [results, variant]);

  const photoDay = variant === "capture" ? "Today" : "Photo day";
  const matchCount = results ? results.waivers.length + results.registrations.length : 0;
  const receiving = receivingCount(selected, textRegistrants);
  const textable = anyTextable(selected);
  const textOnly = textOnlyRecipients(selected);
  const canSearch = term.length >= MIN_QUERY && !searching;

  const renderRow = (row: PhotoRecipientMatch) => {
    const key = recipientKey(row);
    const checked = selectedKeys.has(key);
    return (
      <Pressable
        key={key}
        onPress={() => row.contactable && toggle(row)}
        disabled={!row.contactable}
        className={`mb-2 flex-row items-start gap-3 rounded-xl border p-3 ${
          row.contactable
            ? checked
              ? "border-[#0644C7] bg-blue-50/60 dark:bg-blue-900/20"
              : "border-gray-200 dark:border-neutral-700"
            : "border-gray-200 bg-gray-50 dark:border-neutral-800 dark:bg-neutral-800/40"
        }`}
        accessibilityRole="checkbox"
        accessibilityState={{ checked, disabled: !row.contactable }}
      >
        <View className="mt-0.5">
          <CheckBox checked={checked} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-medium text-gray-900 dark:text-white">{row.name}</Text>
          <Text className="text-xs text-gray-500 dark:text-gray-400">
            {row.emailMasked || "no email"} · {row.phoneMasked || "no phone"}
          </Text>
          <View className="mt-1.5 flex-row flex-wrap gap-1">
            <Chip
              label={sourceLabel(row, photoDay)}
              tone={isRegistration(row) ? "registration" : "waiver"}
            />
            {!!row.unavailableReason && <Chip label={row.unavailableReason} tone="amber" />}
            {row.hasEmail && <Chip label="email" tone="gray" icon="mail" />}
            {row.hasPhone && <Chip label="SMS" tone="gray" icon="message-square" />}
            {row.photoVideoConsent === false && (
              <Chip label="declined the photo release" tone="red" />
            )}
            {row.photoVideoConsent === null && (
              <Chip label="photo release never asked" tone="muted" />
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View>
      {!!heading && (
        <Text className="mb-3 font-bold text-gray-900 dark:text-white">{heading}</Text>
      )}

      <View className="mb-4 flex-row items-center gap-2">
        <View className="h-12 flex-1 flex-row items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 dark:border-neutral-700 dark:bg-neutral-900">
          <Feather name="search" size={16} color="#9CA3AF" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => void runSearch()}
            returnKeyType="search"
            maxLength={MAX_QUERY}
            placeholder="Name, phone or email"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Search by name, phone or email"
            className="flex-1 text-sm text-gray-900 dark:text-white"
            style={{ paddingVertical: 0 }}
          />
        </View>
        <Pressable
          onPress={() => void runSearch()}
          disabled={!canSearch}
          className={`h-12 items-center justify-center rounded-xl bg-[#0644C7] px-5 active:opacity-90 ${
            canSearch ? "" : "opacity-60"
          }`}
          accessibilityRole="button"
        >
          {searching ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text className="text-sm font-semibold text-white">Search</Text>
          )}
        </Pressable>
      </View>

      {searched && matchCount === 0 && (
        <Text className="py-4 text-sm text-gray-500 dark:text-gray-400">
          No waivers or event registrations matched.
          {results?.referenceDay
            ? ` Event registrations are listed for ${longWeekday(results.referenceDay)} (±1 day).`
            : ""}
        </Text>
      )}

      {sections.map((section) => (
        <View key={section.key} className="mb-2">
          <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {section.title} ({section.rows.length})
          </Text>
          {section.rows.map(renderRow)}
        </View>
      ))}

      {selected.length > 0 && (
        <View className="mt-2 border-t border-gray-100 pt-4 dark:border-neutral-800">
          <Text className="mb-2 text-sm font-medium text-gray-900 dark:text-white">
            {selected.length} selected
            {receiving !== selected.length && (
              <Text className="font-normal text-gray-600 dark:text-gray-400">
                {` · ${receiving} will receive the link`}
              </Text>
            )}
          </Text>
          <View className="flex-row flex-wrap gap-2" accessibilityLabel="Selected people">
            {selected.map((row) => (
              <Pressable
                key={recipientKey(row)}
                onPress={() => toggle(row)}
                className="max-w-full flex-row items-center gap-1.5 rounded-full bg-gray-100 py-1.5 pl-3 pr-2.5 dark:bg-neutral-800"
                accessibilityRole="button"
                accessibilityLabel={`Remove ${row.name}`}
              >
                <Text className="shrink text-sm text-gray-800 dark:text-gray-200" numberOfLines={1}>
                  {row.name}
                </Text>
                <Text className="text-xs text-gray-500 dark:text-gray-400">
                  {isRegistration(row) ? "registration" : "waiver"}
                </Text>
                <Feather name="x" size={14} color="#6B7280" />
              </Pressable>
            ))}
          </View>

          {textable && (
            <Pressable
              onPress={() => onTextRegistrantsChange(!textRegistrants)}
              className="mt-3 flex-row items-start gap-3 rounded-xl border border-gray-200 p-3 dark:border-neutral-700"
              accessibilityRole="checkbox"
              accessibilityState={{ checked: textRegistrants }}
            >
              <View className="mt-0.5">
                <CheckBox checked={textRegistrants} />
              </View>
              <Text className="flex-1 text-sm text-gray-800 dark:text-gray-200">
                Also text the selected event registrations (only if the guest asked for a text)
              </Text>
            </Pressable>
          )}

          {!textRegistrants && textOnly.length > 0 && (
            <View className="mt-3 flex-row items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/40 dark:bg-amber-900/20">
              <Feather name="alert-triangle" size={14} color="#B45309" style={{ marginTop: 2 }} />
              <Text className="flex-1 text-sm text-amber-900 dark:text-amber-300">
                {joinNames(textOnly.map((row) => row.name))}{" "}
                {textOnly.length === 1 ? "is" : "are"} only reachable by text. Tick
                {" “Also text…” "}to send.
              </Text>
            </View>
          )}

          <Text className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            Waivers and registrations that share an email or mobile number are recorded individually
            but only sent once.
          </Text>
        </View>
      )}
    </View>
  );
}
