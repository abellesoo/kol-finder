# Campaign Ops Tracker

The **operations layer** for KOL seeding campaigns, built as a new "Campaigns" tab
inside KOL Finder. It picks up where KOL Finder ends ("outreach approved") and
tracks each gifted/paid KOL through the pipeline — shipped → posted — auto-verifies
that they actually posted, chases the ones who don't, and hands a verified-post
dataset to a separate analytics tool (**perftracker**).

It is the "real registration" source that perftracker's README says to replace the
demo seed data with: this tool tells perftracker which KOL posts exist so its
collectors have something to measure.

## Division of ownership

| Concern | Owner |
|---|---|
| KOL roster, tiering, outreach drafts | KOL Finder (this repo, existing) |
| Campaign creation, shipment state, posting deadlines | **Campaign Ops (this module)** |
| Post detection & verification (URL, timestamp, matched tags) | **Campaign Ops** |
| Overdue determination + nudge drafts | **Campaign Ops** |
| Engagement snapshots, spend/sales attribution, A/B, quality judging, scorecards | perftracker |

**Campaign Ops never sends engagement metrics to perftracker** — that boundary
is deliberate; perftracker pulls those from the platform on its own decay
schedule. Campaign Ops does keep a lightweight likes/comments/views **snapshot**
per verified post (captured by the verify scrape, shown in the campaign's Google
Sheet), but it stays out of the `perftracker_feed` contract.

## Architecture

Reuses the KOL Finder stack end to end — nothing new was introduced:

- **Supabase (Postgres)** — data + auth. Google OAuth, `@markato.com` only; every
  table is team-shared via RLS (`public.is_markato()`).
- **Cloudflare Worker** (`worker/worker.js`) — the cron verification engine + the
  DeepSeek nudge drafter + the Google-Sheet push. Runs unattended twice a day.
- **Apify** Instagram scraper — post detection.
- **DeepSeek** — overdue nudge drafts.
- **React** frontend — the Campaigns tab.

### KOL identity (important)

KOL Finder has **no `kols` table**. Approved KOLs live as JSONB inside
`shared_results` (one row per scoring run): each KOL is an element of the
`accounts` array, keyed by its Instagram handle, and "approved" means
`review_state[handle].status === 'approved'`. There is no per-KOL uuid, so the
**stable KOL identifier is the IG handle string**. `campaign_kols` therefore
references a KOL by `kol_handle text`, optionally recording the run it was
approved in via `kol_run_id → shared_results(id)`.

### Data model (4 tables — `db/campaign_ops_schema.sql`)

- **`campaigns`** — brand, market, type, deadline, and the `hashtags[]` /
  `mention_handles[]` used as post-detection signals.
- **`campaign_kols`** — per-KOL pipeline row: `state`, `shipped_at`, tier
  (A = PR/gifted, B = Paid), fees, `deadline_override`, `content_formats[]`.
- **`verified_posts`** — worker output: `post_url`, `post_shortcode` (dedupe key),
  `posted_at`, `matched_signals[]`, `human_verified` (manager confirm toggle),
  plus an engagement snapshot (`likes_count`, `comments_count`, `views_count`,
  `engagement_updated_at` — `campaign_ops_engagement.sql`) refreshed on each
  verify run; sheet-only, never fed to perftracker.
- **`nudges`** — overdue reminder drafts (copy-paste; Meta send API is paused).

### State machine (enforced in app logic, not the DB)

```
approved ──(mark shipped)──▶ shipped ──▶ awaiting_post
awaiting_post ──(worker finds matching post)──▶ posted
awaiting_post ──(deadline passed, no post)────▶ overdue
overdue ──(worker finds post later)──▶ posted     (late posts still count)
any ──(manual)──▶ opted_out
```

`shipped_at` is the day the product is **sent**, so a genuine campaign post is
always on/after it — the verifier only accepts matches dated ≥ `shipped_at`.
Effective deadline = `coalesce(deadline_override, campaigns.posting_deadline)`.
Managers can also override any state manually (the dropdown), for false positives.

## Build phases

| Phase | Scope | Status | Migration |
|---|---|---|---|
| **1** | Data model + Campaigns tab (create, attach approved KOLs, board/table views, mark shipped, deadlines) | Deployed | `campaign_ops_schema.sql` |
| **2** | Verification worker (cron ~2×/day + on-demand), tag matching, human-verify toggle, overdue nudges (DeepSeek, Cantonese HK / zh-TW TW, never mixed) | Code-complete; deploy pending creds | `campaign_ops_phase2.sql` |
| **Studio** | Tier rename (A→PR/B→Paid), per-KOL content formats, table views, spreadsheet importer | Code-complete | `campaign_ops_seeding_studio.sql` |
| **4** | One Google Sheet per campaign ("`<name>` Seeding": one-way app→sheet push, Status/Tier dropdowns, date columns, post-engagement snapshot) | Code-complete; needs GCP setup | `campaign_ops_engagement.sql` |
| **3** | **perftracker feed + wrap summary + handoff docs** | Code-complete | `campaign_ops_phase3.sql` |
| **SF** | SF Express shipping: per-KOL recipient address + one-click bulk-shipment Excel for SF's 批量寄件 upload; waybill # field + "Track" link | Code-complete | `campaign_ops_sf_tracking.sql`, `campaign_ops_shipping.sql` |

