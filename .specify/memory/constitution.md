# ZapZone Mobile Constitution

ZapZone Mobile ("ZapZone Admin") is an internal operations and management app for venue administrators,
managers and staff. It is a single React Native / Expo (SDK 55) TypeScript codebase using Expo Router and
NativeWind, backed by the ZapZone Laravel Backend REST API, built and updated through EAS. Android is the
established platform; iOS is a planned initiative. This constitution governs all future development of the
Mobile repository. It defines durable principles, not feature requirements, and does not certify that existing
behaviour complies with it.

Normative terms: **MUST** / **MUST NOT** are mandatory; **SHOULD** / **SHOULD NOT** are expected practice and
any deviation needs a recorded justification; **MAY** is optional. "Developers" means the project's active human
developers. "AI assistants" means Claude Code or any other AI tool acting in this repository.

## Core Principles

### I. Sources of Truth and Web Admin Parity

- Work MUST use each source for the question it answers, as defined in the Source-of-Truth Model below. Sources
  MUST NOT be treated as a single ranking in which one silently overrides the others.
- Where Web Admin has an applicable counterpart workflow, Mobile MUST preserve its business outcome (rules,
  calculations, validation, state transitions, and Backend-enforced permissions) unless an approved decision
  records a deviation. Mobile MAY adapt layout, navigation and interaction to the device.
- Web-only functionality MAY be classified "Not applicable to Mobile" when the specification records the reason.
- A discrepancy between sources MUST be recorded in the specification, the matching `BR-*` entry, or a `KL-*`
  item. It MUST NOT be resolved silently. Existing behaviour in any repository is evidence of what happens, not
  proof of what is correct.
- A significant product or contract conflict MUST be escalated to the developers before implementation proceeds.
- Mobile work MUST NOT modify the Web Admin (`zappoint`) or Backend (`zapzone-backend`) repositories. A required
  change there MUST be recorded as a cross-repository dependency and needs explicit approval.
- Web Admin or Backend behaviour that a specification relies on, including code comments that claim parity, MUST
  be verified against source and cited with the inspected revision (commit SHA).

*Rationale:* Mobile ports a back office that already exists. Parity mistakes and silent "fixes" change business
behaviour that venues depend on. *Compliance:* specifications record the parity classification and the
Web/Backend references they cite. `/speckit-analyze` and review treat unrecorded discrepancies as defects.

### II. Proportionate Spec-Driven Development

- Before work begins, every change MUST be classified as **Full SDD**, **Lightweight SDD**, or **Direct
  maintenance** using the criteria in "Development Workflow and Quality Gates". When the classification is
  uncertain, the more rigorous track MUST be used. If scope or risk grows during work, the change MUST be
  reclassified upward.
- Full SDD and Lightweight SDD changes MUST have a developer-approved specification. It MUST contain testable
  acceptance criteria and explicit in-scope and out-of-scope boundaries.
- Unresolved product or policy decisions MUST be marked `[NEEDS CLARIFICATION]` and decided by a developer. AI
  assistants MUST NOT resolve them by assumption.
- Retrospective specifications for existing modules MUST NOT be required. A specification covers only what it
  changes.
- Implementation MUST stay within the approved scope. Work discovered along the way MUST be recorded as a
  follow-up, not absorbed into the change.

*Rationale:* two developers need predictable, reviewable changes without paying full-ceremony costs for small
work. *Compliance:* the track is recorded in the specification, or in the change report for direct maintenance.
Review checks that the delivered diff matches the approved scope.

### III. Security, Authorization and Data Isolation (NON-NEGOTIABLE)

- Backend authorization is authoritative for every protected operation. Mobile role checks, navigation gating and
  hidden buttons are user-experience controls. They MUST NOT be described or relied on as security boundaries.
- A rule MUST NOT be described as "enforced" unless the Backend code that enforces it has been inspected and
  cited.
- Company and location isolation MUST be enforced server-side. A feature MUST NOT depend on client-supplied
  identifiers (for example `user_id`, `company_id`, `location_id`) for authorization or data scope unless the
  Backend has been confirmed to validate them. Otherwise the gap MUST be reported as a dependency, and the
  feature MUST NOT be presented as secure.
