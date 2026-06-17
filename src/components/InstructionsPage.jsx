import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

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

function Collapsible({ label, children }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-mist rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-mist/30 transition-colors"
      >
        <span className="font-mono text-xs tracking-widest text-ink/40 uppercase">{label}</span>
        {open ? <ChevronDown size={14} className="text-ink/30" /> : <ChevronRight size={14} className="text-ink/30" />}
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-mist text-sm text-ink/70 leading-relaxed space-y-3">
          {children}
        </div>
      )}
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
        <p className="text-ink/70 leading-relaxed">
          Accounts are sourced by running an Apify Instagram scraper against a competitor's tagged posts, then exporting the results and uploading them here. The tool scores each account across four dimensions and produces a ranked table you can filter, review, and export directly to Excel.
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

      <div className="border-t border-mist mb-10" />

      {/* Scoring Methodology */}
      <Section label="Scoring methodology" title="How accounts are scored">
        <p className="text-sm text-ink/60 leading-relaxed mb-5">
          Each account receives an <strong>Overall Score out of 100</strong>, calculated as a weighted sum of four sub-scores. Niche fit carries the most weight, followed by location, content format, and authenticity. The weights are: Niche × 3.5, Location × 3.0, Format × 2.0, Bot Risk × 1.5.
        </p>

        <div className="border border-mist rounded-xl px-4 py-1 mb-6">
          <ScoreRow
            name="Niche Score"
            range="0 – 10"
            description="Measures how closely the account's content matches the niches you selected at setup. The tool scans each account's hashtags, recent captions, and display name for niche-specific keywords (e.g. 'skincare', '護膚', 'makeup', '化妝'). Each keyword match adds to the score, capped at 10. An account with many relevant keyword hits across its content will score closer to 10; one with little or no matching content will score near 0."
          />
          <ScoreRow
            name="Location Score"
            range="0 – 10"
            description="Measures how likely the account is based in your target location. The tool scans hashtags, captions, and tagged location names for location-specific signals — for example, place names, local landmarks, local retailers, and language markers. Each signal found adds 2.5 points, capped at 10. For Taiwan, accounts that combine traditional Chinese language signals with Mandarin voiceover indicators receive an additional boost, as this combination is a strong regional marker."
          />
          <ScoreRow
            name="Format Score"
            range="0 – 10"
            description="Reflects how much of the account's output is video content (Reels, clips). If you enabled 'Require Video' in the scoring configuration, this score equals the account's video post percentage multiplied by 10 — so an account where 80% of posts are videos scores 8. If video is not required, all accounts receive a neutral score of 7 regardless of their format mix."
          />
          <ScoreRow
            name="Bot Risk Score"
            range="0 – 10"
            description="An authenticity indicator based on the ratio of comments to likes. Genuine engagement typically produces a comment-to-like ratio of around 1–2% or higher. Accounts with very high like counts but near-zero comments are flagged as suspicious: a ratio below 0.5% on accounts with over 5,000 average likes scores 2 (high risk), while a ratio above 2% scores 9 (low risk, likely authentic). A higher Bot Risk Score means lower bot suspicion — it is an authenticity score, not a risk score."
          />
        </div>

        <p className="text-xs text-ink/40 font-mono">
          Scores are computed from the Apify export data using hashtags, captions, location tags, and engagement metrics. No external data sources are used.
        </p>
      </Section>

      <div className="border-t border-mist mb-10" />

      {/* Known Issues */}
      <Collapsible label="Changelog · Known issues">
        <p className="font-medium text-ink/80">Median Likes / Median Views — recency fallback (fixed)</p>
        <p>
          The live scraper fetches a fixed number of recent posts per account (currently 10). For accounts that post infrequently, all scraped posts may fall outside the 3-month recency window that the tool uses to calculate engagement statistics. Previously, when no posts passed this filter, the median calculation returned no value, leaving the Median Likes and Median Views columns blank in both the table and the export — even after a successful scrape.
        </p>
        <p>
          This has been fixed. The tool now uses the 3-month window as its primary source so that medians reflect recent activity wherever possible. When an account has no posts within that window, it falls back to calculating the median across all scraped posts instead of returning blank. As a result, Median Likes and Median Views will always be populated as long as the scraper returned at least some posts for that account.
        </p>
      </Collapsible>

    </div>
  )
}
