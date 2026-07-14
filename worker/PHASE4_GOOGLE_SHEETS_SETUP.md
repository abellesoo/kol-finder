# Phase 4 — Google Sheets per campaign: setup & deploy

The code is done. To make it work you set up a Google service account once (~15 min)
and add its key as a worker secret. This is the only thing blocking Phase 4.

## What it does
Each campaign gets a **"Create sheet"** button. First click creates a Google
Sheet named after the campaign, **shares it with everyone on the markato.com
Workspace domain (edit access)**, and fills it with one row per KOL (handle,
tier PR/Paid, format, status, shipped, deadline, post link + verified, plus the
scoring columns: AI Fit, Overall, Relevancy, Eng. Score, Followers, medians,
niche signals). After that the button says **"Sync sheet"** and re-pushes the
latest data to the same sheet. **One-way** (app → sheet); edits in the sheet are
not read back.

## 1. Create a Google Cloud project + service account (~10 min)
1. Go to <https://console.cloud.google.com> (sign in with your markato.com account).
2. Top bar → project dropdown → **New Project** → name it e.g. `markato-campaign-ops` → Create.
3. With that project selected, open **APIs & Services → Library** and **Enable**:
   - **Google Sheets API**
   - **Google Drive API**  (needed to share the sheet with the domain)
4. **APIs & Services → Credentials → Create credentials → Service account**.
   - Name: `campaign-sheets`. Create → skip the optional role steps → Done.
5. Click the new service account → **Keys** tab → **Add key → Create new key → JSON**.
   A `.json` file downloads. **This is a secret — treat it like a password.**

## 2. (Recommended) let it share to your domain
The sheet is created by the service account, then shared to `markato.com`. For
domain sharing to work, your Google Workspace admin may need to allow the Drive
API to share within the domain (usually on by default). If sharing fails, the
sheet is still created — you'll just need to open it via the link once and
"Share" it manually, or ask your admin to allow it. (If markato.com is **not** a
Workspace domain, tell me and I'll switch it to share-by-link instead.)

## 3. Add the key as a worker secret
The downloaded JSON must be passed as a **single line**. Easiest:
```bash
cd worker
# macOS: this pipes the file straight in as the secret value
cat ~/Downloads/markato-campaign-ops-*.json | wrangler secret put GOOGLE_SERVICE_ACCOUNT_KEY
```
(If prompted to paste instead, open the JSON, copy the whole thing, paste, enter.)

Confirm the domain is right in `worker/wrangler.toml`:
```toml
GOOGLE_WORKSPACE_DOMAIN = "markato.com"
```

## 4. Deploy
```bash
cd worker
wrangler deploy
```

## 5. Test
1. Open a campaign with KOLs → click **Create sheet**.
2. Expect a toast "Google Sheet created & shared" and an open-in-new icon appears.
3. Open it → one row per KOL with all columns. Anyone on markato.com can open it.
4. Change some statuses/formats in the app → click **Sync sheet** → the sheet
   updates in place (same URL). The Campaigns list "Sheet" button also lights up.

### Local dev
`wrangler dev` reads `worker/.dev.vars`. Put the JSON on one line as
`GOOGLE_SERVICE_ACCOUNT_KEY='{...}'` (single-quoted) — see `.dev.vars.example`.

## Notes
- The service-account JSON key is full access to that key's scope — keep it only
  as a worker secret, never in the client bundle or git.
- Sheet writes are **one-way**. Two-way sync (edits in the sheet flowing back) was
  intentionally out of scope — revisit only if truly needed.
- If "Create sheet" errors with a Drive quota/ownership message, the fallback is
  a Google **Shared Drive** owned by the team; ping me and I'll adjust the worker
  to create inside it.
