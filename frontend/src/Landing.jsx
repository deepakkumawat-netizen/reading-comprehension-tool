import { useState } from 'react'

const FEATURES = [
  { icon: '📖', title: 'Grade-Calibrated Passages', desc: 'Engaging passages auto-written at exactly the right reading level for your students.' },
  { icon: '❓', title: 'Smart Questions', desc: 'Literal, inferential and higher-order questions matched to Bloom\'s taxonomy.' },
  { icon: '✏️', title: 'Vocabulary in Context', desc: 'Key words pulled straight from the passage with context-clue activities.' },
  { icon: '🧠', title: 'Annotation Guide', desc: 'A built-in annotation strategy students can use as they read.' },
  { icon: '📤', title: 'Export Anywhere', desc: 'Download as PDF, Word document or Google Docs in one click.' },
  { icon: '🕒', title: 'History & Adapt', desc: 'Revisit any activity, adapt it, or remix it for a new lesson — all your work is saved.' },
]

function pwStrength(p) {
  if (!p) return { s: 0, label: '', color: 'text-gray-400' }
  let s = 0
  if (p.length >= 8) s++; if (/[A-Z]/.test(p)) s++; if (/[0-9]/.test(p)) s++
  if (/[^A-Za-z0-9]/.test(p)) s++; if (p.length >= 12) s++
  if (s <= 1) return { s, label: 'Weak', color: 'text-red-500' }
  if (s <= 3) return { s, label: 'Fair', color: 'text-yellow-500' }
  return { s, label: 'Strong', color: 'text-green-600' }
}

function AuthModal({ mode, onClose, onSwitch, onEnter }) {
  const isSignup = mode === 'signup'
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [showPw, setShowPw] = useState(false)
  const [err, setErr] = useState('')
  const st = pwStrength(form.password)
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }))

  const submit = (e) => {
    e.preventDefault(); setErr('')
    if (isSignup) {
      if (!form.name.trim() || !form.email.trim()) return setErr('Name and email are required.')
      if (form.password.length < 8) return setErr('Password must be at least 8 characters.')
      localStorage.setItem('reading_user', JSON.stringify({ name: form.name, email: form.email, password: btoa(form.password) }))
      onEnter()
    } else {
      const u = JSON.parse(localStorage.getItem('reading_user') || 'null')
      if (!u) return setErr('No account found. Please sign up first.')
      const id = form.email.trim().toLowerCase()
      if (id !== (u.email || '').toLowerCase() && id !== (u.name || '').toLowerCase()) return setErr('Account not found.')
      if (u.password && atob(u.password) !== form.password) return setErr('Wrong password.')
      onEnter()
    }
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between px-6 py-5" style={{ background: '#E85D04', color: '#fff' }}>
          <div>
            <h2 className="text-xl font-bold m-0">{isSignup ? 'Create your account' : 'Welcome back'}</h2>
            <p className="text-sm opacity-90 mt-1">{isSignup ? 'Start building reading activities' : 'Log in to continue'}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white">✕</button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 flex flex-col gap-3.5">
          {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>}
          {isSignup && (
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Full Name</label>
              <input className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-orange-400" value={form.name} onChange={set('name')} placeholder="Your name" />
            </div>
          )}
          <div>
            <label className="text-xs font-bold text-gray-600 block mb-1">{isSignup ? 'Email' : 'Email or Name'}</label>
            <input className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-orange-400" value={form.email} onChange={set('email')} placeholder={isSignup ? 'you@school.edu' : 'email or name'} />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-600 block mb-1">Password</label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} className="w-full px-3 py-2.5 pr-10 border border-gray-200 rounded-lg text-sm outline-none focus:border-orange-400" value={form.password} onChange={set('password')} placeholder={isSignup ? 'At least 8 characters' : 'Your password'} />
              <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm">{showPw ? '🙈' : '👁️'}</button>
            </div>
            {isSignup && form.password && (
              <div className="mt-2">
                <div className="flex gap-1">{[1,2,3,4,5].map((b) => <div key={b} className={`flex-1 h-1 rounded-full ${b <= st.s ? (st.s <= 1 ? 'bg-red-500' : st.s <= 3 ? 'bg-yellow-400' : 'bg-green-500') : 'bg-gray-200'}`} />)}</div>
                <span className={`text-xs font-bold ${st.color}`}>{st.label}</span>
              </div>
            )}
          </div>
          <button type="submit" className="mt-1 py-3 rounded-xl text-white font-bold text-sm shadow" style={{ background: '#E85D04' }}>{isSignup ? 'Create Account' : 'Log In'}</button>
          <p className="text-center text-sm text-gray-500 m-0">
            {isSignup ? 'Already have an account? ' : "Don't have an account? "}
            <button type="button" onClick={onSwitch} className="font-bold" style={{ color: '#E85D04' }}>{isSignup ? 'Log In' : 'Sign Up'}</button>
          </p>
        </form>
      </div>
    </div>
  )
}

