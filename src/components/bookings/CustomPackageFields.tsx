// The Custom Package pieces of Manual Booking (web ManualBooking, zappoint
// 5de9d9e): the package terms, its pricing and fees, the one-time add-ons, the
// space picker and the summary card. State lives in the screen; these only
// render it and report edits.

import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  CUSTOM_PACKAGE_LIMITS,
  CUSTOM_PACKAGE_MESSAGES,
  feeErrorKey,
  feeLineLabel,
  formatMoney,
  oneTimeAddOnErrorKey,
  packageLineLabel,
  priceFieldLabel,
  pricingTypeLabel,
  type CustomFeeInput,
  type CustomPricingType,
  type CustomQuote,
  type CustomTermsInput,
  type OneTimeAddOnInput,
} from "../../lib/bookings/customBooking";
import { sortRoomsNumerically } from "../../lib/rooms";

const PRIMARY = "#0644C7";

export type CustomLoadStatus = "idle" | "loading" | "ready" | "error";
export type CustomFeeRow = CustomFeeInput & { rowKey: number };
export type OneTimeAddOnRow = OneTimeAddOnInput & { rowKey: number };
export interface CustomTermsDraft extends CustomTermsInput {
  fees: CustomFeeRow[];
  oneTimeAddOns: OneTimeAddOnRow[];
}

/** Shows an error for `key` once the field has text, or after a failed save. */
export type ErrorFor = (key: string, value?: string) => string | undefined;

const inputBase =
  "h-11 border rounded-xl px-3 py-0 text-sm text-gray-900 dark:text-white bg-white dark:bg-neutral-900";
/** "+ Add Fee", "+ Add One-Time Add-on", "Retry": one small-button size. */
export const SMALL_BUTTON =
  "h-8 justify-center rounded-lg border border-gray-300 px-3 active:opacity-80 dark:border-neutral-600";

const inputClass = (invalid: boolean) =>
  `${inputBase} ${invalid ? "border-red-500" : "border-gray-200 dark:border-neutral-700"}`;

const Label = ({ children }: { children: React.ReactNode }) => (
  <Text numberOfLines={1} className="mb-1.5 text-xs font-medium text-gray-600 dark:text-gray-300">
    {children}
  </Text>
);

const ErrorText = ({ message }: { message?: string | null }) =>
  message ? <Text className="mt-1 text-xs text-red-700 dark:text-red-400">{message}</Text> : null;

const Hint = ({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "warn" }) => (
  <Text
    className={`mt-1 text-xs ${
      tone === "warn" ? "text-amber-700 dark:text-amber-400" : "text-gray-500 dark:text-gray-400"
    }`}
  >
    {children}
  </Text>
);

const RetryRow = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <View className="mt-1 flex-row flex-wrap items-center gap-2">
    <Text className="text-xs text-red-700 dark:text-red-400">{message}</Text>
    <Pressable
      onPress={onRetry}
      className={SMALL_BUTTON}
      accessibilityRole="button"
    >
      <Text className="text-xs font-medium text-gray-700 dark:text-gray-200">Retry</Text>
    </Pressable>
  </View>
);

/** Two-option switch in the screen's segmented style. */
function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <View className="flex-row gap-2">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            // Keyed by state so css-interop renders each look fresh (see the
            // screen's mode toggle).
            key={`${o.value}-${active}`}
            onPress={() => onChange(o.value)}
            className={`h-11 flex-1 items-center justify-center rounded-xl border ${
              active
                ? "border-[#0644C7] bg-[#0644C7]"
                : "border-gray-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
            }`}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text
              className={`text-xs font-semibold ${active ? "text-white" : "text-gray-700 dark:text-gray-200"}`}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const RemoveButton = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <Pressable
    onPress={onPress}
    className="h-11 w-11 items-center justify-center rounded-xl border border-gray-300 active:opacity-70 dark:border-neutral-600"
    accessibilityRole="button"
    accessibilityLabel={label}
  >
    <Feather name="x" size={16} color="#6B7280" />
  </Pressable>
);

