# War Room

War Room is a personal NFL fantasy assistant for **THE League** on Sleeper.
The app connects directly to the public Sleeper API and provides:

- Live 2026 league and draft status
- Automatic identification of KingBoby's roster and draft slot
- Real league scoring, roster construction, and draft settings
- Pre-draft readiness and strategy context
- Responsive desktop and phone layouts
- Honest inactive states for features that require projections or drafted rosters

Milestone 2 adds:

- FantasyPros as the selected 2026 rankings, ADP, projections, injury and news source
- A Vercel serverless backend that keeps the paid API key out of GitHub Pages
- Password-protected, signed 12-hour sessions for provider-backed routes
- Strict dataset allowlisting, browser-origin checks and upstream caching
- A live backend/provider readiness state in the dashboard

Milestone 3 adds:

- A real War Room password form that exchanges the password for a signed
  private session without storing the password
- Session storage with explicit lock and automatic expired-session recovery
- A live 2026 PPR Rankings board with player search, position filters, ECR,
  tiers, ADP, projections, expert range, and injury designations
- A Players research interface with selected-player projection, availability,
  practice status, and recent FantasyPros news
- Parallel, independently recoverable provider feeds so one unavailable
  dataset does not blank the entire player board
- Position-specific projection aggregation for QB, RB, WR, TE, K, and DST
- Responsive table and player-detail layouts for desktop and phone

Milestone 4 adds:

- Five-second Sleeper pick synchronization while the draft is live
- Automatic removal of drafted players by Sleeper ID and normalized name
- Current picker, next KingBoby selection, and picks-until-turn tracking for
  the 14-team snake draft
- All-team roster construction and unfilled positional needs
- Five recommendations recalculated after every pick using value over
  replacement, scarcity, roster need, ADP, injury risk, and bye-week overlap
- Persistent watchlist, ordered queue, target, sleeper, and avoid controls
- A compact phone command view with recommendations, available players, and
  recent picks together
- A full pre-draft simulator for any practice slot while Sleeper's actual order
  remains unassigned

Milestone 5 adds:

- Clean redraft turn order, player availability, roster needs, forecasts, and
  simulations without carryover-player assumptions
- Opponent-pick forecasting from live roster needs, ADP/ECR, and observed
  value-versus-reach behavior, with alternatives and confidence
- Repeatable 50, 100, or 250-run draft simulations with draft grades, common
  roster outcomes, average position builds, and target hit rates
- Complete round-by-round plans with named pivots for all 14 possible draft slots
- Persistent simulation settings stored only in the current browser
- Correct next-turn calculations when Sleeper returns sparse pick data

Milestone 6 adds:

- A complete My Team workspace backed by the actual Sleeper roster
- Best-lineup optimization across every required slot, including FLEX
- Position-by-position starter quality, coverage, and bench-depth grades
- Prioritized roster weaknesses with specific next actions
- Rest-of-season strength scoring and league rank across all 14 teams
- Explicit FantasyPros rest-of-season projections (`ros=true`) rather than a
  generic projection period
- A 24-hour, reduced Sleeper player cache so the full NFL catalog is not
  downloaded on every app load

Milestone 7 adds:

- Ranked waiver recommendations from the real unrostered player pool
- FAAB low, target, and high ranges calibrated to remaining budget, league bid
  history, roster gain, positional need, injury risk, and Sleeper add momentum
- The safest corresponding drop or an add-only recommendation for open spots
- Search, position filters, recommendation confidence, and a phone Waivers view

Milestone 8 adds:

- A multi-player trade builder for every populated Sleeper roster
- Before-and-after lineup optimization for both teams in each proposal
- Separate ROS score, starting-lineup, bench-depth, projection, and league-rank
  changes for each side
- Needs solved, new weaknesses, positional-grade movement, injury warnings, and
  a both-team verdict
- Package-value and fairness evidence that supports—but does not replace—the
  roster-fit analysis

Milestone 9 adds:

- The current Sleeper opponent, live matchup score and projected win chance
- Weekly FantasyPros projections kept separate from rest-of-season projections
  for specific start/sit decisions
- Start/sit swaps with projected point gain, confidence and a plain-language
  reason
- Starter-aware injury and practice alerts with a specific pre-lock action
- Deterministic 3,000-run playoff simulations using current records, remaining
  matchups and rest-of-season team strength
- Remaining-schedule difficulty for every team plus the user's week-by-week
  opponent path
- A responsive Weekly Matchup workspace in desktop and phone navigation

Milestone 10 adds:

