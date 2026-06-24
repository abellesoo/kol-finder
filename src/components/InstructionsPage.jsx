
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
        <p className="text-[13px] text-body leading-relaxed">{description}</p>
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
        <h1 className="text-[27px] font-bold tracking-[-0.02em] text-ink mb-4">KOL Finder — Seeding Tool</h1>
        <p className="text-body leading-relaxed mb-3">
          This tool helps you identify strong Instagram seeding candidates by automatically scoring and ranking accounts based on how well they match your target niche and how actively engaged their audience is. It works by analysing posts from accounts that have tagged or engaged with a competitor's content on Instagram — giving you a ranked shortlist of KOLs already active in your space.
        </p>
        <p className="text-body leading-relaxed mb-3">
          You can bring in accounts two ways: upload an <strong>.xlsx</strong> export from Apify, or paste competitor post URLs and hashtags directly — the tool triggers the scrape for you and skips the manual Apify step entirely. Either way, it deduplicates accounts, scores them across Engagement and Relevancy, and produces a ranked table ready to filter, review, and export to Excel.
        </p>
        <p className="text-body leading-relaxed">
          Optionally, run <strong>AI Deep-Dive</strong> on the top results — this sends account captions, hashtags, bio, and your campaign brief to Claude and returns a qualitative verdict per account. Base scoring is deterministic arithmetic computed entirely in your browser; AI is only involved if you explicitly opt in.
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
              <p className="text-[13px] font-semibold text-ink mb-1">Pull in your accounts</p>
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
              text: <>On the <strong>Configure</strong> screen, choose your target niches (beauty, skincare, lifestyle…) and set a minimum average-likes threshold to filter out low-engagement accounts. Optionally write a <strong>Campaign brief</strong> — a sentence or two on your campaign goal, target audience, and tone. The brief is used later to generate campaign-specific AI verdicts.</>,
            },
            {
              n: 3,
              title: 'Score & enrich',
              text: <>Click <strong>Start scoring</strong> to rank every account by Engagement and Relevancy — computed instantly in your browser, no external calls. Then click <strong>Fetch Live Stats</strong> on the Results screen to pull real-time median likes and views from Apify, upgrading scores with fresher data. Live stats cost ~$0.01/account and are cached for 7 days.</>,
            },
            {
              n: 4,
              title: 'Review & shortlist',
              text: <>Browse the ranked Results table. Sort, filter, and customise columns to zero in on the right accounts. Expand any row to see captions, hashtag signals, and flags. Optionally run <strong>AI Deep-Dive</strong> (top-N, default 50) — Claude reviews captions, bio, and your brief and returns a qualitative verdict per account, cached for 7 days.</>,
            },
            {
              n: 5,
              title: 'Reach out',
              text: <>Move approved accounts to the <strong>Ready to Send</strong> queue. From there, copy profile links, open Instagram directly, and track DM status for each account. Use the status column to coordinate outreach across your team without double-sending.</>,
            },
            {
              n: 6,
              title: 'Export',
              text: <>Click <strong>Export to XLSX</strong> to download a formatted spreadsheet with per-brand colour coding, workflow dropdowns (Approve Yes/No, Reach-out Status), hyperlinked Instagram URLs, and AI verdicts if available. Ready to share with your team or file for records.</>,
            },
          ].map(({ n, title, text }) => (
            <li key={n} className="flex gap-4">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-ink text-white text-[11px] font-mono font-semibold flex items-center justify-center mt-0.5">
                {n}
              </span>
              <div>
                <p className="text-[13px] font-semibold text-ink mb-1">{title}</p>
                <p className="text-[13px] text-body leading-relaxed">{text}</p>
              </div>
            </li>
          ))}

        </ol>
      </Section>

      {/* Refresh / Cost Warning */}
      <div className="mb-10 px-5 py-4 border border-[#E7D3A8] bg-[#F6ECD6] rounded-[13px]">
        <p className="font-mono text-[9.5px] tracking-[.16em] text-[#8A6A22] uppercase mb-2">Important — costs</p>
        <p className="text-[13px] text-body leading-relaxed mb-2">
          <strong>Fetch Live Stats</strong> triggers a live Apify scrape — approximately <strong>$0.01 per account</strong>. A typical run of 100–200 accounts costs around $1–2. Results are cached for 7 days, so re-uploading the same dataset within that window won't trigger a new scrape.
        </p>
        <p className="text-[13px] text-body leading-relaxed mb-2">
          <strong>Direct scrape</strong> (Option A intake) also uses Apify — cost scales with result limit. 200 results costs roughly $0.50–1; 1,000 results costs around $2–3.
        </p>
        <p className="text-[13px] text-body leading-relaxed">
          <strong>AI Deep-Dive</strong> calls Claude via Anthropic's API — approximately <strong>$0.01–0.05 per run</strong> depending on account count and caption length. Verdicts are cached for 7 days per account + campaign brief combination, so re-running with the same brief won't re-charge for accounts already processed.
        </p>
      </div>

      {/* Scoring Methodology */}
      <Section label="Scoring methodology" title="How accounts are scored">

        {/* Formula summary */}
        <div className="bg-surface border border-card-edge rounded-[12px] px-5 py-4 mb-6">
          <p className="font-mono text-[9.5px] tracking-[.14em] text-faint uppercase mb-3">Formula</p>
          <div className="space-y-1 font-mono text-[13px] text-body">
            <p><span className="text-ink/40 mr-2">Overall (0–100)</span>= Engagement Score × 8 + Relevancy Score × 2</p>
            <p><span className="text-ink/40 mr-2">Engagement Score</span>= log(1 + medianLikes + medianViews × 0.5) <span className="text-ink/40 text-xs">· after live fetch</span></p>
            <p><span className="text-ink/40 mr-2 invisible">Engagement Score</span>= log(1 + avgLikes + avgComments × 3) <span className="text-ink/40 text-xs">· before live fetch</span></p>
            <p><span className="text-ink/40 mr-2">Relevancy Score</span>= 5 + keyword hits − off-niche category hits <span className="text-ink/40 text-xs">· capped 0–10</span></p>
          </div>
        </div>

        {/* Data sources */}
        <p className="font-mono text-[9.5px] tracking-[.14em] text-faint uppercase mb-3">Data sources</p>
        <div className="border border-card-edge rounded-[12px] px-4 py-1 mb-6 bg-white">
          <DataRow
            source="Apify export"
            fields="avgLikes, avgComments, engagementRate, followerCount, videoRatio, hashtags, captions, locationNames — all available immediately on upload, no additional scraping needed."
          />
          <DataRow
            source="Live scrape"
            fields="medianLikes, medianViews — fetched on demand via Fetch Live Stats. Replaces the export-based Engagement Score estimate. Posts from the last 3 months are used; falls back to all 10 scraped posts if no recent content exists."
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
            formula="Before live: log(1 + avgLikes + avgComments×3)   |   After live: log(1 + medianLikes + medianViews×0.5)"
            description="Measures raw audience activity using natural log, which compresses large follower differences so a 10k-like account doesn't automatically swamp a 1k-like account. Before live stats are fetched, comments are weighted 3× as a proxy for replies (higher-intent than likes). After Fetch Live Stats, the formula upgrades to median likes and views — median is more robust than average against outlier viral posts. Views are weighted 0.5× since they require less intent than a like. Photo-only accounts contribute 0 for views, which is correct. The Overall Score updates in real time as live data arrives per account."
          />
          <ScoreRow
            name="Relevancy Score"
            range="0 – 10"
            formula="5 + (hits in target niches) − (off-niche categories with hits)"
            description="Starts at a neutral baseline of 5, reflecting that any account in the dataset has already shown some affinity with the competitor's content. Adds 1 point per keyword match found in the account's hashtags, captions, and display name, using niche-specific keyword lists (e.g. 'skincare', '護膚', 'makeup', '化妝'). Deducts 1 point per off-niche content category that also has keyword hits — so an account mixing skincare content with unrelated food or fitness signals scores lower than a pure-niche account. Score is capped at 0–10."
          />
          <ScoreRow
            name="Bot Risk Score"
            range="0 – 10 · informational"
            formula="based on comments ÷ likes ratio"
            description="Not included in the Overall Score — informational only. Measures authenticity using the comment-to-like ratio. Genuine engagement typically produces a ratio of 1–2%+. Rules: ratio < 0.5% with avg likes > 5,000 → score 2 (high bot risk); ratio < 1% with avg likes > 1,000 → score 4; ratio ≥ 2% → score 9; ratio ≥ 1% → score 7; otherwise score 5. Higher score = more authentic. Accounts scoring 2–3 are flagged as 'bot-risk' in the flags column."
          />
        </div>

        {/* Column guide */}
        <p className="font-mono text-[9.5px] tracking-[.14em] text-faint uppercase mb-3">Column guide</p>
        <div className="border border-card-edge rounded-[12px] px-4 py-1 mb-6 bg-white">
          <ScoreRow
            name="Eng. Rate"
            range="% · from export"
            formula="(avgLikes + avgComments) ÷ followerCount × 100"
            description="Standard engagement rate from the original Apify export, computed per account across all posts. Available without live stats. Useful for comparing accounts relative to their follower size — a 500-follower account with 10% ER is more engaged than a 100k-follower account with 0.5% ER."
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
            name="AI Deep-Dive"
            range="optional · Claude"
            description="Qualitative verdict generated by Claude after reviewing the account's captions, hashtags, bio, and your campaign brief. Only populated after you run AI Deep-Dive on the Results screen. Cached for 7 days per account + brief combination — a different campaign brief will generate a fresh verdict even for the same account."
          />
        </div>

        <p className="text-[11px] text-faint font-mono">
          All scores are computed locally in your browser. Data is only sent externally for opt-in features: Apify (Fetch Live Stats, direct scrape intake) and Anthropic (AI Deep-Dive). Neither API key ever reaches the browser — both go through the Cloudflare Worker proxy.
        </p>
      </Section>

      </>}

    </div>
  )
}