- Specifications and plans that touch authentication, sessions, account switching, roles or staff management,
  payments, deletion, or export of personal data MUST include an explicit authorization and data-exposure
  analysis.
- Credentials, tokens, signing material, payment card data and sensitive customer data MUST NOT appear in source
  code, logs, error reports, documentation, test fixtures or Git commits. Card data MUST go only to the payment
  processor's tokenization service and MUST NOT be sent to the ZapZone Backend. Session credentials MUST be stored
  only in secure device storage. This rule does not restrict the app's authorized processing of customer data, or
  the use of synthetic, non-identifying test data.
- Session behaviour MUST be explicitly specified and approved. This covers inactivity timeout, re-authentication
  on resume, and saved-account switching. Current implementation values are not policy, and any change to
  authentication or session behaviour follows Full SDD.
- A change MUST NOT introduce, or knowingly worsen, a security weakness. Documented concerns (`KL-SEC-*`,
  tenant-scoping, waiver-snapshot and payment items) MUST NOT be presented as resolved without evidence. A
  specification that touches an affected area MUST reference the relevant items.
- Security findings MUST state their evidence level: source-level evidence, suspected weakness, confirmed
  vulnerability, exploitability unverified, or runtime verification required.
- If there is evidence of repository or environment compromise, work MUST stop and be reported before any
  tooling runs. This includes unexpected changes to the executable root JS configs (`tailwind.config.js`,
  `babel.config.js`, `metro.config.js`, `eslint.config.js`).

*Rationale:* the app handles multi-tenant venue data, customer personal data and payments, and earlier static
review found server-side scoping gaps and a prior build-config injection. *Compliance:* the plan's Constitution
Check records the authorization analysis. Review rejects secrets in diffs and unqualified "enforced" or
"resolved" claims.

### IV. API Contract and Data Integrity

- Before implementing against an endpoint, its Backend route, middleware, validation and response shape MUST be
  inspected at a recorded revision. They MUST NOT be inferred only from Mobile code or naming.
- Mobile MUST NOT invent API contracts. When a requirement depends on a Backend capability that is missing or
  incompatible, the dependency MUST be reported instead.
- Backend API, database schema or Web Admin changes MUST NOT be made without explicit approval.
- Requests SHOULD use the shared API client (`apiRequest` in `src/lib/api.ts`). It provides authentication,
  location scoping and the shared global error handling. A bypass MUST be justified in the plan, and it MUST
  either provide equivalent authentication, timeout and error handling or document how its handling differs.
- Screens that show remote data MUST handle loading, error, empty and refresh states. Mutations MUST prevent
  duplicate submission and MUST leave client state consistent with the server outcome after a failure.
- Changes MUST preserve existing caching and synchronization invariants, or redesign them explicitly in the plan.
  Cached data MUST NOT leak across accounts, sessions or locations.
- Record-level idempotency (no duplicate booking or purchase record) and charge-level idempotency (no duplicate
  card charge) are distinct properties. Each MUST be analyzed on its own, and neither may be assumed from the
  other.
- Payment-affecting changes follow Full SDD. They MUST verify failure paths: decline, timeout or unknown outcome,
  retry, and partial failure. A payment MUST NOT be reported to the user as successful unless the server confirmed
  it.

*Rationale:* the Backend serves both Web Admin and Mobile, and contract drift or double charges damage
customers and venues directly. *Compliance:* plans cite the inspected contracts. Tasks include the failure-path
verification, and review checks any request that bypasses `apiRequest`.

### V. One Codebase, Cross-Platform Compatibility and Android Protection

- Android and iOS MUST share one React Native / Expo codebase. Platform-specific code MUST be limited to cases
  where native behaviour requires it, and it MUST be justified and kept as local as practical.
- Existing Android functionality MUST be preserved. A change that can affect Android MUST include Android
  regression verification, and this applies to changes made for iOS too.
