# KOL Finder — Pre-Launch Audit Fix Plan

_Internal execution plan for addressing the pre-launch audit findings._
_Status: awaiting go-ahead. No code changed yet._

Findings were produced by a full codebase read plus four parallel review agents
(security, data integrity, edge cases, auth/state). This document is the plan to
fix them — who does what, in what order, and how the work is batched to avoid
introducing new bugs.

---

## Part 1 — Who fixes what

### 🔴 Manual — only you can do these (outside the repo)

These live in Supabase / Cloudflare / GitHub config, not code. For most, **I write
the code or SQL and you apply + verify.** Item 1 (RLS) is the single most important
task on the whole list — until it's confirmed, every "authorization" in the app is
decorative.

| # | Task | My part | Your part |
|---|------|---------|-----------|
| 1 | **Supabase RLS** on `users`, `sessions`, `shared_results` | Draft the full SQL policy file | Run it in the SQL editor; verify you can't escalate role or read other campaigns from the browser console |
| 2 | **Lock OAuth to markato.com** at the provider (not just client-side) | Point you to the exact setting | Set hosted-domain restriction in Supabase Auth settings |
| 3 | **Worker authentication** | Write JWT verification in the worker + make the client send the Supabase token | Set the JWT secret in Cloudflare, redeploy |
| 4 | **Secret rotation** (precautionary — the Apify key is *not* in git or the bundle, so optional) | — | Rotate in Apify / DeepSeek / Cloudflare if desired |
| 5 | **GitHub environment gate** on the `deploy-worker` job | Edit `deploy.yml` (pin wrangler, add gate) | Create the protected environment in repo Settings |

### 🟢 Code fixes — I do these, you review the diff and deploy

~30 findings across scoring, concurrency, exports, Apify handling, persistence,
and UI. This is the bulk of the work. Detailed list in Part 4.

---

## Part 2 — Batching strategy (and why not just max-parallel)

The binding constraint is **not** how many agents can run at once — it's that two
agents editing the same file, or disagreeing on a shared data shape, create fresh
bugs at the seams. These findings cluster heavily by file (ReviewPage has 4,
scoreInfluencers has 5) and several span files different concerns share
(`App.jsx`, `ResultsStep.jsx`, the export chain, the `review_state` schema).

**Strategy: disjoint file ownership, run in waves, with the contracts held centrally
and a verification pass between waves.** Not a blind fan-out.

---

## Part 3 — Wave plan

### Wave 0 — solo, before any agent
Lock the shared contracts so agents don't disagree at the seams:
- (a) final influencer / score object shape after the hidden-likes fix
- (b) `review_state` schema for the concurrency rewrite
- (c) canonical export column set

Then knock out trivial mechanical fixes: `main.jsx` literal `\n`, KolLookup dead
import, `reader.onerror` message.

### Wave 1 — 5 parallel agents, disjoint leaf modules (lowest conflict risk)
1. **Scoring & data core** — `parseXlsx.js`, `computeStats.js`, `scoreInfluencers.js`
2. **Export** — `columnDefs.js`, `exportCsv.js`
3. **Ingestion & Apify** — `UploadStep.jsx`, `apifyApi.js`
4. **Persistence** — `sessionHistory.js`, `HistoryPage.jsx`
5. **Worker** — `worker/worker.js`

### Wave 2 — 3 parallel agents, consume Wave 1's contracts (must go after)
6. **App shell & pipeline** — `App.jsx` — depends on #1
7. **Results screen** — `ResultsStep.jsx` — depends on #1 + #2
8. **Review/approval + concurrency** — `ReviewPage.jsx`, `ReadyToSendPage.jsx`,
   `DashboardPage.jsx`, `ReviewQueuePage.jsx` — the highest-risk, highest-value
   unit; kept in one agent so the `review_state` concurrency scheme stays
   consistent across all four files.

### Wave 3 — solo, verify
`vite build`, launch the app, walk every fixed flow (upload → score →
live-fetch → send for review → approve → ready-to-send), then a `/code-review`
pass over the full diff to catch seam regressions. Report what was verified vs.
what needs your Supabase/Apify environment to confirm.

---

## Part 4 — Findings mapped to workstreams

### Wave 0 (solo)
- `main.jsx:14` — ErrorBoundary renders literal `\n`
- `KolLookup.jsx:5` — imports non-existent `saveLookup` (build risk if wired in)
- `parseXlsx.js:249` — `reader.onerror` → alert "undefined"

### WS1 — Scoring & data core
- `parseXlsx.js:61-66` — hidden likes counted as 0, deflate avgLikes **(P1)**
- `computeStats.js:28-29` — live median includes hidden likes → Overall collapses on live fetch **(P1, Critical)**
- `parseXlsx.js:103-117` — xlsx medians include hidden likes as 0 **(P1)**
- `scoreInfluencers.js:10-13` — substring keyword matching, not word matching **(P1)**
- `scoreInfluencers.js:78` vs `parseXlsx.js:186` — videoRatio unit mismatch, flag always fires **(P2)**
- `scoreInfluencers.js:64-74` — bot_risk scale inverted vs its name **(P2)**
- `parseXlsx.js:65` — negative commentsCount subtracts from totals **(P3)**

