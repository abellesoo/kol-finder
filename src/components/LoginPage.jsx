import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function LoginPage({ error }) {
  const [loading, setLoading] = useState(false)

  const handleGoogleSignIn = async () => {
    setLoading(true)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/kol-finder/',
      },
    })
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-paper px-6">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <img
            src="/kol-finder/markato-logo.png"
            alt="Markato"
            style={{ width: 120, mixBlendMode: 'multiply', opacity: 0.85 }}
            className="mx-auto mb-4"
          />
          <h1 className="text-[24px] font-bold tracking-[-0.02em] text-ink mb-1">Seeding Studio</h1>
          <p className="text-[14px] text-muted">Sign in with your markato.com account</p>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-[10px] bg-rose/10 border border-rose/20 text-sm text-rose text-center">
            {error}
          </div>
        )}

        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 px-4 py-[13px] border border-card-edge rounded-[12px] bg-white hover:bg-surface transition-all text-[13.5px] font-medium text-ink shadow-sm disabled:opacity-50"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
            <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          {loading ? 'Redirecting...' : 'Sign in with Google'}
        </button>
      </div>
    </div>
  )
}