- Business rules MUST behave the same on every platform unless an approved specification records a difference.
- Specifications and plans that touch platform-sensitive areas MUST address them and document any platform
  difference. These areas include safe areas, keyboard, navigation and gestures, permissions and usage
  descriptions, camera, media and files, notifications, payments UI, and app update and install flows.
- Success on Android MUST NOT be treated as evidence of iOS behaviour. A platform MUST NOT be described as
  supported until it has a successful build and physical-device verification of the affected workflows.
- An approved specification MUST decide platform identity and distribution. This covers bundle identifiers,
  minimum OS versions, device families (phone or tablet), distribution method, EAS channels and platform update
  behaviour. This constitution decides none of them, and implementation defaults MUST NOT settle them.

*Rationale:* the iOS initiative must not regress the Android app staff use daily, and the two platforms differ
natively in ways a shared codebase can hide. *Compliance:* specifications state platform scope. Verification
reports list per-platform evidence separately.

### VI. Incremental Architecture and Consistent Mobile UX

- Changes SHOULD follow the existing repository organization and layering. Screens orchestrate. Hooks fetch and
  cache. Services wrap HTTP calls. Business logic lives in pure `src/lib` modules that do not import native
  modules at runtime, so Node can test it.
- Changes SHOULD reuse the established shared components and cross-cutting mechanisms instead of creating
  parallel implementations. These include the session store, active-location handling, role navigation
  configuration, navigation motion configuration, global prompt hosts, and shared sheets and headers. A parallel
  implementation MUST be justified.
- Changes MUST NOT introduce new TypeScript type errors or new lint errors.
- New dependencies, frameworks or architectural patterns MUST be justified in the plan and approved by a
  developer. Small changes MUST NOT carry unrelated migrations or refactors. A justified deviation from an
  existing pattern MAY be made when it is recorded.
- UI changes MUST respect role-based experiences and the applicable global location behaviour. They MUST provide
  meaningful loading, empty, error and success feedback. They MUST account for safe areas and the keyboard, and
  they MUST support the app's light and dark themes. Interactive elements SHOULD have adequate touch targets and
  accessibility labels.
- Web Admin workflows MUST be adapted to Mobile, not copied as desktop layouts. Existing intentional UX decisions
  MUST be preserved unless the approved specification changes them. Broad visual redesigns require developer
  approval.
- Existing inconsistencies recorded in the documentation are not mandates either way, and they do not require
  migration as part of unrelated work.

*Rationale:* consistency and reuse keep a large app maintainable by two people, and incremental improvement
avoids risky big-bang rewrites. *Compliance:* the plan's Complexity Tracking records justified deviations. Review
checks reuse, new dependencies, and type-check and lint results.

### VII. Evidence-Based Verification

- Every change MUST be verified in proportion to its scope and risk, and the completion report MUST say what was
  verified and how.
- When a change adds or alters business logic in a unit-testable module, it MUST add or update focused regression
  tests. For Full and Lightweight SDD, the specification or plan MUST explicitly request these tests so that
  `/speckit-tasks` generates them.
- Changes to application code MUST run the project checks that are relevant and safe: `npm test`,
  `npm run lint` and `npx tsc --noEmit`. Substantial changes SHOULD run all three. Documentation-only changes
  need none.
- Changes affecting native or platform-sensitive behaviour MUST receive physical-device verification on each
  affected platform before they are declared complete. Until then, that verification MUST be reported as an
  outstanding acceptance item.
- Reports MUST distinguish source-verified behaviour, existing test coverage, tests actually executed, passing
  tests, runtime verification and physical-device verification. A test MUST NOT be reported as passing unless it
  was run. A feature MUST NOT be called fully verified while required runtime or device checks remain.
- When a required check is not run, the report MUST state what was not run, why, the remaining verification
  requirement, and whether this affects acceptance.
- Before completion, the Git diff MUST be reviewed to confirm that only intended files changed.

*Rationale:* the codebase has pure-logic unit tests only, no CI and no recorded device QA, so honest reporting is
the main defence against false confidence. *Compliance:* completion reports use these verification categories,
and review rejects unsupported "verified" or "passing" claims.

