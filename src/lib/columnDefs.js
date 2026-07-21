// Single source of truth for column definitions shared between ResultsStep and ReviewPage.
//
// Each column also declares a `type` that drives the per-column header control
// (Phase 1–3): 'number' → asc/desc sort, 'category' → value filter dropdown,
// 'text' → neither. Sort/filter values are read through COLUMN_ACCESSORS below,
// which is written against the shared account/result row shape so the same
// engine works on every table.

export const TABLE_COLUMNS = [
  { id: 'brand',                 label: 'Source',          width: '1fr', type: 'category',                                     exportIds: ['brand'] },
  { id: 'overall',               label: 'Overall',         width: '1fr', type: 'number', sortKey: 'overall',      infoKey: 'overall',          exportIds: ['overall'] },
  { id: 'relevancy_score',       label: 'Relevancy',       width: '1fr', type: 'number', sortKey: 'relevancy',    infoKey: 'relevancy',        exportIds: ['relevancy_score'] },
  { id: 'engagement_score',      label: 'Eng. Score',      width: '1fr', type: 'number', sortKey: 'eng_score',    infoKey: 'engagement_score', exportIds: ['engagement_score'] },
  { id: 'ai_fit',                label: 'AI Fit',          width: '1fr', type: 'number', sortKey: 'ai_fit',       infoKey: 'ai_fit',           exportIds: ['ai_fit', 'ai_fit_reason'] },
  { id: 'account_location',      label: 'Location',        width: '1fr', type: 'category',                                     exportIds: ['account_location'] },
  { id: 'follower_count',        label: 'Followers',       width: '1fr', type: 'number', sortKey: 'follower_count',                             exportIds: ['follower_count'] },
  { id: 'live_median_likes',     label: 'Med. Likes',      width: '1fr', type: 'number', sortKey: 'live_median_likes', infoKey: 'live_median_likes',  exportIds: ['live_median_likes'] },
  { id: 'live_median_views',     label: 'Med. Views',      width: '1fr', type: 'number', sortKey: 'live_median_views',    infoKey: 'live_median_views',    exportIds: ['live_median_views'] },
  { id: 'live_median_comments',  label: 'Med. Comments',   width: '1fr', type: 'number', sortKey: 'live_median_comments', infoKey: 'live_median_comments', exportIds: ['live_median_comments'] },
  { id: 'sample_post_url',       label: 'Scraped Post',    width: '1fr', type: 'text',                                         exportIds: ['sample_post_url'] },
  { id: 'scraped_post_likes',    label: 'Post Likes',      width: '1fr', type: 'number', sortKey: 'scraped_post_likes',                         exportIds: ['scraped_post_likes'] },
  { id: 'scraped_post_comments', label: 'Post Comments',   width: '1fr', type: 'number', sortKey: 'scraped_post_comments',                      exportIds: ['scraped_post_comments'] },
  { id: 'scraped_post_plays',    label: 'Post Plays',      width: '1fr', type: 'number', sortKey: 'scraped_post_plays',                         exportIds: ['scraped_post_plays'] },
  { id: 'sample_caption',        label: 'Scraped Caption', width: '2fr', type: 'text',                                         exportIds: ['sample_caption'] },
  { id: 'niche_signals',         label: 'Niche Signals',   width: '1fr', type: 'category',                                     exportIds: ['niche_signals'] },
]

// Sort/filter accessors keyed by column id. `sortValue` returns a number (or
// null → sorts last regardless of direction); `filterValues` returns the set of
// category strings a row belongs to (multiple for niche_signals). Written
// against the merged row shape used by both ResultsStep (enriched results) and
// ReviewPage (shared_results accounts) — medians fall back across the two names.
const num = (v) => (v == null || Number.isNaN(Number(v)) ? null : Number(v))
export const COLUMN_ACCESSORS = {
  overall:               { sortValue: (r) => num(r.overall) },
  relevancy_score:       { sortValue: (r) => num(r.scores?.relevancy) },
  engagement_score:      { sortValue: (r) => num(r.scores?.engagement) },
  ai_fit:                { sortValue: (r) => num(r.aiScore) },
  follower_count:        { sortValue: (r) => num(r.followerCount) },
  live_median_likes:     { sortValue: (r) => num(r.liveMedianLikes ?? r.medianLikes) },
  live_median_views:     { sortValue: (r) => num(r.liveMedianViews ?? r.medianViews) },
  live_median_comments:  { sortValue: (r) => num(r.liveMedianComments ?? r.medianComments) },
  scraped_post_likes:    { sortValue: (r) => num(r.samplePostLikes) },
  scraped_post_comments: { sortValue: (r) => num(r.samplePostComments) },
  scraped_post_plays:    { sortValue: (r) => num(r.samplePostPlays) },
  // IG rows carry a single brand handle; Threads rows carry the search
  // keyword(s) that surfaced the account, joined as "增肌, 減脂". Split the
  // Threads case so each keyword is its own filter option (and matches on its
  // own) instead of appearing as one combined "增肌, 減脂" value.
  brand:                 { filterValues: (r) => {
    if (!r.sourceBrand) return []
    return r.platform === 'threads'
      ? String(r.sourceBrand).split(',').map((s) => s.trim()).filter(Boolean)
      : [String(r.sourceBrand)]
  } },
  account_location:      { filterValues: (r) => (r.accountLocation ? [String(r.accountLocation)] : []) },
  niche_signals:         { filterValues: (r) => (Array.isArray(r.nicheSignals) ? r.nicheSignals.map(String) : []) },
}

export const DEFAULT_SELECTED_COLUMNS = [
  'brand', 'overall', 'relevancy_score', 'engagement_score',
  'account_location', 'follower_count', 'live_median_likes', 'live_median_views',
  'live_median_comments', 'sample_post_url', 'niche_signals',
]

// Always included in Step 3 (ResultsStep) export — includes dm_status for tracking.
export const ALWAYS_EXPORT_IDS = ['username', 'instagram_url', 'approve', 'reachout_status', 'remarks', 'dm_status', 'dm_draft']

// Always included in the assistant return view export — dm_status excluded, DM Draft kept.
export const ASSISTANT_ALWAYS_EXPORT_IDS = ['username', 'instagram_url', 'approve', 'reachout_status', 'remarks', 'dm_draft']
