import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Text, TextInput, View } from "react-native";

import { toKey } from "../../lib/date/calendar";
import { venueToday } from "../../lib/date/venueTime";
import {
  promoOfferLabel,
  promoOptionLabel,
  promoProblems,
  promoScopeLine,
  type SharedPromo,
  type VisitActivityFilter,
  VISIT_COMPLETED_TIMING_NOTE,
} from "../../lib/email/visitEmail";
import { getToken } from "../../lib/session";
import type { EmailPromoSummary, VisitEmailOverride } from "../../services/emailService";
import { fetchSharedPromoCodes } from "../../services/promosService";
import { EmailSection } from "./EmailComposerKit";
import { SelectField, type SelectOption } from "./FormControls";

const inputClass =
  "rounded-xl px-3.5 py-2.5 border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800 text-sm text-gray-900 dark:text-white";

function Hint({ children }: { children: React.ReactNode }) {
  return <Text className="text-xs text-gray-500 dark:text-gray-400 mt-1">{children}</Text>;
}

function FieldTitle({ children }: { children: React.ReactNode }) {
  return <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">{children}</Text>;
}

const ACTIVITY_OPTIONS: SelectOption[] = [
  { label: "Every activity", value: "" },
  { label: "Escape rooms only", value: "escape_room" },
  { label: "Everything except escape rooms", value: "not_escape_room" },
];

