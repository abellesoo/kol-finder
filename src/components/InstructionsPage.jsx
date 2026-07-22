
import { useState } from 'react'
import { TextEffect } from './core/text-effect'

function Section({ label, title, children }) {
  return (
    <section className="mb-10">
      <p className="font-mono text-[10px] tracking-[.16em] text-faint uppercase mb-1">{label}</p>
      <h2 className="text-[26px] font-serif font-semibold tracking-[0.02em] text-ink mb-4">{title}</h2>
      {children}
    </section>
  )
}

// Collapsible reference block — closed by default so the task flow stays uncluttered.
function Details({ label, title, children, defaultOpen = false }) {
  return (
    <details
      open={defaultOpen}
      className="group mb-10 border border-card-edge rounded-[14px] bg-white overflow-hidden"
    >
      <summary className="flex items-center justify-between gap-4 cursor-pointer list-none select-none px-5 py-4 hover:bg-surface/40 [&::-webkit-details-marker]:hidden">
        <div>
          <p className="font-mono text-[10px] tracking-[.16em] text-faint uppercase mb-1">{label}</p>
          <h2 className="text-[20px] font-serif font-semibold tracking-[0.02em] text-ink">{title}</h2>
        </div>
        <span className="shrink-0 text-faint text-[12px] font-mono transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="px-5 pb-6 pt-1 border-t border-mist/60">{children}</div>
    </details>
  )
}

function ScoreRow({ name, range, description, formula }) {
  return (
    <div className="flex gap-4 py-3 border-b border-mist/60 last:border-0">
      <div className="w-36 shrink-0">
        <p className="font-mono text-[13px] font-semibold text-ink">{name}</p>
        <p className="font-mono text-[11px] text-faint">{range}</p>
      </div>
      <div className="flex-1">
        {formula && (
          <p className="font-mono text-[11px] text-body bg-surface border border-card-edge px-2 py-1.5 rounded-[8px] mb-2 leading-relaxed">{formula}</p>
        )}
        <div className="text-[13px] text-body leading-relaxed">{description}</div>
      </div>
    </div>
  )
}

function DataRow({ source, fields }) {
  return (
    <div className="flex gap-3 py-2 border-b border-mist/50 last:border-0 text-[13px]">
      <span className="w-28 shrink-0 font-mono text-[11px] text-faint pt-0.5">{source}</span>
      <span className="text-body leading-relaxed">{fields}</span>
    </div>
  )
}


const TAB_SWITCHER = ({ tab, setTab }) => (
  <div className="flex gap-1 bg-[#E9E4D9] rounded-[11px] p-[4px] w-fit">
    {[['guide', 'Guide'], ['flow', 'How it works']].map(([id, label]) => (
      <button
        key={id}
        onClick={() => setTab(id)}
        className={`px-4 py-[6px] rounded-[8px] text-[13px] font-medium transition-all ${
          tab === id ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'
        }`}
      >
        {label}
      </button>
    ))}
  </div>
)