### VIII. Release Safety and Runtime Compatibility

- Every application change MUST be classified by release impact. The classes are: JavaScript or asset change
  (potentially OTA-compatible), native dependency change, native configuration change, runtime-version change,
  and change requiring a new binary. The plan or change report MUST record the classification.
- An OTA update MUST target only installed binaries whose runtime is compatible with it, and only the intended
  platforms and channels.
- A native change MUST ship in a new build, with a runtime-compatibility assessment under the release
  configuration in effect (currently EAS with the `appVersion` runtime policy). The assessment MUST ensure that
  no OTA update can reach a binary that lacks the required native code. No unconditional version-increment rule
  applies; versioning follows the actual configuration and the approved release strategy.
- Adding a platform MUST NOT disrupt existing Android users' builds, runtimes, channels or update path.
- Without explicit developer authorization for that specific action, AI assistants MUST NOT do any of the
  following: publish OTA updates, start EAS builds, submit store releases, or modify signing credentials or EAS
  configuration.

*Rationale:* an incompatible OTA update can crash installed apps across the fleet, and channels and runtimes are
currently shared between platforms. *Compliance:* review checks the release classification. Builds and
publishes happen only on explicit authorization.

### IX. Documentation as Maintained Knowledge

- The `docs/` baseline is shared, descriptive project knowledge, and `docs/README.md` is its navigation entry
  point.
- When a change materially affects any of the following, it MUST update the relevant documentation in the same
  pull request or approved change set:
  - functionality;
  - business rules;
  - API contracts;
  - architecture;
  - authorization;
  - development conventions;
  - platform behaviour;
  - known limitations;
  - release procedures.

  Changes with no documentation impact need no documentation edits.
- `BR-*` and `KL-*` identifiers are stable and MUST NOT be reused or renumbered. A resolved or withdrawn item
  MUST be marked with its date and evidence (for example a commit) instead of being deleted.
- Documentation MUST distinguish historical, current (observed), proposed and approved behaviour. Being
  documented does not make a behaviour a requirement.
- Specifications MUST cite the `BR-*` and `KL-*` identifiers they affect.
- AI assistants MUST load documentation selectively through the `docs/README.md` reading guide. They MUST verify
  documentation claims against current source before relying on them, and they MUST report contradictions
  instead of silently changing either side.

*Rationale:* the baseline exists so that sessions don't have to re-investigate the codebase, and it is only
useful while it stays accurate. *Compliance:* review checks documentation impact for each change and the stable
handling of identifiers.

### X. Collaboration, Git Discipline and Scope Control

- Before making changes, the repository state MUST be inspected: branch, working tree and staged changes.
  Unrelated work, including the other developer's uncommitted changes, MUST be preserved.
- Changes MUST stay within the approved scope. They MUST NOT include unrelated refactoring or unauthorized
  dependency or configuration changes. Cross-repository dependencies MUST be identified.
- Completion reports MUST list the files changed and the verification performed.
- AI assistants MUST NOT do any of the following without explicit developer authorization for that action:
  - create or switch branches;
  - stage, commit or push;
  - merge or rebase;
  - reset, stash, clean or otherwise discard work;
  - fetch or pull;
  - publish builds or updates.

  Authorization for one action does not extend to other actions or later occasions.
- If a Spec Kit command, hook or extension would perform a Git action, the AI assistant MUST stop and request
  approval before it runs.
- Changes to shared infrastructure SHOULD be reviewed by the other developer before merging. This covers the API
  client, session handling, role navigation configuration, shared sheets, motion configuration and the root
  configs.
- This constitution establishes no mandatory branching strategy. Any branching policy requires a separate
  approved decision.

*Rationale:* two developers working with AI assistants on one repository need predictable, reversible changes
and no surprise Git operations. *Compliance:* review compares the diff with the approved scope. The completion
report lists files and checks.

## Source-of-Truth Model and Reserved Decisions

