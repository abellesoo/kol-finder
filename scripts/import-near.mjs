// One-time backfill: attach the tab-1 creator list to the existing "NE:AR" campaign.
//
// Usage:
//   SUPABASE_SERVICE_ROLE="<your service_role key>" node scripts/import-near.mjs
//
// The service_role key bypasses row-level security (the public anon key in .env
// cannot write). It is read from the environment only — it never gets committed.
// Get it from: Supabase dashboard -> Project Settings -> API -> service_role.
//
// Safe to re-run: rows upsert on the (campaign_id, kol_handle) unique constraint
// with ignoreDuplicates, so a second run inserts nothing new.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const CAMPAIGN_NAME = 'NE:AR Protein Shake It'

// Handles from tab 1 of the NE:AR marketing plan (KOL (IG) column). No paid
// amounts were set, so every creator goes in as Tier A (gifted), state approved.
const HANDLES = [
  'loki_kli', 'soagnes729', 'chantal.jj', 'slurpee_pinky', 'kchelseapy',
  'v.enus.sss', '_jh.dailyy', 'wendilau', 'yolanda_ay', 'kisscandiss',
  'pppuiyuk._', 'notkellychen', 'ke_ke6677', 'shlchan_', 'yiki.leung_',
  'ccharchar.c', 'ellie.hada', 'scarttel_', 'cheungnatalie', 'ng_taylorr',
  'carol_tyk',
]

// Mirror normalizeHandle() from src/lib/campaigns.js so the unique index dedupes.
const normalizeHandle = (raw) =>
  !raw ? '' : String(raw).trim().replace(/^@+/, '').replace(/\\_/g, '_').replace(/\\/g, '').toLowerCase()

// Pull the (public) project URL out of .env; take the service_role key from env.
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const url = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE

if (!url) { console.error('Missing VITE_SUPABASE_URL (checked env and .env).'); process.exit(1) }
if (!serviceKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE env var.\n' +
    'Run:  SUPABASE_SERVICE_ROLE="<key>" node scripts/import-near.mjs')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

// 1. Resolve the campaign id by name (no unique name constraint -> must be exactly one match).
const { data: campaigns, error: cErr } = await supabase
  .from('campaigns').select('id, name').eq('name', CAMPAIGN_NAME)
if (cErr) { console.error('Lookup failed:', cErr.message); process.exit(1) }

if (!campaigns?.length) {
  const { data: all } = await supabase.from('campaigns').select('name').order('name')
  console.error(`No campaign named "${CAMPAIGN_NAME}". Existing campaigns:\n  ` +
    (all?.map((c) => c.name).join('\n  ') || '(none)'))
  process.exit(1)
}
if (campaigns.length > 1) {
  console.error(`Found ${campaigns.length} campaigns named "${CAMPAIGN_NAME}" — resolve the ambiguity first.`)
  process.exit(1)
}
const campaignId = campaigns[0].id

// 2. Build rows and upsert. Tier A / state approved come from the DB defaults,
//    set explicitly here for clarity.
const rows = HANDLES.map((h) => ({
  campaign_id: campaignId,
  kol_handle: normalizeHandle(h),
  tier: 'A',
  state: 'approved',
}))

const { data: inserted, error: uErr } = await supabase
  .from('campaign_kols')
  .upsert(rows, { onConflict: 'campaign_id,kol_handle', ignoreDuplicates: true })
  .select('kol_handle')
if (uErr) { console.error('Import failed:', uErr.message); process.exit(1) }

console.log(`NE:AR (${campaignId})`)
console.log(`  ${rows.length} creators submitted, ${inserted?.length ?? 0} newly added` +
  ` (${rows.length - (inserted?.length ?? 0)} already present).`)
