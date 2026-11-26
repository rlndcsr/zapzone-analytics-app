# ZapZone Mobile — Documentation Index

> **Purpose:** Entry point to the ZapZone Mobile documentation. It says which document answers which question,
> and how much weight each document carries.
> **Status:** Baseline (descriptive)
> **Last reviewed:** 2026-11-26
> **Inspected revisions:** Mobile `973d281` (main); Web Admin `zappoint@5de9d9e`; Backend `zapzone-backend@ae877e2`
> **Scope & limitations:** The baseline comes from static source inspection of the revisions above. Nothing in it
> was verified by running the app on a device. Documentation does not update itself, so code merged after these
> revisions may differ.

**Quality review (2026-11-26):** a targeted, evidence-based review checked the high-impact claims: authentication
and session, tenant and location scoping, roles, booking check-in, payments, API contract defects and platform
facts. It also spot-checked all six feature domains. The verified claims held. Corrections were limited to
qualification and classification (for example KL-WAIVER-003, KL-BOOK-003 and payment idempotency wording) and to
count fixes (237 business rules). Areas not re-reviewed remain as originally documented. They are still static
findings only, and the Backend charge handler is still unassessed (KL-PAYMENT-006).

## Why this documentation exists

ZapZone Mobile is a brownfield application with many implemented modules. This baseline records what the app
**actually does** at a known revision. That lets both developers, new Claude Code sessions and future
Spec-Driven Development (SDD) specifications start from the same facts. It is **descriptive, not prescriptive**:
it describes existing behaviour, including gaps and suspected defects. It does not approve that behaviour as a
requirement.

## Start here

