// Custom Package on Manual Booking: one built-in package staff fill in per
// booking. A port of the web's utils/customBooking.ts (zappoint 5de9d9e), so
// the app computes the same total the server checks (CustomPackagePricer) —
// any other total is refused as CUSTOM_PRICE_MISMATCH.

import { normalizeCategory } from "../venueCategories.ts";
import {
  isPackageTimeSlotRestricted,
  type PackageClosureDayOff,
} from "./packageCandidates.ts";

export type CustomPricingType = "per_booking" | "per_guest";
export type CustomFeeType = "flat" | "percent";

export interface CustomFeeInput {
  name: string;
  type: CustomFeeType;
  amount: string;
}

export interface OneTimeAddOnInput {
  name: string;
  quantity: string;
  unitPrice: string;
}

export interface CustomTermsInput {
  name: string;
  category: string;
  durationMinutes: string;
  minGuests: string;
  maxGuests: string;
  pricingType: CustomPricingType;
  price: string;
  fees: CustomFeeInput[];
  oneTimeAddOns: OneTimeAddOnInput[];
}

export interface CustomPackagePayload {
  name: string;
  category: string;
  duration_minutes: number;
  min_guests: number | null;
  max_guests: number;
  pricing_type: CustomPricingType;
  price: number;
  fees: { name: string; type: CustomFeeType; amount: number }[];
  one_time_add_ons: { name: string; quantity: number; unit_price: number }[];
}

export interface CustomQuoteLineInput {
  unitPrice: number;
  quantity: number;
}

export interface CustomFee {
  name: string;
  type: CustomFeeType;
  amount: number;
}

export interface CustomQuoteFee extends CustomFee {
  cents: number;
  label: string;
}

export interface CustomQuote {
  packageCents: number;
  catalogCents: number;
  oneTimeCents: number;
  subtotalCents: number;
  fees: CustomQuoteFee[];
  feesCents: number;
  totalCents: number;
}

/** The applied_fees row the server stores for a custom fee (CustomPackagePricer::appliedFees). */
export interface CustomAppliedFee {
  fee_name: string;
  fee_amount: number;
  fee_application_type: "additive";
  fee_calculation_type: "fixed" | "percentage";
  fee_label: string;
  fee_support_id: null;
}

export interface CustomCatalogLineCheck {
  id: number | string;
  name: string;
  quantity: number | string | null | undefined;
  minQuantity?: number | string | null;
  maxQuantity?: number | string | null;
}

export interface CustomValidationContext {
  participants?: number | string | null;
  locationId?: number | string | null;
  roomId?: number | string | null;
  catalog?: CustomCatalogLineCheck[];
  amountPaid?: number | string | null;
  totalCents?: number | null;
}

export type CustomTermsErrors = Record<string, string>;
export type CustomFeeField = "name" | "amount";
export type OneTimeAddOnField = "name" | "quantity" | "unitPrice";

/** Fields of a booking row that say whether, and how, it is a custom package. */
export interface CustomBookingSource {
  is_custom_package?: boolean | number | null;
  custom_package_name?: string | null;
  custom_package_category?: string | null;
}

export const CUSTOM_PACKAGE_LABEL = "Custom Package";
export const CUSTOM_BADGE_TEXT = "Custom";

export const CUSTOM_PACKAGE_LIMITS = {
  nameMaxLength: 120,
  lineNameMaxLength: 100,
  durationMaxMinutes: 1440,
  guestsMax: 10000,
  priceMax: 99999.99,
  percentMax: 100,
  oneTimeQuantityMax: 1000,
  catalogQuantityMax: 99,
  feesMax: 20,
  oneTimeAddOnsMax: 50,
  totalMax: 99999999.99,
} as const;