### WS2 — Export
- `columnDefs.js:12` — `live_median_comments` export id doesn't exist → missing from every default export **(P1)**
- `exportCsv.js:105-155` — no formula-injection guard on scraped bios/captions **(P1)**

### WS3 — Ingestion & Apify
- `UploadStep.jsx:14-16` — brand regex captures `p`/`reel`/`explore` **(P2)**
- `UploadStep.jsx:90-99` — multi-brand loop discards already-paid results on later failure **(P2)**
- `apifyApi.js:92-105` — `pollUntilDone` has no timeout/cancel **(P1)**
- `apifyApi.js:117-146` — `fetchBatchStats` `Promise.all` discards paid results on one failure **(P1)**
- `apifyApi.js:43` — hashtag not `encodeURIComponent`-d **(P2)**
- `UploadStep.jsx:181-189` — Parse button no in-flight guard **(P3)**

### WS4 — Persistence
- `sessionHistory.js:19` — `saveSession` swallows insert errors silently **(P2)**
- `HistoryPage.jsx:70-74` — delete: no confirm, permanent, team-wide, errors ignored **(P1)**
- `sessionHistory.js:66-70` — `updateSessionTitle` can wipe config on select failure **(P3)**
- `sessionHistory.js:42-52` — `loadHistory` swallows errors → looks empty offline **(P3)**

### WS5 — Worker
- `worker.js:36-132` — all endpoints unauthenticated (Apify + DeepSeek on paid keys) **(P1)** — pairs with manual item 3
- `worker.js:67` — dataset fetch capped at 2000, no pagination, silent truncation **(P2)**

### WS6 — App shell & pipeline (`App.jsx`)
- `App.jsx:222` — minEngagement filter runs on deflated avgLikes, drops good KOLs **(P1, needs WS1)**
- `App.jsx:174-184` — dedupe discards other batch's posts **(P3)**
- `App.jsx:217-242` — Start scoring double-click → duplicate sessions **(P2)**
- `App.jsx:376-395` — role changes need re-login; `onNavigate('seeder')` bypasses nav gating **(P3)**

### WS7 — Results screen (`ResultsStep.jsx`)
- `ResultsStep.jsx:516-522` — `setLiveStats` overwrites good state with empty re-scrape **(P2)**
- `ResultsStep.jsx:366-444` — global stale live-stats cache renders as current **(P2)**
- `ResultsStep.jsx:466-483` — sort on hidden xlsx median doesn't match displayed value **(P3)**
- `ResultsStep.jsx:658` — Retry uses `force:true`, re-pays for succeeded accounts **(P2)**
- `ResultsStep.jsx:674-685` — Export XLSX double-click / silent failure **(P2)**
- `ConfigStep.jsx:41-42` — locationTarget + requireVideo collected but never used **(P1)** _(fix spans ConfigStep + App/scoring; assign with WS6)_

### WS8 — Review/approval + concurrency
- `ReviewPage.jsx:236,242` — card-view undo sets opposite status, fires paid draft **(P0, Critical)**
- `ReviewPage.jsx:599-613` + `ReadyToSendPage.jsx:144-150` — review_state last-write-wins, concurrent edits lost **(P0, Critical)**
- `ReviewPage.jsx:156-175` — stale closure wipes notes typed during draft generation **(P2)**
- `ReviewPage.jsx:156-175,304-329` — approve-then-draft-fails, no regenerate control **(P2)**
- `ReviewPage.jsx:319-322` — DM draft persists on every keystroke, unordered writes **(P2)**
- `DashboardPage.jsx:172` — campaign link `?review=` is a dead full-reload link **(P2)**
- `DashboardPage.jsx:58-67` — pending count misses explicit `status:'pending'` entries **(P3)**

### Manual / config
- Supabase RLS — users, sessions, shared_results **(P0)** — I draft SQL, you apply
- OAuth hosted-domain restriction **(P1)**
- Worker auth secret **(P1)**
- `deploy.yml:38-58` — pin wrangler, add environment gate **(P2)**
- Secret rotation — precautionary **(P3)**

---

## Part 5 — Recommended order

1. **You:** start Supabase RLS (manual item 1) — independent of my code, it's the blocker.
2. **Me, in parallel:** Wave 0 → Wave 1 → Wave 2 → Wave 3.
3. **Worker auth** (item 3) slots in after Wave 1's worker changes land.

**Recommended path: P0/P1 first.** Do only the critical tier first — card-undo,
concurrency rewrite, hidden-likes, worker auth, + your RLS SQL — validate it in
your environment, then continue with the long tail. This de-risks launch fastest
and lets you confirm the two scariest changes (concurrency + RLS) before we touch
anything else.

### Go options
- **"Go, all of it"** — full wave plan + RLS SQL and config checklist for your manual items.
- **"Just P0/P1 first"** — critical tier only, you validate, then continue. _(recommended)_
- **"Start with [files/findings]"** — scoped to exactly what you name.
