# Packages & Pricing — Business Rules

> **Purpose:** Record the business rules governing package, add-on, space, gift-card, promo, special-pricing and fee-support definitions and the shared pricing calculations, with the layer that enforces each.
> **Status:** Baseline (descriptive) — documents existing behaviour; not a requirements source
> **Last reviewed:** 2026-11-25
> **Inspected revisions:** Mobile `973d281`; Web Admin `zappoint@5de9d9e` (cited sections only); Backend `zapzone-backend@ae877e2` (cited sections only)
> **Scope & limitations:** Static source inspection only; nothing was run. "Backend (server-enforced)" is claimed only where the cited controller/request/middleware was read. How bookings and purchases apply these definitions server-side (e.g. whether the charged total is recomputed) is **Not assessed** here. `SpecialPricing::getFullPriceBreakdown`, `PromoController::locationIdsForActor` and Web Admin pricing utilities were not opened.
> **Related:** [Feature catalog](../FEATURE_CATALOG.md) · [Business rules index](../BUSINESS_RULES.md) · [Known limitations](../KNOWN_LIMITATIONS.md) · [Architecture](../ARCHITECTURE.md) · [Packages & pricing features](../features/packages-and-pricing.md)

---

## Packages (BR-PKG)

### BR-PKG-001 — Package lists use the lightweight mobile endpoint; detail uses the full record
- **Rule:** Every package list/picker loads `GET /api/mobile/packages` (scalar columns + location name, no images). The full `GET /api/packages/{id}` is used only for one package (details, edit seed, duplicate source). "Regular" = `package_type` empty or `regular`; every other type appears under Custom Packages.
- **Workflow:** Manage Packages, Custom Packages, Global Notes picker, Special Pricing item picker.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/services/packagesService.ts` (`fetchPackages`, `fetchPackageDetail`, `isRegularPackage`); `src/lib/hooks/usePackages.ts` (`kind` filter); `zapzone-backend@ae877e2:app/Http/Controllers/Api/MobilePackageController.php` (`LIGHTWEIGHT_COLUMNS`, `index`)
- **Exceptions:** None found.
- **Verification:** Source-verified
- **Open questions:** None

### BR-PKG-002 — A package and its relations belong to one location
- **Rule:** A package is created at one location. Non-company-admins are always saved at their own location; company admins choose (mobile defaults to the active workspace location). Attractions, spaces and add-ons linked to a package must belong to that package's location; location is not editable on Edit.
- **Workflow:** Create/Edit/Duplicate/Import Package.
- **Enforcement layer:** Backend (server-enforced); Mobile UI-only (pickers per location, selections cleared on location change)
- **Evidence:** `src/app/packages/create-packages.tsx` (`locationId` state, `prevLocationRef` effect); `src/app/packages/edit-packages.tsx` (read-only location); `zapzone-backend@ae877e2:app/Http/Controllers/Api/PackageController.php` (`store` forces `user->location_id` for non-company-admins; `assertRelationsMatchLocation` → 422; `update` checks `scopedLocation` for old and new location); `app/Http/Traits/ScopesByAuthUser.php` (`guardLocationAccess`)
- **Exceptions:** Duplicate to another location drops attractions/spaces/add-ons (BR-PKG-008).
- **Verification:** Source-verified
- **Open questions:** None

### BR-PKG-003 — Required package fields and numeric bounds
- **Rule:** Name, description, category, price (≥0, max 2 decimals), duration (≥1) and duration unit (`hours` / `minutes` / `hours and minutes`) are required on create. Min/max participants are integers ≥1 with min ≤ max. Per-person pricing requires both min and max. Partial payment percentage is an integer 0–100. Booking window 1–365 days; notice 0–8760 hours.
- **Workflow:** Create/Edit Package.
- **Enforcement layer:** Backend (server-enforced); Mobile client logic (subset)
- **Evidence:** `create-packages.tsx` / `edit-packages.tsx` (`validateStep`); `zapzone-backend@ae877e2:app/Http/Requests/StorePackageRequest.php`, `UpdatePackageRequest.php` (`rules`, `withValidator`)
- **Exceptions:** Mobile accepts "hours and minutes" totals below 1 hour (e.g. 0 h 30 m → `duration` 0.5) while the server requires `duration` ≥1 — **Mobile and Backend disagree**; outcome is a server 422.
- **Verification:** Source-verified
- **Open questions:** Is a sub-hour "hours and minutes" package intended to be allowed?

### BR-PKG-004 — A package must be able to produce a bookable slot
- **Rule:** Max tickets per slot cannot be below min participants; advance notice must be shorter than the booking window (`notice < window × 24 h`); a schedule's start ≠ end and its window must be at least the package duration (an end at/before start means "past midnight").
- **Workflow:** Create/Edit Package (and Bulk Import for the first two).
- **Enforcement layer:** Mobile client logic (all four); Backend (server-enforced) for slot cap and notice/window (and min/max in import)
- **Evidence:** `src/lib/packageSetup.ts` (`validatePackageSetup`); `StorePackageRequest` / `UpdatePackageRequest` (`withValidator`); `PackageController::bulkImport`
- **Exceptions:** Blank values skip their rule.
- **Verification:** Test-backed (`src/lib/packageSetup.test.ts`) for the mobile logic; server side Source-verified
- **Open questions:** Window ≥ duration is not found server-side (Not assessed beyond the request classes read).

### BR-PKG-005 — Availability schedules are a bulk replace
- **Rule:** Schedules are saved separately from the package by `PUT /api/packages/{id}/availability-schedules`, which deletes every existing schedule and recreates the list in one transaction. Each schedule is daily / weekly (weekday names) / monthly (`<occurrence>-<weekday>`, e.g. `first-saturday`); start/end `H:i`; interval 15–240 min; optional per-schedule min participants (sent as `null` explicitly); list order is the priority that decides which schedule wins on a day two cover.
- **Workflow:** Create/Edit Package.
- **Enforcement layer:** Backend (server-enforced); Mobile client logic (weekly/monthly need ≥1 day, interval ≥15, HH:MM)
- **Evidence:** `packagesService.ts` (`savePackageAvailabilitySchedules`); `src/lib/packages/scheduleDays.ts` (`scheduleCoversDate`, `matchesMonthlyPattern`); `zapzone-backend@ae877e2:app/Http/Requests/StorePackageAvailabilityScheduleRequest.php` (`schedules` present array, interval `min:15|max:240`); `PackageController::updateAvailabilitySchedules`
- **Exceptions:** Mobile Edit skips the PUT when no rows remain, so schedules cannot be cleared from mobile (Web Admin `EditPackage.tsx` does send an empty list) — see KL-PKG-004. Mobile does not check the 240-min maximum (KL-PKG-005).
- **Verification:** Test-backed (`src/lib/packages/scheduleDays.test.ts`, `scheduleSlots.test.ts`) for date matching/slot preview; save path Source-verified
- **Open questions:** None

### BR-PKG-006 — Front-End Availability ("backend only") may only be changed by managers and admins
- **Rule:** A package can be hidden from the customer booking site (`available_online=false`) while staff can still book it. Only `company_admin`, `admin`, `location_manager` may change the flag; new packages default to online; attendants see the state but cannot change it. A server without the column answers 503 (switch) or ignores it (create/edit), which mobile reports as "not applied".
- **Workflow:** Manage/Custom Packages switch; Create/Edit; Duplicate; Import.
- **Enforcement layer:** Backend (server-enforced); Mobile UI-only (button/field gating)
- **Evidence:** `src/lib/packages/onlineAvailability.ts` (`canChangeOnlineAvailability`); `packages.tsx` (`handleToggleOnline`); `routes/api.php` L431 (`staff:company_admin|admin|location_manager`); `PackageController` (`guardOnlineAvailabilityChange`, `updateOnlineAvailability`, `bulkImport` `$mayHidePackages`); `app/Models/Package.php` (`canChangeOnlineAvailability`, `isAvailableOnline`)
- **Exceptions:** A staff booking refused as online returns 422 `PACKAGE_NOT_BOOKABLE_ONLINE` (`isStaffLoginRefusal`) — bookings domain.
- **Verification:** Test-backed (`src/lib/packages/onlineAvailability.test.ts`) for the role list and wording; server Source-verified
- **Open questions:** None

### BR-PKG-007 — Package delete is a soft delete
- **Rule:** `DELETE /api/packages/{id}` soft-deletes (activity-logged); restore/force-delete exist only in Web Admin.
- **Workflow:** Manage/Custom Packages, Package details sheet, bulk delete (one request per id).
- **Enforcement layer:** Backend (server-enforced)
- **Evidence:** `PackageController::destroy` (`$package->delete()`, `soft_delete` metadata), `restore`, `forceDelete`; `zappoint@5de9d9e:src/pages/admin/packages/TrashedPackages.tsx`; mobile `packages.tsx` (`runDeleteSelected`)
- **Exceptions:** Mobile single-delete dialogs say "cannot be undone" (KL-PKG-008).
- **Verification:** Source-verified
- **Open questions:** None

### BR-PKG-008 — Duplicating a package
- **Rule:** No duplicate endpoint: the client loads the source and POSTs a copy named "<name> (Copy)", always inactive. Attractions/spaces/add-ons are copied only when the copy stays at the source location. A backend-only source stays backend-only only when a manager/admin duplicates it. Schedules are not copied.
- **Workflow:** Package details sheet → Duplicate.
- **Enforcement layer:** Mobile client logic; Web Admin reference behaviour
- **Evidence:** `packagesService.ts` (`duplicatePackage`); `zappoint@5de9d9e:src/pages/admin/packages/Packages.tsx` (`handleConfirmDuplicate`)
- **Exceptions:** Web also sends `is_escape_room` and `availability_schedules`; the latter is not a `StorePackageRequest` field, so neither client copies schedules. Mobile omits `is_escape_room` (KL-PKG-010).
- **Verification:** Source-verified
- **Open questions:** None

### BR-PKG-009 — Bulk import of packages
- **Rule:** Import takes a JSON array (or `{packages: []}`); ids, timestamps and location fields are stripped; every row is forced to the active workspace location (else the user's); `available_online` is always sent (absent = online). The server validates each row, refuses hidden rows from non-managers, and reports imported/failed counts per row.
- **Workflow:** Manage Packages → More → Import Packages.
- **Enforcement layer:** Mobile client logic; Backend (server-enforced) for row validation, location scope and hidden-row permission
- **Evidence:** `packages.tsx` (`runImport`, `importingRef`); `packagesService.ts` (`bulkImportPackages`); `PackageController::bulkImport`
- **Exceptions:** "All Locations" with no own location blocks import on mobile.
- **Verification:** Test-backed (`onlineAvailability.test.ts` — stayed-online count) for the counting helper; rest Source-verified
- **Open questions:** None

### BR-PKG-010 — Package price for a participant count
- **Rule:** `per_person`: price × participants (minimum 1). `base`: price + max(0, participants − min participants) × price per additional (unset minimum = 1). Mobile sends `price_per_additional = 0` for per-person packages.
- **Workflow:** Booking screens' package subtotal; package forms.
- **Enforcement layer:** Mobile client logic; Backend Not determined (bookings domain)
- **Evidence:** `src/lib/packages/packagePricing.ts` (`packagePriceForParticipants`); `create-packages.tsx` / `edit-packages.tsx` (`pricePerAdditional: perPerson ? 0 : …`)
- **Exceptions:** None found.
- **Verification:** Test-backed (`src/lib/packages/packagePricing.test.ts`)
- **Open questions:** Whether the server recomputes the same figure — Not assessed.

### BR-PKG-011 — Status switches survive in-flight refreshes
- **Rule:** Active and online switches apply optimistically, reconcile with the server's returned value, revert on error, and are replayed over any list fetch that started before them.
- **Workflow:** Manage/Custom Packages.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/lib/packages/patchLog.ts` (`createPatchLog`); `usePackages.ts` (`applyPatch`); `PackageController::toggleIsActiveStatus` (flips `is_active`)
- **Exceptions:** None found.
- **Verification:** Test-backed (`src/lib/packages/patchLog.test.ts`)
- **Open questions:** None