| If you need to… | Read |
|---|---|
| Understand what the app is and who it is for | [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) |
| Find a module, its routes and its status | [FEATURE_CATALOG.md](FEATURE_CATALOG.md) → `features/*` |
| Understand how the app works technically | [ARCHITECTURE.md](ARCHITECTURE.md) → `architecture/*` |
| Check a business rule before changing behaviour | [BUSINESS_RULES.md](BUSINESS_RULES.md) → `business-rules/*` |
| Follow the existing coding conventions | [DEVELOPMENT_GUIDELINES.md](DEVELOPMENT_GUIDELINES.md) |
| Set up the sibling Web Admin and Backend repositories | [DEVELOPMENT_GUIDELINES.md §1](DEVELOPMENT_GUIDELINES.md#repository-layout-and-cross-repository-references) |
| Check known gaps, technical debt and risks | [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) |
| Write a new feature spec | Read the catalog entry, business rules and limitations for the affected modules first. Then follow the constitution in `.specify/memory/constitution.md` (v1.0.0, ratified 2026-11-26). |

### Reading guide by task

**Load selectively.** Don't read all ~29 documents for every task. Start from the row that matches the change, read
those documents, then follow links only as needed. AI sessions should do the same: open the catalog row and the one
matching `features/`, `business-rules/` and `architecture/` file, and search
[KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) for the module name. Avoid loading whole domains up front.

| Task | Read first | Then, if relevant |
|---|---|---|
| General orientation | [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md), [ARCHITECTURE.md](ARCHITECTURE.md) | [FEATURE_CATALOG.md](FEATURE_CATALOG.md) |
| Changing an existing module | Its [FEATURE_CATALOG.md](FEATURE_CATALOG.md) row → its `features/*` section | Matching `business-rules/*` file; its `KL-*` items |
| Web Admin parity work | The module's `features/*` section ("Web Admin counterpart" field) and the matching `business-rules/*` entries | [DEVELOPMENT_GUIDELINES.md §13](DEVELOPMENT_GUIDELINES.md); the Web Admin and Backend source themselves |
| API or service changes | [architecture/api-layer-and-data-flow.md](architecture/api-layer-and-data-flow.md) | [architecture/caching-and-synchronization.md](architecture/caching-and-synchronization.md); [business-rules/core-platform-rules.md](business-rules/core-platform-rules.md) (`BR-API-*`) |
| Authentication, session, accounts | [architecture/startup-auth-and-session.md](architecture/startup-auth-and-session.md) | [architecture/security-and-data-handling.md](architecture/security-and-data-handling.md); `KL-ARCH-001`, `KL-SEC-*` |
| Roles, location scope, authorisation | [architecture/location-and-role-access.md](architecture/location-and-role-access.md) | [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) "Security concerns" summary |
| Bookings, check-in, payments | [business-rules/bookings-and-scheduling.md](business-rules/bookings-and-scheduling.md), [business-rules/dashboard-administration-analytics-and-payments.md](business-rules/dashboard-administration-analytics-and-payments.md) (`BR-PAYMENT-*`) | [business-rules/attractions-events-and-checkin.md](business-rules/attractions-events-and-checkin.md); `KL-BOOK-*`, `KL-PAYMENT-*` (the charge handler is unreviewed: `KL-PAYMENT-006`) |
| UI work | [architecture/ui-navigation-and-styling.md](architecture/ui-navigation-and-styling.md), [DEVELOPMENT_GUIDELINES.md](DEVELOPMENT_GUIDELINES.md) §§5–6, 9 | `KL-UI-*` |
| Platform, native, iOS | [architecture/platform-and-release.md](architecture/platform-and-release.md), [architecture/native-integrations.md](architecture/native-integrations.md) | `KL-PLAT-*`, `KL-UI-001`–`003` |
| Testing and release preparation | [architecture/testing-and-quality.md](architecture/testing-and-quality.md), [architecture/platform-and-release.md](architecture/platform-and-release.md) | `KL-TEST-*`, `KL-OPS-001` |
| Future SDD specifications | The affected modules' catalog rows, `BR-*` and `KL-*` items | The source-of-truth model below |

## Document map

| Document | Responsibility | Status |
|---|---|---|
| [README.md](README.md) | This index; status definitions; proposed source-of-truth model; maintenance approach | Baseline |
| [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) | Identity, purpose, users, scope, stack, platform support, system context | Baseline |
| [FEATURE_CATALOG.md](FEATURE_CATALOG.md) | Central module inventory with status, roles, routes and links | Baseline |
| [features/](features/) | Detailed module documentation, grouped by domain | Baseline |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Architecture overview, boundaries, exceptions, diagrams | Baseline |
| [architecture/](architecture/) | Detailed technical subjects (startup/auth, API layer, location and roles, caching, security, UI/navigation, native integrations, platform/release, testing) | Baseline |
| [BUSINESS_RULES.md](BUSINESS_RULES.md) | Business-rule register: identifier scheme, enforcement layers, cross-domain discrepancies | Baseline |
| [business-rules/](business-rules/) | Detailed business-rule entries by domain (`BR-*` identifiers) | Baseline |
| [DEVELOPMENT_GUIDELINES.md](DEVELOPMENT_GUIDELINES.md) | Existing conventions and practices, plus recommendations awaiting approval | Baseline |
| [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) | Register of limitations, technical debt, parity gaps and suspected defects (`KL-*` identifiers) | Baseline |

### Historical and reference documents

Kept for context. **Do not use these as sources of current behaviour or requirements.** Each one carries a
status banner.

| Document | Status | Current replacement |
|---|---|---|
| [MOBILE_APP_OVERVIEW.md](MOBILE_APP_OVERVIEW.md) | Superseded (2026-06-25). Describes a read-only reporting app that no longer matches the code. | [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) |
| [MOBILE_APP_PROGRESS.md](MOBILE_APP_PROGRESS.md) | Historical (2026-07-04) progress snapshot | [FEATURE_CATALOG.md](FEATURE_CATALOG.md) |
| [MAX_UPDATE_DEPTH_DEBUG_REPORT.md](MAX_UPDATE_DEPTH_DEBUG_REPORT.md) | Historical investigation record (2026-08-27) | [architecture/startup-auth-and-session.md](architecture/startup-auth-and-session.md) |
| [reference/BACKEND_OVERVIEW.md](reference/BACKEND_OVERVIEW.md) | Unmaintained snapshot of the Backend repository (2026-06-25) | The Backend repository itself |
| [reference/FRONTEND_OVERVIEW.md](reference/FRONTEND_OVERVIEW.md) | Unmaintained snapshot of the Web Admin repository (2026-06-25) | The Web Admin repository itself |

The repository-root `README.md` is still create-expo-app boilerplate. It is outside the scope of this baseline
and is recorded as a documentation gap in [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).

## Status definitions

Implementation status and verification status are **separate**. A module can be "Implemented" but only
"Source-verified".

**Implementation status**

| Status | Meaning |
|---|---|
| Implemented | The functionality is present in the inspected source. |
| Partially implemented | The functionality exists, but has identified incomplete behaviour. |
| Not implemented | Confirmed absent within the inspected scope. |
| Not applicable | Does not apply to the Mobile workflow. |
| Not assessed | Not investigated enough to say. |

**Verification status**

| Status | Meaning |
|---|---|
| Source-verified | Confirmed by static source inspection. |
| Test-backed | Relevant automated tests exist (named). This does **not** mean they were run or passed. |
| Runtime-verified | Actual runtime behaviour was verified, with evidence. *No baseline entry uses this status; the app was not run.* |
| Device verification required | Behaviour on a physical device (especially iOS) is unverified. |
| Inferred | A reasonable interpretation that needs confirmation. |
| Unknown | Not enough evidence. |

**Document status:** *Baseline* (describes the code at the inspected revision), *Superseded*, *Historical*, or
*Reference snapshot*.

## Identifier conventions

- `BR-<DOMAIN>-NNN`: business rules. Each domain's entries live in the file listed in
  [BUSINESS_RULES.md](BUSINESS_RULES.md).
- `KL-<AREA>-NNN`: known limitations, technical debt and suspected defects, listed in
  [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).
- Identifiers are stable. Never reuse or renumber one. If an item no longer applies, mark it *Resolved* or
  *Withdrawn* with a date, rather than deleting it.

## Reference format

- **Mobile:** repository-relative path plus symbol, e.g. `src/lib/api.ts` (`apiRequest`).
- **Other repositories:** `zappoint@<sha>:<path>` (`Symbol`) and `zapzone-backend@<sha>:<path>` (`Class::method`).
- Line numbers are supplementary only, because they drift.

## Source-of-truth model

The ratified constitution adopts this model, refined in its "Source-of-Truth Model and Reserved Decisions" section.
That section is authoritative; this table is a summary.

| Question | Proposed authority |
|---|---|
| What does Mobile do today? | Mobile source code at HEAD. This documentation describes it, and loses if the two disagree. |
| What should a feature do? | Approved product decisions, then the relevant Web Admin behaviour. |
| What is the API contract, and what does the server enforce? | Backend implementation and verified API contracts. |
| What are we building next, and what are the acceptance criteria? | Approved SDD specifications under `specs/`. |
| What principles are mandatory? | The approved project constitution, `.specify/memory/constitution.md`. |
| What happened historically? | Historical documents. Context only. |

If sources disagree, **record the discrepancy and the decision it needs** (in the relevant business-rule entry or
in [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md)). Don't quietly let one source win in a way that changes existing
functionality. This baseline documents discrepancies; it does not resolve them.

## Relationship with Spec Kit and AI instructions

| Location | Role |
|---|---|
| `docs/` | Existing project knowledge (descriptive). |
| `.specify/memory/constitution.md` | Mandatory development principles, workflow tracks and governance (v1.0.0, ratified 2026-11-26). |
| `specs/` | Future feature specifications, plans, tasks and acceptance criteria. Not created yet. Existing features are not specified retroactively. |
| `CLAUDE.md` → `AGENTS.md` | Concise AI entry instructions: read the Expo v55 versioned docs before writing code, follow the constitution, and use this index to load documentation selectively. |
| `.claude/skills/speckit-*` | Spec Kit workflows. They run only when invoked explicitly (`disable-model-invocation: true`). |

**For AI assistants:** treat `docs/` as a map, not as ground truth. Verify any claim you rely on against the
current source before changing code. If you find a contradiction, report it rather than silently "fixing" the
documentation or the code.

## Maintenance approach (lightweight)

Constitution Principle IX makes the core of items 1 and 3 mandatory. The remaining items are recommendations.

1. **Same pull request, same truth.** When a change alters a module's behaviour, routes, roles or a `BR-*` rule,
   update the matching `features/*`, `business-rules/*` or catalog row in the same commit.
2. **Architecture docs** change only when a cross-cutting mechanism changes, for example `src/lib/api.ts`,
   session, location, caching, navigation shell, or native or release configuration.
3. **New SDD specs** cite the existing documentation and rule IDs they affect (`BR-*`, `KL-*`). When a spec is
   implemented, update the catalog row's status and resolve any `KL-*` items it closes.
4. **Staleness:** each primary document carries "Last reviewed" and the inspected commit. Anyone who finds a
   mismatch adds a `KL-DOC-*` entry, or fixes the documentation in a small documentation-only commit.
5. **Review through Git:** documentation changes go through the normal diff review. Each developer reviews
   documentation changes that touch modules the other owns.
6. **Re-baseline occasionally:** for example before a major release or platform milestone, refresh the
   "Inspected revisions" metadata after spot-checking.
