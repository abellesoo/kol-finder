# KOL Finder

AI-powered influencer vetting tool for beauty & lifestyle campaigns in HK/Asia.

Upload an Apify Instagram scraper `.xlsx` export → configure filters → get AI-scored results.

## What it does

- Parses Apify post-level scraper output and groups by influencer account
- Scores each account on: niche fit, HK location signals, content format (video vs static), bot risk
- Filters by minimum engagement, niche, location target
- Exports results to CSV

## Setup

```bash
npm install
cp .env.example .env
# Add your Anthropic API key to .env
npm run dev
```

Open `http://localhost:5173`

## Getting your API key

Go to [console.anthropic.com](https://console.anthropic.com) → API Keys → Create key.

Add it to `.env`:
```
VITE_ANTHROPIC_API_KEY=sk-ant-...
```

Or paste it directly in the UI at runtime (not saved anywhere).

## How to use

1. Run an Apify Instagram Scraper job (scrape competitor brand tags or hashtags)
2. Export the dataset as `.xlsx`
3. Upload to this tool
4. Select your target niches + location
5. Hit **Start scoring** — Claude analyses each account's captions + hashtags
6. Filter, sort, export shortlist to CSV

## Hashtag scraping tip

Instead of scraping competitor tagged posts, try scraping by hashtag directly:
- `#香港美妝` `#hkmakeup` `#韓妝香港` `#護膚香港`
- Use Apify's "Instagram Hashtag Scraper" actor

## Tech stack

- Vite + React
- Tailwind CSS
- Claude API (claude-sonnet-4) for AI scoring
- xlsx (SheetJS) for parsing

## Deploying to GitHub Pages

```bash
npm run build
# Push dist/ to gh-pages branch, or use GitHub Actions
```

Or deploy to Vercel in one click — connect your repo and it auto-deploys.
