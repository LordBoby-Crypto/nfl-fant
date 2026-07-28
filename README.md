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

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

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