export const CUSTOM_PACKAGE_MESSAGES = {
  nameRequired: "Enter a name.",
  nameTooLong: "Booking name can be at most 120 characters.",
  categoryRequired: "Choose a category.",
  durationRequired: "Enter a duration in minutes.",
  durationInvalid: "Duration must be whole minutes from 1 to 1,440.",
  minGuestsInvalid: "Min. guests must be a whole number from 1 to 10,000.",
  maxGuestsRequired: "Enter the maximum number of guests.",
  maxGuestsInvalid: "Max. guests must be a whole number from 1 to 10,000.",
  maxGuestsBelowMin: (min: number): string => `Max. guests must be at least ${min}.`,
  priceRequired: "Enter a price.",
  priceInvalid: "Price must be from $0.00 to $99,999.99, with at most 2 decimals.",
  participantsOutOfRange: (min: number, max: number): string =>
    `Participants must be between ${min} and ${max}.`,
  lineNameRequired: "Enter a name.",
  lineNameTooLong: "Name can be at most 100 characters.",
  feeAmountRequired: "Enter an amount.",
  feeAmountInvalid: "Amount must be from $0.00 to $99,999.99, with at most 2 decimals.",
  feeRateRequired: "Enter a rate.",
  feeRateInvalid: "Rate must be from 0 to 100, with at most 2 decimals.",
  tooManyFees: "A custom package can have at most 20 fees.",
  quantityInvalid: "Quantity must be a whole number from 1 to 1,000.",
  unitPriceRequired: "Enter a unit price.",
  unitPriceInvalid: "Unit price must be from $0.00 to $99,999.99, with at most 2 decimals.",
  tooManyOneTimeAddOns: "A custom package can have at most 50 one-time add-ons.",
  locationRequired: "Choose a location for this booking.",
  spaceRequired: "Choose a space for this booking.",
  noSpaces: "No spaces at this location yet. Type a name to add one.",
  catalogBelowMinimum: (min: number): string => `Enter zero or at least ${min}.`,
  catalogOutOfRange: (name: string, min: number, max: number): string =>
    `${name} needs a quantity between ${min} and ${max}.`,
  amountPaidOverTotal: "Amount paid cannot exceed the total.",
  totalTooLarge: "The total cannot be more than $99,999,999.99.",
  categoriesFailed: "Categories could not be loaded.",
  noCategories: "No categories are set up yet. Add one on Create Package first.",
  capacityFromCustomPackage: "Capacity comes from the custom package",
  pastDate: "Choose today or a future date.",
  staffOnly:
    "Custom packages can only be booked by staff. Please sign in again and try once more.",
  priceChanged:
    "The total for this custom package changed. Please check the price and try again.",
  priceChangedRefreshed:
    "The price changed since this page was opened, so the latest add-on prices were loaded. Please check the total and try again.",
} as const;

/** Server refusal codes (CustomPackagePricer). */
export const CUSTOM_PACKAGE_STAFF_ONLY_CODE = "CUSTOM_PACKAGE_STAFF_ONLY";
export const CUSTOM_PRICE_MISMATCH_CODE = "CUSTOM_PRICE_MISMATCH";

const MONEY_MAX_CENTS = 9999999;
const TOTAL_MAX_CENTS = 9999999999;
const RATE_MAX_BASIS_POINTS = 10000;
const MINUTES_PER_DAY = 1440;

const parseNumberInput = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text === "") return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
};

const finiteOr = (value: unknown, fallback: number): number => parseNumberInput(value) ?? fallback;

const numberOrNaN = (value: unknown): number => parseNumberInput(value) ?? Number.NaN;

const positiveWhole = (value: unknown): number | null => {
  const parsed = parseNumberInput(value);
  return parsed !== null && Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
};

const wholeCount = (value: unknown): number => {
  const parsed = parseNumberInput(value);
  return parsed !== null && parsed > 0 ? Math.floor(parsed) : 0;
};

const textOf = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return String(value);
};

const hasAtMostTwoDecimals = (value: number): boolean =>
  Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;

const isWholeWithin = (value: number, min: number, max: number): boolean =>
  Number.isInteger(value) && value >= min && value <= max;

const isCentsAmountWithin = (value: number, maxCents: number): boolean =>
  value >= 0 && hasAtMostTwoDecimals(value) && toCents(value) <= maxCents;

const hasId = (value: unknown): boolean => {
  const parsed = parseNumberInput(value);
  return parsed !== null && parsed > 0;
};