### BR-PKG-012 — Media are sent only when changed
- **Rule:** Package image is sent (base64 data URL) only when newly picked; the invitation is link **or** file; on edit the file is tri-state (new data URL / `null` to clear / omitted to keep), never resending the stored path.
- **Workflow:** Create/Edit Package.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `packagesService.ts` (`updatePackage`); `edit-packages.tsx` (`invitationFileForSave`); `PackageController::update` (image/invitation handling)
- **Exceptions:** None found.
- **Verification:** Source-verified
- **Open questions:** None

### BR-PKG-013 — Escape-room categories are folded for display
- **Rule:** Category aliases and difficulty names (e.g. "Beginner", "Advanced") display and filter as "Escape Room"; exports keep the stored value so import round-trips.
- **Workflow:** Package lists, filters, export.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/lib/venueCategories.ts` (`normalizeCategory`); `packages.tsx` (`runExport` uses `p.category`)
- **Exceptions:** None found.
- **Verification:** Test-backed (`src/lib/venueCategories.test.ts`)
- **Open questions:** None

### BR-PKG-014 — Global note targeting
- **Rule:** A global note has `package_ids = null` and applies to every package; a note with a package list applies only to those. An empty list matches nothing, so mobile requires ≥1 package when not global. Content is required; a cleared title is sent as `null`.
- **Workflow:** Global Notes.
- **Enforcement layer:** Mobile client logic; Backend (server-enforced) for `content` required and `forPackage` matching
- **Evidence:** `src/lib/packages/globalNotePayload.ts`; `global-notes.tsx`; `zapzone-backend@ae877e2:app/Http/Controllers/Api/GlobalNoteController.php` (`store`), `app/Models/GlobalNote.php` (`scopeForPackage`)
- **Exceptions:** Notes have no company ownership, so a "global" note's reach is not limited to one company (KL-PKG-021).
- **Verification:** Test-backed (`src/lib/packages/globalNotePayload.test.ts`)
- **Open questions:** Intended tenant scope of global notes.

---

## Add-ons (BR-ADDON)

### BR-ADDON-001 — Add-on quantity limits
- **Rule:** Minimum quantity ≥1; maximum may be empty (unbounded) and must be ≥ minimum. Booking steppers default to a 99 ceiling when no maximum is set.
- **Workflow:** Add-ons form; booking add-on steppers.
- **Enforcement layer:** Backend (server-enforced); Mobile client logic
- **Evidence:** `add-ons.tsx` (`saveForm`); `src/lib/addOnQuantity.ts` (`DEFAULT_MAX_QUANTITY`, `clampAddOnQuantity`); `AddOnController::store`/`update` (`min_quantity min:1`, `max_quantity gte:min_quantity`)
- **Exceptions:** A blank minimum is sent as `0` by mobile (`Number(fMin) || 0`), which the server's `min:1` rejects.
- **Verification:** Test-backed (`src/lib/addOnQuantity.test.ts`) for clamping; form Source-verified
- **Open questions:** None

### BR-ADDON-002 — Forced add-ons are per package
- **Rule:** An add-on is forced only for packages listed in its `price_each_packages`; the per-package minimum overrides the global one; a forced add-on starts at, and cannot go below, that minimum.
- **Workflow:** Booking screens (Manual Booking etc.).
- **Enforcement layer:** Mobile client logic; Web Admin reference behaviour (requires ≥1 package when forced)
- **Evidence:** `src/lib/addOnQuantity.ts` (`isForceAddOn`, `getAddOnMinQuantity`, `seedForcedAddOns`); `zappoint@5de9d9e:src/pages/admin/packages/AddOns.tsx` (submit validation)
- **Exceptions:** Mobile Add-ons form cannot set `price_each_packages`, so a forced add-on created on mobile is forced for no package (KL-PKG-012).
- **Verification:** Test-backed (`src/lib/addOnQuantity.test.ts`)
- **Open questions:** Server-side enforcement in bookings — Not assessed.

### BR-ADDON-003 — Add-ons belong to a location
- **Rule:** An add-on is created for a location (mobile requires one); company admins pick it, others default to their own. Writes on another location's add-on are refused.
- **Workflow:** Add-ons form.
- **Enforcement layer:** Backend (server-enforced); Mobile UI-only
- **Evidence:** `add-ons.tsx` (`openCreate`, `saveForm`); `AddOnController::store` (`scopedLocation`), `update`/`destroy` (`denyForeignRecord`)
- **Exceptions:** Server accepts `location_id` null on store; mobile never sends null.
- **Verification:** Source-verified
- **Open questions:** None

---

## Spaces (BR-SPACE)

### BR-SPACE-001 — Space fields
- **Rule:** A space needs a location and name; capacity optional integer ≥1; turnaround (`booking_interval`) integer ≥0 minutes (default 15 on create); on edit a blank turnaround keeps the stored value; a cleared area group is sent as `null` (ungroups).
- **Workflow:** Space create/edit.
- **Enforcement layer:** Backend (server-enforced); Mobile client logic
- **Evidence:** `space.tsx` (`saveRoom`, `saveCreate`); `src/lib/rooms.ts` (`turnaroundUpdate`, `areaGroupValue`); `RoomController::store`/`update`
- **Exceptions:** None found.
- **Verification:** Test-backed (`src/lib/rooms.test.ts`) for the helpers
- **Open questions:** None

### BR-SPACE-002 — Area-group turnaround
- **Rule:** One turnaround is applied to every space in an area group; blank or negative input is rejected (never silently 0).
- **Workflow:** Space → Area group settings.
- **Enforcement layer:** Mobile client logic; Backend has a dedicated endpoint mobile does not use
- **Evidence:** `space.tsx` (`saveAreaGroup`); `bookingsService.ts` (`updateAreaGroupInterval`, per-room PUT); `RoomController::updateBookingIntervalByAreaGroup` (used by `zappoint@5de9d9e:src/pages/admin/packages/Rooms.tsx`)
- **Exceptions:** Mobile is non-atomic (KL-PKG-015).
- **Verification:** Source-verified
- **Open questions:** None

### BR-SPACE-003 — Creating several spaces at once
- **Rule:** "Multiple" mode builds names from base + suffix + count + start and POSTs them one by one; after a partial failure the sheet closes and reports "N of M created" so a retry cannot duplicate the ones already saved.
- **Workflow:** Space create.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `space.tsx` (`saveCreate`, `buildRoomNames`)
- **Exceptions:** None found.
- **Verification:** Source-verified
- **Open questions:** None

---

## Gift cards (BR-GIFT)

### BR-GIFT-001 — Creating a gift card
- **Rule:** Type is `fixed` only; value >0 (mobile; server ≥0); the server sets `balance = initial_value` and generates the code; max usage ≥1; expiry blank (never expires) or strictly after today; empty targeting lists = unrestricted.
- **Workflow:** Gift Cards → Create.
- **Enforcement layer:** Backend (server-enforced); Mobile client logic
- **Evidence:** `gift-cards.tsx` (`submitCreate`); `src/lib/giftCards/giftCardExpiry.ts`; `GiftCardController::store` (`type in:fixed`, `expiry_date after:today`, `balance = initial_value`)
- **Exceptions:** Mobile shows an editable Balance field and percentage branches the server ignores/refuses (KL-PKG-016).
- **Verification:** Test-backed (`src/lib/giftCards/giftCardExpiry.test.ts`) for expiry; rest Source-verified
- **Open questions:** None

### BR-GIFT-002 — Selling a gift card at the counter
- **Rule:** Cash / in-store sales require a staff login; amount must be an offered denomination or between the configured min and max (default $10–$500); location managers/attendants sell only for their own location; a repeat of the same sale is answered as a duplicate (same card) instead of issuing another.
- **Workflow:** Gift Cards → Sell.
- **Enforcement layer:** Backend (server-enforced); Mobile client logic (10–500, purchaser name/email)
- **Evidence:** `src/lib/giftCards/sellGiftCard.ts` (`validateSellAmount`, `describeSellResult`); `GiftCardController::purchase`, `resolvePurchaseAmount`; `config/gift_cards.php`
- **Exceptions:** Mobile sends no `checkout_key`; duplicate detection relies on the server fingerprint (KL-PKG-017).
- **Verification:** Test-backed (`src/lib/giftCards/sellGiftCard.test.ts`) for client checks; server Source-verified
- **Open questions:** None

### BR-GIFT-003 — Gift card at checkout is a quote until the purchase is saved
- **Rule:** `POST /api/gift-cards/validate-code` quotes a discount without consuming the card; the applied discount is clamped to the subtotal and the amount due rounded to cents; after saving, the server-computed remainder decides settle / charge / retry.
- **Workflow:** Booking and purchase checkout (consumers outside this module).
- **Enforcement layer:** Mobile client logic; redemption Not determined (bookings domain)
- **Evidence:** `src/services/discountCodesService.ts`; `src/lib/giftCards/checkoutGiftCard.ts` (`giftCardDiscountFor`, `amountDueAfterGiftCard`, `reconcileGiftCardPurchase`)
- **Exceptions:** None found.
- **Verification:** Test-backed (`src/lib/giftCards/checkoutGiftCard.test.ts`)
- **Open questions:** None

### BR-GIFT-004 — An expired card is shown as inactive
- **Rule:** A card past its expiry counts as inactive in the list, whatever its stored status.
- **Workflow:** Gift Cards list/status chips.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `giftCardsService.ts` (`mapGiftCardRow`)
- **Exceptions:** None found.
- **Verification:** Source-verified
- **Open questions:** None

---

## Promo codes (BR-PROMO)

### BR-PROMO-001 — Creating a promo code
- **Rule:** Name required; type `fixed` or `percentage` (percentage ≤100); start and end dates required with end ≥ start (mobile defaults to today → +30 days when blank); code optional (server suggests a free code on conflict); total and per-user limits ≥1 when given.
- **Workflow:** Promos → Create.
- **Enforcement layer:** Backend (server-enforced); Mobile client logic
- **Evidence:** `promos.tsx` (`submitCreate`, `suggestedCodeFrom`); `PromoController::store` (rules, percentage check)
- **Exceptions:** None found.
- **Verification:** Source-verified
- **Open questions:** None

### BR-PROMO-002 — Editing a promo code
- **Rule:** Targeting lists are always sent (`[]` = unrestricted); a blank/0 total limit is sent as `null` (no limit); per-user limit never below 1; dates travel together.
- **Workflow:** Promos → Edit.
- **Enforcement layer:** Mobile client logic; Backend (server-enforced) for `after_or_equal:start_date` and limits
- **Evidence:** `promos.tsx` (`submitEdit`); `PromoController::update`
- **Exceptions:** Mobile rejects end = start; the server allows it — **Mobile and Backend disagree** (KL-PKG-019).
- **Verification:** Source-verified
- **Open questions:** None

### BR-PROMO-003 — Promo location targeting is limited to the actor's locations
- **Rule:** The server rewrites requested `location_ids` through `locationIdsForActor` on create, update and bulk generation.
- **Workflow:** Promos create/edit/bulk.
- **Enforcement layer:** Backend (server-enforced) — call sites verified; function body Not assessed
- **Evidence:** `PromoController` (`store` L171, `update` L571, `generateBulk` L813)
- **Exceptions:** None found.
- **Verification:** Inferred
- **Open questions:** Exact narrowing rule.

### BR-PROMO-004 — Bulk code generation limits
- **Rule:** Quantity 1–1000, code length 4–16, prefix ≤10 alphanumeric; each code gets a per-code usage limit (default 1) and per-user limit 1.
- **Workflow:** Promos → Generate Bulk Codes.
- **Enforcement layer:** Backend (server-enforced); Mobile client logic (clamps quantity/length)
- **Evidence:** `PromoController::generateBulk`; `promos.tsx` (`submitBulk`)
- **Exceptions:** Mobile payload keys do not match the server's, so generation is refused (KL-PKG-002).
- **Verification:** Source-verified
- **Open questions:** None

---

## Pricing (BR-PRICE)

### BR-PRICE-001 — Special pricing follows the visit, not the sale
- **Rule:** Specials are quoted for the visit date/time. With no scheduled date the venue's today and current clock are used, unless the screen requires a picked date first.
- **Workflow:** Purchases and bookings (shared pricing services).
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/lib/pricing/specialPricing.ts` (`specialVisit`, `venueTodayKey`); `src/lib/hooks/useOnsitePricing.ts` (`requireDate`); `pricingService.ts` (`fetchSpecialPricing` `date`)
- **Exceptions:** None found.
- **Verification:** Test-backed (`src/lib/pricing/specialPricing.test.ts`)
- **Open questions:** None

