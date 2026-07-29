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

See `docs/DATA_SOURCES.md` for the provider comparison and license constraints.

## Data sources

League data comes from Sleeper's public, read-only API. No Sleeper password or
API token is required. Player intelligence comes from FantasyPros after the
personal production key is configured. Provider data remains disabled until
then; the app does not invent rankings or substitute sample players.
