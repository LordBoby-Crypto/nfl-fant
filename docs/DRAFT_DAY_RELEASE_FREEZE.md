# Draft-day release freeze — active

The original Milestone 15 freeze was superseded by the approved Milestones
16–26 upgrade program. Milestone 26 is the final major-feature release before
the 2026 draft. The replacement major-feature freeze is **active** after the
verified production release recorded below.

## Activation evidence

- Verified production commit: `c4571e19ac6e41165fed1ea47404716bae0770e8`
- Verified at: `2026-08-11T17:43:41-05:00`
- GitHub Pages workflow: run `31543436452` completed successfully
- GitHub Pages bundle: `assets/index-DeHB90bT.js`
- Vercel production deployment: `dpl_Fp2QZkeBQzBxr645cvAvdmNEmgNP` was `READY`
- Release gate: 133/133 tests, rehearsal matrix, lint, build, desktop/phone QA,
  status, session protection, runtime errors and public asset integrity passed

## Allowed during the freeze

- A narrowly scoped fix for a reproduced draft-day blocker
- Provider compatibility fixes required by Sleeper, FantasyPros, Vercel, or
  Supabase
- Security fixes
- Copy or style corrections that do not alter the draft engine

Every freeze-period change must include a regression test, pass the complete
test suite, and repeat the affected rehearsal. New features, broad refactors,
dependency upgrades, data-model changes, and visual redesigns wait until after
the draft.

## Mandatory release gate

GitHub Pages runs the full automated suite and lint before its production
build. `tests/draft-rehearsal.test.ts` and
`tests/adaptive-draft-rehearsal.test.ts` are part of that suite and must prove:

- Complete 238-pick snake drafts from slots 1, 7, and 14
- Complete adaptive drafts across 8, 10, 12, 14 and 16 teams; 10–16 rounds;
  snake and linear order; and early, middle and late slots
- Standard, half-PPR, PPR, Superflex, tight-end premium, keeper, IDP, custom
  bonus, partial-category and unsupported-category behavior
- Commissioner scoring and roster changes before and during a rehearsal
- Exactly 17 selections for the controlled roster from every slot
- No duplicate player selections
- Immediate removal of every drafted player from availability and
  recommendations
- Ranking, recommendation and forecast rebuilds after every pick using the
  active settings fingerprint
- Recommendation recalculation p95 below 50 ms and maximum below 250 ms on the
  CI runner
- Complete ranking/recommendation/forecast response p95 below 450 ms and
  maximum below 2,000 ms on the CI runner
- Retention and merge of the last complete Sleeper board through an outage
- Last-known FantasyPros rankings during provider downtime
- Expired-session rejection and successful renewed-session validation
- Lossless preference handoff between desktop and phone

## Manual production gate

For every freeze-period production change:

1. Verify the exact Vercel preview build and its logs.
2. Open the live Draft Room on desktop and phone-sized viewports.
3. Confirm the 238-cell board stays bounded and scrolls inside its container.
4. Confirm no framework overlay, application-origin console error, or
   page-level horizontal overflow.
5. Verify `/api/status`, unauthenticated protected-route rejection, and current
   Vercel runtime logs.
6. After merge, verify the same commit is live on Vercel and GitHub Pages.

The freeze was activated only after the first Milestone 26 production
deployment passed every gate above. This document is the required separate
documentation-only activation record.