### BR-PRICE-002 — Specials are priced per unit × quantity
- **Rule:** `for-entity` receives one unit's price (ticket / participant / flat package) plus `quantity`; a fixed special comes off every unit and a percentage never touches add-ons. For packages, quantity = participants when `per_person`, else 1. Older servers that omit `quantity` are scaled client-side the same way.
- **Workflow:** Shared pricing services.
- **Enforcement layer:** Mobile client logic; Backend (server-enforced) for the `quantity` parameter
- **Evidence:** `pricingService.ts` (`fetchSpecialPricing`); `specialPricing.ts` (`packageSpecialQuantity`, `normalizeSpecialBreakdown`); `SpecialPricingController::getForEntity` (`quantity` 1–10000)
- **Exceptions:** None found.
- **Verification:** Test-backed (`src/lib/pricing/specialPricing.test.ts`)
- **Open questions:** None

### BR-PRICE-003 — How fees and specials combine
- **Rule:** Base = subtotal + add-ons − manual discount (clamped to [0, subtotal + add-ons]); fees are quoted on that base; total = fee total − special discount, floored at 0; with no fee data, total = base − special.
- **Workflow:** Shared pricing services.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/lib/pricing/combineFreshPricing.ts`; `useOnsitePricing.ts`; `pricingService.ts` (`resolveFreshPricing`)
- **Exceptions:** None found.
- **Verification:** Test-backed (`src/lib/pricing/combineFreshPricing.test.ts`)
- **Open questions:** Whether the server charges the same total — Not assessed (KL-PRICE-007).

### BR-PRICE-004 — Payment waits for a verified special
- **Rule:** Payment is blocked while the special check for the current inputs is pending or has failed ("payment is paused"); purchase edits re-quote the special via `special-quote` and show a repricing notice.
- **Workflow:** Purchase/booking checkout and edits.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `specialPricing.ts` (`specialCheckState`, `specialPaymentBlocker`, `repricingNotice`); `useOnsitePricing.ts`; `useSpecialRepricing.ts`; `pricingService.ts` (`quotePurchaseSpecial`)
- **Exceptions:** None found.
- **Verification:** Test-backed (`src/lib/pricing/specialPricing.test.ts`)
- **Open questions:** None

### BR-PRICE-005 — Special pricing rule definition
- **Rule:** Fixed or percentage (≤100); recurrence one-time (needs `specific_date`; start/end cleared), weekly (`recurrence_value` 0–6) or monthly (1–31); optional first/last visit dates (last ≥ first) and visit time window (to > from); entity type package/attraction/event/all with an empty item list meaning all of that type; priority ≥0; stackable flag; `company_id` required on create.
- **Workflow:** Special Pricing create/edit.
- **Enforcement layer:** Backend (server-enforced); Mobile client logic (name only)
- **Evidence:** `create-special-pricing.tsx` (`submit`); `specialPricingService.ts` (`SpecialPricingInput`); `SpecialPricingController::store`, `::update`
- **Exceptions:** Mobile cannot send `company_id`, `specific_date`, or a new monthly day — **Mobile and Backend disagree** (KL-PRICE-001, KL-PRICE-002).
- **Verification:** Source-verified
- **Open questions:** None

### BR-PRICE-006 — Company-wide rules show under every location
- **Rule:** Special-pricing and fee lists keep rules with no location (company-wide) plus those of the active location.
- **Workflow:** Special Pricing and Fee Supports lists.
- **Enforcement layer:** Mobile client logic; Backend (server-enforced) for managers/attendants (`location_id` = own or null)
- **Evidence:** `pricing.tsx`, `fee-support.tsx` (active-location filter); `SpecialPricingController::index`, `FeeSupportController::index`
- **Exceptions:** None found.
- **Verification:** Source-verified
- **Open questions:** None

---

## Fees (BR-FEE)

### BR-FEE-001 — Fee support definition
- **Rule:** Fee is fixed or percentage, additive (added on top) or inclusive (inside the price), for package/attraction/event/membership; it either applies to all items of that type (`applies_to_all`, re-evaluated for new items) or to ≥1 named item; `company_id` required on create.
- **Workflow:** Fee Supports create/edit.
- **Enforcement layer:** Backend (server-enforced); Mobile client logic (name, ≥1 item unless all)
- **Evidence:** `create-fee-support.tsx` (`submit`); `feeSupportService.ts` (`FeeSupportInput`); `FeeSupportController::store` (entity_ids closure), `::update`
- **Exceptions:** No upper bound on a percentage fee on either side. Mobile omits `company_id` (KL-PRICE-003).
- **Verification:** Source-verified
- **Open questions:** Should percentage fees be capped?

### BR-FEE-002 — A missing fee total is not $0
- **Rule:** A fee quote without a usable total is treated as "no data" (`null`), and callers keep the fee they already showed rather than charging zero fees.
- **Workflow:** Shared pricing services.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `pricingService.ts` (`fetchFeeBreakdown`)
- **Exceptions:** None found.
- **Verification:** Source-verified
- **Open questions:** None

---

## Cross-layer disagreements (summary)

| Topic | Mobile | Backend | Web Admin |
|---|---|---|---|
| Add-on image | array `image: [dataUrl]` | `nullable|string` | string |
| Bulk promo keys | `campaign_name`, `discount_type`, `discount_value`, `uses_per_code` | `name`, `type`, `value`, `usage_limit_per_code` | matches backend |
| Special pricing / fee create | no `company_id` | `company_id` required | sends `company_id` (`|| 1`) |
| Special pricing one-time/monthly | no date / day picker | `specific_date`, `recurrence_value` required | pickers present |
| Package `display_order` | `null` | nullable rule, NOT NULL column | number (default 0) |
| Clearing schedules on edit | skipped when empty | empty list accepted | sends empty list |
| Promo same-day window | rejected on edit | allowed | Not assessed |
| Schedule interval max | not checked | 240 | Not assessed |
| Sub-hour "hours and minutes" duration | allowed | `duration min:1` | Not assessed |