export function toCents(value: unknown): number {
  const parsed = parseNumberInput(value);
  if (parsed === null) return 0;
  const cents = Math.round(Math.abs(parsed) * 100);
  return parsed < 0 && cents > 0 ? -cents : cents;
}

const nonNegativeCents = (value: unknown): number => Math.max(0, toCents(value));

export function centsToDollars(cents: number): number {
  if (!Number.isFinite(cents)) return 0;
  const rounded = Math.round(cents);
  return rounded === 0 ? 0 : rounded / 100;
}

/** "$1,234.50" — formatted by hand, so it never depends on Hermes' Intl support. */
export function formatMoney(cents: number): string {
  const safe = Number.isFinite(cents) ? Math.round(cents) : 0;
  const negative = safe < 0;
  const abs = Math.abs(safe);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = String(abs % 100).padStart(2, "0");
  return `${negative ? "-" : ""}$${whole}.${fraction}`;
}

const rateText = (amount: unknown): string => String(Number((toCents(amount) / 100).toFixed(2)));

export function feeLabel(type: CustomFeeType, amount: number | string | null | undefined): string {
  return type === "percent" ? `${rateText(amount)}%` : formatMoney(toCents(amount));
}

export function feeLineLabel(fee: {
  name: string;
  type: CustomFeeType;
  amount: number | string | null | undefined;
}): string {
  const name = textOf(fee.name).trim();
  if (fee.type !== "percent") return name;
  const rate = feeLabel("percent", fee.amount);
  return name ? `${name} (${rate})` : rate;
}

export function pricingTypeLabel(type: CustomPricingType): string {
  return type === "per_guest" ? "Per guest" : "Per booking";
}

export function priceFieldLabel(type: CustomPricingType): string {
  return type === "per_guest" ? "Price per Guest" : "Package Price";
}

export function packageLineLabel(
  pricingType: CustomPricingType,
  participants: number | string | null | undefined,
  price: number | string | null | undefined,
): string {
  if (pricingType !== "per_guest") return "Package";
  return `Package · ${wholeCount(participants)} × ${formatMoney(nonNegativeCents(price))}`;
}

export function durationText(minutes: number | string | null | undefined): string {
  const total = positiveWhole(minutes);
  if (total === null) return "";
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest > 0 ? `${hours} hr ${rest} min` : `${hours} hr`;
}

const guestsText = (count: number): string => `${count} ${count === 1 ? "guest" : "guests"}`;

export function capacityText(
  min: number | string | null | undefined,
  max: number | string | null | undefined,
): string {
  const low = positiveWhole(min);
  const high = positiveWhole(max);
  if (high === null || (low !== null && low > high)) return "";
  if (low === high) return guestsText(high);
  if (low === null) return `Up to ${guestsText(high)}`;
  return `${low}–${high} guests`;
}

export function customGuestRange(
  min: number | string | null | undefined,
  max: number | string | null | undefined,
): { min: number; max: number } | null {
  const low = positiveWhole(min);
  const high = positiveWhole(max);
  if (high === null || (low !== null && low > high)) return null;
  return { min: low ?? 1, max: high };
}

export function participantsHint(
  min: number | string | null | undefined,
  max: number | string | null | undefined,
): string {
  const range = customGuestRange(min, max);
  return range
    ? `Min: ${range.min} • Max: ${range.max}`
    : CUSTOM_PACKAGE_MESSAGES.capacityFromCustomPackage;
}

export function endTimeText(
  date: string | null | undefined,
  time: string | null | undefined,
  minutes: number | string | null | undefined,
): string {
  const duration = positiveWhole(minutes);
  const match = /^(\d{1,2}):(\d{2})/.exec(textOf(time).trim());
  if (!textOf(date).trim() || !match || duration === null) return "";
  const startHour = Number(match[1]);
  const startMinute = Number(match[2]);
  if (startHour > 23 || startMinute > 59) return "";
  const end = startHour * 60 + startMinute + duration;
  const endOfDay = end % MINUTES_PER_DAY;
  const hour24 = Math.floor(endOfDay / 60);
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const text = `Ends ${hour12}:${String(endOfDay % 60).padStart(2, "0")} ${hour24 >= 12 ? "PM" : "AM"}`;
  return end >= MINUTES_PER_DAY ? `${text} (next day)` : text;
}