| Question | Source | Notes |
|---|---|---|
| What should the product do? | Approved product decisions and requirements | Recorded by the developers; specifications capture them per feature |
| How does an existing workflow behave in the business? | Web Admin (`zappoint`) | Primary reference for applicable workflows; verify against source |
| What is the API contract, and what does the server validate, authorize and persist? | Backend (`zapzone-backend`) | Authoritative for contracts and enforcement |
| What does Mobile do today? | Mobile source at `HEAD` | Observed behaviour, not proof of correctness |
| What is documented about the existing system? | `docs/` | Descriptive map; loses to current source on fact |
| What will this change do, and how is it accepted? | Approved specification under `specs/` | Binding within its own scope only |
| Which constraints apply to all work? | This constitution | Governs process and principles, not feature behaviour |

When sources disagree, the discrepancy MUST be recorded and the decision it needs MUST be identified. The work
MUST NOT redefine requirements silently or assume existing behaviour is correct. Significant conflicts escalate to
the developers. An approved specification MAY change Mobile behaviour within its scope. It cannot authorize
Backend or Web Admin changes, and it cannot violate a MUST in this constitution without a recorded exception.

**Reserved decisions.** The following are deliberately **unresolved** by this constitution. Each MUST be decided
explicitly by the developers, in an approved specification or decision record, before an implementation relies
on it. Current code values MUST NOT be treated as the decision.

- Session and accounts:
  - the exact inactivity timeout;
  - password or re-authentication requirements when resuming saved accounts.
- Bookings: check-in eligibility and balance-due policy, and whether generic status changes may force a
  check-in.
- Payments and data:
  - waiver deletion policy;
  - gift-card payment behaviour;
  - customer and staff data-export policy.
- iOS: bundle identifier, minimum supported version, iPhone versus iPad support, and distribution strategy.
- Release: EAS channel isolation, and platform-specific application update behaviour.
- Operations: kiosk restrictions.
- Collaboration: any new mandatory branching policy.

## Development Workflow and Quality Gates

**Tracks.**

| Track | Use for | Installed Spec Kit skills |
|---|---|---|
| **Full SDD** | Major features; iOS and other platform initiatives; authentication, session or authorization changes; payment-affecting changes; significant architectural change; complex cross-module workflows; high-risk or ambiguous requirements | `/speckit-specify` → `/speckit-clarify` (when material ambiguity remains; not required when requirements are already clear) → developer review of the specification → `/speckit-plan` → developer review of the plan → `/speckit-tasks` → `/speckit-analyze` → `/speckit-implement` → verification (Principle VII). `/speckit-checklist` SHOULD be used for security and payment requirements, and `/speckit-converge` MAY be used to append unbuilt work after implementation. |
| **Lightweight SDD** | Small Web Admin parity changes, bounded feature improvements, localized business-rule changes, moderate bug fixes with clear requirements | `/speckit-specify` (concise: requirements, acceptance criteria, scope boundaries, parity references, affected `BR-*`/`KL-*`) → developer review of the specification. Then either `/speckit-plan` → `/speckit-tasks` → `/speckit-implement` (SHOULD be used when the change spans more than one module or touches shared infrastructure), or implementation directly against the approved specification's acceptance criteria. `/speckit-clarify` and `/speckit-analyze` MAY be used. |
| **Direct maintenance** | Typographical fixes, small visual adjustments, documentation-only corrections, clearly understood low-risk maintenance | No specification is required. Principles VII and X still apply, and the change report states the track. |

Direct maintenance MUST NOT be used for changes touching any of the following; such changes are at least
Lightweight SDD:

- authentication, session or authorization;
- payments;
- data deletion or export;
- API contract usage;
- native dependencies or configuration;
- release configuration.

**Constitution Check (gate for `/speckit-plan`).** The plan MUST answer each applicable item. A "no" needs a
justified entry in Complexity Tracking or a recorded exception.

1. **Parity (I):** Web Admin counterpart and Backend contract inspected and cited with revisions? Discrepancies
   recorded? Is the work free of unapproved cross-repository changes?