/** Money / number input with a "$" or "%" adornment. */
const AdornedInput = ({
  value,
  onChangeText,
  adornment,
  side,
  invalid,
  placeholder = "0.00",
  accessibilityLabel,
}: {
  value: string;
  onChangeText: (v: string) => void;
  adornment: string;
  side: "left" | "right";
  invalid: boolean;
  placeholder?: string;
  accessibilityLabel: string;
}) => (
  <View
    className={`h-11 flex-row items-center rounded-xl border bg-white px-3 dark:bg-neutral-900 ${
      invalid ? "border-red-500" : "border-gray-200 dark:border-neutral-700"
    }`}
  >
    {side === "left" && <Text className="mr-1 text-sm text-gray-500">{adornment}</Text>}
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#9CA3AF"
      keyboardType="decimal-pad"
      accessibilityLabel={accessibilityLabel}
      className="h-full flex-1 py-0 text-sm text-gray-900 dark:text-white"
    />
    {side === "right" && <Text className="ml-1 text-sm text-gray-500">{adornment}</Text>}
  </View>
);

/** A bottom-sheet list to pick one option (the mobile stand-in for a web <select>). */
function OptionSheet({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: string[];
  selected: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Pressable
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(20,20,20,0.5)" }}
          onPress={onClose}
          accessibilityLabel="Close"
        />
        <View
          className="max-h-[70%] rounded-t-3xl bg-white dark:bg-neutral-900"
          style={{ paddingBottom: insets.bottom + 8 }}
        >
          <View className="mb-1 mt-3 h-1 w-10 self-center rounded-full bg-gray-300" />
          <Text className="px-5 pb-2 pt-3 text-base font-bold text-gray-900 dark:text-white">{title}</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {options.map((option) => {
              const active = option === selected;
              return (
                <Pressable
                  key={option}
                  onPress={() => {
                    onSelect(option);
                    onClose();
                  }}
                  className="flex-row items-center justify-between px-5 py-3.5 active:bg-gray-50 dark:active:bg-neutral-800"
                >
                  <Text
                    className={`text-sm ${
                      active ? "font-semibold text-[#0644C7]" : "text-gray-700 dark:text-gray-200"
                    }`}
                  >
                    {option}
                  </Text>
                  {active && <Feather name="check" size={18} color={PRIMARY} />}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Package terms: location, name, category, duration, guest range.

export function CustomPackageTermsFields({
  terms,
  onChange,
  errorFor,
  canPickLocation,
  locationOptions,
  locationId,
  locationName,
  onPickLocation,
  categories,
  categoriesStatus,
  onRetryCategories,
}: {
  terms: CustomTermsDraft;
  onChange: (patch: Partial<CustomTermsDraft>) => void;
  errorFor: ErrorFor;
  canPickLocation: boolean;
  locationOptions: { id: number; name: string }[];
  locationId: number | null;
  locationName: string;
  onPickLocation: (id: number) => void;
  categories: string[];
  categoriesStatus: CustomLoadStatus;
  onRetryCategories: () => void;
}) {
  const [categoryOpen, setCategoryOpen] = useState(false);
  const locationError = errorFor("location");
  const nameError = errorFor("name", terms.name);
  const categoryError = errorFor("category");
  const durationError = errorFor("durationMinutes", terms.durationMinutes);
  const minError = errorFor("minGuests", terms.minGuests);
  const maxError = errorFor("maxGuests", terms.maxGuests);

  return (
    <View>
      <View className="mb-3">
        {canPickLocation ? (
          <>
            <Label>Location *</Label>
            <View className="flex-row flex-wrap gap-2">
              {locationOptions.map((o) => {
                const active = o.id === locationId;
                return (
                  <Pressable
                    key={`${o.id}-${active}`}
                    onPress={() => onPickLocation(o.id)}
                    className={`rounded-full border px-3 py-2 ${
                      active
                        ? "border-[#0644C7] bg-[#0644C7]"
                        : "border-gray-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
                    }`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text
                      numberOfLines={1}
                      className={`text-xs font-medium ${active ? "text-white" : "text-gray-700 dark:text-gray-200"}`}
                    >
                      {o.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <ErrorText message={locationError} />
          </>
        ) : locationId ? (
          <Text className="text-xs text-gray-600 dark:text-gray-300">
            Location:{" "}
            <Text className="font-medium text-gray-900 dark:text-white">{locationName}</Text>
          </Text>
        ) : (
          <Hint tone="warn">{CUSTOM_PACKAGE_MESSAGES.locationRequired}</Hint>
        )}
      </View>

      <Label>Booking Name *</Label>
      <TextInput
        value={terms.name}
        onChangeText={(name) => onChange({ name })}
        maxLength={CUSTOM_PACKAGE_LIMITS.nameMaxLength}
        placeholder="e.g. Team Outing"
        placeholderTextColor="#9CA3AF"
        className={inputClass(!!nameError)}
      />
      <ErrorText message={nameError} />

      <View className="mt-3">
        <Label>Category *{categoriesStatus === "loading" ? "  (Loading...)" : ""}</Label>
        <Pressable
          onPress={() => setCategoryOpen(true)}
          disabled={categoriesStatus !== "ready" || categories.length === 0}
          className={`h-11 flex-row items-center justify-between rounded-xl border px-3 active:opacity-80 ${
            categoryError ? "border-red-500" : "border-gray-200 dark:border-neutral-700"
          }`}
          accessibilityRole="button"
          accessibilityLabel="Category"
        >
          <Text className={`text-sm ${terms.category ? "text-gray-900 dark:text-white" : "text-gray-400"}`}>
            {terms.category || "Select a category"}
          </Text>
          <Feather name="chevron-down" size={16} color="#9ca3af" />
        </Pressable>
        {categoriesStatus === "error" && (
          <RetryRow message={CUSTOM_PACKAGE_MESSAGES.categoriesFailed} onRetry={onRetryCategories} />
        )}
        {categoriesStatus === "ready" && categories.length === 0 && (
          <Hint tone="warn">{CUSTOM_PACKAGE_MESSAGES.noCategories}</Hint>
        )}
        <ErrorText message={categoryError} />
      </View>

      <View className="mt-3 flex-row gap-3">
        <View className="flex-1">
          <Label>Duration (min) *</Label>
          <TextInput
            value={terms.durationMinutes}
            onChangeText={(durationMinutes) => onChange({ durationMinutes })}
            placeholder="e.g. 90"
            placeholderTextColor="#9CA3AF"
            keyboardType="number-pad"
            className={inputClass(!!durationError)}
          />
        </View>
        <View className="flex-1">
          <Label>Min. Guests</Label>
          <TextInput
            value={terms.minGuests}
            onChangeText={(minGuests) => onChange({ minGuests })}
            placeholder="Optional"
            placeholderTextColor="#9CA3AF"
            keyboardType="number-pad"
            className={inputClass(!!minError)}
          />
        </View>
        <View className="flex-1">
          <Label>Max. Guests *</Label>
          <TextInput
            value={terms.maxGuests}
            onChangeText={(maxGuests) => onChange({ maxGuests })}
            placeholder="e.g. 30"
            placeholderTextColor="#9CA3AF"
            keyboardType="number-pad"
            className={inputClass(!!maxError)}
          />
        </View>
      </View>
      <ErrorText message={durationError} />
      <ErrorText message={minError} />
      <ErrorText message={maxError} />

      <OptionSheet
        visible={categoryOpen}
        title="Category"
        options={categories}
        selected={terms.category}
        onSelect={(category) => onChange({ category })}
        onClose={() => setCategoryOpen(false)}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Space selection: every available space at the location, or a new one.

export function CustomSpacePicker({
  locationId,
  rooms,
  status,
  selectedRoomId,
  onSelect,
  onRetry,
  newSpaceName,
  onNewSpaceName,
  onAddSpace,
  creating,
  error,
}: {
  locationId: number | null;
  rooms: { id: number; name: string }[];
  status: CustomLoadStatus;
  selectedRoomId: number | null;
  onSelect: (id: number | null) => void;
  onRetry: () => void;
  newSpaceName: string;
  onNewSpaceName: (v: string) => void;
  onAddSpace: () => void;
  creating: boolean;
  error?: string;
}) {
  return (
    <View className="mt-4 border-t border-gray-100 pt-4 dark:border-neutral-800">
      <Text className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-700 dark:text-gray-300">
        Space Selection *
      </Text>
      {!locationId ? (
        <Hint tone="warn">{CUSTOM_PACKAGE_MESSAGES.locationRequired}</Hint>
      ) : status === "error" ? (
        <RetryRow message="Spaces could not be loaded." onRetry={onRetry} />
      ) : (
        <>
          {status === "loading" && (
            <View className="mb-2 flex-row items-center gap-2">
              <ActivityIndicator size="small" color={PRIMARY} />
              <Text className="text-xs text-gray-500 dark:text-gray-400">Loading spaces...</Text>
            </View>
          )}
          {status === "ready" && rooms.length === 0 && <Hint>{CUSTOM_PACKAGE_MESSAGES.noSpaces}</Hint>}
          <View className="flex-row flex-wrap gap-1.5">
            {sortRoomsNumerically(rooms).map((room) => {
              const active = selectedRoomId === room.id;
              return (
                <Pressable
                  key={`${room.id}-${active}`}
                  // Tapping the chosen space again clears it, as on the web.
                  onPress={() => onSelect(active ? null : room.id)}
                  className={`rounded-lg border px-3 py-2 active:opacity-80 ${
                    active
                      ? "border-[#0644C7] bg-[#0644C7]"
                      : "border-gray-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
                  }`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text className={`text-sm ${active ? "font-semibold text-white" : "text-gray-800 dark:text-gray-200"}`}>
                    {room.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View className="mt-2 flex-row items-center gap-2">
            <TextInput
              value={newSpaceName}
              onChangeText={onNewSpaceName}
              placeholder="Type new Space name"
              placeholderTextColor="#9CA3AF"
              editable={status === "ready" && !creating}
              returnKeyType="done"
              onSubmitEditing={onAddSpace}
              accessibilityLabel="New space name"
              className={`flex-1 ${inputClass(false)}`}
            />
            <Pressable
              onPress={onAddSpace}
              disabled={!newSpaceName.trim() || creating || status !== "ready"}
              className="h-11 w-11 items-center justify-center rounded-xl active:opacity-80"
              accessibilityRole="button"
              accessibilityLabel="Add space"
            >
              {creating ? (
                <ActivityIndicator size="small" color={PRIMARY} />
              ) : (
                <Feather name="plus" size={20} color={newSpaceName.trim() ? PRIMARY : "#D1D5DB"} />
              )}
            </Pressable>
          </View>
        </>
      )}
      <ErrorText message={error} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// One-time add-ons: lines that exist only on this booking.

export function OneTimeAddOnRows({
  rows,
  errorFor,
  onUpdate,
  onRemove,
}: {
  rows: OneTimeAddOnRow[];
  errorFor: ErrorFor;
  onUpdate: (rowKey: number, patch: Partial<OneTimeAddOnInput>) => void;
  onRemove: (rowKey: number) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <View className="mb-3 rounded-xl border border-gray-200 bg-gray-50 p-2.5 dark:border-neutral-700 dark:bg-neutral-800/50">
      <Text className="mb-2 text-xs text-gray-500 dark:text-gray-400">
        These add-ons apply only to this booking.
      </Text>
      {rows.map((line, index) => {
        const nameError = errorFor(oneTimeAddOnErrorKey(index, "name"), line.name);
        const quantityError = errorFor(oneTimeAddOnErrorKey(index, "quantity"), line.quantity);
        const priceError = errorFor(oneTimeAddOnErrorKey(index, "unitPrice"), line.unitPrice);
        const messages = [nameError, quantityError, priceError].filter((m): m is string => !!m);
        return (
          <View key={line.rowKey} className={index > 0 ? "mt-3" : ""}>
            <View className="flex-row items-end gap-2">
              <View className="flex-1">
                <Label>Add-on Name</Label>
                <TextInput
                  value={line.name}
                  onChangeText={(name) => onUpdate(line.rowKey, { name })}
                  maxLength={CUSTOM_PACKAGE_LIMITS.lineNameMaxLength}
                  placeholder="e.g. Glow Bracelets"
                  placeholderTextColor="#9CA3AF"
                  className={inputClass(!!nameError)}
                />
              </View>
              <RemoveButton label="Remove add-on" onPress={() => onRemove(line.rowKey)} />
            </View>
            <View className="mt-2 flex-row gap-2">
              <View className="w-20">
                <Label>Qty.</Label>
                <TextInput
                  value={line.quantity}
                  onChangeText={(quantity) => onUpdate(line.rowKey, { quantity })}
                  keyboardType="number-pad"
                  accessibilityLabel="Quantity"
                  className={inputClass(!!quantityError)}
                />
              </View>
              <View className="flex-1">
                <Label>Unit Price</Label>
                <AdornedInput
                  value={line.unitPrice}
                  onChangeText={(unitPrice) => onUpdate(line.rowKey, { unitPrice })}
                  adornment="$"
                  side="left"
                  invalid={!!priceError}
                  accessibilityLabel="Unit price"
                />
              </View>
            </View>
            {messages.length > 0 && <ErrorText message={messages.join(" ")} />}
          </View>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Pricing: per booking / per guest, the price, fees, breakdown and total.

export function CustomPricingFields({
  terms,
  onChange,
  errorFor,
  onAddFee,
  onUpdateFee,
  onRemoveFee,
  quote,
  participants,
  hasPackagePrice,
  hasAddOnLines,
  hasEstimate,
  totalError,
}: {
  terms: CustomTermsDraft;
  onChange: (patch: Partial<CustomTermsDraft>) => void;
  errorFor: ErrorFor;
  onAddFee: () => void;
  onUpdateFee: (rowKey: number, patch: Partial<CustomFeeInput>) => void;
  onRemoveFee: (rowKey: number) => void;
  quote: CustomQuote;
  participants: string;
  hasPackagePrice: boolean;
  hasAddOnLines: boolean;
  hasEstimate: boolean;
  totalError?: string;
}) {
  const priceError = errorFor("price", terms.price);
  const pricingOptions: { value: CustomPricingType; label: string }[] = [
    { value: "per_booking", label: pricingTypeLabel("per_booking") },
    { value: "per_guest", label: pricingTypeLabel("per_guest") },
  ];

  return (
    <View>
      <Label>Pricing</Label>
      <Segmented value={terms.pricingType} options={pricingOptions} onChange={(pricingType) => onChange({ pricingType })} />

      <View className="mt-3">
        <Label>{priceFieldLabel(terms.pricingType)} *</Label>
        <AdornedInput
          value={terms.price}
          onChangeText={(price) => onChange({ price })}
          adornment="$"
          side="left"
          invalid={!!priceError}
          accessibilityLabel={priceFieldLabel(terms.pricingType)}
        />
        {terms.pricingType === "per_guest" && <Hint>Uses the participant count.</Hint>}
        <ErrorText message={priceError} />
      </View>

      <View className="mt-3 flex-row items-center justify-between">
        <Text className="text-xs font-medium text-gray-700 dark:text-gray-200">Fees</Text>
        <Pressable
          onPress={onAddFee}
          disabled={terms.fees.length >= CUSTOM_PACKAGE_LIMITS.feesMax}
          className={SMALL_BUTTON}
          accessibilityRole="button"
        >
          <Text className="text-xs font-medium text-gray-700 dark:text-gray-200">+ Add Fee</Text>
        </Pressable>
      </View>

      {terms.fees.map((fee, index) => {
        const isPercent = fee.type === "percent";
        const nameError = errorFor(feeErrorKey(index, "name"), fee.name);
        const amountError = errorFor(feeErrorKey(index, "amount"), fee.amount);
        const messages = [nameError, amountError].filter((m): m is string => !!m);
        return (
          <View
            key={fee.rowKey}
            className="mt-2 rounded-xl border border-gray-200 bg-gray-50 p-2.5 dark:border-neutral-700 dark:bg-neutral-800/50"
          >
            <View className="flex-row items-end gap-2">
              <View className="flex-1">
                <Label>Fee Name</Label>
                <TextInput
                  value={fee.name}
                  onChangeText={(name) => onUpdateFee(fee.rowKey, { name })}
                  maxLength={CUSTOM_PACKAGE_LIMITS.lineNameMaxLength}
                  placeholder="e.g. Venue Fee"
                  placeholderTextColor="#9CA3AF"
                  className={inputClass(!!nameError)}
                />
              </View>
              <RemoveButton label="Remove fee" onPress={() => onRemoveFee(fee.rowKey)} />
            </View>
            <View className="mt-2 flex-row gap-2">
              <View className="flex-1">
                <Label>Fee Type</Label>
                <Segmented
                  value={fee.type}
                  options={[
                    { value: "flat", label: "Flat fee" },
                    { value: "percent", label: "Percent" },
                  ]}
                  onChange={(type) => onUpdateFee(fee.rowKey, { type })}
                />
              </View>
              <View className="flex-1">
                <Label>{isPercent ? "Rate (%)" : "Amount"}</Label>
                <AdornedInput
                  value={fee.amount}
                  onChangeText={(amount) => onUpdateFee(fee.rowKey, { amount })}
                  adornment={isPercent ? "%" : "$"}
                  side={isPercent ? "right" : "left"}
                  invalid={!!amountError}
                  accessibilityLabel={isPercent ? "Fee rate" : "Fee amount"}
                />
              </View>
            </View>
            {messages.length > 0 && <ErrorText message={messages.join(" ")} />}
          </View>
        );
      })}
      {terms.fees.length > 0 && <Hint>Percentage fees use the package and add-ons subtotal.</Hint>}

      {/* Breakdown */}
      <View className="mt-3 gap-1.5">
        <View className="flex-row items-center justify-between">
          <Text className="flex-1 text-xs text-gray-600 dark:text-gray-300">
            {hasPackagePrice ? packageLineLabel(terms.pricingType, participants, terms.price) : "Package"}
          </Text>
          <Text className="text-xs font-medium text-gray-900 dark:text-white">
            {hasPackagePrice ? formatMoney(quote.packageCents) : "—"}
          </Text>
        </View>
        {hasAddOnLines && (
          <View className="flex-row items-center justify-between">
            <Text className="text-xs text-gray-600 dark:text-gray-300">Add-ons</Text>
            <Text className="text-xs font-medium text-gray-900 dark:text-white">
              {formatMoney(quote.catalogCents + quote.oneTimeCents)}
            </Text>
          </View>
        )}
        {quote.fees.map((fee, index) => {
          const source = terms.fees[index];
          if (!source || source.amount.trim() === "") return null;
          return (
            <View key={source.rowKey} className="flex-row items-center justify-between">
              <Text className="flex-1 text-xs text-gray-500 dark:text-gray-400">{feeLineLabel(fee) || "Fee"}</Text>
              <Text className="text-xs text-gray-700 dark:text-gray-300">+{formatMoney(fee.cents)}</Text>
            </View>
          );
        })}
      </View>

      {/* Total */}
      <View className="mt-3 flex-row items-center justify-between rounded-xl border border-[#0644C7]/20 bg-[#0644C7]/5 px-3 py-3">
        <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">Total</Text>
        <Text className="text-xl font-bold text-[#0644C7]">
          {hasEstimate ? formatMoney(quote.totalCents) : "—"}
        </Text>
      </View>
      <ErrorText message={totalError} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Summary card: the name and shape of what is being booked.

export function CustomPackageSummaryCard({
  name,
  category,
  duration,
  capacity,
  endsAt,
}: {
  name: string;
  category: string;
  duration: string;
  capacity: string;
  endsAt: string;
}) {
  return (
    <View
      className="mb-4 flex-row items-start gap-3 rounded-2xl bg-white p-4 dark:bg-neutral-900"
      style={{
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
      }}
    >
      <View className="h-11 w-11 items-center justify-center rounded-xl border border-[#0644C7]/20 bg-[#0644C7]/5">
        <Feather name="package" size={20} color={PRIMARY} />
      </View>
      <View className="flex-1">
        <Text numberOfLines={1} className="text-sm font-semibold text-gray-900 dark:text-white">
          {name}
        </Text>
        <Text className="mt-1 text-sm text-gray-500 dark:text-gray-400">{category || "Choose a category"}</Text>
        {!!duration && <Text className="text-sm text-gray-500 dark:text-gray-400">{duration}</Text>}
        {!!capacity && <Text className="text-sm text-gray-500 dark:text-gray-400">{capacity}</Text>}
        {!!endsAt && <Text className="text-sm text-gray-500 dark:text-gray-400">{endsAt}</Text>}
      </View>
    </View>
  );
}
