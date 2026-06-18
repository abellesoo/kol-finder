
function Section({ label, title, children }) {
  return (
    <section className="mb-10">
      <p className="font-mono text-xs tracking-widest text-ink/40 uppercase mb-1">{label}</p>
      <h2 className="text-xl font-semibold text-ink mb-4">{title}</h2>
      {children}
    </section>
  )
}

function ScoreRow({ name, range, description, formula }) {
  return (
    <div className="flex gap-4 py-3 border-b border-mist/60 last:border-0">
      <div className="w-36 shrink-0">
        <p className="font-mono text-sm font-medium text-ink">{name}</p>
        <p className="font-mono text-xs text-ink/40">{range}</p>
      </div>
      <div className="flex-1">
        {formula && (
          <p className="font-mono text-xs text-accent bg-accent/8 px-2 py-1 rounded mb-2 leading-relaxed">{formula}</p>
        )}
        <p className="text-sm text-ink/70 leading-relaxed">{description}</p>
      </div>
    </div>
  )
}

function DataRow({ source, fields }) {
  return (
    <div className="flex gap-3 py-2 border-b border-mist/50 last:border-0 text-sm">
      <span className="w-28 shrink-0 font-mono text-xs text-ink/50 pt-0.5">{source}</span>
      <span className="text-ink/70 leading-relaxed">{fields}</span>
    </div>
  )
}


