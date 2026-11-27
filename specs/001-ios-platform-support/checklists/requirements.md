# Specification Quality Checklist: iOS Platform Support

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-11-27
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [ ] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Validation Log

**Iteration 1** (2026-11-27)

- "All functional requirements have clear acceptance criteria": **failed**. FR-004 (documentation), FR-013
  (credential exposure), FR-018 (prerequisites checklist) and FR-063 (release classification) had no matching
  acceptance scenario or success criterion. **Fixed** by adding SC-012.
- "No [NEEDS CLARIFICATION] markers remain": **failed**. There are three markers: FR-014 (device families and
  minimum iOS version, RD-03/RD-04), FR-020 (initial coverage and kiosk scope, RD-12/RD-10) and FR-064 (test
  Backend environment and payment test mode, RD-07). These are product decisions reserved by the constitution, so
  they are presented to the developers and not resolved by assumption.

**Iteration 2** (2026-11-27): All items pass except the outstanding clarification markers.

**`/speckit-clarify` re-validation** (2026-11-27). This supersedes the Phase 4 marker and count notes below where
they conflict.

- The checkbox states are unchanged: 15/16 before and after. There are no newly passing items and no regressions.
- "No [NEEDS CLARIFICATION] markers remain" still fails. The FR-014 and FR-020 markers were resolved by developer
  decisions (RD-04 and RD-12 approved, and the RD-03 rule approved with its value pending technical verification).
  The FR-064 marker was converted into an explicit open operational prerequisite with restrictions (RD-07; its
  availability is unknown and is not resolved). Two new markers remain: FR-026 (push, RD-13) and FR-027 (kiosks,
  RD-10).
- Requirement identifiers: there are 53 unique functional requirements. That is the 48 from Phase 4, whose report
  wrongly said 47, plus FR-026, FR-027, FR-028, FR-065 and FR-073. There are no duplicates, and every FR, SC, RD and
  E reference resolves.
- "Implementation details" and "Technology-agnostic success criteria" pass, with a qualification. FR-014 names the
  SDK and React Native only to restate the developer-approved "no upgrade" compatibility constraint.
- "Scope is clearly bounded" passes, with a qualification. The push and kiosk boundaries are explicitly marked open
  (FR-026, FR-027) and are not assumed.
- "All functional requirements have clear acceptance criteria" passes. SC-004 now also covers FR-028, SC-003 covers
  FR-073, and SC-008 covers FR-065.
- After the RD-10 answer (Option B) and the tier F granularity correction, the checkbox states are unchanged:
  15/16. The FR-027 marker is resolved, and FR-027 now has its acceptance criteria in SC-013. One marker remains:
  FR-026 (push, RD-13). There are still 53 unique functional requirements, and every reference resolves.
- After the RD-13 answer (Option A) and the primary-tabs correction, the checkbox states are unchanged: 15/16. The
  FR-026 marker is resolved, and FR-026 now has its acceptance criteria in User Story 2 scenarios 8 to 14 and
  SC-014.
- Once all original markers were resolved, the specify-step cap of three markers no longer limited marking. Per
  Principle II, every still-open product decision now carries an inline marker: FR-010 (RD-01), FR-015 (RD-05),
  FR-037 (RD-11), FR-041 (RD-09) and FR-062 (RD-08). "No [NEEDS CLARIFICATION] markers remain" therefore
  **correctly stays unchecked**. RD-02 and RD-07 are operational prerequisites, and RD-03 (value) and RD-06 are
  planning items, so they carry no marker. There are still 53 unique functional requirements and 14 success
  criteria, and every reference resolves.
- After the RD-09 answer (Option A), the checkbox states are unchanged: 15/16. The FR-041 marker is resolved, and
  FR-041 now has its acceptance criteria in User Story 2 scenarios 15 to 19 and SC-015. Four markers remain: FR-010,
  FR-015, FR-037 and FR-062.
- After the RD-08 answer (Option A) and the session-policy qualification, the checkbox states are unchanged: 15/16.
  The FR-062 marker is resolved. The earlier "never block without a working action" wording in FR-062, User Story
  6, SC-010 and the edge cases was replaced, so nothing contradicts the approved mandatory-policy rule. Three
  markers remain: FR-010, FR-015 and FR-037.
- **Session complete** after the RD-11 answer (Option A), with 5 of 5 questions asked. The final state is
  **15/16**, unchanged from the start of the session: no items newly passing and no regressions. The FR-037 marker
  is resolved, and FR-037 has its acceptance criteria in User Story 7 scenarios 1 to 3 and SC-016.
  - **Still unchecked**: "No [NEEDS CLARIFICATION] markers remain". The two remaining markers are FR-010 (RD-01,
    bundle identifier) and FR-015 (RD-05, initial distribution). Both are product decisions needed before plan
    approval or the first build. Every product decision needed for specification approval is resolved.
  - **Final integrity**: 53 unique functional requirements, 16 success criteria (SC-001 to SC-016) and 13 reserved
    decisions. Every FR, SC, RD and E reference resolves, and acceptance scenarios are numbered sequentially in
    all 8 user stories. The only new headings are `## Clarifications` and `### Session 2026-11-27`.

## Notes

- **Implementation details (pass, with qualification).** Requirements and success criteria name no framework,
  library, file or API. Product and platform names appear only where unavoidable:
  - in the Context and Evidence Baseline (E-02 "Expo template" describes current state);
  - in Assumptions and Out of scope ("React Native or Expo SDK upgrade" restates a developer-stated exclusion).
  Platform concepts (OTA update, share sheet, Dynamic Island, bundle identifier) are the subject matter of a
  platform feature, not implementation choices. No build-service product is selected; channel structure is RD-06.
- **Non-technical audience (pass, with qualification).** This is a platform feature, and its primary
  stakeholders are the two developers. User stories and success criteria are written as observable outcomes. The
  Context table and Reserved Decisions are developer-facing by necessity.
- **Testability.** FR-014, FR-020 and FR-064 can be tested once their clarification markers are resolved.
  FR-038 ("no worse than Android") is tested by comparing the two platforms on the same screens.
- **Reserved decisions beyond the marker limit.** The installed workflow allows at most three
  `[NEEDS CLARIFICATION]` markers. Constitution Principle II requires every unresolved product or policy decision
  to be marked and left to developers. Both are honoured. The three highest-impact markers cover five reserved
  decisions (RD-03 and RD-04 share FR-014; RD-10 and RD-12 share FR-020; RD-07 is FR-064). The remaining seven
  (RD-01, RD-02, RD-05, RD-06, RD-08, RD-09, RD-11) are recorded as **Open** in the spec's Reserved Decisions
  table. Each has a "Needed before" gate and a recommendation labelled "not a decision". None is assumed by any
  requirement.
- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`.