export default function InstructionsPage() {
  const [tab, setTab] = useState('guide')

  if (tab === 'flow') {
    return (
      <div className="flex flex-col flex-1 h-full">
        <div className="px-[48px] pt-[40px] pb-[16px]">
          <TAB_SWITCHER tab={tab} setTab={setTab} />
        </div>
        <iframe
          src="/kol-finder/flowchart.html"
          className="flex-1 border-0 w-full"
          title="How it works"
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen px-[48px] py-[40px] max-w-3xl mx-auto">

      <div className="mb-8">
        <TAB_SWITCHER tab={tab} setTab={setTab} />
      </div>

      {tab === 'guide' && <>

      {/* Intro — one-liner, no wall of text */}
      <div className="mb-8">
        <p className="font-mono text-[10px] tracking-[.18em] text-faint uppercase mb-[8px]">About this tool</p>
        <TextEffect
          as="h1"
          per="word"
          preset="slide"
          duration={0.3}
          staggerDelay={0.05}
          className="text-[34px] font-serif font-bold tracking-[0.02em] text-ink mb-4"
        >
          KOL Finder — Seeding Studio
        </TextEffect>
        <p className="text-body leading-relaxed mb-3">
          Your Instagram KOL seeding workflow, start to finish: <strong>find</strong> accounts, <strong>score &amp; rank</strong> them automatically, <strong>review</strong> as a team, send your <strong>DM outreach</strong>, then <strong>track</strong> every seeded KOL through to their published post (that last part lives in the <strong>Campaigns</strong> tab).
        </p>
        <p className="text-[13px] text-muted leading-relaxed">
          Scoring is free and runs right in your browser — no external calls. A few opt-in features use a paid API (scraping, Live Stats, AI Fit, DM drafts) — see <strong className="text-body">Costs</strong> below.
        </p>
      </div>

      {/* Quick Start */}
      <div className="mb-10 px-5 py-4 border border-card-edge bg-surface rounded-[13px]">
        <p className="font-mono text-[9.5px] tracking-[.16em] text-faint uppercase mb-3">Quick start — the 30-second version</p>
        <ol className="space-y-2.5">
          {[
            ['Get accounts in', 'Upload an Apify .xlsx export, or paste competitor URLs / hashtags to scrape.'],
            ['Set your brief', 'Pick target niches, add keywords + audience terms, and write the campaign brief.'],
            ['Start scoring', 'Every account gets ranked by Engagement + Relevancy — instantly, and free.'],
            ['Shortlist & reach out', 'Sort and filter the table, approve your picks, move them to Ready to Send.'],
            ['Export', 'Download a formatted XLSX to share with your team.'],
          ].map(([t, d], i) => (
            <li key={t} className={`flex gap-3 anim-rise anim-d${i + 1}`}>
              <span className="shrink-0 w-5 h-5 rounded-full bg-ink/10 text-ink text-[10px] font-mono font-semibold flex items-center justify-center mt-px">{i + 1}</span>
              <p className="text-[13px] text-body leading-relaxed"><strong>{t}</strong> — {d}</p>
            </li>
          ))}
        </ol>
        <p className="text-[12px] text-faint mt-3">That covers most runs. Full steps and scoring details are below when you need them.</p>
      </div>

      <div className="border-t border-mist mb-10" />

      {/* Seeding Tool Instructions */}
      <Section label="How to use" title="Seeding Tool — Step-by-step">

        <ol className="space-y-6">

          {/* Step 1 — two intake paths */}
          <li className="flex gap-4">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-ink text-white text-[11px] font-mono font-semibold flex items-center justify-center mt-0.5">1</span>
            <div className="flex-1">
              <p className="text-[16px] font-bold text-ink mb-1">Get your accounts in</p>
              <p className="text-[13px] text-body leading-relaxed mb-3">Two ways to do it — pick whichever fits:</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="border border-card-edge rounded-[12px] px-4 py-3 bg-white">
                  <p className="font-mono text-[9.5px] tracking-[.14em] text-faint uppercase mb-2">Option A — Paste URLs / hashtags</p>
                  <p className="text-[12px] text-muted italic mb-2">Starting a fresh scrape now.</p>
                  <p className="text-[13px] text-body leading-relaxed">
                    Go to <strong>Scrape URLs / Hashtags</strong> and paste competitor post URLs, brand-tagged pages, or hashtags — one per line, <code className="font-mono text-[11px] bg-surface px-1 rounded">#skincare</code> or plain <code className="font-mono text-[11px] bg-surface px-1 rounded">skincare</code> both work. Pick a result limit and hit <strong>Start scrape</strong>. Results feed straight into the pipeline.
                  </p>
                </div>
                <div className="border border-card-edge rounded-[12px] px-4 py-3 bg-white">
                  <p className="font-mono text-[9.5px] tracking-[.14em] text-faint uppercase mb-2">Option B — Upload XLSX</p>
                  <p className="text-[12px] text-muted italic mb-2">You already have an Apify export.</p>
                  <p className="text-[13px] text-body leading-relaxed">
                    Drop in an Apify Instagram Scraper .xlsx — the filename becomes the source label in your export. Upload several files to combine sources, or re-score an old dataset with new filters.
                  </p>
                </div>
              </div>
            </div>
          </li>

          {/* Step 2 — brief, broken into scannable pieces */}
          <li className="flex gap-4">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-ink text-white text-[11px] font-mono font-semibold flex items-center justify-center mt-0.5">2</span>
            <div className="flex-1">
              <p className="text-[16px] font-bold text-ink mb-1">Define your brief</p>
              <p className="text-[13px] text-body leading-relaxed mb-3">
                Everything lives on one <strong>Set up your run</strong> screen — intake on one side, scoring setup on the other — so you can tune things while your data loads. Pick your <strong>target niches</strong> first (beauty, skincare, lifestyle…), then:
              </p>
              <ul className="space-y-2 text-[13px] text-body leading-relaxed mb-3">
                <li className="flex gap-2">
                  <span className="text-faint shrink-0">•</span>
                  <span><strong>Two filters run before scoring even starts</strong> — a minimum average-likes bar, and <strong>Target location</strong> (HK / Taiwan / Singapore / Macau). Accounts detected in another region never make it to the table; accounts with no detected region are kept.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-faint shrink-0">•</span>
                  <span><strong>Three text fields</strong> sharpen Relevancy. <strong>Target audience</strong> and <strong>In-niche keywords</strong> add points per match; <strong>Exclude keywords</strong> subtract them. Exact weights are in <em>How accounts are scored</em> below.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-faint shrink-0">•</span>
                  <span>Paste your <strong>Campaign brief</strong> into the one box — anything works (WhatsApp brief, a doc, a few typed lines), then hit <strong>自動整理 Auto-tidy</strong> and DeepSeek reformats it into the standard shape (brand / background / new product / collab format / selling points). It feeds the AI fit score and powers the campaign's DM draft. DeepSeek only uses what's in the box — it won't invent claims. It's optional here: you can still add or edit the brief on the Review page before generating DMs.</span>
                </li>
              </ul>
              <p className="text-[13px] text-body leading-relaxed">
                Ran this brand before? The <strong>Databank</strong> launcher at the top of an empty Set-up page shows a card per saved brand: click a card to prefill its background and products, then click one of its <strong>saved runs</strong> to reload the scrape inputs and the full scoring form too. Once you're working it collapses to a thin strip — that's where <strong>Save inputs</strong> lives; the current inputs file under the form's brand name, so name the run after the campaign and one brand can keep several setups.
              </p>
            </div>
          </li>

          {/* Steps 3–6 */}
          {[
            {
              n: 3,
              title: 'Score & enrich',
              text: <>Hit <strong>Start scoring</strong> and every account gets ranked by Engagement and Relevancy — instantly, right in your browser. Want fresher numbers? <strong>Fetch Live Stats</strong> pulls real-time median likes, views, and comments (≈$0.01/account, cached 7 days). You can also <strong>Score fit with AI</strong> to add an AI Fit column — it's advisory unless you tick <strong>Blend into Overall</strong>.</>,
            },
            {
              n: 4,
              title: 'Review & shortlist',
              text: <>Work through the ranked table — the header stays put while you scroll. Click a numeric column to sort, or open a category column's dropdown to filter (Location, say). The <strong>Content</strong> filter (All / Video only / Non-video) narrows by format. Expand any row for the verdict, AI Fit reasoning, niche signals, and flags. Every sort and filter lands in the URL — copy the link and a teammate opens the exact same view.</>,
            },
            {
              n: 5,
              title: 'Reach out',
              text: <>Move your approved accounts to <strong>Ready to Send</strong>. From there you can copy profile links, open Instagram, and track DM status per account — so nobody double-sends.</>,
            },
            {
              n: 6,
              title: 'Export',
              text: <>Hit <strong>Export to XLSX</strong> and you get a formatted spreadsheet — per-source colour coding, workflow dropdowns, and clickable Instagram links.</>,
            },
          ].map(({ n, title, text }) => (
            <li key={n} className="flex gap-4">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-ink text-white text-[11px] font-mono font-semibold flex items-center justify-center mt-0.5">
                {n}
              </span>
              <div>
                <p className="text-[16px] font-bold text-ink mb-1">{title}</p>
                <p className="text-[13px] text-body leading-relaxed">{text}</p>
              </div>
            </li>
          ))}

        </ol>
      </Section>

      {/* Refresh / Cost Warning */}
      <div className="mb-10 px-5 py-4 border border-[#E7D3A8] bg-[#F6ECD6] rounded-[13px]">
        <p className="font-mono text-[9.5px] tracking-[.16em] text-[#8A6A22] uppercase mb-3">Costs</p>
        <p className="text-[13px] text-body leading-relaxed mb-2">
          Most of the tool costs nothing — scoring, the Review Queue, Ready to Send, and DM status tracking are all <strong>free</strong>. Only four actions call a paid API:
        </p>
        <div className="space-y-2 mt-3">
          <div className="flex gap-3">
            <span className="font-mono text-[11px] text-[#8A6A22] w-28 shrink-0 pt-px">Direct scrape</span>
            <p className="text-[13px] text-body leading-relaxed">Apify Instagram Scraper — cost scales with your result limit. 200 results ≈ $0.50–1; 1,000 ≈ $2–3.</p>
          </div>
          <div className="flex gap-3">
            <span className="font-mono text-[11px] text-[#8A6A22] w-28 shrink-0 pt-px">Fetch Live Stats</span>
            <p className="text-[13px] text-body leading-relaxed">≈<strong>$0.01 per account</strong> via Apify (100–200 accounts ≈ $1–2). Results are cached for 7 days, so re-running won't charge you twice for the same accounts.</p>
          </div>
          <div className="flex gap-3">
            <span className="font-mono text-[11px] text-[#8A6A22] w-28 shrink-0 pt-px">Score fit with AI</span>
            <p className="text-[13px] text-body leading-relaxed">DeepSeek — one call per 15 accounts. A 200-account run stays well under $0.50.</p>
          </div>
          <div className="flex gap-3">
            <span className="font-mono text-[11px] text-[#8A6A22] w-28 shrink-0 pt-px">Generate DM draft</span>
            <p className="text-[13px] text-body leading-relaxed">DeepSeek — a fraction of a cent per draft. Draft away.</p>
          </div>
        </div>
      </div>

      {/* Scoring Methodology — collapsed reference */}
      <Details label="Reference" title="How accounts are scored">

        {/* Formula summary */}
        <div className="bg-surface border border-card-edge rounded-[12px] px-5 py-4 mb-6 mt-4 overflow-x-auto">
          <p className="font-mono text-[9.5px] tracking-[.14em] text-faint uppercase mb-3">Formula</p>
          <div className="space-y-1 font-mono text-[13px] text-body min-w-[520px]">
            <p><span className="text-ink/40 mr-2">Overall (0–100)</span>= Engagement Score × 5 + Relevancy Score × 5 <span className="text-ink/40 text-xs">· 50% Eng / 50% Rel</span></p>
            <p><span className="text-ink/40 mr-2 invisible">Overall (0–100)</span>= Engagement × 3.5 + Relevancy × 2.5 + AI Fit × 4 <span className="text-ink/40 text-xs">· when "Blend into Overall" is on (35% Eng / 25% Rel / 40% AI)</span></p>
            <p><span className="text-ink/40 mr-2 invisible">Overall (0–100)</span>= capped at 40 <span className="text-ink/40 text-xs">· when Relevancy &lt; 3 (off-niche floor — reach can't rescue a wrong-vertical account)</span></p>
            <p><span className="text-ink/40 mr-2">Engagement Score</span>= log(1 + medianLikes + medianViews × 0.8 + medianComments × 1.5) + reach boost <span className="text-ink/40 text-xs">· with Live Stats</span></p>
            <p><span className="text-ink/40 mr-2 invisible">Engagement Score</span>= log(1 + avgLikes + avgComments × 1.5) + reach boost <span className="text-ink/40 text-xs">· before Live Stats · reach boost = log10(1 + followers) × 0.5</span></p>
            <p><span className="text-ink/40 mr-2">Relevancy Score</span>= 3 + niche hits + ((in-niche keyword + audience term hits) × 1.5) − off-niche categories − (exclude keyword hits × 3) <span className="text-ink/40 text-xs">· capped 0–10; +1 if location matches</span></p>
            <p><span className="text-ink/40 mr-2">AI Fit</span>= DeepSeek rating 0–10 vs. brief + audience + past decisions <span className="text-ink/40 text-xs">· advisory unless blended</span></p>
          </div>
        </div>

        {/* Data sources */}
        <p className="font-mono text-[9.5px] tracking-[.14em] text-faint uppercase mb-3">Data sources</p>
        <div className="border border-card-edge rounded-[12px] px-4 py-1 mb-6 bg-white">
          <DataRow
            source="Apify export"
            fields="avgLikes, avgComments, followerCount, videoRatio, hashtags, captions, locationNames — all there the moment you upload, no extra scraping needed."
          />
          <DataRow
            source="Live Stats"
            fields="medianLikes, medianViews, medianComments — pulled on demand when you Fetch Live Stats. These replace the export-based Engagement Score estimate. Uses posts from the last 3 months, falling back to all 10 scraped posts if there's no recent content."
          />
        </div>

        {/* Score breakdown */}
        <p className="font-mono text-[9.5px] tracking-[.14em] text-faint uppercase mb-3">Score breakdown</p>
        <div className="border border-card-edge rounded-[12px] px-4 py-1 mb-6 bg-white">
          <ScoreRow
            name="Overall Score"
            range="0 – 100"
            formula="(engagement × 5) + (relevancy × 5)   ·   capped at 40 when relevancy < 3"
            description="50% Engagement Score + 50% Relevancy Score. Niche fit and audience activity weigh equally, so a high-engagement account in the wrong niche can't float to the top. If Relevancy falls below the baseline of 3 (net off-niche or excluded matches), Overall gets capped at 40 — the off-niche floor. Reach alone won't lift a wrong-vertical creator into your shortlist. 70+ is flagged a strong match; 45–69 possible; below 45 low fit. Treat it as your review order, not a pass/fail grade."
          />
          <ScoreRow
            name="Engagement Score"
            range="0 – 10"
            formula="Before Live Stats: log(1 + avgLikes + avgComments×1.5) + reach boost   |   With Live Stats: log(1 + medianLikes + medianViews×0.8 + medianComments×1.5) + reach boost   ·   reach boost = log10(1 + followers) × 0.5"
            description="Measures raw audience activity on a natural-log scale, which compresses big follower gaps — so a 10k-like account doesn't automatically swamp a 1k-like one. Before Live Stats, comments count 1.5× as a stand-in for replies (a comment takes more intent than a like). Once you Fetch Live Stats, the formula upgrades to median likes, views, and comments — medians shrug off the one viral post that would skew an average. Views weigh 0.8× (slightly less intent than a like); comments keep their 1.5× high-intent weight. Photo-only accounts contribute 0 for views — that's expected, not a bug. Overall updates in real time as live data lands, account by account."
          />
          <ScoreRow
            name="Relevancy Score"
            range="0 – 10"
            formula="3 + niche hits + ((in-niche keyword + audience term) hits × 1.5) − off-niche categories − (exclude keyword hits × 3)   ·   +1 when location matches"
            description={<>
              <p className="mb-3">Every account starts at a baseline of 3. Its hashtags, captions, display name, and bio get scanned against six built-in niche keyword lists. Each keyword match in a <em>target niche</em> adds +1; each <em>off-niche</em> category with any match at all deducts −1 (flat per category, not per word). The score is capped 0–10.</p>
              <div className="border border-card-edge rounded-[10px] bg-surface px-4 py-3 mb-3">
                <p className="text-[11px] font-mono text-faint uppercase tracking-[.12em] mb-2">Per-campaign signals (Set up your run screen)</p>
                <p className="mb-2">Six built-in niches can't describe every product (a 減脂 protein shake, say). That's what your own signals are for:</p>
                <ul className="list-disc ml-4 space-y-1">
                  <li><strong>In-niche keywords</strong> you type (e.g. 減脂, 高蛋白, 健身, 代餐) count <strong>+1.5 each</strong> — they outrank the built-in dictionary because they describe <em>this</em> campaign.</li>
                  <li><strong>Target audience</strong> terms (who the product is for) also count <strong>+1.5 each</strong>. The free text gets split into terms and matched the same way — so stick to short, comma-separated terms (e.g. <code className="font-mono text-[11px] bg-white px-1 rounded">健康, gym, OL, 低卡, 減脂</code>). Long run-on phrases match less reliably.</li>
                  <li><strong>Exclude keywords</strong> (e.g. makeup, 化妝, 美妝) are a hard no at <strong>−3 each</strong> — enough to push a wrong-vertical account below the off-niche floor, where the Overall cap kicks in.</li>
                  <li><strong>Target location</strong> adds <strong>+1</strong> when an account's detected region matches. This is separate from the location <em>filter</em>, which removes wrong-region accounts before scoring even starts.</li>
                </ul>
              </div>
              <div className="border border-card-edge rounded-[10px] overflow-hidden mb-3">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-surface border-b border-card-edge">
                      <th className="text-left font-mono text-[10px] tracking-[.1em] text-faint uppercase px-3 py-2 w-24">Niche</th>
                      <th className="text-left font-mono text-[10px] tracking-[.1em] text-faint uppercase px-3 py-2">Sample keywords</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['beauty',    'makeup, lipstick, foundation, eyeshadow, blush, 化妝, 唇膏, 眼影'],
                      ['skincare',  'skincare, serum, moisturizer, spf, retinol, acne, 護膚, 精華, 防曬'],
                      ['lifestyle', 'lifestyle, daily, vlog, life, 生活, 日常, 分享'],
                      ['fashion',   'fashion, style, outfit, ootd, wear, 穿搭, 時尚, 造型'],
                      ['health',    'health, wellness, yoga, gym, fitness, workout, 健康, 健身, 瑜伽'],
                      ['food',      'food, eat, restaurant, recipe, foodie, 美食, 食物, 餐廳'],
                    ].map(([niche, kws], i) => (
                      <tr key={niche} className={i % 2 === 0 ? 'bg-white' : 'bg-surface/50'}>
                        <td className="font-mono text-body px-3 py-1.5 border-b border-mist/40 last:border-0 align-top">{niche}</td>
                        <td className="text-muted px-3 py-1.5 border-b border-mist/40 last:border-0">{kws}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[12px] text-faint"><strong className="text-body">Example:</strong> You select beauty + skincare. An account with "makeup, serum, moisturizer, foodie" in their content: beauty hits +1, skincare hits +2, food is off-niche −1 → score = 3 + 3 − 1 = <strong className="text-body">5</strong>. If a score looks off, expand the row — the "Niche signals" tags are the exact keywords that matched.</p>
            </>}
          />
          <ScoreRow
            name="Bot Risk Score"
            range="0 – 10 · informational"
            formula="based on comments ÷ likes ratio"
            description="Not part of the Overall Score — informational only. It reads authenticity from the comment-to-like ratio; genuine engagement usually runs 1–2%+. The rules: ratio < 0.5% with avg likes > 5,000 → score 2 (high bot risk); ratio < 1% with avg likes > 1,000 → score 4; ratio ≥ 2% → score 9; ratio ≥ 1% → score 7; anything else → score 5. Higher = more authentic. Accounts scoring 2–3 get a 'bot-risk' flag in the flags column."
          />
          <ScoreRow
            name="AI Fit Score"
            range="0 – 10 · opt-in, advisory"
            formula="DeepSeek rating vs. brief + seeding criteria + past decisions"
            description={<>
              <p className="mb-2">A learning layer on top of the fixed formulas. Click <strong>Score fit with AI</strong> on the Results screen and DeepSeek rates each account 0–10 on how well it fits <em>this</em> campaign, with a one-line reason (expand a row to read it).</p>
              <div className="border border-card-edge rounded-[10px] bg-surface px-4 py-3 mb-3">
                <p className="text-[11px] font-mono text-faint uppercase tracking-[.12em] mb-2">How it learns — no trained model, no stored agent</p>
                <p className="mb-2">There's <strong>no fine-tuned model and no agent remembering things between runs.</strong> Nothing gets written into model weights — the "learning" lives entirely in your data. Each time you click Score fit with AI, the app:</p>
                <ol className="list-decimal ml-4 space-y-1 mb-2">
                  <li>Pulls your team's <strong>~40 most recent approve/reject decisions</strong> from past campaigns in the database — each with its categorised rejection reason, 1–5 fit rating, and that account's bio, hashtags, niches, flags, and follower count.</li>
                  <li>Sends those labeled examples <strong>plus</strong> the campaign brief and seeding criteria <strong>plus</strong> the accounts being scored to DeepSeek in a single prompt.</li>
                  <li>DeepSeek reads the examples as context and imitates your demonstrated taste — criteria and brief first, then the patterns in what you've approved vs. rejected.</li>
                </ol>
                <p className="mb-2">Because it re-reads your latest decisions every run, it gets sharper the moment your team logs more reviews — no training step, no waiting. Two trade-offs: it only sees the <strong>most recent ~40 decisions</strong> (a token-budget limit, not your whole history), and it matches demonstrated patterns rather than tracking specific past "mistakes" with a correction signal. On a brand-new database with no decisions yet, it scores on the brief alone and stays deliberately moderate.</p>
                <p className="text-[12px] text-faint">This is why <strong className="text-body">consistent reviewing matters</strong>: the more consistently brand managers categorise rejections and rate approvals in the Review Queue, the sharper this score gets.</p>
              </div>
              <p>It's <strong>advisory</strong> by default — it gets its own column but doesn't move the Overall score. Tick <strong>Blend into Overall</strong> only once you've sanity-checked it against a few real campaigns; blending reweights Overall to <strong>35% Engagement + 25% Relevancy + 40% AI Fit</strong>. The off-niche cap still applies — a below-floor Relevancy caps Overall at 40, high AI Fit or not.</p>
            </>}
          />
        </div>

        {/* Column guide */}
        <p className="font-mono text-[9.5px] tracking-[.14em] text-faint uppercase mb-3">Column guide</p>
        <div className="border border-card-edge rounded-[12px] px-4 py-1 mb-6 bg-white">
          <ScoreRow
            name="AI Fit"
            range="0 – 10 · opt-in"
            description="Covered under AI Fit Score in the score breakdown above. Appears after you run Score fit with AI; expand a row for the reasoning. Advisory unless Blend into Overall is ticked."
          />
          <ScoreRow
            name="Med. Likes"
            range="Live · from scrape"
            description="Median like count across the 10 most recent posts from Live Stats. We use the median instead of the average so one viral post can't skew it. Requires Fetch Live Stats."
          />
          <ScoreRow
            name="Med. Views"
            range="Live · from scrape"
            description="Median video view count across the 10 most recent Reels or clips from Live Stats. Photo-only accounts show a dash. Requires Fetch Live Stats."
          />
          <ScoreRow
            name="Med. Comments"
            range="Live · from scrape"
            description="Median comment count across the 10 most recent posts or Reels from Live Stats. Weighted 1.5× in the Engagement Score formula as a high-intent signal. Requires Fetch Live Stats."
          />
          <ScoreRow
            name="Scraped Post"
            range="link · from export"
            description="Link to the most recent post found in the original Apify export for this account. Opens the post right on Instagram."
          />
          <ScoreRow
            name="Post Likes / Comments / Plays"
            range="from export"
            description="Raw like, comment, and play/view counts on that most recent scraped post. Handy for a quick gut-check on typical performance before you click through."
          />
          <ScoreRow
            name="Scraped Caption"
            range="from export"
            description="Caption text from the most recent scraped post — a quick read on content style and language without leaving the tool."
          />
          <ScoreRow
            name="Scoring Verdict"
            range="local · from scoring"
            description="A short plain-language summary generated locally from the scores — e.g. 'strong niche fit' or 'some niche relevancy, possible bot activity'. Shows when you expand a row in the Results table."
          />
        </div>

        <p className="text-[11px] text-faint font-mono">
          All scores are computed locally in your browser. Data only leaves for the opt-in Apify features (Fetch Live Stats, direct scrape intake). The Apify API key never reaches the browser — it stays behind the Cloudflare Worker proxy.
        </p>
      </Details>

      {/* Campaign Ops — collapsed reference */}
      <Details label="Campaign Ops" title="Tracking your seeded KOLs">

        <p className="text-body leading-relaxed mb-3 mt-4">
          Once your accounts are approved and the DMs are out, the <strong>Campaigns</strong> tab takes over. It tracks every seeded KOL from parcel to published post — and <strong>detects the post for you</strong>, so you're not scrolling feeds. Approved KOLs carry over by their Instagram handle, the same handle used everywhere else in the tool.
        </p>

        {/* Pipeline states */}
        <div className="bg-surface border border-card-edge rounded-[12px] px-5 py-4 mb-6">
          <p className="font-mono text-[9.5px] tracking-[.14em] text-faint uppercase mb-3">The KOL pipeline</p>
          <div className="flex items-center flex-wrap gap-x-2 gap-y-2 text-[11px] font-mono">
            {['approved', 'shipped', 'awaiting post', 'posted'].map((s, i, arr) => (
              <span key={s} className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-ink/5 text-body">{s}</span>
                {i < arr.length - 1 && <span className="text-faint">→</span>}
              </span>
            ))}
            <span className="text-faint mx-1">·</span>
            <span className="px-2 py-0.5 rounded-full bg-[#F4E2E6] text-[#A8485E]">overdue</span>
            <span className="px-2 py-0.5 rounded-full bg-ink/5 text-faint">opted out</span>
          </div>
          <p className="text-[12px] text-body leading-relaxed mt-3">
            A late post still counts — <strong>overdue → posted</strong> is allowed. And any KOL who hasn't reached a final state can be marked <strong>opted out</strong> if they drop.
          </p>
        </div>

        <ol className="space-y-6">
          {[
            {
              n: 1,
              title: 'Create or import a campaign',
              text: <>In the <strong>Campaigns</strong> tab, click <strong>New</strong> and set the brand, market, and posting deadline — plus the <strong>#hashtags</strong> and <strong>@mentions</strong> that count as "posted". Those are the signals the tracker matches against, so choose them carefully. Already have a marketing-plan sheet? Click <strong>Import</strong> to pull handles, budgets, and formats straight from the .xlsx. Flip between <strong>card</strong> and <strong>table</strong> views — the table shows KOLs, Posted, Overdue, and a <strong>Fulfilled %</strong> per campaign.</>,
            },
            {
              n: 2,
              title: 'Attach KOLs & set their content format',
              text: <>Open a campaign and <strong>Attach KOLs</strong> straight from your approved Review Queue. Tag each one with the content they owe — <strong>Feed</strong>, <strong>Reel</strong>, <strong>Story</strong>, or <strong>Blog</strong>. Feed and Reels are <strong>auto-verified</strong> from the scrape. Stories vanish within 24h and Blogs live off-platform, so those get flagged <strong>"verify manually"</strong> and are never auto-marked overdue.</>,
            },
            {
              n: 3,
              title: 'Verify posts',
              text: <>Click <strong>Verify posts</strong> to scrape every awaiting or overdue KOL and match their recent posts against the campaign's hashtags and mentions. It also runs on its own <strong>~twice a day</strong>, so most posts get caught without you lifting a finger. A match records the post — link plus which signals hit — and moves the KOL to <strong>Posted</strong>. Past the deadline with no match → <strong>Overdue</strong>.</>,
            },
            {
              n: 4,
              title: 'Confirm the match',
              text: <>Auto-detection plays it safe — it marks the KOL as <strong>Posted</strong> but leaves the post <em>unconfirmed</em>. Eyeball the detected post, then hit <strong>Confirm</strong>. Nothing counts as fully verified until a human signs off — that's your safety gate against a mis-tagged or coincidental post being counted.</>,
            },
            {
              n: 5,
              title: 'Nudge overdue KOLs',
              text: <>Got an overdue KOL? Click <strong>Draft nudge</strong> for a warm, no-pressure reminder DM in the campaign's market language (<strong>Cantonese for HK, zh-TW for Taiwan</strong> — never mixed). Copy it, send it from Instagram, then hit <strong>Mark sent</strong> to log it. Sending stays copy-paste for now — the Meta API is paused.</>,
            },
          ].map(({ n, title, text }) => (
            <li key={n} className="flex gap-4">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-ink text-white text-[11px] font-mono font-semibold flex items-center justify-center mt-0.5">
                {n}
              </span>
              <div>
                <p className="text-[16px] font-bold text-ink mb-1">{title}</p>
                <p className="text-[13px] text-body leading-relaxed">{text}</p>
              </div>
            </li>
          ))}
        </ol>

        <p className="text-[11px] text-faint font-mono mt-6">
          Verification uses the same Apify scrape as Live Stats (~$0.01 per KOL checked); nudge drafts use DeepSeek (a fraction of a cent each) — the same two paid APIs from the cost note above. Everything else in Campaign Ops is free.
        </p>
      </Details>

      </>}

    </div>
  )
}
