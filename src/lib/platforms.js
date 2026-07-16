// Platform-aware helpers for candidate accounts. Everything defaults to
// Instagram — records without a `platform` field predate Threads support.

export function profileUrl(account) {
  const username = typeof account === 'string' ? account : account?.username || ''
  const platform = typeof account === 'string' ? 'instagram' : account?.platform || 'instagram'
  return platform === 'threads'
    ? `https://www.threads.net/@${username}`
    : `https://instagram.com/${username}`
}

export function platformLabel(account) {
  return (account?.platform || 'instagram') === 'threads' ? 'Threads' : 'Instagram'
}

// Badge styling per platform, matching the app's existing chip palette.
export const PLATFORM_BADGE_CLS = {
  instagram: 'bg-rose/10 text-rose',
  threads: 'bg-ink/10 text-ink/70',
}