SF shipping is deliberately **file-based, not API-based**: a full SF Open
Platform integration needs a Markato SF business account + developer credentials
(none exist today), and automating their website with a stored login is brittle.
Instead, each KOL gets a shipping address in the app, and **SF bulk file**
downloads an Excel to upload on SF's online bulk-order (批量寄件) page — SF then
creates every order at once and generates the waybills to print. The export
reproduces SF's real template (「寄快遞批量下單模板」: two header rows, columns
A–BA, data from row 3) — headers were extracted from the template file itself.
Before first use, fill in `SF_SENDER` in `src/lib/sfBulk.js` (Markato's sender
name/phone/district/address — SF requires them on every row) and check
`SF_DEFAULTS` (product type, payment method, parcel weight).

## The perftracker data contract (Phase 3)

Campaign Ops exposes **one read-only view**, `perftracker_feed`, that Michelle's
tool consumes. One row per (KOL × verified post); KOLs with no post yet still
appear once so she sees the full roster including who's awaiting/overdue.

Delivery is a **read-only Postgres view** (the default/preferred mode) read by a
dedicated `perftracker_reader` role. A Bearer-token JSON endpoint on the worker is
the documented fallback if she can't reach Postgres directly — it's a thin read
over the same view (not built until she asks). Apply + connection steps:
[`worker/PHASE3_PERFTRACKER_FEED.md`](worker/PHASE3_PERFTRACKER_FEED.md).

**Contract rules (additive changes only — coordinate any rename with Michelle):**

1. `human_verified = false` rows are **provisional** — ingest but mark unconfirmed.
2. `post_shortcode` is the stable dedupe key across both systems.
3. **Overdue is owned on this side.** perftracker consumes `is_overdue`; it does
   not re-derive overdue from missing placements (it has no ship-date data).
4. Engagement metrics never flow through this contract.

Feed columns: `a_campaign_id`, `campaign_name`, `brand`, `market`,
`campaign_type`, `a_kol_id`/`kol_handle`, `tier`, `agreed_fee`, `product_value`,
`state`, `shipped_at`, `effective_deadline`, `is_overdue`, `post_url`,
`post_shortcode`, `posted_at`, `detected_at`, `human_verified`.

> **Open sync item:** confirm with Michelle (out sick during scoping) the three
> defaults this feed assumes — overdue ownership on this side, view (not JSON)
> delivery, `post_shortcode` as the shared dedupe key. All three are the
> documented defaults; switching to the JSON endpoint is a small swap.

## Wrap summary (Phase 3)

Each campaign's header shows a minimal wrap: KOL count, and posted / shipped /
awaiting / overdue / opted-out counts, plus a **fulfillment rate** =
`posted ÷ (attached − opted out)`. Opted-out KOLs are excluded from the
denominator so a negotiated drop-out doesn't understate the result. Nothing
deeper lives here by design — performance analysis is perftracker's job.

## Operating the tool

1. In the Review Queue, approve KOLs, then **Start campaign** to auto-attach them
   (or import a wave from a spreadsheet with the importer).
2. Open the campaign and add each KOL's **shipping address** (the 📍 line on the
   card). **SF bulk file** downloads the bulk-shipment Excel — upload it on SF
   Express's 批量寄件 page to create all the orders at once, print the waybills,
   stick them on. **Mark KOLs shipped** as products go out; optionally paste each
   waybill # into the tracking field (the **Track** button opens SF's tracking
   page).
3. The worker auto-verifies twice a day; or hit **Verify posts** on demand. A
   detected post moves the KOL to **Posted** with the matched signals.
4. **Confirm** each detected post (green) — the worker never auto-confirms.
5. Past-deadline KOLs surface as **overdue**; **Draft nudge** writes a
   market-correct reminder to copy-paste. Mark it sent after you send it.
6. **Create / Sync sheet** pushes the current campaign to a shared Google Sheet
   ("`<campaign name>` Seeding") — Status/Tier as dropdowns, dates as dates, and
   each verified post's likes/comments/views. The push is **one-way**: edits made
   in the sheet are overwritten on the next sync, so treat the app as the source
   of truth. Engagement numbers refresh whenever the verifier runs (cron 2×/day
   or the Verify posts button) — hit Verify before Sync for the freshest counts.

## Open threads (from KOL Finder, unchanged)

- **Instagram Messaging API** — paused pending Meta Business Verification / App
  Review. Until it clears, all DM sending (outreach + nudges) stays copy-paste.
- **Production rollout** of KOL Finder is still in progress.

## Deploy / runbooks

- Phase 2 worker + cron: [`worker/PHASE2_RUNBOOK.md`](worker/PHASE2_RUNBOOK.md)
- Phase 4 Google Sheets setup: [`worker/PHASE4_GOOGLE_SHEETS_SETUP.md`](worker/PHASE4_GOOGLE_SHEETS_SETUP.md)
- Phase 3 perftracker feed: [`worker/PHASE3_PERFTRACKER_FEED.md`](worker/PHASE3_PERFTRACKER_FEED.md)

Full internal spec (schema + contract, not committed — repo is public):
`campaign-ops-context.md` / `campaign-ops-handoff.md` at the repo root.
