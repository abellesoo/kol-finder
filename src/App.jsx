import { useState, useEffect, useRef } from 'react'
import { LayoutDashboard, Search, Clock, BookOpen, Users, LogOut, ClipboardList, Send, Rocket, BookMarked, X } from 'lucide-react'
import CombinedStep from './components/CombinedStep'
import ResultsStep from './components/ResultsStep'
import DashboardPage from './components/DashboardPage'
import InstructionsPage from './components/InstructionsPage'
import HistoryPage from './components/HistoryPage'
import ReviewPage from './components/ReviewPage'
import ReviewQueuePage from './components/ReviewQueuePage'
import ReadyToSendPage from './components/ReadyToSendPage'
import CampaignsPage from './components/CampaignsPage'
import CampaignDetailPage from './components/CampaignDetailPage'
import VaultPage from './components/VaultPage'
import LoginPage from './components/LoginPage'
import TeamPage from './components/TeamPage'
import { supabase } from './lib/supabase'
import { parseApifyXlsx, aggregatePostItems, aggregateThreadsPostItems, classifyRegion } from './lib/parseXlsx'
import { scoreInfluencers } from './lib/scoreInfluencers'
import { saveSession, loadSessionFull } from './lib/sessionHistory'
import { getCampaign, getBrandById, campaignToForm } from './lib/campaigns'
import { runSeederScrape } from './lib/seederScrape'
import { readUrlState, popStashedDeepLink, syncUrl } from './lib/urlState'
import StepProgress from './components/core/StepProgress'

const NAV_GROUPS = [
  {
    label: 'Workspace',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'seeder', label: 'Seeder', icon: Search, restricted: ['brand_manager'] },
      { id: 'vault', label: 'Creator Vault', icon: BookMarked },
      { id: 'history', label: 'History', icon: Clock, restricted: ['brand_manager'] },
    ],
  },
  {
    label: 'Approvals',
    items: [
      { id: 'review_queue', label: 'Review Queue', icon: ClipboardList },
      { id: 'ready_to_send', label: 'Ready to Send', icon: Send, restricted: ['brand_manager'] },
    ],
  },
  {
    label: 'Operations',
    items: [
      { id: 'campaigns', label: 'Campaigns', icon: Rocket },
    ],
  },
  {
    label: 'Help',
    items: [
      { id: 'help', label: 'Instructions', icon: BookOpen },
    ],
  },
  {
    label: 'Admin',
    items: [
      { id: 'team', label: 'Team', icon: Users, adminOnly: true },
    ],
  },
]

function navGroupsForRole(role) {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (item.adminOnly) return role === 'admin'
      if (item.restricted) return !item.restricted.includes(role)
      return true
    }),
  })).filter((group) => group.items.length > 0)
}

// Validate an incoming URL state against the user's role — a shared link must
// not route someone into a view their nav doesn't offer.
function resolveUrlState(state, role) {
  if (!state) return { mode: 'help' }
  const allowed = new Set(navGroupsForRole(role).flatMap((g) => g.items.map((i) => i.id)))
  if (state.mode === 'review_detail') return allowed.has('review_queue') ? state : { mode: 'help' }
  if (state.mode === 'campaign_detail') return allowed.has('campaigns') ? state : { mode: 'help' }
  return allowed.has(state.mode) ? state : { mode: 'help' }
}

function NavButton({ id, label, Icon, isActive, onClick }) {
  return (
    <div className="relative">
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[17px] bg-accent rounded-r-full" />
      )}
      <button
        onClick={onClick}
        className={`flex items-center gap-3 w-full pl-4 pr-3 py-2 rounded-[9px] text-[13.5px] text-left transition-all ${
          isActive
            ? 'bg-white text-ink font-semibold shadow-sm'
            : 'text-[#7B7464] font-medium hover:bg-white/50 hover:text-ink'
        }`}
      >
        <Icon size={15} strokeWidth={isActive ? 2 : 1.5} className="flex-shrink-0" />
        <span className="flex-1 truncate">{label}</span>
      </button>
    </div>
  )
}