export default function Landing({ onEnter }) {
  const [auth, setAuth] = useState(null)

  // Hero image — fresh AI-generated Pixar-style cartoon on every visit.
  // Flow: frontend → backend /api/hero-image (the Pollinations secret key
  // lives in POLLINATIONS_API_KEY on the server, never reaches the browser).
  // Backend proxies to Pollinations with a seed, returns the JPEG.
  //
  // Each page load picks a fresh random seed → fresh image. No rotation
  // (controls cost — one Pollinations call per visit ~ $0.001, vs $0.06
  // per session at 12-rotations/min).
  const [heroSeed] = useState(() => Math.floor(Math.random() * 999999))
  const heroUrl = `/api/hero-image?seed=${heroSeed}`

  return (
    <div className="min-h-screen bg-orange-50/50">
      <header className="flex items-center justify-between px-[6vw] py-4 border-b border-orange-100 bg-white">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-xl" style={{ background: '#E85D04' }}>📖</div>
          <span className="text-xl font-extrabold">Reading <span style={{ color: '#E85D04' }}>Comprehension</span></span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setAuth('login')} className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 font-bold text-sm hover:bg-gray-50">Log In</button>
          <button onClick={() => setAuth('signup')} className="px-5 py-2 rounded-lg text-white font-bold text-sm shadow" style={{ background: '#E85D04' }}>Sign Up Free</button>
        </div>
      </header>

      <section className="px-[6vw] py-16 max-w-6xl mx-auto flex flex-col md:flex-row items-center gap-10">
        <div className="flex-1 min-w-0 text-center md:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold mb-5" style={{ background: '#FDE3CC', color: '#E85D04' }}>
            <span className="w-2 h-2 rounded-full" style={{ background: '#E85D04' }} /> Reading Activity Generator · K–12
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold leading-tight mb-4">
            Build reading comprehension<br />
            <span style={{ color: '#E85D04' }}>in seconds.</span>
          </h1>
          <p className="text-base md:text-lg text-gray-600 max-w-xl md:mx-0 mx-auto mb-7 leading-relaxed">
            Generate complete reading activities — passages, before-you-read questions, text-dependent questions, vocabulary and annotation guides — perfectly calibrated to your students' grade level.
          </p>
          <div className="flex gap-3.5 justify-center md:justify-start flex-wrap">
            <button onClick={() => setAuth('signup')} className="px-7 py-3.5 rounded-xl text-white font-bold text-base shadow-lg" style={{ background: '#E85D04' }}>Get Started Free →</button>
            <button onClick={onEnter} className="px-7 py-3.5 rounded-xl border border-gray-200 bg-white text-gray-700 font-bold text-base">Try it now</button>
          </div>
        </div>
        <div className="flex-1 flex justify-center min-w-0">
          <div
            className="w-full max-w-md rounded-2xl shadow-xl overflow-hidden"
            style={{ aspectRatio: '1 / 1', background: 'linear-gradient(135deg, #FDE3CC, #fff7ee)' }}
          >
            <img
              src={heroUrl}
              alt="Reading comprehension"
              onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
              className="w-full h-full object-cover transition-opacity duration-300"
            />
          </div>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-[6vw] pb-14">
        <h2 className="text-center text-2xl font-extrabold mb-8">Everything teachers need</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-3" style={{ background: '#FDE3CC' }}>{f.icon}</div>
              <h3 className="text-lg font-bold mb-1.5">{f.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed m-0">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-gray-100 py-6 px-[6vw] text-center text-xs text-gray-500">
        <div className="inline-flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500" /> Powered by Codevidhya</div>
        <div className="mt-1.5">© 2025 Reading Comprehension</div>
      </footer>

      {auth && <AuthModal mode={auth} onClose={() => setAuth(null)} onSwitch={() => setAuth((m) => (m === 'signup' ? 'login' : 'signup'))} onEnter={onEnter} />}
    </div>
  )
}