export function isCustomBooking(b: CustomBookingSource | null | undefined): boolean {
  if (!b) return false;
  return b.is_custom_package === true || b.is_custom_package === 1;
}

/** The custom name for a custom booking, else the package name, else `fallback`. */
export function bookingDisplayName(
  b: (CustomBookingSource & { package?: { name?: string | null } | null }) | null | undefined,
  fallback: string,
): string {
  if (isCustomBooking(b)) {
    return textOf(b?.custom_package_name).trim() || CUSTOM_PACKAGE_LABEL;
  }
  return textOf(b?.package?.name).trim() || fallback;
}

/** A custom booking's own category, normalized like a package category. */
export function customBookingCategory(b: CustomBookingSource | null | undefined): string {
  return isCustomBooking(b) ? normalizeCategory(b?.custom_package_category) : "";
}

const sumLines = (lines: CustomQuoteLineInput[]): number =>
  lines.reduce((sum, line) => sum + nonNegativeCents(line.unitPrice) * wholeCount(line.quantity), 0);

/** Same arithmetic, in whole cents, as CustomPackagePricer::price on the server. */
export function computeCustomQuote(input: {
  pricingType: CustomPricingType;
  price: number;
  participants: number;
  catalog?: CustomQuoteLineInput[];
  oneTime?: CustomQuoteLineInput[];
  fees?: CustomFee[];
}): CustomQuote {
  const guests = input.pricingType === "per_guest" ? wholeCount(input.participants) : 1;
  const packageCents = nonNegativeCents(input.price) * guests;
  const catalogCents = sumLines(input.catalog ?? []);
  const oneTimeCents = sumLines(input.oneTime ?? []);
  const subtotalCents = packageCents + catalogCents + oneTimeCents;
  const fees = (input.fees ?? []).map((fee): CustomQuoteFee => {
    const type: CustomFeeType = fee.type === "percent" ? "percent" : "flat";
    const amount = finiteOr(fee.amount, 0);
    const cents =
      type === "percent"
        ? Math.floor((subtotalCents * nonNegativeCents(amount) + 5000) / 10000)
        : nonNegativeCents(amount);
    return { name: textOf(fee.name).trim(), type, amount, cents, label: feeLabel(type, amount) };
  });
  const feesCents = fees.reduce((sum, fee) => sum + fee.cents, 0);
  return {
    packageCents,
    catalogCents,
    oneTimeCents,
    subtotalCents,
    fees,
    feesCents,
    totalCents: subtotalCents + feesCents,
  };
}

export function customQuoteFromInput(
  input: CustomTermsInput,
  participants: number | string | null | undefined,
  catalog: CustomQuoteLineInput[] = [],
): CustomQuote {
  return computeCustomQuote({
    pricingType: input.pricingType,
    price: finiteOr(input.price, 0),
    participants: finiteOr(participants, 0),
    catalog,
    oneTime: input.oneTimeAddOns.map((line) => ({
      unitPrice: finiteOr(line.unitPrice, 0),
      quantity: finiteOr(line.quantity, 0),
    })),
    fees: input.fees.map((fee) => ({
      name: fee.name,
      type: fee.type,
      amount: finiteOr(fee.amount, 0),
    })),
  });
}

export function toAppliedFees(quote: Pick<CustomQuote, "fees">): CustomAppliedFee[] {
  return quote.fees.map(
    (fee): CustomAppliedFee => ({
      fee_name: fee.name,
      fee_amount: centsToDollars(fee.cents),
      fee_application_type: "additive",
      fee_calculation_type: fee.type === "percent" ? "percentage" : "fixed",
      fee_label: fee.label,
      fee_support_id: null,
    }),
  );
}

