
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
          Accounts are sourced by running an Apify Instagram scraper against a competitor's tagged posts, then exporting the results and uploading them here. The tool scores each account across two dimensions — Engagement and Relevancy — and produces a ranked table you can filter, review, and export directly to Excel.
        </p>
        <p className="text-ink/70 leading-relaxed">
          The main benefit over working from a raw Apify export is that all the cleanup, deduplication, and ranking happens automatically. Instead of a messy spreadsheet that still needs manual sorting, you get a prioritised shortlist of MIs, KOLs, and KOCs — ordered by fit rather than scrape order — that's ready to hand off or act on directly.
        </p>
      </div>

      <div className="border-t border-mist mb-10" />

      {/* Seeding Tool Instructions */}
      <Section label="How to use" title="Seeding Tool — Step-by-step">
        <ol className="space-y-4">
          {[
            {
              n: 1,
              text: <>Open the <a href="https://console.apify.com" target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">Apify Console</a> and navigate to the <strong>Instagram Scraper</strong> actor (apify/instagram-scraper). You want the actor that accepts post URLs as direct input.</>,
            },
            {
              n: 2,
              text: <>In the <strong>Direct URLs</strong> input field, paste the links to your competitor's tagged Instagram posts. These are posts where real users have tagged or mentioned the competitor's brand — typically found under a branded hashtag or the brand's tagged section on their profile.</>,
            },
            {
              n: 3,
              text: <>Set the date filter to cover the <strong>last 3 months</strong>. In the Apify scraper, this is usually labelled "Only posts newer than" or a similar recency field. Limiting to 3 months ensures you're working with currently active accounts rather than historical data.</>,
            },
            {
              n: 4,
              text: <>Set the <strong>maximum number of results</strong> to your desired volume — 500 is a good starting point for a broad search. A higher number gives you more candidates to score but increases scraping time and cost.</>,
            },
            {
              n: 5,
              text: <>Click <strong>Run</strong> and wait for the actor to finish. Run time depends on the number of results requested; most runs complete within a few minutes.</>,
            },
            {
              n: 6,
              text: <>Once the run is complete, click <strong>Export</strong> in the Apify results view and download the output as an <strong>.xlsx</strong> file. Make sure you export the full dataset, not just a preview.</>,
            },
            {
              n: 7,
              text: <>Back in this tool, go to <strong>Step 1</strong> and upload the exported .xlsx file. The tool will parse all accounts, deduplicate them, and move you to the scoring configuration screen automatically. On the Results page you can click <strong>Fetch Live Stats</strong> to pull real-time median likes and views — this upgrades the Engagement Score with more accurate data, but triggers an Apify scrape that incurs cost (see the cost note below).</>,
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
        <p className="font-mono text-xs tracking-widest text-amber-600/70 uppercase mb-2">Important — Apify costs</p>
        <p className="text-sm text-ink/70 leading-relaxed mb-2">
          The <strong>Fetch Live Stats</strong> button on the Results screen triggers a live Apify scrape that charges the Markato Apify account. Each run scrapes the 10 most recent posts for every account in your results — at approximately <strong>$0.01 per account</strong>, a typical run of 300–400 accounts costs around $3–4. Use it sparingly.
        </p>
        <p className="text-sm text-ink/70 leading-relaxed">
          To avoid unnecessary charges, the tool caches live scrape results for <strong>7 days</strong>. Re-uploading the same dataset within that window will reload your previously fetched stats without triggering a new scrape. Only click Fetch Live Stats when you need genuinely updated figures.
        </p>
      </div>

      {/* Scoring Methodology */}
      <Section label="Scoring methodology" title="How accounts are scored">

        {/* Formula summary */}
        <div className="bg-mist/30 border border-mist rounded-xl px-5 py-4 mb-6">
          <p className="font-mono text-xs tracking-widest text-ink/40 uppercase mb-3">Formula</p>
          <div className="space-y-1 font-mono text-sm text-ink/80">
            <p><span className="text-ink/40 mr-2">Overall (0–100)</span>= (Engagement Score + Relevancy Score) × 5</p>
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
            formula="(engagement + relevancy) × 5"
            description="Equal 50/50 blend of the two sub-scores below. Accounts scoring 70+ are flagged as strong matches; 45–69 as possible; below 45 as low fit. Use it to triage who to review first, not as a definitive pass/fail."
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
            name="Location Score"
            range="0 – 10 · informational"
            formula="min(10, location signal hits × 2.5)"
            description="Not included in the Overall Score — shown as an informational column for filtering and sorting. Scans hashtags, captions, and tagged location names for location-specific signals: place names, local landmarks, local retailers, and language markers. Each unique signal found adds 2.5 points, capped at 10. For Taiwan specifically, accounts that combine traditional Chinese language signals (繁體, 正體, 國語) with Mandarin voiceover indicators (普通話, 配音) receive an additional +4 boost, as this combination is a strong regional marker."
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
        </div>

        <p className="text-xs text-ink/40 font-mono">
          All scores are computed locally in your browser from the uploaded export file. No data is sent to any external server except Apify (for the optional live stats fetch).
        </p>
      </Section>

    </div>
  )
}
