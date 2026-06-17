
function Section({ label, title, children }) {
  return (
    <section className="mb-10">
      <p className="font-mono text-xs tracking-widest text-ink/40 uppercase mb-1">{label}</p>
      <h2 className="text-xl font-semibold text-ink mb-4">{title}</h2>
      {children}
    </section>
  )
}

function ScoreRow({ name, range, description }) {
  return (
    <div className="flex gap-4 py-3 border-b border-mist/60 last:border-0">
      <div className="w-36 shrink-0">
        <p className="font-mono text-sm font-medium text-ink">{name}</p>
        <p className="font-mono text-xs text-ink/40">{range}</p>
      </div>
      <p className="text-sm text-ink/70 leading-relaxed">{description}</p>
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
          This tool helps you identify strong Instagram seeding candidates by automatically scoring and ranking accounts based on how well they match your target niche, location, and content format. It works by analysing the posts of accounts that have tagged or engaged with a competitor's content on Instagram — giving you a ranked shortlist of KOLs already active in your space.
        </p>
        <p className="text-ink/70 leading-relaxed mb-3">
          Accounts are sourced by running an Apify Instagram scraper against a competitor's tagged posts, then exporting the results and uploading them here. The tool scores each account across four dimensions and produces a ranked table you can filter, review, and export directly to Excel.
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
              text: <>Open the <a href="https://console.apify.com" target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">Apify Console</a> and navigate to the <strong>Instagram Hashtag Scraper</strong> or <strong>Instagram Scraper</strong> actor. You want the scraper that accepts post URLs as input (not a username-based scraper).</>,
            },
            {
              n: 2,
              text: <>In the <strong>Start URLs</strong> or <strong>Direct URLs</strong> input field, paste the links to your competitor's tagged Instagram posts. These are the posts where real users have tagged or mentioned the competitor's brand — typically found under a branded hashtag or the brand's tagged section on their profile.</>,
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
              text: <>Back in this tool, go to <strong>Step 1</strong> and upload the exported .xlsx file. The tool will parse all the accounts in the file, deduplicate them, and move you to the scoring configuration screen automatically. Once on the Results page, you can click <strong>Refresh</strong> to fetch live engagement stats — but note that each Refresh triggers an Apify scrape that charges the Markato account (see the cost note above).</>,
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
          The <strong>Refresh</strong> button on the Results screen triggers a live Apify scrape that charges the Markato Apify account. Each run scrapes the 10 most recent posts for every account in your results — at approximately <strong>$0.01 per account</strong>, a typical run of 300–400 accounts costs around $3–4. Use Refresh sparingly.
        </p>
        <p className="text-sm text-ink/70 leading-relaxed">
          To avoid unnecessary charges, the tool caches live scrape results for <strong>7 days</strong>. Re-uploading the same dataset within that window will reload your previously fetched stats without triggering a new scrape. Only click Refresh when you need genuinely updated figures.
        </p>
      </div>

      {/* Scoring Methodology */}
      <Section label="Scoring methodology" title="How accounts are scored">
        <p className="text-sm text-ink/60 leading-relaxed mb-5">
          Each account receives an <strong>Overall Score out of 100</strong>, computed as an equal 50/50 blend of Engagement Score and Relevancy Score. These two signals — how actively engaged the audience is, and how closely the content matches your target niche — together determine the overall priority ranking.
        </p>

        <div className="border border-mist rounded-xl px-4 py-1 mb-6">
          <ScoreRow
            name="Overall Score"
            range="0 – 100"
            description="Equal weighting of Engagement Score and Relevancy Score: (engagement + relevancy) × 5. Accounts scoring 70 or above are flagged as strong matches; 45–69 as possible; below 45 as low fit. Use it to prioritise who to review first, not as a definitive pass/fail."
          />
          <ScoreRow
            name="Engagement Score"
            range="0 – 10"
            description="log(1 + Likes + Comments×3). Comments are weighted 3× as a proxy for replies, since they signal active conversation rather than passive scrolling. Instagram does not expose repost counts, so that term is omitted. Natural log compresses large numbers: ~4 for micro-influencers (~50 avg likes), ~6–7 for mid-tier (~500–1,000 avg likes), ~9–10 for large accounts (10,000+ avg likes)."
          />
          <ScoreRow
            name="Relevancy Score"
            range="0 – 10"
            description="Baseline 5. Adds 1 per keyword hit in your target niches (scanned from hashtags, captions, and display name). Deducts 1 per off-niche content category that also has keyword hits — so an account mixing skincare content with unrelated food or fitness content will score lower than a pure-niche account. Capped at 0–10."
          />
          <ScoreRow
            name="Location Score"
            range="0 – 10 · informational"
            description="Measures how likely the account is based in your target location. Scans hashtags, captions, and tagged location names for location-specific signals — place names, local landmarks, local retailers, and language markers. Each signal found adds 2.5 points, capped at 10. For Taiwan, accounts combining traditional Chinese language signals with Mandarin voiceover indicators receive an additional boost. Not included in the Overall Score — use it to filter or sort separately."
          />
          <ScoreRow
            name="Bot Risk Score"
            range="0 – 10 · informational"
            description="An authenticity indicator based on the comment-to-like ratio. Accounts with very high likes but near-zero comments are flagged as suspicious. A ratio below 0.5% on accounts with over 5,000 avg likes scores 2 (high risk); above 2% scores 9 (low risk). Higher = more authentic. Not included in the Overall Score."
          />
          <ScoreRow
            name="Engagement Rate"
            range="% · from export"
            description="The percentage of followers who liked or commented on a post, averaged across all posts in the Apify export. Calculated as (average likes + average comments) ÷ follower count × 100. Available without clicking Fetch Live Stats."
          />
          <ScoreRow
            name="Median Likes"
            range="Live data"
            description="The median like count across the 10 most recent posts or reels fetched live for this account. Posts from the last 3 months are used as the primary source, so the figure reflects recent activity. For accounts that post infrequently and have no content within that window, the calculation uses all 10 scraped posts instead, ensuring a value is always shown as long as the scraper returned any data for that account."
          />
          <ScoreRow
            name="Median Views"
            range="Live data"
            description="The median video view count across the 10 most recent posts or reels fetched live for this account. Only video content (Reels and clips) contributes to this figure — accounts that post photos only will show a blank. The same 3-month recency window and fallback logic applies as for Median Likes."
          />
        </div>

        <p className="text-xs text-ink/40 font-mono">
          Scores are computed from the Apify export data using hashtags, captions, location tags, and engagement metrics. No external data sources are used.
        </p>
      </Section>

    </div>
  )
}