export default function InstructionsPage() {
  return (
    <div className="min-h-screen px-6 py-10 max-w-3xl mx-auto">

      {/* Tool Overview */}
      <div className="mb-10">
        <p className="font-mono text-xs tracking-widest text-ink/40 uppercase mb-2">About this tool</p>
        <h1 className="text-2xl font-semibold text-ink mb-4">KOL Finder — Seeding Tool</h1>
        <p className="text-ink/70 leading-relaxed mb-3">
          This tool helps you identify strong Instagram seeding candidates by automatically scoring and ranking accounts based on how well they match your target niche and how actively engaged their audience is. It works by analysing posts from accounts that have tagged or engaged with a competitor's content on Instagram — giving you a ranked shortlist of KOLs already active in your space.
        </p>
        <p className="text-ink/70 leading-relaxed mb-3">
          You can bring in accounts two ways: upload an <strong>.xlsx</strong> export from Apify, or paste competitor post URLs and hashtags directly — the tool triggers the scrape for you and skips the manual Apify step entirely. Either way, it deduplicates accounts, scores them across Engagement and Relevancy, and produces a ranked table ready to filter, review, and export to Excel.
        </p>
        <p className="text-ink/70 leading-relaxed">
          Optionally, run <strong>AI Deep-Dive</strong> on the top results — this sends account captions, hashtags, bio, and your campaign brief to Claude and returns a qualitative verdict per account. Base scoring is deterministic arithmetic computed entirely in your browser; AI is only involved if you explicitly opt in.
        </p>
      </div>

      <div className="border-t border-mist mb-10" />

      {/* Seeding Tool Instructions */}
      <Section label="How to use" title="Seeding Tool — Step-by-step">

        {/* Step 1 — two intake paths */}
        <div className="mb-6">
          <div className="flex gap-3 items-start mb-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-ink text-white text-xs font-mono font-medium flex items-center justify-center mt-0.5">1</span>
            <p className="text-sm font-medium text-ink pt-0.5">Bring in your account data — pick one of two paths:</p>
          </div>

          <div className="ml-9 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="border border-mist rounded-xl px-4 py-3">
              <p className="font-mono text-xs tracking-widest text-ink/40 uppercase mb-2">Option A — Paste URLs / hashtags</p>
              <p className="text-sm text-ink/70 leading-relaxed">
                Go to <strong>Step 1 → "Scrape URLs / Hashtags" tab</strong>. Paste competitor post URLs, brand-tagged page URLs, or hashtags (one per line — <code className="font-mono text-xs bg-mist/60 px-1 rounded">#skincare</code> or just <code className="font-mono text-xs bg-mist/60 px-1 rounded">skincare</code>). Choose a result limit and click <strong>Start scrape</strong>. The tool calls Apify, polls until done, and feeds results straight into the pipeline — no manual Apify steps required.
              </p>
            </div>
            <div className="border border-mist rounded-xl px-4 py-3">
              <p className="font-mono text-xs tracking-widest text-ink/40 uppercase mb-2">Option B — Upload XLSX</p>
              <p className="text-sm text-ink/70 leading-relaxed">
                Run an <strong>Apify Instagram Scraper</strong> job manually (paste competitor post URLs into Direct URLs, set a 3-month date filter, run). Export the dataset as <strong>.xlsx</strong>. Go to <strong>Step 1 → "Upload XLSX" tab</strong> and drop the file in. The filename becomes the brand label in the export. You can upload multiple files to combine brands.
              </p>
            </div>
          </div>
        </div>

        {/* Steps 2–6 */}
        <ol className="space-y-4">
          {[
            {
              n: 2,
              text: <>On the <strong>Configure</strong> screen, select your target niches and set a minimum engagement threshold. Optionally fill in a <strong>Campaign brief</strong> — a sentence or two describing the campaign goal, target audience, and tone. The brief is passed to AI Deep-Dive if you run it and makes the qualitative verdicts significantly more useful.</>,
            },
            {
              n: 3,
              text: <>Click <strong>Start scoring</strong>. Engagement and Relevancy scores are computed entirely in your browser from the uploaded data — no external calls happen at this step.</>,
            },
            {
              n: 4,
              text: <>On the <strong>Results</strong> screen, review the ranked table. Columns are customisable. Click <strong>Fetch Live Stats</strong> to pull real-time median likes and views from Apify — this upgrades the Engagement Score with more accurate data but incurs cost (see the cost note below).</>,
            },
            {
              n: 5,
              text: <><strong>Optional — AI Deep-Dive:</strong> Set the top-N limit (default 50) and click the AI Deep-Dive button. This sends captions, hashtags, bio, and your campaign brief to Claude and returns a qualitative verdict per account. Results are cached for 7 days per account + brief combination. Verdicts appear in the expanded row and the export. This is the only step that calls an AI model.</>,
            },
            {
              n: 6,
              text: <>Filter, sort, and customise columns, then click <strong>Export to XLSX</strong>. The export includes per-brand colour coding, workflow dropdowns (Approve Yes/No, Reach-out Status), hyperlinked Instagram URLs, and AI verdicts if available.</>,
            },
          ].map(({ n, text }) => (
            <li key={n} className="flex gap-4">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-ink text-white text-xs font-mono font-medium flex items-center justify-center mt-0.5">
                {n}
              </span>
              <p className="text-sm text-ink/70 leading-relaxed">{text}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* Refresh / Cost Warning */}
      <div className="mb-10 px-5 py-4 border border-amber-200 bg-amber-50 rounded-xl">
        <p className="font-mono text-xs tracking-widest text-amber-600/70 uppercase mb-2">Important — costs</p>
        <p className="text-sm text-ink/70 leading-relaxed mb-2">
          <strong>Fetch Live Stats</strong> triggers a live Apify scrape — approximately <strong>$0.01 per account</strong>. A typical run of 300–400 accounts costs around $3–4. Results are cached for 7 days, so re-uploading the same dataset within that window won't trigger a new scrape.
        </p>
        <p className="text-sm text-ink/70 leading-relaxed mb-2">
          <strong>Direct scrape</strong> (Option A intake) also uses Apify — cost scales with result limit. 200 results costs roughly $0.50–1; 1,000 results costs around $2–3.
        </p>
        <p className="text-sm text-ink/70 leading-relaxed">
          <strong>AI Deep-Dive</strong> calls Claude via Anthropic's API — approximately <strong>$0.01–0.05 per run</strong> depending on account count and caption length. Verdicts are cached for 7 days per account + campaign brief combination, so re-running with the same brief won't re-charge for accounts already processed.
        </p>
      </div>

      {/* Scoring Methodology */}
      <Section label="Scoring methodology" title="How accounts are scored">

        {/* Formula summary */}
        <div className="bg-mist/30 border border-mist rounded-xl px-5 py-4 mb-6">
          <p className="font-mono text-xs tracking-widest text-ink/40 uppercase mb-3">Formula</p>
          <div className="space-y-1 font-mono text-sm text-ink/80">
            <p><span className="text-ink/40 mr-2">Overall (0–100)</span>= Engagement Score × 8 + Relevancy Score × 2</p>
            <p><span className="text-ink/40 mr-2">Engagement Score</span>= log(1 + medianLikes + medianViews × 0.5) <span className="text-ink/40 text-xs">· after live fetch</span></p>
            <p><span className="text-ink/40 mr-2 invisible">Engagement Score</span>= log(1 + avgLikes + avgComments × 3) <span className="text-ink/40 text-xs">· before live fetch</span></p>
            <p><span className="text-ink/40 mr-2">Relevancy Score</span>= 5 + keyword hits − off-niche category hits <span className="text-ink/40 text-xs">· capped 0–10</span></p>
          </div>
        </div>

        {/* Data sources */}
        <p className="font-mono text-xs tracking-widest text-ink/40 uppercase mb-3">Data sources</p>
        <div className="border border-mist rounded-xl px-4 py-1 mb-6">
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
        <p className="font-mono text-xs tracking-widest text-ink/40 uppercase mb-3">Score breakdown</p>
        <div className="border border-mist rounded-xl px-4 py-1 mb-6">
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
        <p className="font-mono text-xs tracking-widest text-ink/40 uppercase mb-3">Column guide</p>
        <div className="border border-mist rounded-xl px-4 py-1 mb-6">
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

        <p className="text-xs text-ink/40 font-mono">
          All scores are computed locally in your browser. Data is only sent externally for opt-in features: Apify (Fetch Live Stats, direct scrape intake) and Anthropic (AI Deep-Dive). Neither API key ever reaches the browser — both go through the Cloudflare Worker proxy.
        </p>
      </Section>

    </div>
  )
}