- A full green/yellow/red draft-day readiness report on the Overview screen
- Separate Sleeper league, draft, pick, roster, user and player-feed telemetry
- FantasyPros rankings and projection freshness based on the last real
  upstream success, including when Vercel serves a cached provider response
- FantasyPros-to-Sleeper match coverage across the top 350 draft-eligible
  ranked players, with unmatched-player evidence
- Draft date, order, rounds, timer, team count, redraft and scoring validation
- Live private-session time remaining, browser connectivity and backend latency
- Stale-data thresholds with exact last-success timestamps
- Three-attempt Sleeper recovery, pick-number deduplication, and last-complete
  pick-board retention when a failed or shorter response arrives

Milestone 11 adds:

- A complete 14-team, 17-round draft-board grid with all 238 pick cells
- Automatic position-run alerts using the latest six selections
- Tier-break warnings based on remaining same-position players and the next
  FantasyPros tier
- Modeled player survival probability through KingBoby's next selection
- Explicit **Draft now**, **Lean draft now**, and **Likely safe to wait**
  guidance on every recommendation
- Queue depletion alerts plus automatic detection when a queued, targeted, or
  sleeper player is selected
- Expected opponent selections before the next KingBoby turn, including team,
  position, player, and confidence
- Recommendation rank and score changes highlighted after every pick

Milestone 12 adds:

- Automatic focused Draft Room activation while Sleeper reports `drafting`
- Oversized current-picker, picks-until-turn, current-pick and position-run
  status in one emergency command surface
- Three always-visible recommendations with wait/draft and tier guidance
- Queue and six most recent picks alongside those recommendations
- Deduplicated sound and browser notifications at five, three and one pick
  away, plus a strong on-clock alert
- Optional position-run notifications
- Screen Wake Lock controls with clear unsupported or blocked states
- Draft-time navigation that temporarily removes Waivers, Trades and Matchups
- A compact phone layout that preserves the full command screen above the fold

Milestone 13 adds:

- Versioned JSON export and validated import for queue, watchlist, targets,
  sleepers, and avoids
- A standalone emergency HTML cheat sheet with saved lists and the top 200
  last-known rankings
- Printable FantasyPros rankings grouped by position and tier
- Persistent last-known FantasyPros rankings that survive provider failures
- Persistent last-complete Sleeper league and draft state for outage recovery
- Optional AES-256-GCM cross-device sync backed by a dedicated Supabase vault
- Recovery-code authorization with RLS isolation; Supabase stores ciphertext,
  never the encryption key or plaintext draft preferences
- A 30-minute session-expiration countdown and in-place renewal warning
- A responsive Backup & device safety workspace on desktop and phone

Milestone 14 adds:

- Automatic post-draft report activation when Sleeper reports `complete`
- Honest overall, starting-lineup, bench, depth, and risk-safety grades
- Best and worst selection review against FantasyPros ADP and ECR
- Separate justified and unnecessary reach analysis with explicit evidence
- Players successfully drafted at least half a league round after market
- Starter-aware bye-week and injury-risk concentration warnings
- The best available undrafted players and a first waiver watchlist shaped by
  roster needs plus saved queue, target, sleeper, and watchlist intent
- A Week 1 optimized lineup that uses weekly projections when published and
  falls back honestly to rankings when they are not
- Position weaknesses ordered into an immediate action plan
- Provisional-grade disclosure when a roster player cannot be matched

Milestone 16 adds:

- Sleeper as the automatic source of truth for teams, rounds, format, roster
  slots, bench, IR, taxi squads, FLEX, SUPER_FLEX, IDP and keepers
- Complete import and display of every Sleeper scoring rule
- Automatic team and draft-position detection
- Settings refresh on open, manual refresh, reconnect, live polling and before
  recommendations
- Commissioner-change notices with the exact old value, new value and
  recommendation impact
- Warnings only for structures the current engine genuinely cannot model

Milestone 17 adds:

- Fantasy-point reconstruction from FantasyPros statistical projections using
  the connected league's complete Sleeper scoring configuration
- Passing, rushing, receiving, kicking, defense, return and IDP component
  scoring, including reception formats and tight-end premium
- Attempts, completions, incompletions, turnovers, sacks and supported
  big-game yardage thresholds
- League-adjusted overall and positional ranks, replacement value, positional
  scarcity and recalculated tiers
- Roster-demand adjustment for FLEX, SUPER_FLEX, bench depth and IDP
- An auditable formula for every player with each projected statistic,
  multiplier and point contribution
- High, medium or low per-player confidence plus exact supported, partial and
  unsupported category warnings
