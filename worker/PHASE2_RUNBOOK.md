# Campaign Ops — Phase 2 deploy & test runbook

Everything in Phase 2 is code-complete and pushed. These steps need **your**
Cloudflare + Supabase credentials (I can't run them headlessly), so they're
yours to do. ~10 minutes end to end.

## What Phase 2 added
- **Verification worker** (`worker/worker.js`): on a cron (~2×/day) and on demand,
  it scrapes each `awaiting_post`/`overdue` KOL, matches recent posts against the
  campaign's `@mentions`/`#hashtags`, records `verified_posts` (deduped on
  shortcode) and flips the KOL to **posted**. Past deadline + no post → **overdue**.
- **Human-verify toggle**: the worker leaves `human_verified = false`; you confirm
  each match in the UI (the "Confirm" button on a detected post).
- **Overdue nudges**: a "Draft nudge" button on overdue KOLs → DeepSeek draft,
  **Cantonese for HK / zh-TW for TW (never mixed)** → copy-paste to send.

## 1. DB migration (30s)
In Supabase → SQL editor, run **both** files (both are additive and safe to re-run):
- `db/campaign_ops_phase2.sql` — adds `campaign_kols.last_checked_at` (observability,
  optional) and swaps `verified_posts`' shortcode dedupe to be per campaign_kol
  instead of global.
- `db/campaign_ops_seeding_studio.sql` — adds `campaign_kols.content_formats` and
  `campaigns.sheet_url`. **Required**: the content-format badges and the "Open Sheet"
  button read these columns; skip it and clicking a badge throws
  `column content_formats does not exist`.

## 2. Set the worker secret (the one genuinely new thing)
The cron has no logged-in user, so it writes with the Supabase **service_role**
key (bypasses RLS). From Supabase → Project Settings → API → `service_role`:

```bash
cd worker
wrangler secret put SUPABASE_SERVICE_ROLE_KEY   # paste the service_role key
```

`APIFY_API_KEY` and `DEEPSEEK_API_KEY` should already be set from before — check
with `wrangler secret list`. If either is missing, `wrangler secret put <NAME>`.

> ⚠️ `service_role` is a full-access key. It lives only as a Worker secret —
> never put it in the client bundle or commit it.

## 3. Deploy the worker (installs the cron trigger too)
```bash
cd worker
wrangler deploy
```
The `[triggers] crons = ["0 1,13 * * *"]` in `wrangler.toml` schedules unattended
runs at **09:00 & 21:00 HK** (01:00 & 13:00 UTC). Confirm under the Worker →
Triggers tab in the Cloudflare dashboard.

## 4. End-to-end test (the "done when")
1. Log in to the app as your @markato account, open a campaign with KOLs.
2. Mark a KOL **shipped**, then move it to **awaiting_post**.
3. Best real test: use a KOL who has actually posted with the campaign's tag
   since their ship date. Click **Verify posts** in the campaign header.
   - Expect a toast like "Verification done — N checked, 1 posted".
   - The KOL moves to **Posted** with the detected post link + matched signals.
4. Click **Confirm** on that post → it flips to **Verified** (green).
5. For an overdue KOL (past deadline, no post), click **Draft nudge** → a draft
   appears in the campaign's market language → **Copy** → **Mark sent**.

### Testing the cron without waiting for 09:00
```bash
cd worker
wrangler dev --test-scheduled
# then in another shell:
curl "http://localhost:8787/__scheduled?cron=0+1+*+*+*"
```
(`wrangler dev` reads secrets from `worker/.dev.vars` — copy `.dev.vars.example`
to `.dev.vars` and fill in all three keys first.)

## Notes / gotchas
- **Matching** normalizes case and strips markdown `\_` escaping, mirroring
  `src/lib/campaigns.js` exactly — keep the two normalizers in sync if you touch one.
- A post needs a **shortcode** to be recorded (that's the cross-system dedupe key).
- Nudges are offered **only** on `overdue` KOLs — never against a detected-but-
  unconfirmed post (the Phase 2 safety rule). Sending stays copy-paste (Meta API
  paused).
- Cron subrequest budget: one scrape covers all a run's KOLs, so a normal wave is
  well within limits. Very large multi-campaign crons on the CF free plan could
  approach the 50-subrequest cap — the paid plan (1000) removes that ceiling.
