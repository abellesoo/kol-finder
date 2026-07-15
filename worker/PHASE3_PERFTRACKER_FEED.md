# Campaign Ops — Phase 3: perftracker feed apply & handoff runbook

Phase 3 exposes the **data contract to perftracker**: one read-only Postgres view,
`perftracker_feed`, read by a dedicated `perftracker_reader` role. This is the
verified-post dataset Michelle's analytics tool consumes. ~5 minutes to apply,
plus one thing to send Michelle.

Nothing here needs Cloudflare — the default delivery is a straight Postgres view.
(A worker JSON endpoint is only needed if Michelle can't reach Postgres — §4.)

## What Phase 3 added

- **`db/campaign_ops_phase3.sql`** — the `perftracker_feed` view + a read-only
  `perftracker_reader` role with `select` on the view only.
- **Wrap summary** — the campaign header now shows posted / shipped / awaiting /
  overdue / opted-out counts + a fulfillment rate (`posted ÷ (attached − opted
  out)`). No deploy — it ships with the client bundle.
- **Handoff docs** — `CAMPAIGN_OPS_README.md` (module deliverable) + this runbook.

## 1. Apply the migration (1 min)

In Supabase → SQL editor, run **`db/campaign_ops_phase3.sql`** top to bottom.
It's `create or replace` + guarded grants, safe to re-run. Requires the Phase 1
tables (`campaign_ops_schema.sql`) to already exist.

Verify:

```sql
select count(*) from public.perftracker_feed;   -- should return without error
select * from public.perftracker_feed limit 5;  -- eyeball the row shape
```

> **RLS note:** the base tables have row-level security, but the view is owned by
> the `postgres` SQL-editor role, which owns those tables and so bypasses RLS
> (`enable`, not `force`). The view is created with the default
> `security_invoker = false`, so `perftracker_reader` reads the feed **without**
> an `@markato` JWT — exactly what a headless perftracker pull needs. Don't flip
> `security_invoker` on, or the reader will see zero rows.

## 2. Give the read role a login password (1 min)

The migration creates `perftracker_reader` as **NOLOGIN** (no secret committed).
Give it a login + a generated password so Michelle can connect:

```sql
alter role perftracker_reader with login password '<generate-a-strong-one>';
```

Keep the password in a secret manager, not in git or this file.

## 3. Send Michelle the connection details

She connects with the restricted role and reads the feed — she can `select` the
view and nothing else (no base tables, no writes):

```
host:     <your-project>.supabase.co  (or the pooler host from Supabase → Settings → Database)
port:     5432   (or 6543 for the transaction pooler)
database: postgres
user:     perftracker_reader
password: <the one you just set>
sslmode:  require
```

```sql
-- full pull
select * from public.perftracker_feed;

-- incremental pull (only posts detected since her last sync)
select * from public.perftracker_feed where detected_at > :last_pull;
```

### Contract reminders (put these in the message to her)

1. `human_verified = false` rows are **provisional** — ingest but flag unconfirmed.
2. `post_shortcode` is the **shared dedupe key** across both systems.
3. **Overdue is owned on this side** — consume `is_overdue`; don't re-derive it
   from missing placements (she has no ship-date data to do so correctly).
4. Engagement metrics never flow through this feed — her collectors pull those.
5. Schema changes are **additive only**; no renames/removals without a heads-up.

Mapping into her model: `kol_handle`+`tier` → KOL roster ("real registration");
`post_url`+`post_shortcode`+`posted_at` → placement (kind=`kol`); `agreed_fee`+
`product_value` → spend; `is_overdue` → her `flag_kol_overdue` input;
`a_campaign_id` → she keeps a mapping table to her own campaign ids.

## 4. Fallback — JSON endpoint (only if she can't reach Postgres)

If a direct Postgres connection isn't viable on her side, the alternative is a
Bearer-token worker endpoint returning the same rows:

```
GET https://<worker>.workers.dev/api/perftracker-feed?since=<iso8601>
Authorization: Bearer <shared-token>
```

It's a thin read over this exact view (select `*` from `perftracker_feed`,
optional `detected_at > since` filter, JSON out) plus a token check against a new
worker secret. **Not built** — it's a ~30-line handler to add to `worker.js` if
and when she asks for it. The view is the preferred path; don't build both.

## Done when

Michelle can pull a verified-post dataset from `perftracker_feed` — full and
incremental — and the three contract defaults (overdue ownership, view delivery,
`post_shortcode` dedupe) are confirmed with her. That closes the Phase 3 feed;
the wrap summary and handoff docs are already in the bundle.
