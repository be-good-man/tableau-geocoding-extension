# Tableau Geocoding Extension

A Tableau dashboard extension that geocodes addresses and writes the result to a spatial parameter as WKT `POINT` geometry. Supports multiple geocoding providers.

## Features

- **Multi-provider support** — Google, Mapbox, Salesforce Maps, Geocodio, and OpenStreetMap (Nominatim)
- **Spatial parameter output** — writes `POINT(lng lat)` WKT directly to a Tableau spatial parameter
- **Request caching** — in-memory cache prevents redundant API calls within a session
- **History list** — click any previous request to re-apply its result instantly
- **Configurable** — settings dialog lets users choose provider, enter API key, and select the target parameter

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org) (v18+) and npm
- Tableau Desktop 2018.2+ (or Tableau Cloud/Server for web authoring)

### Setup

```bash
git clone https://github.com/yourorg/tableau-geocoding-extension.git
cd tableau-geocoding-extension
npm install
npm run dev
```

This starts a development server at `http://localhost:8765`.

### Load in Tableau

1. Open a Tableau workbook and navigate to a dashboard
2. Create a parameter (any data type — the extension writes WKT strings to it)
3. Drag an **Extension** object onto the dashboard
4. Click **My Extensions** and browse to `manifest/geocoding-extension.trex`
5. On first load, the settings dialog will prompt you to choose a provider and API key

## Usage

1. Type an address in the **Address** field
2. Press **Enter** or click **Locate**
3. The geocoded coordinates are written to your spatial parameter as `POINT(lng lat)`
4. Click any entry in the **Recent Requests** list to re-apply a cached result
5. Click the **Settings** gear icon to change provider or API key

## Development

```bash
npm run dev       # Start dev server + watch mode
npm test          # Run unit tests
npm run build     # Production build to dist/
npm run lint      # Lint TypeScript source
```

## Deployment

The `deploy.yml` GitHub Actions workflow automatically builds and deploys to GitHub Pages on push to `main`. Update the `<url>` in `manifest/geocoding-extension.trex` to your GitHub Pages URL for production use.

## Providers

| Provider | API Key Required | Free Tier | Rate Limits |
|----------|-----------------|-----------|-------------|
| Google | Yes | $200/mo credit | 50 req/sec |
| Mapbox | Yes | 100k req/mo | 600 req/min |
| Salesforce Maps | Yes (OAuth) | With SF Maps license | Per-org |
| Geocodio | Yes | 2,500 req/day | Varies |
| OSM (Nominatim) | No | Unlimited | 1 req/sec |

## License

MIT
