import { useState, useEffect } from 'react'
import { LayoutDashboard, Search, Clock, HelpCircle, Users, LogOut, ClipboardList, Send } from 'lucide-react'
import UploadStep from './components/UploadStep'
import ConfigStep from './components/ConfigStep'
import ResultsStep from './components/ResultsStep'
import DashboardPage from './components/DashboardPage'
import InstructionsPage from './components/InstructionsPage'
import HistoryPage from './components/HistoryPage'
import ReviewPage from './components/ReviewPage'
import ReviewQueuePage from './components/ReviewQueuePage'
import ReadyToSendPage from './components/ReadyToSendPage'
import LoginPage from './components/LoginPage'
import TeamPage from './components/TeamPage'
import { supabase } from './lib/supabase'
import { parseApifyXlsx, aggregatePostItems } from './lib/parseXlsx'
import { scoreInfluencers } from './lib/scoreInfluencers'
import { saveSession } from './lib/sessionHistory'

function navItemsForRole(role) {
  const items = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'seeder', label: 'Seeder', icon: Search, restricted: ['brand_manager'] },
    { id: 'history', label: 'History', icon: Clock, restricted: ['brand_manager'] },
    { id: 'review_queue', label: 'Review Queue', icon: ClipboardList },
    { id: 'ready_to_send', label: 'Ready to Send', icon: Send, restricted: ['brand_manager'] },
    { id: 'team', label: 'Team', icon: Users, adminOnly: true },
  ]
  return items.filter((item) => {
    if (item.adminOnly) return role === 'admin'
    if (item.restricted) return !item.restricted.includes(role)
    return true
  })
}

function Sidebar({ mode, onNav, user, role, onSignOut }) {
  const navItems = navItemsForRole(role)
  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || ''
  // review_detail is entered from review_queue — keep queue highlighted
  const activeId = mode === 'review_detail' ? 'review_queue' : mode

  return (
    <aside
      style={{ width: 220, minWidth: 220 }}
      className="flex flex-col h-screen sticky top-0 border-r border-mist bg-paper shrink-0"
    >
      <div className="px-5 py-4 border-b border-mist">
        <span className="font-mono text-xs tracking-widest text-ink/30 uppercase">Seeding Tool</span>
      </div>

      <nav className="flex-1 px-3 py-3 flex flex-col gap-0.5">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onNav(id)}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left w-full ${
              activeId === id
                ? 'bg-accent/10 text-accent'
                : 'text-ink/50 hover:text-ink hover:bg-mist/60'
            }`}
          >
            <Icon size={16} strokeWidth={activeId === id ? 2 : 1.5} />
            {label}
          </button>
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-mist flex flex-col gap-0.5">
        <button
          onClick={() => onNav('help')}
          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left w-full ${
            activeId === 'help'
              ? 'bg-accent/10 text-accent'
              : 'text-ink/50 hover:text-ink hover:bg-mist/60'
          }`}
        >
          <HelpCircle size={16} strokeWidth={activeId === 'help' ? 2 : 1.5} />
          Help
        </button>
        <a
          href="/kol-finder/flowchart.html"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 px-3 py-2 text-sm text-ink/30 hover:text-ink/60 transition-colors font-mono"
        >
          how it works ↗
        </a>

        {/* User info + sign out */}
        <div className="px-3 pt-3 mt-1 border-t border-mist/60">
          <p className="text-xs font-medium text-ink/70 truncate">{displayName}</p>
          <p className="text-xs text-ink/30 font-mono truncate">{user?.email}</p>
          <button
            onClick={onSignOut}
            className="mt-2 flex items-center gap-1.5 text-xs text-ink/30 hover:text-rose transition-colors"
          >
            <LogOut size={11} />
            Sign out
          </button>
        </div>
      </div>
    </aside>
  )
}

function MainApp({ user, role, onSignOut }) {
  const [mode, setMode] = useState('dashboard')
  const [openReviewId, setOpenReviewId] = useState(null)
  const [step, setStep] = useState('upload')
  const [fileNames, setFileNames] = useState([])
  const [influencers, setInfluencers] = useState([])
  const [results, setResults] = useState([])
  const [config, setConfig] = useState(null)
  const [progress, setProgress] = useState({ done: 0, total: 0, error: null })

  const handleLoadSeederSession = (session) => {
    setFileNames(session.fileNames)
    setConfig(session.config)
    setInfluencers(session.influencers)
    setResults(session.results)
    setStep('results')
    setMode('seeder')
  }

  function deduplicateInfluencers(batches) {
    const merged = {}
    for (const batch of batches) {
      for (const inf of batch) {
        const existing = merged[inf.username]
        if (!existing || inf.totalEngagement > existing.totalEngagement) {
          merged[inf.username] = inf
        }
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
    const influencerLists = brandedResults.map(({ items, brand }) => {
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
    } catch (err) {
      setProgress((p) => ({ ...p, error: err.message }))
    }
  }

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  const handleNav = (newMode) => {
    setMode(newMode)
    if (newMode !== 'review_detail') setOpenReviewId(null)
  }

  const handleOpenReview = (id) => {
    setOpenReviewId(id)
    setMode('review_detail')
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar mode={mode} onNav={handleNav} user={user} role={role} onSignOut={onSignOut} />
      <main className="flex-1 overflow-auto flex flex-col">
        {mode === 'dashboard' && <DashboardPage />}
        {mode === 'help' && <InstructionsPage />}
        {mode === 'team' && <TeamPage />}
        {mode === 'review_queue' && (
          <ReviewQueuePage onOpenReview={handleOpenReview} />
        )}
        {mode === 'review_detail' && openReviewId && (
          <ReviewPage
            reviewId={openReviewId}
            onBack={() => { setMode('review_queue'); setOpenReviewId(null) }}
          />
        )}
        {mode === 'ready_to_send' && <ReadyToSendPage />}
        {mode === 'history' && (
          <HistoryPage onLoadSeederSession={handleLoadSeederSession} />
        )}
        {mode === 'seeder' && (
          <>
            {step === 'scoring' && (
              <div className="flex-1 flex flex-col items-center justify-center px-6 py-20">
                <div className="max-w-sm w-full text-center">
                  <p className="font-mono text-xs tracking-widest text-ink/40 uppercase mb-6">Scoring accounts</p>
                  {progress.error ? (
                    <div className="text-rose text-sm mb-4">
                      <p className="font-medium mb-1">Error</p>
                      <p className="text-ink/60 text-xs">{progress.error}</p>
                      <button
                        onClick={() => setStep('config')}
                        className="mt-4 px-4 py-2 bg-ink text-white rounded-lg text-sm"
                      >
                        Back to config
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="w-full h-1.5 bg-mist rounded-full overflow-hidden mb-3">
                        <div
                          className="h-full bg-accent rounded-full transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="font-mono text-sm text-ink/60">
                        {progress.done} / {progress.total} accounts
                      </p>
                      <p className="text-xs text-ink/30 mt-1">
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
              <ResultsStep results={results} influencers={influencers} config={config} />
            )}
          </>
        )}
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
      <div className="min-h-screen flex items-center justify-center">
        <p className="font-mono text-xs text-ink/30 tracking-widest uppercase">Loading...</p>
      </div>
    )
  }

  if (!authState.user) {
    return <LoginPage error={authState.error} />
  }

  return <MainApp user={authState.user} role={authState.role} onSignOut={handleSignOut} />
}
