# War Room

War Room is a personal NFL fantasy assistant for **THE League** on Sleeper.
The first milestone connects directly to the public Sleeper API and provides:

- Live 2026 league and draft status
- Automatic identification of KingBoby's roster and draft slot
- Real league scoring, roster construction, and draft settings
- Pre-draft readiness and strategy context
- Responsive desktop and phone layouts
- Honest inactive states for features that require projections or drafted rosters

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

## Data

League data comes from Sleeper's public, read-only API. No Sleeper password or
API token is required. A separate projections/ADP provider will be integrated
before rankings and recommendation features are enabled.
