import { useState, useEffect } from 'react'
import { motion, stagger, useAnimate } from 'motion/react'
import { supabase } from '../lib/supabase'
import Floating, { FloatingElement } from './ui/parallax-floating'
import { TextEffect } from './core/text-effect'

const images = [
  '/kol-finder/wellage-serum.webp',
  '/kol-finder/whipped-jars.webp',
  '/kol-finder/dermafirm-serum.webp',
  '/kol-finder/ilso-bottles.webp',
  '/kol-finder/narka-products.webp',
  '/kol-finder/bblab-lemon.jpg',
  '/kol-finder/lilyeve-shampoo.png',
  '/kol-finder/wellage-mask.webp',
]

export default function LoginPage({ error }) {
  const [loading, setLoading] = useState(false)
  const [scope, animate] = useAnimate()

  useEffect(() => {
    animate('img', { opacity: [0, 1] }, { duration: 0.5, delay: stagger(0.15) })
  }, [])

  const handleGoogleSignIn = async () => {
    setLoading(true)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/kol-finder/' },
    })
  }

  return (
    <div
      className="flex w-full min-h-screen justify-center items-center bg-[#f5f4f0] overflow-hidden relative"
      ref={scope}
    >
      <motion.div
        className="z-50 space-y-4 flex flex-col max-w-2xl px-6 items-center text-center"
        initial={{ opacity: 1 }}
        animate={{ opacity: 1 }}
      >
        <motion.img
          src="/kol-finder/markato-logo.png"
          alt="Markato"
          style={{ width: 80, mixBlendMode: 'multiply', opacity: 0.75 }}
          className="mb-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.75 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        />
        <motion.p
          className="text-xs tracking-widest text-[#1a1a1a]/50 uppercase"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          Seeding Studio
        </motion.p>
        <div className="text-3xl md:text-4xl font-bold text-[#1a1a1a] leading-tight">
          <TextEffect per='char' preset='fade' delay={0.4} className="block">
            Find, score and launch creators who actually fit.
          </TextEffect>
        </div>
        <ul className="text-sm text-[#1a1a1a]/60 space-y-1">
          {['Score accounts automatically', 'Send for brand manager review', 'Draft and send DMs'].map((item, i) => (
            <motion.li
              key={item}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 3.2 + i * 0.25 }}
            >
              {item}
            </motion.li>
          ))}
        </ul>
        <div className="text-3xl md:text-4xl font-bold text-[#1a1a1a] leading-tight mt-6">
          <TextEffect per='char' preset='fade' delay={4.2} className="block">
            All in one place.
          </TextEffect>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-[10px] bg-rose-50 border border-rose-200 text-sm text-rose-600 text-center">
            {error}
          </div>
        )}

        <motion.button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="flex items-center gap-2 bg-white border border-[#1a1a1a]/20 rounded-full px-5 py-2.5 text-sm text-[#1a1a1a] w-fit hover:scale-105 transition-transform cursor-pointer disabled:opacity-50"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 4.0 }}
        >
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
            <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          {loading ? 'Redirecting…' : 'Sign in with Google'}
        </motion.button>
        <motion.p
          className="text-xs text-[#1a1a1a]/40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 4.2 }}
        >
          Use your markato.com account to continue
        </motion.p>
      </motion.div>

      <Floating sensitivity={-1} className="overflow-hidden">
        <FloatingElement depth={0.5} className="top-[8%] left-[11%]">
          <motion.img initial={{ opacity: 0 }} src={images[0]}
            className="w-16 h-16 md:w-24 md:h-24 object-cover hover:scale-105 duration-200 cursor-pointer transition-transform" />
        </FloatingElement>
        <FloatingElement depth={1} className="top-[10%] left-[32%]">
          <motion.img initial={{ opacity: 0 }} src={images[1]}
            className="w-20 h-20 md:w-28 md:h-28 object-cover hover:scale-105 duration-200 cursor-pointer transition-transform" />
        </FloatingElement>
        <FloatingElement depth={2} className="top-[2%] left-[53%]">
          <motion.img initial={{ opacity: 0 }} src={images[2]}
            className="w-28 h-40 md:w-40 md:h-52 object-cover hover:scale-105 duration-200 cursor-pointer transition-transform" />
        </FloatingElement>
        <FloatingElement depth={1} className="top-[0%] left-[83%]">
          <motion.img initial={{ opacity: 0 }} src={images[3]}
            className="w-24 h-24 md:w-32 md:h-32 object-cover hover:scale-105 duration-200 cursor-pointer transition-transform" />
        </FloatingElement>
        <FloatingElement depth={1} className="top-[40%] left-[2%]">
          <motion.img initial={{ opacity: 0 }} src={images[4]}
            className="w-28 h-28 md:w-36 md:h-36 object-cover hover:scale-105 duration-200 cursor-pointer transition-transform" />
        </FloatingElement>
        <FloatingElement depth={2} className="top-[70%] left-[77%]">
          <motion.img initial={{ opacity: 0 }} src={images[7]}
            className="w-28 h-28 md:w-36 md:h-48 object-cover hover:scale-105 duration-200 cursor-pointer transition-transform" />
        </FloatingElement>
        <FloatingElement depth={4} className="top-[73%] left-[15%]">
          <motion.img initial={{ opacity: 0 }} src={images[5]}
            className="w-40 md:w-52 h-full object-cover hover:scale-105 duration-200 cursor-pointer transition-transform" />
        </FloatingElement>
        <FloatingElement depth={1} className="top-[80%] left-[50%]">
          <motion.img initial={{ opacity: 0 }} src={images[6]}
            className="w-24 h-24 md:w-32 md:h-32 object-cover hover:scale-105 duration-200 cursor-pointer transition-transform" />
        </FloatingElement>
      </Floating>
    </div>
  )
}