/** Return-visit promo picker — shared codes only (web PromoCodePicker). */
function PromoCodePicker({
  value,
  onChange,
  locationId,
  locations,
  summary,
  disabled,
}: {
  value: number | null;
  onChange: (promoId: number | null) => void;
  locationId: number | null;
  locations: { id: number; name: string }[];
  summary: EmailPromoSummary | null;
  disabled: boolean;
}) {
  const [promos, setPromos] = useState<SharedPromo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const controller = new AbortController();
    fetchSharedPromoCodes(token, controller.signal)
      .then(setPromos)
      .catch(() => setLoadError("Promo codes could not be loaded. Reload the page to try again."))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const selected = useMemo(() => promos.find((p) => p.id === value) ?? null, [promos, value]);
  const problems = selected
    ? promoProblems(selected, locationId, locations, toKey(venueToday()))
    : summary?.problem
      ? [summary.problem]
      : [];
  const missingSelection = value !== null && !loading && !selected;
  const savedTerms = summary && selected && summary.id === selected.id ? (summary.terms ?? "") : "";

  const options: SelectOption[] = [
    { label: loading ? "Loading promo codes…" : "No promo code", value: "" },
    ...(missingSelection
      ? [{ label: `${summary?.code ?? `Promo #${value}`} (not in the list)`, value: value ?? "" }]
      : []),
    ...promos.map((p) => ({ label: promoOptionLabel(p), value: p.id })),
  ];

  return (
    <View className="gap-3">
      <View>
        <FieldTitle>Return-visit promo code</FieldTitle>
        <Text className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          Guests see this code as a thank-you for their next visit. Change it here whenever you like; each email uses the code chosen when it is sent.
        </Text>
        <SelectField
          value={value ?? ""}
          options={options}
          disabled={disabled || loading}
          onSelect={(v) => onChange(v === "" ? null : Number(v))}
        />
        {!!loadError && <Text className="text-xs text-red-600 dark:text-red-400 mt-1">{loadError}</Text>}
      </View>

      {selected && (
        <View className="flex-row items-start gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/20">
          <Feather name="tag" size={15} color="#B45309" style={{ marginTop: 2 }} />
          <View className="flex-1 gap-0.5">
            <Text className="text-sm text-amber-900 dark:text-amber-200">
              <Text className="font-semibold">{selected.code}</Text> · {promoOfferLabel(selected)}
              {selected.name ? ` · ${selected.name}` : ""}
            </Text>
            <Text className="text-xs text-amber-800 dark:text-amber-300">
              {promoScopeLine(selected, locations)}
            </Text>
            {selected.itemLimited && (
              <Text className="text-xs text-amber-800 dark:text-amber-300">
                {savedTerms || "Works only on some packages, attractions or events."} The email tells guests where the code works.
              </Text>
            )}
          </View>
        </View>
      )}

      {selected && selected.locationIds.length > 0 && !locationId && (
        <Text className="text-xs text-gray-600 dark:text-gray-300">
          This email goes to guests of every location, but the code only works at some of them. Guests of the other locations get the email without a code.
        </Text>
      )}

      {problems.map((problem) => (
        <View key={problem} className="flex-row items-start gap-2">
          <Feather name="alert-triangle" size={13} color="#92400E" style={{ marginTop: 1 }} />
          <Text className="flex-1 text-xs text-amber-800 dark:text-amber-300">{problem}</Text>
        </View>
      ))}

      <Text className="text-xs text-gray-500 dark:text-gray-400">
        Codes from a bulk batch are not listed because each works only once. Create or edit codes under{" "}
        <Text className="underline" onPress={() => router.push("/packages/promos")}>
          Promo Codes
        </Text>
        .
      </Text>
    </View>
  );
}

type Props = {
  triggerType: string;
  promoId: number | null;
  onPromoChange: (promoId: number | null) => void;
  locationId: number | null;
  locations: { id: number; name: string }[];
  promoSummary?: EmailPromoSummary | null;
  disabled?: boolean;
  fromName: string;
  onFromNameChange: (value: string) => void;
  reviewUrl: string;
  onReviewUrlChange: (value: string) => void;
  activityFilter: VisitActivityFilter | null;
  onActivityFilterChange: (value: VisitActivityFilter | null) => void;
  canFilterActivity: boolean;
  overrides?: VisitEmailOverride[];
};

/**
 * The Visit Completed / Visit Follow-up sections of the notification form —
 * web components/admin/email/VisitEmailSettings.tsx. The per-location
 * "Public review links" panel is not ported: no lightweight endpoint returns
 * `review_url`, and the full locations list is too heavy for the app.
 */
export function VisitEmailSettings({
  triggerType,
  promoId,
  onPromoChange,
  locationId,
  locations,
  promoSummary = null,
  disabled = false,
  fromName,
  onFromNameChange,
  reviewUrl,
  onReviewUrlChange,
  activityFilter,
  onActivityFilterChange,
  canFilterActivity,
  overrides = [],
}: Props) {
  const isThanks = triggerType === "visit_completed";
  const replacedEverywhere = overrides.find((o) => o.covers_everything);

  return (
    <>
      <EmailSection title="How this email is sent">
        <View className="gap-3">
          {isThanks ? (
            <>
              <Text className="text-sm text-gray-700 dark:text-gray-200">
                Goes to each guest as soon as staff mark the visit complete: Complete &amp; Send on the escape-room game screen (with the group photo and finish time), Result only when staff choose to email the players, or setting a party booking or an event purchase to Completed. It is never sent from checkout, check-in or imports, and each guest gets it once per visit.
              </Text>
              <Text className="text-sm text-gray-700 dark:text-gray-200">
                {VISIT_COMPLETED_TIMING_NOTE}
              </Text>
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                Party bookings include the group photo only when staff sent that party&apos;s photo from the photo library to the party&apos;s waivers. Event purchases never include a photo.
              </Text>
            </>
          ) : (
            <Text className="text-sm text-gray-700 dark:text-gray-200">
              Goes out automatically the number of hours set above after staff mark the visit complete, to the same guests. An email that would land between 8 PM and 9 AM waits until 9 AM. Each guest is asked at most once every 30 days and can unsubscribe, and a rating of 2 stars or fewer alerts the location in Notifications.
            </Text>
          )}
          <Text className="text-sm text-gray-700 dark:text-gray-200">
            <Text className="font-medium">Recipients:</Text> the guests of the visit. That is the booker for parties and events, and every player with an email address on their waiver for escape-room games. Guests who unsubscribed, withdrew marketing consent on their waiver or are marked inactive in Contacts get no review requests and no offers.
          </Text>
          <Text className="text-xs text-gray-500 dark:text-gray-400">
            When more than one active email of this kind fits a visit, only the most specific one is sent: an email aimed at particular packages or events first, then one limited to escape rooms (or to everything except escape rooms), then one for all packages or all events, then one for every visit. A location&apos;s own email beats a company-wide one at the same level, and a copy beats the default when they are equal. Duplicate the default to give one brand, location or activity its own version.
          </Text>
        </View>
      </EmailSection>

      {overrides.length > 0 && (
        <View className="mb-4 gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/40 dark:bg-amber-900/20">
          <View className="flex-row items-center gap-2">
            <Feather name="alert-triangle" size={18} color="#B45309" />
            <Text className="flex-1 text-base font-semibold text-amber-900 dark:text-amber-200">
              {replacedEverywhere ? "This email is never sent" : "Other emails are sent instead for some visits"}
            </Text>
          </View>
          {replacedEverywhere && (
            <Text className="text-sm text-amber-900 dark:text-amber-200">
              {`“${replacedEverywhere.name}” is active and covers every visit this one does, so guests get that one. Switch one of them off, or narrow one of them to a location or activity.`}
            </Text>
          )}
          <OverrideList overrides={overrides} isThanks={isThanks} />
          {isThanks && (
            <Text className="text-xs text-amber-800 dark:text-amber-300">
              Changing the promo code here does not change the code in these emails.
            </Text>
          )}
        </View>
      )}

      <EmailSection title="Sender and activity">
        <View className="gap-4">
          <View>
            <FieldTitle>Sender name</FieldTitle>
            <TextInput
              value={fromName}
              onChangeText={onFromNameChange}
              editable={!disabled}
              maxLength={120}
              placeholder="Your company name"
              placeholderTextColor="#9CA3AF"
              className={inputClass}
              style={{ paddingVertical: 10, opacity: disabled ? 0.6 : 1 }}
            />
            <Hint>
              The name guests see in their inbox, for example Escape Room Zone. Leave it blank to use the company name.
            </Hint>
          </View>
          {canFilterActivity && (
            <View>
              <FieldTitle>Activity</FieldTitle>
              <SelectField
                value={activityFilter ?? ""}
                options={ACTIVITY_OPTIONS}
                disabled={disabled}
                onSelect={(v) => onActivityFilterChange(v === "" ? null : (v as VisitActivityFilter))}
              />
              <Hint>
                Escape rooms only covers every package flagged as an escape room, including rooms added later, so the email never needs its package list updated.
              </Hint>
            </View>
          )}
          {!isThanks && (
            <View>
              <FieldTitle>Public review link for this email</FieldTitle>
              <TextInput
                value={reviewUrl}
                onChangeText={onReviewUrlChange}
                editable={!disabled}
                maxLength={500}
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="https://g.page/r/..."
                placeholderTextColor="#9CA3AF"
                className={inputClass}
                style={{ paddingVertical: 10, opacity: disabled ? 0.6 : 1 }}
              />
              <Hint>
                Optional. Use it when this email is for a brand with its own listing. Leave it blank to use each location&apos;s review link.
              </Hint>
            </View>
          )}
        </View>
      </EmailSection>

      {isThanks && (
        <EmailSection title="Return-visit offer">
          <PromoCodePicker
            value={promoId}
            onChange={onPromoChange}
            locationId={locationId}
            locations={locations}
            summary={promoSummary}
            disabled={disabled}
          />
          <Text className="text-xs text-gray-500 dark:text-gray-400 mt-3">
            The offer appears where {"{{promo_section}}"} sits in the email, and is added above the sign-off if the wording leaves it out. A paragraph that uses {"{{promo_code}}"} or {"{{promo_offer}}"} is left out when there is no usable code. An email with a code also gets an unsubscribe link and the location&apos;s address.
          </Text>
        </EmailSection>
      )}
    </>
  );
}

/** Bulleted list of the emails sent instead, each opening its details. */
export function OverrideList({
  overrides,
  isThanks,
}: {
  overrides: VisitEmailOverride[];
  isThanks: boolean;
}) {
  return (
    <View className="gap-0.5">
      {overrides.map((o) => (
        <Text key={o.id} className="text-sm text-amber-900 dark:text-amber-200">
          {"• "}
          <Text
            className="underline"
            onPress={() =>
              router.push({ pathname: "/email-campaign/notification-details", params: { id: String(o.id) } })
            }
          >
            {o.name}
          </Text>
          {o.location_name ? ` · ${o.location_name}` : " · every location"}
          {isThanks ? ` · ${o.promo_code ? `code ${o.promo_code}` : "no promo code"}` : ""}
        </Text>
      ))}
    </View>
  );
}

/** The promo tag a Visit Completed row shows in the notifications list. */
export function VisitPromoBadge({ summary }: { summary: EmailPromoSummary | null }) {
  if (summary?.code || summary?.problem) {
    const bad = !!summary.problem;
    return (
      <View
        className={`flex-row items-center gap-1 px-1.5 py-0.5 rounded border ${
          bad
            ? "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-900/40"
            : "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-900/40"
        }`}
      >
        <Feather name="tag" size={10} color={bad ? "#B91C1C" : "#92400E"} />
        <Text className={`text-[10px] font-medium ${bad ? "text-red-700 dark:text-red-300" : "text-amber-800 dark:text-amber-300"}`}>
          {summary.code ?? "Promo missing"}
          {bad ? " · not usable" : ""}
        </Text>
      </View>
    );
  }
  return (
    <View className="flex-row items-center gap-1 px-1.5 py-0.5 rounded border bg-gray-100 border-gray-200 dark:bg-neutral-800 dark:border-neutral-700">
      <Feather name="tag" size={10} color="#4B5563" />
      <Text className="text-[10px] font-medium text-gray-600 dark:text-gray-300">No promo code</Text>
    </View>
  );
}