2. **Track and scope (II):** Track recorded? Scope boundaries explicit? No unresolved `[NEEDS CLARIFICATION]` or
   reserved decision assumed?
3. **Security (III):** Authorization and data-exposure analysis done where required? No sensitive data
   exposure? No new or worsened weakness? Affected `KL-*` items referenced?
4. **Contracts and integrity (IV):** Shared API client used, or bypass justified? Failure, empty and loading
   states covered? Duplicate-submission and payment idempotency analyzed?
5. **Platforms (V):** Platform scope stated? Android regression protected? Platform-sensitive areas addressed?
6. **Architecture and UX (VI):** Existing layers and components reused? New dependencies or patterns justified?
   Is the change free of unrelated refactors?
7. **Verification (VII):** Tests requested for changed business logic? Checks and device verification
   planned per platform?
8. **Release (VIII):** Release-impact classification recorded? OTA and runtime compatibility assessed?
9. **Documentation (IX):** Documentation and `BR-*`/`KL-*` updates identified?
10. **Collaboration (X):** No Git, build or publish action planned without explicit authorization?

**Review points.**

- Specification review: track, scope, parity classification, reserved decisions.
- Plan review: Constitution Check.
- `/speckit-analyze`: treats violations of constitution MUSTs as CRITICAL.
- Completion report: files changed, verification categories, release classification, documentation impact.
- Developer review before merge.

## Governance

- **Authority.** This constitution governs future development of the ZapZone Mobile repository and takes
  precedence over conflicting practice or guidance. `docs/DEVELOPMENT_GUIDELINES.md` and `AGENTS.md` provide
  supporting guidance. Where they describe existing practice, it is not mandatory unless a principle here makes
  it so.
- **Status and ratification.** The developers ratified version 1.0.0 on 2026-11-26, and it is in effect.
- **Amendments.** Amendments are made through `/speckit-constitution`, as a change separate from feature work.
  Each amendment states its rationale, updates the version and Last Amended date, and includes a Sync Impact
  Report for review. Approval is proportionate to impact:
  - **Substantive amendments** need approval from both active developers. These are amendments that affect a
    mandatory principle, shared architecture, security, authorization, payment integrity or release policy.
  - **Minor clarifications** that do not change policy may be approved by one developer, who notifies the other.
  - **Editorial and typographical corrections** may be approved by one developer.
- **Versioning.** Semantic versioning applies:
  - MAJOR for removing or redefining a principle in a backward-incompatible way;
  - MINOR for adding a principle or section, or materially expanding guidance;
  - PATCH for clarifications and wording.
- **Compliance review.** Compliance is checked at the review points defined above. Constitution conflicts are
  resolved by adjusting the specification, plan or tasks, or by a formal amendment, never by silently ignoring a
  principle.
- **Exceptions.** An exception MUST be recorded in the plan's Complexity Tracking, or in the change report for
  work without a plan. It records the principle, the reason, the simpler alternative rejected, its scope and
  expiry, and the approving developer. No exception may permit introducing a new security weakness or exposing
  sensitive data. Accepting an existing security risk requires explicit, recorded developer approval.
- **Incremental adoption.**
  - New development MUST comply with the applicable principles.
  - Modified functionality SHOULD improve compliance where this is reasonably related to the approved scope.
  - Existing unrelated technical debt does not by itself block new work, and it remains documented in
    `KNOWN_LIMITATIONS.md`.
  - Changes MUST NOT knowingly worsen existing problems.
  - Significant security or data-integrity risks discovered during work MUST be escalated explicitly.
  - Incremental adoption is never a waiver of Principle III or of payment integrity.
  - This constitution does not itself start any remediation work.
- **Escalation.** Unresolved product, policy or architectural decisions are recorded, for example as
  `[NEEDS CLARIFICATION]`, a `BR-*` discrepancy or a `KL-*` item, and are decided by the developers. AI
  assistants surface them and never decide them.

**Version**: 1.0.0 | **Ratified**: 2026-11-26 | **Last Amended**: 2026-11-26
