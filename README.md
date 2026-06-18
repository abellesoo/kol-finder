# KOL Finder — Seeding Tool

Instagram KOL/seeding candidate finder for any brand campaign.

Upload an Apify Instagram scraper `.xlsx` export (or scrape directly by pasting URLs/hashtags) → configure filters → get scored and ranked results → optionally run AI Deep-Dive for qualitative verdicts.

## What it does

- Parses Apify post-level scraper output and groups rows by influencer account
- Scores each account on two dimensions computed **entirely locally, no AI involved**:
  - **Engagement Score** — log-scaled median likes/views (arithmetic)
  - **Relevancy Score** — keyword matching against your selected niches
- Optional **AI Deep-Dive** (opt-in, costs money): sends account captions, hashtags, bio, and your campaign brief to Claude and returns a genuine qualitative verdict per account. This is the _only_ step that calls an AI model.
- Filters by minimum engagement, niche, location target
- Exports results to XLSX with per-brand color coding and workflow dropdowns

## Setup

```bash
npm install
npm run dev
```

Open `http://localhost:5173`

No API key is needed for local development unless you want to test live Apify scraping or AI Deep-Dive. Both go through the Cloudflare Worker proxy — see the Worker section below.

## How to use

### Option A — Upload XLSX

1. Run an Apify Instagram Scraper job (scrape competitor brand tags, hashtags, or tagged pages)
2. Export the dataset as `.xlsx`
3. Upload to this tool (Step 1)

### Option B — Scrape directly

1. Go to Step 1 → "Scrape URLs / Hashtags" tab
2. Paste one entry per line: post URLs, brand tagged-page URLs, or hashtag strings (`#skincare` or `skincare`)
3. Choose a result limit and click **Start scrape** — the tool triggers Apify, polls until done, and feeds results straight into the pipeline

### Scoring and export

4. Select your target niches and optionally fill in a **Campaign brief** (used by AI Deep-Dive)
5. Hit **Start scoring** — engagement and relevancy are computed locally in your browser
6. On the Results page:
   - Click **Fetch Live Stats** to pull real-time median likes/views from Apify (costs ~$0.01/account)
   - Click **AI Deep-Dive** to get Claude qualitative verdicts for the top-N accounts (costs ~$0.01–0.05 per run depending on count)
7. Filter, sort, export shortlist to XLSX

## Cloudflare Worker

The tool uses a Cloudflare Worker as a proxy to keep API keys server-side:

- **Apify key** — used for Instagram scraping (Fetch Live Stats, direct scrape)
- **Anthropic key** — used for AI Deep-Dive verdicts

The frontend never sees either key. Both are stored as Cloudflare Worker secrets and deployed automatically via GitHub Actions.

For local development, run the Worker locally:

```bash
cd worker
cp .dev.vars.example .dev.vars
# Fill in your keys in .dev.vars
npx wrangler dev
```

The frontend defaults to `http://localhost:8787` for the Worker when `VITE_PROXY_URL` is not set.

## Hashtag scraping tips

- `#香港美妝` `#hkmakeup` `#韓妝香港` `#護膚香港`
- Use the "Scrape URLs / Hashtags" tab directly, or Apify's "Instagram Hashtag Scraper" actor

## Tech stack

- Vite + React
- Tailwind CSS
- ExcelJS for XLSX export (with dropdowns and color coding)
- Cloudflare Worker (Apify + Anthropic proxy)
- Apify instagram-scraper and instagram-reel-scraper

## Deploying

Push to `main` — GitHub Actions handles everything automatically:

1. **Frontend build** — runs `npm ci && npm run build`, deploys to GitHub Pages
2. **Worker deploy** — runs `wrangler deploy` and syncs `APIFY_API_KEY` and `ANTHROPIC_API_KEY` as Worker secrets

Required GitHub repository secrets/variables:

| Name | Type | Description |
|---|---|---|
| `VITE_PROXY_URL` | Variable | Public Cloudflare Worker URL (not secret) |
| `CF_API_TOKEN` | Secret | Cloudflare API token with Worker deploy permissions |
| `APIFY_API_KEY` | Secret | Apify API key |
| `ANTHROPIC_API_KEY` | Secret | Anthropic API key (for AI Deep-Dive) |