export function customPackagePayload(input: CustomTermsInput): CustomPackagePayload {
  return {
    name: input.name.trim(),
    category: input.category.trim(),
    duration_minutes: numberOrNaN(input.durationMinutes),
    min_guests: parseNumberInput(input.minGuests),
    max_guests: numberOrNaN(input.maxGuests),
    pricing_type: input.pricingType === "per_guest" ? "per_guest" : "per_booking",
    price: numberOrNaN(input.price),
    fees: input.fees.map((fee) => ({
      name: fee.name.trim(),
      type: fee.type === "percent" ? ("percent" as const) : ("flat" as const),
      amount: numberOrNaN(fee.amount),
    })),
    one_time_add_ons: input.oneTimeAddOns.map((line) => ({
      name: line.name.trim(),
      quantity: numberOrNaN(line.quantity),
      unit_price: numberOrNaN(line.unitPrice),
    })),
  };
}

export function emptyCustomTermsInput(): CustomTermsInput {
  return {
    name: "",
    category: "",
    durationMinutes: "",
    minGuests: "",
    maxGuests: "",
    pricingType: "per_booking",
    price: "",
    fees: [],
    oneTimeAddOns: [],
  };
}

export function emptyCustomFeeInput(): CustomFeeInput {
  return { name: "", type: "flat", amount: "" };
}

export function emptyOneTimeAddOnInput(): OneTimeAddOnInput {
  return { name: "", quantity: "1", unitPrice: "" };
}

export function feeErrorKey(index: number, field: CustomFeeField): string {
  return `fees.${index}.${field}`;
}

export function oneTimeAddOnErrorKey(index: number, field: OneTimeAddOnField): string {
  return `oneTimeAddOns.${index}.${field}`;
}

export function catalogErrorKey(id: number | string): string {
  return `catalog.${id}`;
}

const lineNameError = (value: string): string | null => {
  const name = textOf(value).trim();
  if (!name) return CUSTOM_PACKAGE_MESSAGES.lineNameRequired;
  if (name.length > CUSTOM_PACKAGE_LIMITS.lineNameMaxLength)
    return CUSTOM_PACKAGE_MESSAGES.lineNameTooLong;
  return null;
};

