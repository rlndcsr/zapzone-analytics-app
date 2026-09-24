import {
  packagePriceForParticipants,
  participantLabelFor,
} from "../packages/packagePricing.ts";

/**
 * The priced lines the Edit Booking "Booking Summary" card itemises.
 *
 * These say what each line is *made of*. They never decide what the booking costs — subtotal,
 * fees, discount and total all come off the server's reprice quote. That split is why the package
 * line here is the package alone and the heads past its minimum are a line of their own: it is how
 * the web summary reads them out, and it keeps this file away from the money that has to agree
 * with the server.
 */
export type SummaryLine = {
  label: string;
  /** The small grey note after the label — "(4 × $25.00 per participant)". */
  hint?: string | null;
  amount: number;
};

/** Money inside a line's label or hint, printed the way the web prints it. */
const money = (n: number) => `$${Number(n ?? 0).toFixed(2)}`;

/** Only the parts of a package that decide how its lines read. */
export type SummaryPackage = {
  pricingType: string | null;
  price: number;
  minParticipants: number | null;
  pricePerAdditional: number | null;
  participantLabel: string;
};

/**
 * The package's own line.
 *
 * Per-person packages price every head here, so the hint shows the arithmetic. A flat-priced one
 * charges its headline price for everyone up to its minimum, and the heads past that are
 * extraParticipantsLine's business, not this line's.
 */
export function packageSummaryLine(
  pkg: SummaryPackage | null,
  participants: number,
): SummaryLine | null {
  if (!pkg) return null;

  const perPerson = pkg.pricingType === "per_person";
  const minParticipants = pkg.minParticipants ?? 0;

  return {
    label: "Package",
    hint: perPerson
      ? `(${participants} × ${money(pkg.price)} per ${participantLabelFor(pkg.participantLabel)})`
      : minParticipants > 1
        ? `(up to ${minParticipants} people)`
        : null,
    amount: perPerson
      ? packagePriceForParticipants({
          pricingType: "per_person",
          price: pkg.price,
          participants,
        })
      : Number(pkg.price ?? 0),
  };
}

/**
 * The heads past a flat-priced package's minimum.
 *
 * Null for a per-person package, which has already counted every one of them in the package line —
 * charging them again here is how a booking ends up billed twice for the same people.
 */
export function extraParticipantsSummaryLine(
  pkg: SummaryPackage | null,
  participants: number,
): SummaryLine | null {
  if (!pkg || pkg.pricingType === "per_person") return null;

  const minParticipants = pkg.minParticipants || 1;
  const pricePerAdditional = Number(pkg.pricePerAdditional ?? 0);
  const extra = Math.max(0, participants - minParticipants);

  if (extra <= 0 || pricePerAdditional <= 0) return null;

  return {
    label: `+${extra} extra participant${extra > 1 ? "s" : ""} × ${money(pricePerAdditional)}`,
    amount: extra * pricePerAdditional,
  };
}

/**
 * One add-on's line.
 *
 * `unitPrice` is resolved by the caller, because a booking's frozen price beats the catalog's
 * current one. A per-person add-on multiplies by the head count as well as its quantity.
 */
export function addOnSummaryLine(
  addOn: { name: string; pricingType: string | null },
  quantity: number,
  unitPrice: number,
  participants: number,
): SummaryLine {
  const perPerson = addOn.pricingType === "per_person";

  return {
    label: `${addOn.name}${quantity > 1 ? ` ×${quantity}` : ""}${
      perPerson ? ` × ${participants}` : ""
    }`,
    amount: perPerson ? unitPrice * quantity * participants : unitPrice * quantity,
  };
}

/** One kept attraction's line, at the price frozen when it was booked. */
export function attractionSummaryLine(attraction: {
  name: string;
  quantity: number;
  priceAtBooking: number;
}): SummaryLine {
  return {
    label:
      attraction.quantity > 1
        ? `${attraction.name} ×${attraction.quantity}`
        : attraction.name,
    amount: attraction.priceAtBooking * attraction.quantity,
  };
}
