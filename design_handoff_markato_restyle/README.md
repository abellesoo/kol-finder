# Handoff: Markato Seeding Tool — visual restyle

## TL;DR for Claude Code

This is a **restyle of an existing, working app** — NOT a rebuild. Keep 100% of the current
functionality, routing, Supabase auth, RBAC, and everything in `src/lib/`. Only the **markup +
styling** of each screen changes to match the new "Markato" design.

The new look is a single HTML design reference: **`Markato KOL Studio.dc.html`** (in this folder).
It's a prototype that shows the intended look and behaviour — do **not** copy its code (it uses a
custom template runtime + inline styles). Recreate its look in the real codebase using **Tailwind +
the existing component structure**.

Work in this order:
1. **Global token + font swap** (Step 1) — this alone moves ~60% of the UI to the new look.
2. **Shared visual vocabulary** (Step 2) — learn the card / button / label patterns.
3. **Restyle each component in place** (Step 3) — one file at a time, logic untouched.

---

## Overview

The app is a Vite + React + Tailwind + Supabase tool for finding Instagram KOL/seeding candidates.
The redesign keeps the exact same information architecture and flows but moves to a warmer, editorial
"Markato" aesthetic: cream paper background, near-black warm ink, a single gold accent, Schibsted
Grotesk for display text and JetBrains Mono for labels/data.