- Honest partial models for total-fumble and field-goal-distance limitations;
  unavailable first-down, long-play and return-yardage counts are never
  silently invented

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

## Tests

```bash
npm test
```

The focused draft-engine suites cover snake order, simulator slot swaps,
redraft live turns, drafted-player removal, recommendation controls,
opponent forecasting, repeatable simulations, all-slot plans, and simulator
advancement. My Team tests cover lineup optimization, FLEX eligibility, injury
risk, depth weaknesses, and league-wide rest-of-season ranking. Waiver tests
cover FAAB calibration, rostered-player exclusion, safe drops, open spots, and
budget limits. Trade tests cover ownership, multi-player offers, both-team
lineup rebuilding, positional impact, and newly uncovered needs.
Weekly tests cover opponent resolution, projection-driven start/sit swaps,
starter injury escalation, deterministic playoff odds, schedule difficulty,
and unpublished-schedule states.
Preflight tests cover all-green readiness, missing setup blockers, slow-draft
warnings, stale provider data, session expiration, retry success, duplicate
pick removal, and last-complete-board retention.
Live-intelligence tests cover the complete 238-cell board, position runs, tier
cliffs, snake-turn survival targets, wait/draft guidance, controlled-player
losses, queue depletion, and recommendation movement.
Focused-mode tests cover five/three/one-pick thresholds, repeated-poll
deduplication, urgent on-clock priority, optional position-run alerts, and
fast-pick threshold recovery.
Backup and sync tests cover full preference round-tripping, invalid-import
rejection, emergency output, tier grouping, session warnings, recovery-code
validation, AES-GCM encryption, wrong-key rejection, and the protected
server-to-Supabase storage contract.
Post-draft tests cover Sleeper completion activation, stable grade boundaries,
selection value, justified and unnecessary reaches, successful waits,
bye/injury concentrations, undrafted-player ordering, saved-intent waiver
priorities, Week 1 optimization, and unmatched-player disclosure.
League-scoring tests cover PPR variants, tight-end premium, passing volume,
turnovers, yardage thresholds, kicking confidence, defense, returns, IDP,
unsupported custom categories, nested provider-stat parsing, roster scarcity,
replacement value and Superflex rank movement.

Milestone 15 adds the final draft-day release gate: complete 238-pick
rehearsals from early, middle, and late slots; outage/reconnect and provider
fallback checks; expired-session renewal validation; desktop/phone preference
handoff; duplicate-player prevention; and measured recommendation
recalculation budgets. Major feature work is frozen until after the draft under
[`docs/DRAFT_DAY_RELEASE_FREEZE.md`](docs/DRAFT_DAY_RELEASE_FREEZE.md).

Milestone 26 replaces that original gate with a complete adaptive rehearsal
matrix spanning standard, half-PPR, PPR, Superflex, tight-end premium, keeper,
IDP, custom/partial scoring, snake and linear drafts, 8–16 teams, 10–16 rounds,
multiple slots and live commissioner changes. Every pick must rebuild and
validate availability, rankings, recommendations and forecasts, while the
release also repeats outage, session, delayed-pick, correction, reconciliation,
cross-device and rendered desktop/phone checks. The replacement major-feature
freeze is active after the verified production release under
[`docs/MILESTONE_26_RELEASE_QUALIFICATION.md`](docs/MILESTONE_26_RELEASE_QUALIFICATION.md).

The project is configured for GitHub Pages at `/nfl-fant/`.

## Secure player data

The server-only environment variables are documented in `.env.example`. Do not
place the FantasyPros key in a `VITE_` variable: every `VITE_` value is shipped
to the browser.

The GitHub Pages build reads only the public backend URL:

```bash
VITE_INTELLIGENCE_API_URL=https://your-backend.vercel.app
```

The backend requires:

```bash
FANTASYPROS_API_KEY=
WAR_ROOM_PASSWORD=
WAR_ROOM_SESSION_SECRET=
```

Secure sync uses the dedicated `nfl-fant-sync` Supabase project. Its checked-in
fallback is a Supabase publishable key, not a secret key. RLS policies and the
recovery-derived vault secret enforce access to each encrypted row. Optional
server-side overrides are:

```bash
SYNC_SUPABASE_URL=
SYNC_SUPABASE_PUBLISHABLE_KEY=
```

See `docs/DATA_SOURCES.md` for the provider comparison and license constraints.

## Data sources

League data comes from Sleeper's public, read-only API. No Sleeper password or
API token is required. Player intelligence comes from FantasyPros after the
personal production key is configured. Provider data remains disabled until
then; the app does not invent rankings or substitute sample players.
