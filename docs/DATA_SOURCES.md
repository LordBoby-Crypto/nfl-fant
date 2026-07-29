# 2026 player-intelligence sources

Research completed July 28, 2026.

## Selected stack

| Need | Selected source | Why |
| --- | --- | --- |
| League, rosters, draft, picks, matchups and transactions | Sleeper public API | Official source for the league and draft; no key required. |
| 2026 PPR rankings and tiers | FantasyPros Expert Consensus Rankings | Aggregates 130+ ranked experts and includes tiers and rank dispersion. |
| ADP | FantasyPros consensus rankings | ADP is returned alongside consensus rankings, keeping player IDs and scoring consistent. |
| Season and weekly projections | FantasyPros projections | Provides preseason, weekly and rest-of-season stat projections. |
| Injuries and practice status | FantasyPros injuries | Structured injury designations and practice-report status. |
| Player news | FantasyPros news | Filterable player news and notes through the same player identity system. |
| Critical injury verification | Official NFL/team reports | Final verification source when a roster decision depends on a late designation. No automated scraping is planned. |

## Why FantasyPros

FantasyPros is the best fit for this personal, non-commercial helper because one
official API covers all required intelligence datasets. Its 2026 personal
production access is bundled with FantasyPros HOF, advertised from $8.99/month
when billed annually. It also avoids fragile scraping and the matching errors
that come from combining unrelated ranking, projection and news vendors.

The free API tier is for prototyping only. Production use requires the personal
production key included with HOF or a commercial agreement.

## Alternatives considered

| Provider | Strength | Reason not selected |
| --- | --- | --- |
| Fantasy Nerds | Broad fantasy feed set and explicit 14-team PPR ADP support | Uses the key in the query string and would add another player-ID system without improving the primary use case enough. |
| SportsDataIO | Deep NFL coverage, projections, ADP, injuries and editorial news | Strong enterprise product, but pricing is sales-led and excessive for one personal league. |
| MySportsFeeds | Affordable personal core feed and projection add-ons | Less purpose-built consensus ranking/ADP coverage; would still require another source. |

## License and security constraints

- FantasyPros personal API data is for personal, non-commercial use.
- The API key must remain confidential.
- Provider-backed routes require a War Room password and a signed, expiring
  session token.
- Repeated failed password attempts are throttled.
- The browser only receives requested data after authentication; it never
  receives the FantasyPros API key.
- The backend restricts browser origins and caches upstream results to reduce
  unnecessary calls.
- Projection requests are split by NFL position and combined server-side so
  the browser receives one consistent player board.
- Weekly projections use the requested NFL week and a one-hour server cache;
  rest-of-season projections use `ros=true` and remain a separate six-hour
  dataset so start/sit and long-range decisions cannot be mixed accidentally.
- Sleeper matchup rows are paired by their official `matchup_id`; playoff odds
  remain model estimates and are never presented as provider guarantees.
- The browser stores only the signed, expiring session token in session
  storage. The War Room password is never persisted.
- FantasyPros attribution must be displayed anywhere provider data appears.

Official references:

- https://www.fantasypros.com/api-data/
- https://api.fantasypros.com/public/v2/docs/
- https://api.fantasypros.com/public/v2/terms-of-use
- https://docs.sleeper.com/
- https://api.fantasynerds.com/docs/nfl
- https://sportsdata.io/nfl-api
- https://www.mysportsfeeds.com/feed-pricing/