**Critical constraint:** every original feature must be retained. The design reference intentionally
omits a few things that exist in your code (login, sign-out, role-gated nav, KOL Lookup) because it's
a static mock — see [§ Keep these original features](#keep-these-original-features-not-shown-in-the-mock).
Do not delete them; restyle them to match.

## About the design file

- `Markato KOL Studio.dc.html` — the full visual reference, all screens in one file. Open it in the
  design tool to view. Treat it as **pixel-level intent** (hi-fi): exact colours, type, spacing.
- It is a design prototype, not production code. The class names, `<sc-if>`/`<sc-for>` tags, and
  `renderVals()` logic are runtime-specific — ignore them. Read it only for **layout, colour, type,
  spacing, copy, and states**.

## Fidelity

**High-fidelity.** Match colours, typography, spacing, and radii exactly. All hex values and sizes
below are final.

---

## Step 1 — Global token + font swap (do this first)

Your Tailwind theme already uses the same gold accent and JetBrains Mono, so only a few values move.

### 1a. `tailwind.config.js` — change 4 colours, add 3, swap the sans font

```js
// theme.extend.fontFamily
sans: ['"Schibsted Grotesk"', 'system-ui', 'sans-serif'],   // was: Inter
mono: ['"JetBrains Mono"', 'monospace'],                     // unchanged

// theme.extend.colors
ink:         '#221E18',   // was #0D0D0D  — warmer near-black
paper:       '#F4F1EB',   // was #F7F6F3  — warmer cream (app background)
mist:        '#E1DCD0',   // was #E8E6E1  — warmer hairline border
accent:      '#C8A96E',   // unchanged — gold
'accent-dim':'#E8D9BC',   // unchanged
rose:        '#D4627A',   // unchanged (used for sign-out / destructive)
sage:        '#4A7C59',   // unchanged (high-score badge)

// ADD these — the design leans on a few warm neutrals beyond the existing scale:
sidebar:     '#EEEAE1',   // sidebar surface
card:        '#FFFFFF',   // card surface
'card-edge': '#E7E2D6',   // card border (slightly warmer than mist)
panel:       '#FBF9F4',   // inset/secondary panel fill
muted:       '#7E7768',   // secondary body text
faint:       '#A89E8C',   // mono labels, meta text
body:        '#5C5340',   // long-form body copy
```

> If you prefer not to add tokens, the raw hexes are listed inline per component below. But adding
> them keeps the restyle terse and consistent.

### 1b. Fonts — load Schibsted Grotesk (JetBrains Mono is already in use)

Add to `index.html` `<head>` (or your font setup):

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```

### 1c. `index.css` — base + score badges

The `@layer base` body rule already maps to `bg-paper text-ink` — it'll pick up the new hexes
automatically. The `.score-*` component classes still work (sage / accent / mist). No change needed,
but verify the badges read well on the new paper colour.

After Step 1, reload — the whole app should already feel close. The rest is per-screen markup.

---

## Step 2 — Shared visual vocabulary

These patterns repeat across every screen. Build them once (as small components or Tailwind class
recipes) and reuse.

### Mono eyebrow label
Tiny uppercase monospace kicker above headings.
`font-mono text-[10px] tracking-[0.18em] uppercase text-faint` (≈ `#A89E8C`).

### Page heading
`text-[25px] font-bold tracking-[-0.02em] text-ink`, with a `text-[13.5px] text-muted` subtitle below.

### Card
White surface, warm hairline, generous radius:
`bg-card border border-card-edge rounded-[14px]` (`#fff` / `#E7E2D6` / 14px). Inset/secondary panels
use `bg-panel` (`#FBF9F4`) or `#F3EEE2`.

### Primary button
`bg-ink text-white rounded-[12px] px-[18px] py-[14px] text-sm font-semibold`, subtle shadow.
Smaller variants use `px-4 py-[11px] rounded-[10px]`.

### Secondary button
`border border-[#E1DBCD] text-muted rounded-[12px] px-[18px] py-[14px] text-sm font-semibold`.

### Gold text link
`font-mono text-xs text-[#9A7636]` (darker gold for legibility; `#8A6A22` on warning surfaces).

### Sidebar nav item
236px sidebar (`bg-sidebar`, right border `mist`). Items are grouped under mono section headers
(**Workspace**, **Approvals**, **Admin**). Active item: gold-tinted text + a small gold left bar
(`#C8A96E`); inactive: `text-muted`, hover lifts to `text-ink` on a faint warm hover fill. Count
badges (Review Queue, Ready to Send) are small mono pills.

### Role badge (Team)
Pill, mono, 11px. `assistant_bm` → `bg-[#F1E7D2] text-[#8A6A22]`; `brand_manager` →
`bg-[#EEEAE0] text-[#7E7768]`; `admin` → `bg-[#E1EFE3] text-[#3E6B4B]`.

### Warning/cost callout
`bg-[#F6ECD6] border border-[#E7D3A8] rounded-[14px]`, mono `#8A6A22` heading with a small triangle
icon.

### Icons
Keep `lucide-react`. The mock draws inline SVGs at 16px, `stroke-width≈1.6`; lucide at `size={16}`
matches. Active nav icons go to `strokeWidth={2}`.

---

## Step 3 — Component-by-component restyle map

Each row: **your file** → the matching screen in the mock → what to do. **Logic, props, handlers, and
state stay exactly as they are** — you are replacing JSX markup + classes only.

| Your component | Mock screen (`data-screen-label`) | Notes |
|---|---|---|
| `App.jsx` → `Sidebar` | left sidebar | Rebrand header to **Markato** + "Seeding Tool" mono kicker with the gold-dot logo mark. Group nav under **Workspace / Approvals / Admin** mono headers. Apply active gold-bar treatment. **Keep** `navItemsForRole()` filtering, the user name/email block, Sign out, and the flowchart link (see below). |
| `DashboardPage.jsx` | Dashboard | Restyle stat cards + "New scoring run" primary button. Keep all data/handlers. |
| `UploadStep.jsx` | Seeder · Upload | Two-tab control (**Upload XLSX** / **Scrape URLs**) as a segmented control on `bg-panel`. Restyle dropzone. Keep `onFiles` / `onScrapedItems`. |
| `ConfigStep.jsx` | Seeder · Config | Niche chips, location, **video toggle** (gold track when on), min-likes number input with mono hint, campaign brief textarea. "Start scoring N accounts" primary button. Keep `onStart(cfg)`. |
| (scoring state in `App.jsx`) | Seeder · Scoring | Centered card: mono "Scoring accounts" label, thin gold progress bar, "X / Y accounts". Keep the real progress + error/back-to-config branch. |
| `ResultsStep.jsx` | Seeder · Results | The big one. Ranked table, score badges (reuse `.score-*`), expandable row with "Scoring verdict" panel, filters/sort, **Fetch Live Stats**, **AI Deep-Dive**, column customisation, **Export to XLSX**, selection → send-to-review. Restyle chrome only; keep every handler and `columnDefs`. |
| `HistoryPage.jsx` | History | Session list cards with "N accounts · brief" + date, load-session action. Keep `onLoadSeederSession`. |
| `ReviewQueuePage.jsx` | Review Queue | Submission cards, pending count. Keep `onOpenReview`. |
| `ReviewPage.jsx` | Review Detail | Per-KOL approve/reject/annotate, back-to-queue link. Keep all review logic + DM-draft generation. |
| `ReadyToSendPage.jsx` | Ready to Send | DM-ready list + count. Keep logic. |
| `TeamPage.jsx` | Team | User rows with initials avatar, email, join date, **role `<select>`** using the role-badge colours. Keep `changeRole` / Supabase writes. |
| `InstructionsPage.jsx` | Help | The Help screen in the mock is already the **fully restyled** version of this page (4-step quickstart + About + step-by-step + cost callout + scoring methodology + column guide). Mirror that structure/copy. |

---

## Keep these original features (not shown in the mock)

The static mock has no auth and shows every nav item, because it's a prototype. **Do not remove these
— restyle them to match.**

1. **`LoginPage.jsx`** — Google sign-in, `@markato.com` gating, error/loading states. No mock exists;
   design a login screen in the same language: cream `paper` bg, centered `card`, Markato logo mark,
   mono kicker, `bg-ink` primary "Sign in with Google" button, `rose` error text.
2. **Sidebar user block + Sign out** — keep the name/email/sign-out footer in the restyled sidebar
   (sign-out uses `rose` on hover).
3. **Role-gated nav** (`navItemsForRole`) — keep the filtering logic; it just feeds the restyled nav.
4. **`KolLookup.jsx`** — single-profile lookup + its 30-entry lookup history (`sessionHistory.js`).
   ⚠️ Note this component is **not currently routed in `App.jsx`** (it's orphaned). Decide with the
   team whether to (a) wire it into the new sidebar under **Workspace** and restyle it, or (b) leave
   it out. Either way, don't delete the file without confirming.

---

## Design tokens (reference)

| Token | Hex | Use |
|---|---|---|
| ink | `#221E18` | primary text, primary buttons, logo mark |
| paper | `#F4F1EB` | app background |
| sidebar | `#EEEAE1` | sidebar surface |
| card | `#FFFFFF` | card surface |
| card-edge | `#E7E2D6` | card border |
| mist | `#E1DCD0` | hairline dividers / sidebar border |
| panel | `#FBF9F4` | inset panels |
| accent | `#C8A96E` | gold accent, active state, progress bar |
| gold-text | `#9A7636` / `#8A6A22` | gold links / on-warning text |
| body | `#5C5340` | long-form body copy |
| muted | `#7E7768` | secondary text |
| faint | `#A89E8C` | mono labels, meta |
| sage | `#4A7C59` | high score / admin badge |
| rose | `#D4627A` | sign-out / destructive |
| warn-fill / warn-edge | `#F6ECD6` / `#E7D3A8` | cost callout |

**Type:** Schibsted Grotesk (400–800) display/UI; JetBrains Mono (400–600) labels, data, numbers.
**Radii:** cards 14px; buttons 10–12px; pills/badges full. **Sidebar width:** 236px.

## Files in this bundle

- `README.md` — this document.
- `Markato KOL Studio.dc.html` — the hi-fi visual reference (all screens).

## Suggested Claude Code prompt

> Read `design_handoff_markato_restyle/README.md`. This is a **visual restyle** of our existing app —
> keep all logic, routing, Supabase auth, RBAC, and `src/lib/` untouched. Start with Step 1 (the
> Tailwind token + font swap) and show me the diff before moving on. Then restyle components one file
> at a time per the Step 3 table, changing markup/classes only. Do not remove `LoginPage`,
> `KolLookup`, the sidebar sign-out, or `navItemsForRole` — restyle them to match. Pause after each
> component so I can review.
