
import { useState } from 'react'

function Section({ label, title, children }) {
  return (
    <section className="mb-10">
      <p className="font-mono text-[10px] tracking-[.16em] text-faint uppercase mb-1">{label}</p>
      <h2 className="text-[20px] font-bold tracking-[-0.02em] text-ink mb-4">{title}</h2>
      {children}
    </section>
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

      {/* Tool Overview */}
      <div className="mb-10">
        <p className="font-mono text-[10px] tracking-[.18em] text-faint uppercase mb-[8px]">About this tool</p>
        <h1 className="text-[27px] font-bold tracking-[-0.02em] text-ink mb-4">KOL Finder — Seeding Studio</h1>
        <p className="text-body leading-relaxed mb-3">
          A full end-to-end Instagram KOL seeding workflow — from account discovery to tracked outreach. Source KOL candidates, score and rank them automatically, review and approve as a team, then manage DM outreach in one place.
        </p>
        <p className="text-body leading-relaxed mb-3">
          Bring in accounts two ways: upload an Apify <strong>.xlsx</strong> export, or paste competitor post URLs and hashtags directly and let the tool trigger the scrape. Either way, accounts are deduplicated, scored across Engagement and Relevancy, and surfaced in a ranked table ready to filter and shortlist.
        </p>
        <p className="text-body leading-relaxed mb-3">
          From the Results table, move approved accounts into the <strong>Review Queue</strong> for your team to assess, then into <strong>Ready to Send</strong> where you can track DM status per account and coordinate outreach without double-sending. In the Review Queue, brand managers categorise why an account was rejected, rate the fit of approvals, and set the campaign's seeding criteria — this structured feedback is what the <strong>AI Fit</strong> score learns from over time.
        </p>
        <p className="text-body leading-relaxed">
          The rule-based Engagement and Relevancy scoring is deterministic arithmetic in your browser with no external calls. Three features are opt-in and call a paid API: Live Stats and direct scraping (Apify), and AI Fit scoring plus DM drafts (DeepSeek) — see the cost breakdown below.
        </p>
      </div>

      <div className="border-t border-mist mb-10" />

      {/* Seeding Tool Instructions */}
      <Section label="How to use" title="Seeding Tool — Step-by-step">

        <ol className="space-y-6">

          {/* Step 1 — two intake paths */}
          <li className="flex gap-4">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-ink text-white text-[11px] font-mono font-semibold flex items-center justify-center mt-0.5">1</span>
            <div className="flex-1">
              <p className="text-[16px] font-bold text-ink mb-1">Pull in your accounts</p>
              <p className="text-[13px] text-body leading-relaxed mb-3">Two ways to bring in data — pick whichever fits your situation:</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="border border-card-edge rounded-[12px] px-4 py-3 bg-white">
                  <p className="font-mono text-[9.5px] tracking-[.14em] text-faint uppercase mb-2">Option A — Paste URLs / hashtags</p>
                  <p className="text-[12px] text-muted italic mb-2">Starting a fresh scrape right now.</p>
                  <p className="text-[13px] text-body leading-relaxed">
                    Go to <strong>"Scrape URLs / Hashtags"</strong>. Paste competitor post URLs, brand-tagged page URLs, or hashtags (one per line — <code className="font-mono text-[11px] bg-surface px-1 rounded">#skincare</code> or just <code className="font-mono text-[11px] bg-surface px-1 rounded">skincare</code>). Choose a result limit and click <strong>Start scrape</strong>. The tool calls Apify, polls until done, and feeds results straight into the pipeline.
                  </p>
                </div>
                <div className="border border-card-edge rounded-[12px] px-4 py-3 bg-white">
                  <p className="font-mono text-[9.5px] tracking-[.14em] text-faint uppercase mb-2">Option B — Upload XLSX</p>
                  <p className="text-[12px] text-muted italic mb-2">You already have a previous Apify export.</p>
                  <p className="text-[13px] text-body leading-relaxed">
                    Drop in an Apify Instagram Scraper .xlsx. The filename becomes the brand label in the export. Upload multiple files to combine brands, or re-score an old dataset with new niche filters.
                  </p>
                </div>
              </div>
            </div>
          </li>

          {/* Steps 2–6 */}
          {[
            {
              n: 2,
              title: 'Define your brief',
              text: <>On the <strong>Configure</strong> screen, choose your target niches (beauty, skincare, lifestyle…) and set a minimum average-likes threshold to filter out low-engagement accounts. Also write a <strong>Campaign brief</strong> — it's used later to generate each approved account's personalised DM draft, so it works best filled in with five structured fields: brand name, brand background, new product (+ where it's sold, + hook), collab format, and per-product selling points. DeepSeek only ever uses what's written here — it won't invent ingredients, numbers, or claims. Click <strong>"How to fill this in →"</strong> on the Configure screen for the full guide and a filled-in example.</>,
            },
            {
              n: 3,
              title: 'Score & enrich',
              text: <>Click <strong>Start scoring</strong> to rank every account by Engagement and Relevancy — computed instantly in your browser, no external calls. Then click <strong>Fetch Live Stats</strong> on the Results screen to pull real-time median likes, views, and comments from Apify, upgrading scores with fresher data. Live stats cost ~$0.01/account and are cached for 7 days. Optionally click <strong>Score fit with AI</strong> to add an AI Fit column that rates each account against your brief and your team's past review decisions — advisory unless you tick <strong>Blend into Overall</strong>.</>,
            },
            {
              n: 4,
              title: 'Review & shortlist',
              text: <>Browse the ranked Results table. Sort, filter, and customise columns to zero in on the right accounts. Expand any row to see the scoring verdict, AI Fit reasoning, niche signals, top hashtags, and flags.</>,
            },
            {
              n: 5,
              title: 'Reach out',
              text: <>Move approved accounts to the <strong>Ready to Send</strong> queue. From there, copy profile links, open Instagram directly, and track DM status for each account. Use the status column to coordinate outreach across your team without double-sending.</>,
            },
            {
              n: 6,
              title: 'Export',
              text: <>Click <strong>Export to XLSX</strong> to download a formatted spreadsheet with per-brand colour coding, workflow dropdowns (Approve Yes/No, Reach-out Status), and hyperlinked Instagram URLs. Ready to share with your team or file for records.</>,
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
        <p className="font-mono text-[9.5px] tracking-[.16em] text-[#8A6A22] uppercase mb-3">Important — costs</p>
        <p className="text-[13px] text-body leading-relaxed mb-2">
          Most of the tool is <strong>free</strong> — rule-based scoring, the Review Queue, Ready to Send, and DM status tracking all run at no cost. Four actions call a paid API:
        </p>
        <div className="space-y-2 mt-3">
          <div className="flex gap-3">
            <span className="font-mono text-[11px] text-[#8A6A22] w-28 shrink-0 pt-px">Direct scrape</span>
            <p className="text-[13px] text-body leading-relaxed">Apify Instagram Scraper — cost scales with result limit. 200 results ≈ $0.50–1; 1,000 results ≈ $2–3.</p>
          </div>
          <div className="flex gap-3">
            <span className="font-mono text-[11px] text-[#8A6A22] w-28 shrink-0 pt-px">Fetch Live Stats</span>
            <p className="text-[13px] text-body leading-relaxed">Apify batch scrape — approximately <strong>$0.01 per account</strong>. A run of 100–200 accounts costs around $1–2. Results are cached for 7 days, so re-running the same dataset won't re-charge for already-fetched accounts.</p>
          </div>
          <div className="flex gap-3">
            <span className="font-mono text-[11px] text-[#8A6A22] w-28 shrink-0 pt-px">Score fit with AI</span>
            <p className="text-[13px] text-body leading-relaxed">DeepSeek chat API — one call per 15 accounts, with your past review decisions attached. Cost is negligible: well under $0.50 for a 200-account run.</p>
          </div>
          <div className="flex gap-3">
            <span className="font-mono text-[11px] text-[#8A6A22] w-28 shrink-0 pt-px">Generate DM draft</span>
            <p className="text-[13px] text-body leading-relaxed">DeepSeek chat API — cost is negligible, a small fraction of a cent per draft.</p>
          </div>
        </div>
      </div>

      {/* Scoring Methodology */}
      <Section label="Scoring methodology" title="How accounts are scored">

        {/* Formula summary */}
        <div className="bg-surface border border-card-edge rounded-[12px] px-5 py-4 mb-6">
          <p className="font-mono text-[9.5px] tracking-[.14em] text-faint uppercase mb-3">Formula</p>
          <div className="space-y-1 font-mono text-[13px] text-body">
            <p><span className="text-ink/40 mr-2">Overall (0–100)</span>= Engagement Score × 8 + Relevancy Score × 2</p>
            <p><span className="text-ink/40 mr-2 invisible">Overall (0–100)</span>= Engagement × 6 + Relevancy × 1 + (AI Fit ÷ 10) × 3 <span className="text-ink/40 text-xs">· when "Blend into Overall" is on (60% Eng / 10% Rel / 30% AI)</span></p>
            <p><span className="text-ink/40 mr-2">Engagement Score</span>= log(1 + medianLikes + medianViews × 0.8 + medianComments × 1.5) <span className="text-ink/40 text-xs">· after live fetch</span></p>
            <p><span className="text-ink/40 mr-2 invisible">Engagement Score</span>= log(1 + avgLikes + avgComments × 1.5) <span className="text-ink/40 text-xs">· before live fetch</span></p>
            <p><span className="text-ink/40 mr-2">Relevancy Score</span>= 3 + keyword hits − off-niche category hits <span className="text-ink/40 text-xs">· capped 0–10</span></p>
            <p><span className="text-ink/40 mr-2">AI Fit</span>= DeepSeek rating 0–100 vs. brief + past decisions <span className="text-ink/40 text-xs">· advisory unless blended</span></p>
          </div>
        </div>

        {/* Data sources */}
        <p className="font-mono text-[9.5px] tracking-[.14em] text-faint uppercase mb-3">Data sources</p>
        <div className="border border-card-edge rounded-[12px] px-4 py-1 mb-6 bg-white">
          <DataRow
            source="Apify export"
            fields="avgLikes, avgComments, followerCount, videoRatio, hashtags, captions, locationNames — all available immediately on upload, no additional scraping needed."
          />
          <DataRow
            source="Live scrape"
            fields="medianLikes, medianViews, medianComments — fetched on demand via Fetch Live Stats. Replaces the export-based Engagement Score estimate. Posts from the last 3 months are used; falls back to all 10 scraped posts if no recent content exists."
          />
        </div>

        {/* Score breakdown */}
        <p className="font-mono text-[9.5px] tracking-[.14em] text-faint uppercase mb-3">Score breakdown</p>
        <div className="border border-card-edge rounded-[12px] px-4 py-1 mb-6 bg-white">
          <ScoreRow
            name="Overall Score"
            range="0 – 100"
            formula="(engagement × 8) + (relevancy × 2)"
            description="80% Engagement Score + 20% Relevancy Score. Accounts scoring 70+ are flagged as strong matches; 45–69 as possible; below 45 as low fit. Use it to triage who to review first, not as a definitive pass/fail."
          />
          <ScoreRow
            name="Engagement Score"
            range="0 – 10"
            formula="Before live: log(1 + avgLikes + avgComments×1.5)   |   After live: log(1 + medianLikes + medianViews×0.8 + medianComments×1.5)"
            description="Measures raw audience activity using natural log, which compresses large follower differences so a 10k-like account doesn't automatically swamp a 1k-like account. Before live stats are fetched, comments are weighted 1.5× as a proxy for replies (higher-intent than likes). After Fetch Live Stats, the formula upgrades to median likes, views, and comments — median is more robust than average against outlier viral posts. Views are weighted 0.8× since they require slightly less intent than a like; comments are weighted 1.5× as a high-intent signal. Photo-only accounts contribute 0 for views, which is correct. The Overall Score updates in real time as live data arrives per account."
          />
          <ScoreRow
            name="Relevancy Score"
            range="0 – 10"
            formula="3 + (hits in target niches) − (off-niche categories with hits)"
            description={<>
              <p className="mb-3">Starts at a baseline of 3. The account's hashtags, captions, and display name are scanned against six niche keyword lists. Each keyword match in a <em>target niche</em> adds +1; each <em>off-niche</em> category that has any match at all deducts −1 (flat per category, not per word). Score is capped 0–10.</p>
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
              <p className="text-[12px] text-faint"><strong className="text-body">Example:</strong> You select beauty + skincare. An account with "makeup, serum, moisturizer, foodie" in their content: beauty hits +1, skincare hits +2, food is off-niche −1 → score = 3 + 3 − 1 = <strong className="text-body">5</strong>. The "Niche signals" tags shown in the expanded row are the exact matched keywords.</p>
            </>}
          />
          <ScoreRow
            name="Bot Risk Score"
            range="0 – 10 · informational"
            formula="based on comments ÷ likes ratio"
            description="Not included in the Overall Score — informational only. Measures authenticity using the comment-to-like ratio. Genuine engagement typically produces a ratio of 1–2%+. Rules: ratio < 0.5% with avg likes > 5,000 → score 2 (high bot risk); ratio < 1% with avg likes > 1,000 → score 4; ratio ≥ 2% → score 9; ratio ≥ 1% → score 7; otherwise score 5. Higher score = more authentic. Accounts scoring 2–3 are flagged as 'bot-risk' in the flags column."
          />
          <ScoreRow
            name="AI Fit Score"
            range="0 – 100 · opt-in, advisory"
            formula="DeepSeek rating vs. brief + seeding criteria + past decisions"
            description={<>
              <p className="mb-2">A learning layer on top of the deterministic scores. Click <strong>Score fit with AI</strong> on the Results screen and DeepSeek rates each account 0–100 for how well it fits <em>this</em> campaign, with a one-line reason (expand a row to read it).</p>
              <div className="border border-card-edge rounded-[10px] bg-surface px-4 py-3 mb-3">
                <p className="text-[11px] font-mono text-faint uppercase tracking-[.12em] mb-2">How it actually learns — no trained model, no stored agent</p>
                <p className="mb-2">There is <strong>no fine-tuned model and no agent that remembers things between runs.</strong> Nothing is written into model weights. The "learning" lives entirely in your data. Each time you click Score fit with AI, the app:</p>
                <ol className="list-decimal ml-4 space-y-1 mb-2">
                  <li>Pulls your team's <strong>~40 most recent approve/reject decisions</strong> from past campaigns in the database — each with its categorised rejection reason, 1–5 fit rating, and that account's bio, hashtags, niches, flags, and follower count.</li>
                  <li>Sends those labeled examples <strong>plus</strong> the campaign brief and seeding criteria <strong>plus</strong> the accounts being scored to DeepSeek in a single prompt.</li>
                  <li>DeepSeek reads the examples as context and imitates your demonstrated taste, weighing the criteria and brief first, then the patterns in what you've approved vs. rejected.</li>
                </ol>
                <p className="mb-2">Because it re-reads the latest decisions every run, it improves the moment your team logs more reviews — no training step, no waiting. The trade-offs: it looks at the <strong>most recent ~40 decisions</strong> (not your entire history forever — a token-budget limit), and it's matching demonstrated patterns, not tracking specific past "mistakes" with a correction signal. On a brand-new database with no decisions yet, it scores on the brief alone and stays deliberately moderate.</p>
                <p className="text-[12px] text-faint">This is why <strong className="text-body">Phase 1 matters</strong>: the more consistently brand managers categorise rejections and rate approvals in the Review Queue, the sharper this score gets.</p>
              </div>
              <p>By default it's <strong>advisory</strong> — shown in its own column but it does not move the Overall score. Tick <strong>Blend into Overall</strong> only once you've sanity-checked it against a few real campaigns; blending reweights Overall to <strong>60% Engagement + 10% Relevancy + 30% AI Fit</strong> (Engagement × 6 + Relevancy × 1 + AI Fit ÷ 10 × 3).</p>
            </>}
          />
        </div>

        {/* Column guide */}
        <p className="font-mono text-[9.5px] tracking-[.14em] text-faint uppercase mb-3">Column guide</p>
        <div className="border border-card-edge rounded-[12px] px-4 py-1 mb-6 bg-white">
          <ScoreRow
            name="AI Fit"
            range="0 – 100 · opt-in"
            description="DeepSeek's fit rating for this campaign, learned from your brief, seeding criteria, and past review decisions. Appears after Score fit with AI; expand a row for the reasoning. Advisory unless Blend into Overall is ticked."
          />
          <ScoreRow
            name="Med. Likes"
            range="Live · from scrape"
            description="Median like count across the 10 most recent posts fetched live. Median is used instead of average to avoid viral-post skew. Requires Fetch Live Stats."
          />
          <ScoreRow
            name="Med. Views"
            range="Live · from scrape"
            description="Median video view count across the 10 most recent Reels or clips fetched live. Photo-only accounts show a dash. Requires Fetch Live Stats."
          />
          <ScoreRow
            name="Med. Comments"
            range="Live · from scrape"
            description="Median comment count across the 10 most recent posts or Reels fetched live. Weighted 1.5× in the post-live Engagement Score formula as a high-intent signal. Requires Fetch Live Stats."
          />
          <ScoreRow
            name="Scraped Post"
            range="link · from export"
            description="URL of the most recent post found in the original Apify export for this account. Opens the post directly on Instagram."
          />
          <ScoreRow
            name="Post Likes / Comments / Plays"
            range="from export"
            description="Raw like count, comment count, and play/view count of that most recent scraped post. Useful for a quick sanity check on the account's typical performance before clicking through."
          />
          <ScoreRow
            name="Scraped Caption"
            range="from export"
            description="Caption text of the most recent scraped post. Helpful for a quick read on content style and language without leaving the tool."
          />
          <ScoreRow
            name="Scoring Verdict"
            range="local · from scoring"
            description="Short text summary generated locally from the scoring results. Examples: 'strong niche fit', 'some niche relevancy, possible bot activity'. Visible when you expand a row in the Results table."
          />
        </div>

        <p className="text-[11px] text-faint font-mono">
          All scores are computed locally in your browser. Data is only sent externally for opt-in Apify features (Fetch Live Stats, direct scrape intake). The Apify API key never reaches the browser — it goes through the Cloudflare Worker proxy.
        </p>
      </Section>

      </>}

    </div>
  )
}
