// Single source of truth for column definitions shared between ResultsStep and ReviewPage.

export const TABLE_COLUMNS = [
  { id: 'brand',                 label: 'Brand',           width: '1fr',                                                       exportIds: ['brand'] },
  { id: 'overall',               label: 'Overall',         width: '1fr', sortKey: 'overall',      infoKey: 'overall',          exportIds: ['overall'] },
  { id: 'relevancy_score',       label: 'Relevancy',       width: '1fr', sortKey: 'relevancy',    infoKey: 'relevancy',        exportIds: ['relevancy_score'] },
  { id: 'engagement_score',      label: 'Eng. Score',      width: '1fr', sortKey: 'eng_score',    infoKey: 'engagement_score', exportIds: ['engagement_score'] },
  { id: 'account_location',      label: 'Location',        width: '1fr',                                                       exportIds: ['account_location'] },
  { id: 'engagement',            label: 'Eng. Rate',       width: '1fr', sortKey: 'engagement',   infoKey: 'engagement',       exportIds: ['engagement_rate'] },
  { id: 'follower_count',        label: 'Followers',       width: '1fr',                                                       exportIds: ['follower_count'] },
  { id: 'live_median_likes',     label: 'Med. Likes',      width: '1fr', sortKey: 'live_median_likes', infoKey: 'live_median_likes',  exportIds: ['live_median_likes'] },
  { id: 'live_median_views',     label: 'Med. Views',      width: '1fr', sortKey: 'live_median_views', infoKey: 'live_median_views',  exportIds: ['live_median_views'] },
  { id: 'sample_post_url',       label: 'Scraped Post',    width: '1fr',                                                       exportIds: ['sample_post_url'] },
  { id: 'scraped_post_likes',    label: 'Post Likes',      width: '1fr',                                                       exportIds: ['scraped_post_likes'] },
  { id: 'scraped_post_comments', label: 'Post Comments',   width: '1fr',                                                       exportIds: ['scraped_post_comments'] },
  { id: 'scraped_post_plays',    label: 'Post Plays',      width: '1fr',                                                       exportIds: ['scraped_post_plays'] },
  { id: 'sample_caption',        label: 'Scraped Caption', width: '2fr',                                                       exportIds: ['sample_caption'] },
  { id: 'niche_signals',         label: 'Niche Signals',   width: '1fr',                                                       exportIds: ['niche_signals'] },
]

export const DEFAULT_SELECTED_COLUMNS = [
  'brand', 'overall', 'relevancy_score', 'engagement_score',
  'engagement', 'live_median_likes', 'live_median_views',
  'sample_post_url', 'scraped_post_likes', 'scraped_post_comments', 'niche_signals',
]

// Always included in Step 3 (ResultsStep) export — includes dm_status for tracking.
export const ALWAYS_EXPORT_IDS = ['username', 'instagram_url', 'approve', 'reachout_status', 'remarks', 'dm_status', 'dm_draft']

// Always included in the assistant return view export — dm_status excluded, DM Draft kept.
export const ASSISTANT_ALWAYS_EXPORT_IDS = ['username', 'instagram_url', 'approve', 'reachout_status', 'remarks', 'dm_draft']
