// The fixed roster of brands we run seeding for. Picking a brand at set-up time
// drives BOTH:
//   · niches          — what the relevancy scorer rewards (niche ids match
//                        NICHE_OPTIONS in ConfigStep: beauty/skincare/lifestyle/
//                        fashion/health/food)
//   · scoringProfile  — which formula ranks the run (see SCORING_PROFILES in
//                        scoreInfluencers.js): 'beauty' = engagement-first,
//                        'health' = relevancy-protected
// so the operator no longer hand-picks niches per run — they just pick the brand.
//
// EDIT ME: the niches/profile below are a proposed mapping from each brand's
// category. Adjust any row and the setup screen updates automatically.
export const BRAND_CATALOG = [
  { id: 'lilyeve',    name: 'LILYEVE',    tag: 'Korean Haircare',   niches: ['haircare', 'personal'],       scoringProfile: 'beauty' },
  { id: 'dermafirm',  name: 'Dermafirm',  tag: 'Korean Skincare',   niches: ['skincare'],                   scoringProfile: 'beauty' },
  { id: 'wellage',    name: 'WELLAGE',    tag: 'Korean Skincare',   niches: ['skincare'],                   scoringProfile: 'beauty' },
  { id: 'bblab',      name: 'BB Lab',     tag: 'Korean Wellness',   niches: ['supplements', 'skincare'],    scoringProfile: 'health' },
  { id: 'gynomaster', name: 'GYNOMASTER', tag: "Women's Wellness",  niches: ['feminine', 'supplements'],    scoringProfile: 'health' },
  { id: 'ilso',       name: 'ILSO',       tag: 'Korean Skincare',   niches: ['skincare'],                   scoringProfile: 'beauty' },
  { id: 'nutseline',  name: 'Nutseline',  tag: 'Body Wellness',     niches: ['bodycare', 'skincare', 'sports'], scoringProfile: 'beauty' },
  { id: 'near',       name: 'NE:AR',      tag: 'Aromatic Beauty',   niches: ['supplements', 'skincare'],    scoringProfile: 'health' },
  { id: 'whipped',    name: 'Whipped',    tag: 'Vegan Skincare',    niches: ['skincare'],                   scoringProfile: 'beauty' },
  { id: 'narka',      name: 'NARKA',      tag: 'Korean Beauty',     niches: ['makeup', 'skincare', 'haircare'], scoringProfile: 'beauty' },
]

export function getBrand(id) {
  return BRAND_CATALOG.find((b) => b.id === id) || null
}