function Sidebar({ mode, onNav, user, role, onSignOut }) {
  const groups = navGroupsForRole(role)
  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Local dev'
  const initials = displayName.slice(0, 2).toUpperCase()
  const activeId =
    mode === 'review_detail' ? 'review_queue'
    : mode === 'campaign_detail' ? 'campaigns'
    : mode

  return (
    <aside
      style={{ width: 236, minWidth: 236 }}
      className="flex flex-col h-screen sticky top-0 border-r border-mist bg-sidebar shrink-0"
    >
      {/* Logo */}
      <div className="px-4 py-3 border-b border-mist">
        <img
          src="/kol-finder/markato-logo.png"
          alt="Markato"
          style={{ width: 88, mixBlendMode: 'multiply', opacity: 0.85 }}
        />
        <p className="font-mono text-[9px] tracking-[.16em] text-faint uppercase mt-[4px]">Seeding Studio</p>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 py-2 flex flex-col overflow-y-auto">
        {groups.map((group, gi) => (
          <div key={group.label} className={gi > 0 ? 'mt-0' : ''}>
            <p className="font-mono text-[9px] tracking-[.16em] text-[#B0A693] uppercase px-5 pb-2 pt-2">
              {group.label}
            </p>
            <div className="flex flex-col gap-0 px-3">
              {group.items.map(({ id, label, icon: Icon }) => (
                <NavButton
                  key={id}
                  id={id}
                  label={label}
                  Icon={Icon}
                  isActive={activeId === id}
                  onClick={() => onNav(id)}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer nav */}
      <div className="px-3 pb-2 flex flex-col gap-0">
        {/* User block — only shown when logged in */}
        {user && (
        <div className="mt-0 pt-3 pb-2 border-t border-mist">
          <div className="flex items-center gap-2">
            <div className="w-[28px] h-[28px] bg-ink rounded-full flex items-center justify-center text-white text-[11px] font-semibold flex-shrink-0 leading-none">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold text-[#3A352C] truncate leading-tight">{displayName}</p>
              <p className="font-mono text-[10px] text-faint truncate">{user.email}</p>
            </div>
            <button
              onClick={onSignOut}
              className="text-faint hover:text-rose transition-colors flex-shrink-0 ml-0"
              title="Sign out"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
        )}
      </div>
    </aside>
  )
}

function MainApp({ user, role, onSignOut }) {
  // Deep link: the current URL wins; otherwise a link stashed before the OAuth redirect.
  const [initialUrlState] = useState(() => resolveUrlState(readUrlState() || popStashedDeepLink(), role))
  const [mode, setMode] = useState(initialUrlState.mode)
  const [openReviewId, setOpenReviewId] = useState(initialUrlState.reviewId || null)
  const [openCampaignId, setOpenCampaignId] = useState(initialUrlState.campaignId || null)
  const [campaignSeed, setCampaignSeed] = useState(null) // { runId, name, count } from "Start campaign"
  const [step, setStep] = useState('upload')
  const [fileNames, setFileNames] = useState([])
  const [influencers, setInfluencers] = useState([])
  const [results, setResults] = useState([])
  const [config, setConfig] = useState(null)
  const [activeCampaign, setActiveCampaign] = useState(null) // the campaign this seeder run belongs to
  const [progress, setProgress] = useState({ done: 0, total: 0, error: null })
  const [currentSessionId, setCurrentSessionId] = useState(initialUrlState.sessionId || null)
  const [runNotice, setRunNotice] = useState(null) // { kind: 'error' | 'info', text } — non-blocking banner
  const startingRef = useRef(false)
  const cancelledRef = useRef(false) // set by the interstitial Cancel button
  const prevPageKeyRef = useRef(null)

  // Keep the URL in sync with the current view. Push a history entry when the
  // page identity changes (so back/forward walk between views); replace when
  // only secondary state changes (e.g. a scoring run finishing gains a session id).
  // The seeder's Set up ↔ Results position counts as page identity: it has its
  // own navigation affordances, so the back button must walk it too. The
  // transient 'scoring' interstitial groups with setup so it never gets its own
  // history entry.
  const seederView = mode === 'seeder' && step === 'results' ? 'results' : 'setup'
  useEffect(() => {
    const pageKey = `${mode}:${openReviewId || ''}:${openCampaignId || ''}:${mode === 'seeder' ? seederView : ''}`
    const replace = prevPageKeyRef.current === null || prevPageKeyRef.current === pageKey
    prevPageKeyRef.current = pageKey
    syncUrl(
      {
        mode,
        reviewId: openReviewId,
        campaignId: openCampaignId,
        sessionId: mode === 'seeder' ? currentSessionId : null,
        view: seederView,
      },
      { replace }
    )
  }, [mode, openReviewId, openCampaignId, currentSessionId, seederView])

  // Browser back/forward: re-read the URL into view state.
  useEffect(() => {
    const onPop = () => {
      const s = resolveUrlState(readUrlState(), role)
      // Mark this page as already current so the sync effect replaces instead
      // of pushing a duplicate history entry on top of the one we navigated to.
      const popView = s.mode === 'seeder' ? (s.view === 'setup' ? 'setup' : 'results') : ''
      prevPageKeyRef.current = `${s.mode}:${s.reviewId || ''}:${s.campaignId || ''}:${popView}`
      setMode(s.mode)
      setOpenReviewId(s.reviewId || null)
      setOpenCampaignId(s.campaignId || null)
      if (s.mode === 'seeder') {
        if (s.sessionId && s.sessionId !== currentSessionId) {
          loadSessionFull(s.sessionId)
            .then((session) => session && handleLoadSeederSession(session, popView))
            .catch(console.error)
        } else if (popView === 'results' && results.length > 0) {
          setStep('results')
        } else {
          // Setup view, or a results entry whose data is gone (fresh reload).
          setStep(influencers.length > 0 ? 'config' : 'upload')
        }
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [role, currentSessionId, results.length, influencers.length])

  // Deep-linked seeder session (?page=seeder&session=<id>): load its results once on mount.
  useEffect(() => {
    if (!initialUrlState.sessionId) return
    loadSessionFull(initialUrlState.sessionId)
      .then((session) => session && handleLoadSeederSession(session, initialUrlState.view))
      .catch(console.error)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleLoadSeederSession = (session, view = 'results') => {
    setFileNames(session.fileNames)
    setConfig(session.config)
    setInfluencers(session.influencers)
    setResults(session.results)
    setCurrentSessionId(session.id)
    setStep(view === 'setup' ? 'config' : 'results')
    setMode('seeder')
    // Restore the campaign this session belongs to, so a re-score stays grouped.
    if (session.campaignId) {
      getCampaign(session.campaignId).then(setActiveCampaign).catch(() => setActiveCampaign(null))
    } else {
      setActiveCampaign(null)
    }
  }

  function deduplicateInfluencers(batches) {
    const merged = {}
    for (const batch of batches) {
      for (const inf of batch) {
        // Key by platform + username: the same handle on Instagram and Threads
        // is two distinct candidates (often the same person, but different
        // content/engagement) — they must not overwrite each other.
        const key = `${inf.platform || 'instagram'}:${inf.username}`
        const existing = merged[key]
        // Prefer the record built from more posts (richer data) rather than the
        // one with higher engagement, so we don't drop the batch that actually
        // saw more of this account. NOTE: aggregates can't be losslessly merged
        // here — a full cross-batch merge would need re-aggregating raw rows.
        const better =
          !existing ||
          inf.postCount > existing.postCount ||
          (inf.postCount === existing.postCount && inf.totalEngagement > existing.totalEngagement)
        if (better) merged[key] = inf
      }
    }
    return Object.values(merged).sort((a, b) => b.totalEngagement - a.totalEngagement)
  }

  // Aggregate Apify branded scrape results into a deduped influencer list —
  // used by the campaign run flow.
  function aggregateBranded(brandedResults) {
    const influencerLists = brandedResults.map(({ items, brand, platform, trackByTerm, enrichByUser }) => {
      // Threads batches carry platform:'threads' + a term→track map + a
      // username→follower/bio enrichment map; they go through the Threads-shaped
      // aggregator (different actor field names).
      if (platform === 'threads') return aggregateThreadsPostItems(items, trackByTerm, enrichByUser)
      const all = aggregatePostItems(items, brand)
      return brand
        ? all.filter((inf) => inf.username.toLowerCase() !== brand.toLowerCase())
        : all
    })
    return deduplicateInfluencers(influencerLists)
  }

  // Score a set of influencers with a config, then save the session. Shared by
  // the campaign run flow (scrape + upload paths).
  const runScoringAndSave = async (allInfluencers, cfg, campaignId) => {
    setProgress({ phase: 'scoring', done: 0, total: allInfluencers.length, error: null, note: '' })
    const toScore = allInfluencers.filter((inf) => {
      if (inf.avgLikes < (cfg.minEngagement || 0)) return false
      if (cfg.locationTarget) {
        const region = classifyRegion(inf.accountLocation)
        if (region && region !== cfg.locationTarget) return false
      }
      return true
    })
    // Found accounts, but the pre-filters removed every one — explain rather than
    // dropping the user on a blank "0 scored" results page.
    if (toScore.length === 0 && allInfluencers.length > 0) {
      const reasons = [
        cfg.minEngagement ? `minimum engagement of ${cfg.minEngagement}` : null,
        cfg.locationTarget ? `location "${cfg.locationTarget}"` : null,
      ].filter(Boolean)
      setProgress((p) => ({
        ...p,
        error: `Found ${allInfluencers.length} account${allInfluencers.length === 1 ? '' : 's'}, but ${reasons.length ? `your filters (${reasons.join(', ')}) removed them all` : 'none passed the filters'}. Loosen the campaign's filters and run again.`,
      }))
      return
    }
    setProgress((p) => ({ ...p, total: toScore.length }))
    const allResults = []
    const batchSize = 5
    for (let i = 0; i < toScore.length; i += batchSize) {
      if (cancelledRef.current) return // user hit Cancel on the interstitial
      const batch = toScore.slice(i, i + batchSize)
      const scored = await scoreInfluencers(batch, cfg)
      allResults.push(...scored)
      setProgress((p) => ({ ...p, done: Math.min(i + batchSize, toScore.length) }))
    }
    if (cancelledRef.current) return
    setResults(allResults)
    setConfig(cfg)
    setStep('results')
    // Persist the run. If it fails, keep the results on screen but tell the user
    // (a null session id would otherwise silently break vault/share later).
    try {
      const id = await saveSession({ fileNames, config: cfg, results: allResults, influencers: allInfluencers, campaignId })
      setCurrentSessionId(id)
    } catch (e) {
      console.error('Failed to save session', e)
      setRunNotice({ kind: 'error', text: 'Scored successfully, but saving this run to History failed. Your results are shown below but weren’t saved.' })
    }
  }

  // Map a campaign's saved scrape targets (default_step1) to runSeederScrape args.
  function campaignScrapeParams(campaign, resultsLimit) {
    const s1 = campaign.default_step1 || {}
    return {
      platforms: s1.platforms || { instagram: true, threads: false },
      scrapeInput: s1.scrapeInput || '',
      painpointInput: s1.painpointInput || '',
      genreInput: s1.genreInput || '',
      resultsLimit: resultsLimit || s1.resultsLimit || 200,
    }
  }

  // The one-button campaign run: get data (scrape the campaign's targets, or use
  // an uploaded export), then score with the campaign's shared config, then save.
  const handleRunCampaign = async ({ mode = 'scrape', files = [], resultsLimit = 200 } = {}) => {
    if (startingRef.current || !activeCampaign) return
    startingRef.current = true
    cancelledRef.current = false
    setRunNotice(null)
    setMode('seeder')
    setStep('scoring')
    setProgress({ phase: 'scraping', done: 0, total: 0, error: null, note: '' })
    try {
      // Re-fetch the campaign so the run uses its LATEST config (it may have been
      // edited elsewhere) and never runs a campaign that was deleted meanwhile.
      let campaign = activeCampaign
      try {
        const fresh = await getCampaign(activeCampaign.id)
        if (!fresh) {
          setActiveCampaign(null)
          setStep('upload')
          return
        }
        campaign = fresh
        setActiveCampaign(fresh)
      } catch (e) {
        console.error('Failed to refresh campaign before run', e)
      }
      let inf = []
      let names = []
      if (mode === 'upload') {
        setProgress((p) => ({ ...p, note: 'Parsing files…' }))
        const parsed = await Promise.all(files.map((f) => parseApifyXlsx(f)))
        inf = deduplicateInfluencers(parsed)
        names = files.map((f) => f.name)
      } else {
        const { brandedResults, failedBrands, notices } = await runSeederScrape(
          campaignScrapeParams(campaign, resultsLimit),
          { onProgress: (text) => setProgress((p) => ({ ...p, note: text })) }
        )
        if (cancelledRef.current) return
        if (brandedResults.length === 0) {
          setProgress((p) => ({ ...p, error: failedBrands.length ? `Scrape failed for ${failedBrands.join(', ')}.` : 'No results were scraped.' }))
          return
        }
        const noticeParts = []
        if (failedBrands.length) noticeParts.push(`Some targets failed and were skipped: ${failedBrands.join(', ')}. Continuing with what succeeded.`)
        if (notices.length) noticeParts.push(...notices)
        if (noticeParts.length) setRunNotice({ kind: 'info', text: noticeParts.join(' · ') })
        inf = aggregateBranded(brandedResults)
        names = brandedResults.map(({ brand }) => brand)
      }
      if (inf.length === 0) {
        setProgress((p) => ({ ...p, error: 'No KOLs found in the data. Try different targets or upload an export.' }))
        return
      }
      setFileNames(names)
      setInfluencers(inf)
      setCurrentSessionId(null)

      // Build the scoring config from the campaign (shared) + brand facts.
      let brand = null
      try {
        if (campaign.brand_id) brand = await getBrandById(campaign.brand_id)
      } catch (e) {
        console.error('Failed to load brand facts', e)
      }
      const cfg = { ...campaignToForm(brand, campaign), sessionTitle: campaign.name, resultsLimit }

      await runScoringAndSave(inf, cfg, campaign.id)
    } catch (err) {
      setProgress((p) => ({ ...p, error: err.message }))
    } finally {
      startingRef.current = false
    }
  }

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  const handleNav = (newMode) => {
    // Enforce role-based nav gating here too, so links like the dashboard
    // empty-state button can't route a brand_manager into a restricted view.
    // Detail views (review_detail, campaign_detail) aren't nav items — exempt them.
    if (newMode !== 'review_detail' && newMode !== 'campaign_detail') {
      const allowed = new Set(navGroupsForRole(role).flatMap((g) => g.items.map((i) => i.id)))
      if (!allowed.has(newMode)) return
      setOpenReviewId(null)
      setOpenCampaignId(null)
      setCampaignSeed(null) // a manual nav shouldn't reopen a stale "start campaign" form
    }
    // Re-clicking Seeder while viewing results goes back to Set up. Nothing is
    // lost: results stay in memory (step "2 Results" jumps back to them) and
    // the run is already saved in History.
    if (newMode === 'seeder' && mode === 'seeder' && step === 'results') {
      setStep(influencers.length > 0 ? 'config' : 'upload')
      return
    }
    setMode(newMode)
  }

  const handleStartCampaign = (seed) => {
    // Bridge from a reviewed seeding run → pre-filled campaign with its approved
    // KOLs auto-attached. Set the seed first, then land on the Campaigns tab.
    setOpenCampaignId(null)
    setCampaignSeed(seed)
    setMode('campaigns')
  }

  const handleOpenReview = (id) => {
    setOpenReviewId(id)
    setMode('review_detail')
  }

  const handleOpenCampaign = (id) => {
    setOpenCampaignId(id)
    setMode('campaign_detail')
  }

  // Open a campaign's existing session in the Seeder (from the campaign detail).
  const handleOpenSessionFromCampaign = (sessionId) => {
    loadSessionFull(sessionId)
      .then((session) => session && handleLoadSeederSession(session, 'results'))
      .catch(console.error)
  }

  // Start a fresh session under a campaign: clear the seeder and land on the Run
  // screen with this campaign active (it already holds config + scrape targets).
  const handleNewSessionForCampaign = (campaign) => {
    setActiveCampaign(campaign)
    setInfluencers([])
    setResults([])
    setFileNames([])
    setConfig(null)
    setCurrentSessionId(null)
    setStep('upload')
    setOpenCampaignId(null)
    setMode('seeder')
  }

  // A brand-new campaign (created from the Step 1 picker) opens its page so the
  // user sets it up (config + scrape targets) before running.
  const handleNewCampaign = (campaign) => {
    setActiveCampaign(campaign)
    setOpenCampaignId(campaign.id)
    setMode('campaign_detail')
  }

  // A campaign/session deleted in another tab must not stay "active" in the
  // long-lived seeder state (MainApp never unmounts, so it wouldn't self-heal).
  const handleCampaignDeleted = (id) => {
    if (activeCampaign?.id === id) setActiveCampaign(null)
  }
  const handleSessionDeleted = (id) => {
    if (currentSessionId === id) {
      setResults([])
      setInfluencers([])
      setConfig(null)
      setCurrentSessionId(null)
      if (mode === 'seeder') setStep('upload')
    }
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar mode={mode} onNav={handleNav} user={user} role={role} onSignOut={onSignOut} />
      <main className="flex-1 overflow-auto flex flex-col">
        {mode === 'dashboard' && <DashboardPage onNavigate={handleNav} onOpenReview={handleOpenReview} onOpenCampaign={handleOpenCampaign} />}
        {mode === 'help' && <InstructionsPage />}
        {mode === 'team' && role === 'admin' && <TeamPage />}
        {mode === 'review_queue' && (
          <ReviewQueuePage onOpenReview={handleOpenReview} onStartCampaign={handleStartCampaign} />
        )}
        {mode === 'review_detail' && openReviewId && (
          <ReviewPage
            reviewId={openReviewId}
            onBack={() => { setMode('review_queue'); setOpenReviewId(null) }}
          />
        )}
        {mode === 'ready_to_send' && <ReadyToSendPage />}
        {mode === 'campaigns' && (
          <CampaignsPage
            onOpenCampaign={handleOpenCampaign}
            seed={campaignSeed}
            onSeedConsumed={() => setCampaignSeed(null)}
            onCampaignDeleted={handleCampaignDeleted}
          />
        )}
        {mode === 'campaign_detail' && openCampaignId && (
          <CampaignDetailPage
            campaignId={openCampaignId}
            onBack={() => { setMode('campaigns'); setOpenCampaignId(null) }}
            onOpenSession={handleOpenSessionFromCampaign}
            onNewSession={handleNewSessionForCampaign}
          />
        )}
        {mode === 'vault' && <VaultPage onNavigate={handleNav} />}
        {mode === 'history' && (
          <HistoryPage onLoadSeederSession={handleLoadSeederSession} onNavigate={handleNav} onSessionDeleted={handleSessionDeleted} />
        )}
        {mode === 'seeder' && (
          <>
            {step === 'scoring' && (
              <div className="px-8 py-8">
                <StepProgress
                  current={2}
                  className="mb-8"
                  steps={[{ num: 1, label: 'Set up' }, { num: 2, label: 'Results' }]}
                />
                <div className="max-w-sm">
                  <p className="font-mono text-[10px] tracking-[.18em] text-faint uppercase mb-6">
                    {progress.phase === 'scraping' ? 'Scraping accounts' : 'Scoring accounts'}
                  </p>
                  {progress.error ? (
                    <div className="text-rose text-sm mb-4">
                      <p className="font-medium mb-1">Error</p>
                      <p className="text-muted text-xs">{progress.error}</p>
                      <button
                        onClick={() => setStep('upload')}
                        className="mt-4 px-4 py-2 bg-ink text-white rounded-[10px] text-sm"
                      >
                        Back to setup
                      </button>
                    </div>
                  ) : progress.phase === 'scraping' ? (
                    <>
                      <div className="w-full h-1.5 bg-mist rounded-full overflow-hidden mb-3">
                        <div className="h-full w-1/3 bg-ink rounded-full anim-indeterminate" />
                      </div>
                      <p className="font-mono text-sm text-muted">{progress.note || 'Starting scrape…'}</p>
                      <p className="text-xs text-faint mt-1">
                        Scraping the campaign's targets — this usually takes 1–5 minutes.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="w-full h-1.5 bg-mist rounded-full overflow-hidden mb-3">
                        <div
                          className="h-full bg-ink rounded-full transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="font-mono text-sm text-muted">
                        {progress.done} / {progress.total} accounts
                      </p>
                      <p className="text-xs text-faint mt-1">
                        Analysing captions, hashtags, and engagement signals...
                      </p>
                    </>
                  )}
                  {!progress.error && (
                    <button
                      onClick={() => {
                        cancelledRef.current = true
                        startingRef.current = false
                        setStep('upload')
                      }}
                      className="mt-6 text-[12px] text-faint hover:text-ink underline underline-offset-2"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            )}
            {(step === 'upload' || step === 'config') && (
              <CombinedStep
                activeCampaign={activeCampaign}
                onSelectCampaign={setActiveCampaign}
                onNewCampaign={handleNewCampaign}
                onEditCampaign={handleOpenCampaign}
                onRunCampaign={handleRunCampaign}
                onViewResults={results.length > 0 ? () => setStep('results') : null}
              />
            )}
            {step === 'results' && (
              <ResultsStep
                results={results}
                influencers={influencers}
                config={config}
                sessionId={currentSessionId}
                campaignId={activeCampaign?.id || null}
                onBackToSetup={() => setStep(influencers.length > 0 ? 'config' : 'upload')}
              />
            )}
          </>
        )}
        <footer className="mt-auto px-8 py-3 text-center">
          <p className="font-mono text-[10px] tracking-[.12em]" style={{ color: '#C4BDB0' }}>Seeding Studio · Annabelle Soo 2026</p>
        </footer>
      </main>
      {runNotice && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] max-w-[520px] px-4 py-3 rounded-[12px] shadow-lg text-[13px] flex items-start gap-3 ${
            runNotice.kind === 'error' ? 'bg-rose text-white' : 'bg-ink text-white'
          }`}
        >
          <span className="flex-1">{runNotice.text}</span>
          <button onClick={() => setRunNotice(null)} className="opacity-70 hover:opacity-100 flex-shrink-0" title="Dismiss">
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  )
}

export default function App() {
  return <AuthGate />
}

function AuthGate() {
  const [authState, setAuthState] = useState({ loading: true, user: null, role: null, error: null })

  useEffect(() => {
    if (!supabase) {
      setAuthState({ loading: false, user: null, role: null, error: null })
      return
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        resolveUser(session.user)
      } else {
        setAuthState({ loading: false, user: null, role: null, error: null })
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        resolveUser(session.user)
      } else {
        setAuthState((prev) => ({ ...prev, loading: false, user: null, role: null }))
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function resolveUser(user) {
    if (!user.email.endsWith('@markato.com')) {
      await supabase.auth.signOut()
      setAuthState({ loading: false, user: null, role: null, error: 'Only @markato.com accounts are allowed.' })
      return
    }

    // Get existing role, or create user row with default role
    let { data: record } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (!record) {
      const { data: inserted } = await supabase
        .from('users')
        .insert({ id: user.id, email: user.email, role: 'assistant_bm' })
        .select('role')
        .single()
      record = inserted
    }

    setAuthState({ loading: false, user, role: record?.role || 'assistant_bm', error: null })
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  // No Supabase configured (local dev) — skip auth
  if (!supabase) {
    return <MainApp user={null} role="admin" onSignOut={() => {}} />
  }

  if (authState.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper">
        <p className="font-mono text-[10px] text-faint tracking-[.18em] uppercase">Loading...</p>
      </div>
    )
  }

  if (!authState.user) {
    return <LoginPage error={authState.error} />
  }

  return <MainApp user={authState.user} role={authState.role} onSignOut={handleSignOut} />
}