export function validateCustomTerms(
  input: CustomTermsInput,
  context: CustomValidationContext = {},
): CustomTermsErrors {
  const messages = CUSTOM_PACKAGE_MESSAGES;
  const limits = CUSTOM_PACKAGE_LIMITS;
  const errors: CustomTermsErrors = {};

  if (context.locationId !== undefined && !hasId(context.locationId))
    errors.location = messages.locationRequired;

  const name = textOf(input.name).trim();
  if (!name) errors.name = messages.nameRequired;
  else if (name.length > limits.nameMaxLength) errors.name = messages.nameTooLong;

  if (!textOf(input.category).trim()) errors.category = messages.categoryRequired;

  const duration = parseNumberInput(input.durationMinutes);
  if (duration === null) errors.durationMinutes = messages.durationRequired;
  else if (!isWholeWithin(duration, 1, limits.durationMaxMinutes))
    errors.durationMinutes = messages.durationInvalid;

  const minGuests = parseNumberInput(input.minGuests);
  const minValid = minGuests === null || isWholeWithin(minGuests, 1, limits.guestsMax);
  if (!minValid) errors.minGuests = messages.minGuestsInvalid;

  const maxGuests = parseNumberInput(input.maxGuests);
  let capacity: { min: number; max: number } | null = null;
  if (maxGuests === null) errors.maxGuests = messages.maxGuestsRequired;
  else if (!isWholeWithin(maxGuests, 1, limits.guestsMax)) errors.maxGuests = messages.maxGuestsInvalid;
  else if (minValid && minGuests !== null && minGuests > maxGuests)
    errors.maxGuests = messages.maxGuestsBelowMin(minGuests);
  else if (minValid) capacity = { min: minGuests ?? 1, max: maxGuests };

  if (context.participants !== undefined && capacity) {
    const participants = parseNumberInput(context.participants);
    if (participants === null || !isWholeWithin(participants, capacity.min, capacity.max)) {
      errors.participants = messages.participantsOutOfRange(capacity.min, capacity.max);
    }
  }

  const price = parseNumberInput(input.price);
  if (price === null) errors.price = messages.priceRequired;
  else if (!isCentsAmountWithin(price, MONEY_MAX_CENTS)) errors.price = messages.priceInvalid;

  if (input.fees.length > limits.feesMax) errors.fees = messages.tooManyFees;
  input.fees.forEach((fee, index) => {
    const nameError = lineNameError(fee.name);
    if (nameError) errors[feeErrorKey(index, "name")] = nameError;
    const amount = parseNumberInput(fee.amount);
    const percent = fee.type === "percent";
    if (amount === null) {
      errors[feeErrorKey(index, "amount")] = percent
        ? messages.feeRateRequired
        : messages.feeAmountRequired;
    } else if (!isCentsAmountWithin(amount, percent ? RATE_MAX_BASIS_POINTS : MONEY_MAX_CENTS)) {
      errors[feeErrorKey(index, "amount")] = percent
        ? messages.feeRateInvalid
        : messages.feeAmountInvalid;
    }
  });

  if (input.oneTimeAddOns.length > limits.oneTimeAddOnsMax)
    errors.oneTimeAddOns = messages.tooManyOneTimeAddOns;
  input.oneTimeAddOns.forEach((line, index) => {
    const nameError = lineNameError(line.name);
    if (nameError) errors[oneTimeAddOnErrorKey(index, "name")] = nameError;
    const quantity = parseNumberInput(line.quantity);
    if (quantity === null || !isWholeWithin(quantity, 1, limits.oneTimeQuantityMax)) {
      errors[oneTimeAddOnErrorKey(index, "quantity")] = messages.quantityInvalid;
    }
    const unitPrice = parseNumberInput(line.unitPrice);
    if (unitPrice === null)
      errors[oneTimeAddOnErrorKey(index, "unitPrice")] = messages.unitPriceRequired;
    else if (!isCentsAmountWithin(unitPrice, MONEY_MAX_CENTS))
      errors[oneTimeAddOnErrorKey(index, "unitPrice")] = messages.unitPriceInvalid;
  });

  if (context.roomId !== undefined && !hasId(context.roomId)) errors.room = messages.spaceRequired;

  (context.catalog ?? []).forEach((line) => {
    const quantity = wholeCount(line.quantity);
    if (quantity === 0) return;
    const min = Math.max(1, wholeCount(line.minQuantity));
    const max = positiveWhole(line.maxQuantity) ?? limits.catalogQuantityMax;
    if (quantity < min) errors[catalogErrorKey(line.id)] = messages.catalogBelowMinimum(min);
    else if (quantity > max)
      errors[catalogErrorKey(line.id)] = messages.catalogOutOfRange(textOf(line.name).trim(), min, max);
  });

  const totalCents = context.totalCents;
  if (typeof totalCents === "number" && Number.isFinite(totalCents)) {
    if (totalCents > TOTAL_MAX_CENTS) errors.total = messages.totalTooLarge;
    const amountPaid = parseNumberInput(context.amountPaid);
    if (amountPaid !== null && toCents(amountPaid) > totalCents)
      errors.amountPaid = messages.amountPaidOverTotal;
  }

  return errors;
}

/**
 * Whether a custom booking's time runs into a closure (web customClosureWarning).
 * A custom booking has no package, so closures aimed at packages never reach it;
 * a closure aimed at spaces reaches it only when its space is one of them; a
 * location-wide closure always does.
 */
export function isCustomSlotClosed(
  dayOffs: PackageClosureDayOff[],
  dateKey: string,
  startMinutes: number,
  endMinutes: number,
  roomId: number | null,
  today: Date,
): boolean {
  const reaching = dayOffs
    .filter((off) => {
      if (off.packageIds.length > 0) return false;
      if (off.roomIds.length > 0) return roomId != null && off.roomIds.includes(roomId);
      return true;
    })
    // Read every remaining closure as location-wide for the shared check below.
    .map((off) => ({ ...off, packageIds: [], roomIds: [] }));
  return isPackageTimeSlotRestricted(reaching, -1, dateKey, startMinutes, endMinutes, today);
}
