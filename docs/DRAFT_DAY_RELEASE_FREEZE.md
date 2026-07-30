# Draft-day release freeze

Milestone 15 is the final major-feature release before the 2026 draft. After
this milestone reaches production, `main` is frozen against major feature and
architecture changes until the draft completes.

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

GitHub Pages now runs the full automated suite and lint before its production
build. `tests/draft-rehearsal.test.ts` is part of that suite and must prove:

- Complete 238-pick snake drafts from slots 1, 7, and 14
- Exactly 17 selections for the controlled roster from every slot
- No duplicate player selections
- Immediate removal of every drafted player from availability and
  recommendations
- Recommendation recalculation p95 below 50 ms and maximum below 250 ms on the
  CI runner
- Retention and merge of the last complete Sleeper board through an outage
- Last-known FantasyPros rankings during provider downtime
- Expired-session rejection and successful renewed-session validation
- Lossless preference handoff between desktop and phone

## Manual production gate

Before merging Milestone 15:

1. Verify the exact Vercel preview build and its logs.
2. Open the live Draft Room on desktop and phone-sized viewports.
3. Confirm the 238-cell board stays bounded and scrolls inside its container.
4. Confirm no framework overlay, application-origin console error, or
   page-level horizontal overflow.
5. Verify `/api/status`, unauthenticated protected-route rejection, and current
   Vercel runtime logs.
6. After merge, verify the same commit is live on Vercel and GitHub Pages.

The freeze is complete only after every automated and production gate above is
green.
