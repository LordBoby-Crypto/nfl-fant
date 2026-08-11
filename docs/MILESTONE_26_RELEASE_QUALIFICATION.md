# Milestone 26 release qualification

Status: **Accepted — production verified and major-feature freeze active**

Milestone 26 is a qualification and blocker-fix release. It does not add a new
draft workflow. The release is accepted only when the complete adaptive
rehearsal matrix, deterministic recovery suites, rendered desktop/phone checks,
preview verification and production verification are green.

## Automated configuration matrix

| Scenario | Scoring and roster model | Draft shape |
|---|---|---|
| Standard | Standard scoring, 1QB | 8 teams, 10 rounds, snake, slot 1 |
| Half PPR | 0.5 reception scoring, 1QB | 10 teams, 12 rounds, linear, slot 5 |
| PPR | 1.0 reception scoring, 1QB | 12 teams, 14 rounds, snake, slot 12 |
| Superflex | Half PPR, 1 SUPER_FLEX | 12 teams, 15 rounds, snake, slot 2 |
| Keeper TEP | PPR, 0.75 TE premium, imported keeper | 14 teams, 15 rounds, linear, slot 7 |
| IDP custom | PPR, DL/LB/DB/IDP_FLEX, yardage bonuses, distance kicking, unsupported first-down/long-play/return rules | 16 teams, 16 rounds, snake, slot 16 |

Every completed pick must trigger and validate:

1. Removal by provider ID and normalized name from every available ranking.
2. Recommendation rebuilding with the active roster and scoring model.
3. Next-turn forecast rebuilding for the next open pick.
4. Duplicate prevention across the board, recommendations and forecast paths.
5. Ranking, recommendation, forecast and complete-response timing capture.

An additional 10-team, 12-round rehearsal changes from standard 1QB to PPR,
Superflex and TE premium at pick 41. Every cycle before and after the change is
tagged with, and asserted against, the appropriate settings fingerprint.

## Recovery and continuity gate

The complete test suite must also pass the established deterministic checks
for internet loss, FantasyPros fallback, expired and renewed sessions, delayed
or missing Sleeper picks, reordered and duplicate picks, manual correction and
later Sleeper reconciliation, recommendation-history merging, encrypted
desktop-to-phone continuity, stale-source labeling and duplicate-free player
availability.

## Performance budgets

| Operation | Required budget |
|---|---:|
| Available-ranking rebuild, p95 | < 10 ms |
| Recommendation rebuild, p95 | < 50 ms |
| Forecast rebuild, p95 | < 350 ms |
| Complete post-pick response, p95 | < 450 ms |
| Complete post-pick response, maximum | < 2,000 ms |

These are CI safety ceilings, not claims about network latency. Rendered QA
must separately measure the visible response to refresh, navigation and draft
correction interactions.

## Production and freeze gate

1. Publish the exact tested tree to a draft pull request.
2. Verify the immutable Vercel preview build, runtime and protected routes.
3. Run rendered desktop and phone QA with no framework overlay, relevant
   console error or page-level horizontal overflow.
4. Merge only the verified head commit.
5. Verify the exact merge on Vercel production and GitHub Pages.
6. Verify status, session protection, runtime errors and public asset integrity.
7. Only then publish a documentation-only activation commit that changes the
   freeze from pending to active and records the production evidence.

If any step fails, the freeze remains pending and the release stays open.

## Final production result

Milestone 26 was accepted on `2026-08-11T17:43:41-05:00` after production
commit `c4571e19ac6e41165fed1ea47404716bae0770e8` passed the complete GitHub
Pages workflow, deployed bundle verification, Vercel production verification,
status and protected-route checks, runtime-error scan, and rendered desktop and
phone QA. The major-feature freeze is active under
[`DRAFT_DAY_RELEASE_FREEZE.md`](DRAFT_DAY_RELEASE_FREEZE.md).
