# KOL Finder — Manual / config checklist (things only you can apply)

These live in Supabase / Google Cloud / Cloudflare / GitHub, not in code. The
code side of each is already done; this is what you apply and verify.

---

## 1. 🔴 Supabase RLS — the launch blocker (P0)

Until this is on, every "authorization" in the app is decorative: anyone with
the anon key (it ships in the client bundle) can read/write any row.

1. Open **Supabase → SQL Editor**, paste and run [`db/audit_rls_and_rpc.sql`](./audit_rls_and_rpc.sql) top to bottom.
2. Seed the first admin (RLS blocks self-promotion once on):
   ```sql
   update public.users set role = 'admin' where email = 'you@markato.com';
   ```
3. **Verify from the browser console** (logged in as a NON-admin):
   ```js
   // Should FAIL (row not updated) — role escalation blocked:
   await supabase.from('users').update({ role: 'admin' }).eq('id', (await supabase.auth.getUser()).data.user.id)
   // Should return only YOUR row (not the whole team):
   await supabase.from('users').select('*')
   ```
   If you can flip your own role or read every user row, the policies didn't
   apply — stop and recheck.

> Note: the SQL assumes `shared_results.id` is `uuid` and `sessions.id` is
> `bigint`. If either differs, adjust the `merge_review_entry` signature — the
> client falls back to a non-atomic path if the signature doesn't match, so it
> won't break, it just won't be atomic.

---

## 2. Lock OAuth to markato.com at the provider (P1)

Client-side email checks are bypassable. Enforce at Google:

- **Google Cloud Console → APIs & Services → OAuth consent screen** → set
  **User type = Internal** (restricts sign-in to the Markato Google Workspace).
- Defense-in-depth is already in place: the app rejects non-`@markato.com`
  emails on login, and the RLS `is_markato()` helper re-checks the verified
  email claim on every query.

---

## 3. Worker authentication secret (P1) — pairs with the code change

The worker now **requires** `Authorization: Bearer <supabase access token>` on
every endpoint and **fails closed** (HTTP 500) if the secret is unset.

- Get the secret: **Supabase → Project Settings → API → JWT Settings → "JWT
  Secret"**.
- Set it on the worker, either:
  - **Manually:** `cd worker && npx wrangler@3 secret put SUPABASE_JWT_SECRET`, or
  - **Via CI:** add a GitHub repo secret named `SUPABASE_JWT_SECRET` — the
    `deploy-worker` job now syncs it automatically.

⚠️ **Consequence to know:** once the secret is set, the worker rejects
unauthenticated calls. Local dev **without Supabase configured** (no login) can
no longer call the live-fetch / draft-DM endpoints — that's the intended
security trade-off. Log in (or point local dev at a dev worker with no secret)
to use those features.

---

## 4. GitHub environment gate on `deploy-worker` (P2)

`.github/workflows/deploy.yml` now pins `wrangler@3` and declares
`environment: worker-production` on the worker job. To activate the gate:

- **Repo → Settings → Environments → New environment → `worker-production`**,
  then add **Required reviewers**. Worker deploys (which touch paid keys) will
  now wait for approval.
- Add the `SUPABASE_JWT_SECRET` repo secret here too (see item 3).

---

## 5. Secret rotation — precautionary (P3, optional)

The Apify/DeepSeek keys are not in git or the client bundle, so this is
optional. If you want to be safe, rotate the Apify + DeepSeek keys and the
`CF_API_TOKEN`, then re-sync via the deploy workflow.

---

## ⚠️ Build not verified in this environment

`vite build` could **not** be run here — Node/npm isn't installed on this
machine. All changes were reviewed statically. Before deploy, run locally:

```bash
npm ci && npm run build
```

and walk the flows: upload → score → fetch live → send for review → approve
(check the DM draft generates) → undo (must return to *pending*, not flip) →
ready-to-send. Confirm two browsers editing different accounts in one review no
longer overwrite each other.
