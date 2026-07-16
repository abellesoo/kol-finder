import { useState, useEffect, useRef } from 'react'
import { LayoutDashboard, Search, Clock, BookOpen, Users, LogOut, ClipboardList, Send, Rocket } from 'lucide-react'
import UploadStep from './components/UploadStep'
import ConfigStep from './components/ConfigStep'
import ResultsStep from './components/ResultsStep'
import DashboardPage from './components/DashboardPage'
import InstructionsPage from './components/InstructionsPage'
import HistoryPage from './components/HistoryPage'
import ReviewPage from './components/ReviewPage'
import ReviewQueuePage from './components/ReviewQueuePage'
import ReadyToSendPage from './components/ReadyToSendPage'
import CampaignsPage from './components/CampaignsPage'
import CampaignDetailPage from './components/CampaignDetailPage'
import LoginPage from './components/LoginPage'
import TeamPage from './components/TeamPage'
import { supabase } from './lib/supabase'
import { parseApifyXlsx, aggregatePostItems, aggregateThreadsPostItems } from './lib/parseXlsx'
import { scoreInfluencers } from './lib/scoreInfluencers'
import { saveSession } from './lib/sessionHistory'

const NAV_GROUPS = [
  {
    label: 'Workspace',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'seeder', label: 'Seeder', icon: Search, restricted: ['brand_manager'] },
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
  const [mode, setMode] = useState('help')
  const [openReviewId, setOpenReviewId] = useState(null)
  const [openCampaignId, setOpenCampaignId] = useState(null)
  const [campaignSeed, setCampaignSeed] = useState(null) // { runId, name, count } from "Start campaign"
  const [step, setStep] = useState('upload')
  const [fileNames, setFileNames] = useState([])
  const [influencers, setInfluencers] = useState([])
  const [results, setResults] = useState([])
  const [config, setConfig] = useState(null)
  const [progress, setProgress] = useState({ done: 0, total: 0, error: null })
  const [currentSessionId, setCurrentSessionId] = useState(null)
  const startingRef = useRef(false)

  const handleLoadSeederSession = (session) => {
    setFileNames(session.fileNames)
    setConfig(session.config)
    setInfluencers(session.influencers)
    setResults(session.results)
    setCurrentSessionId(session.id)
    setStep('results')
    setMode('seeder')
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

  const handleFiles = async (files) => {
    setFileNames(files.map((f) => f.name))
    try {
      const allParsed = await Promise.all(files.map((f) => parseApifyXlsx(f)))
      setInfluencers(deduplicateInfluencers(allParsed))
      setStep('config')
    } catch (err) {
      alert('Failed to parse file(s): ' + err.message)
    }
  }

  const handleScrapedItems = (brandedResults) => {
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
    const merged = deduplicateInfluencers(influencerLists)
    if (merged.length === 0) {
      alert(
        "No KOLs found in the scraped data.\n\nThis usually means the tagged page returned no posts from other users, or the account doesn't exist. Try a different URL or check the account on Instagram first."
      )
      return
    }
    setFileNames(brandedResults.map(({ brand }) => brand))
    setInfluencers(merged)
    setStep('config')
  }

  const handleStart = async (cfg) => {
    // Guard against a double-click starting two scoring runs (and two sessions).
    if (startingRef.current) return
    startingRef.current = true
    setConfig(cfg)
    setStep('scoring')
    setProgress({ done: 0, total: influencers.length, error: null })

    const toScore = influencers.filter((inf) => inf.avgLikes >= (cfg.minEngagement || 0))
    setProgress((p) => ({ ...p, total: toScore.length }))

    try {
      const allResults = []
      const batchSize = 5
      for (let i = 0; i < toScore.length; i += batchSize) {
        const batch = toScore.slice(i, i + batchSize)
        const scored = await scoreInfluencers(batch, cfg)
        allResults.push(...scored)
        setProgress((p) => ({ ...p, done: Math.min(i + batchSize, toScore.length) }))
      }
      setResults(allResults)
      setStep('results')
      saveSession({ fileNames, config: cfg, results: allResults, influencers })
        .then((id) => setCurrentSessionId(id))
        .catch(console.error)
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
          />
        )}
        {mode === 'campaign_detail' && openCampaignId && (
          <CampaignDetailPage
            campaignId={openCampaignId}
            onBack={() => { setMode('campaigns'); setOpenCampaignId(null) }}
          />
        )}
        {mode === 'history' && (
          <HistoryPage onLoadSeederSession={handleLoadSeederSession} onNavigate={handleNav} />
        )}
        {mode === 'seeder' && (
          <>
            {step === 'scoring' && (
              <div className="px-8 py-8">
                <div className="flex items-center mb-8">
                  {[{ num: 1, label: 'Get Data' }, { num: 2, label: 'Configure' }, { num: 3, label: 'Results' }].map((s, i, arr) => (
                    <div key={s.num} className="flex items-center">
                      <div className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-mono font-semibold flex-shrink-0 ${s.num === 3 ? 'bg-accent text-white' : 'bg-mist text-body'}`}>{s.num}</span>
                        <span className={`text-[12.5px] font-medium whitespace-nowrap ${s.num === 3 ? 'text-ink' : 'text-faint'}`}>{s.label}</span>
                      </div>
                      {i < arr.length - 1 && <div className="w-8 h-px bg-mist mx-3 flex-shrink-0" />}
                    </div>
                  ))}
                </div>
                <div className="max-w-sm">
                  <p className="font-mono text-[10px] tracking-[.18em] text-faint uppercase mb-6">Scoring accounts</p>
                  {progress.error ? (
                    <div className="text-rose text-sm mb-4">
                      <p className="font-medium mb-1">Error</p>
                      <p className="text-muted text-xs">{progress.error}</p>
                      <button
                        onClick={() => setStep('config')}
                        className="mt-4 px-4 py-2 bg-ink text-white rounded-[10px] text-sm"
                      >
                        Back to config
                      </button>
                    </div>
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
                </div>
              </div>
            )}
            {step === 'upload' && <UploadStep onFiles={handleFiles} onScrapedItems={handleScrapedItems} />}
            {step === 'config' && (
              <ConfigStep
                fileNames={fileNames}
                influencerCount={influencers.length}
                onStart={handleStart}
              />
            )}
            {step === 'results' && (
              <ResultsStep results={results} influencers={influencers} config={config} sessionId={currentSessionId} />
            )}
          </>
        )}
        <footer className="mt-auto px-8 py-3 text-center">
          <p className="font-mono text-[10px] tracking-[.12em]" style={{ color: '#C4BDB0' }}>Seeding Studio · Annabelle Soo 2026</p>
        </footer>
      </main>
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
