import { useState, useRef } from 'react'
import FormPage from './pages/FormPage'
import ResultPage from './pages/ResultPage'
import Landing from './Landing'

const API = import.meta.env.DEV ? '' : ''

// Filter only the most egregious intent-to-generate-porn / CSAM / slurs.
// Earlier versions also blocked "sexual harassment", "child abuse", "rape",
// "nude", "vagina", "penis" — all of which are legitimate academic topics
// (law / women's safety education / anatomy / consent curriculum). The
// model's own safety rails reject genuinely-bad asks at generation time;
// this filter only catches obvious abuse so we don't burn Groq tokens
// processing them.
const BLOCKED_PATTERNS = [
  // Obvious porn-generation intent
  'porn(?:o|ography)?', 'pornographic',
  'masturbat\\w*', 'orgasm\\w*', 'erotic\\w*', 'fetish\\w*',
  'anal\\s+sex', 'oral\\s+sex',
  'sex\\s+(?:act|scene|tape|video|position|story|stories|fantasy)',
  // CSAM
  'child\\s+porn', 'pedophil\\w*', 'incest',
  // Explicit slurs and profanity in clear classroom-inappropriate form
  'fuck\\w*', 'cunt\\w*', 'pussy', 'whore', 'slut',
]

const BLOCKED_REGEX = new RegExp('\\b(?:' + BLOCKED_PATTERNS.join('|') + ')\\b', 'i')

const containsBlockedContent = (text = '') => BLOCKED_REGEX.test(text)

export default function App() {
  // Every visit starts on the Landing page. The user can then Sign Up,
  // Log In, or click "Try it now" to enter the Form. Even returning
  // logged-in users see the Landing first — they pass straight through
  // by clicking any of the three buttons, but the marketing/branding
  // page is always the entry point.
  const [view, setView] = useState('landing')
  const [sessionId, setSessionId] = useState(null)
  const [comprehension, setComprehension] = useState(null)
  const [formData, setFormData] = useState({})
  const [prefillData, setPrefillData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [streamStatus, setStreamStatus] = useState('')
  const [tabs, setTabs] = useState([])
  // A pending /api/sessions promise — guards against double-create when the
  // user mashes the Generate button. Without this, two parallel handleGenerate
  // calls each see sessionId === null (React state hasn't flushed between
  // them), both POST /api/sessions, and only one session id survives in
  // state — the other session's row is orphaned and any saved work under
  // it never appears in the History panel.
  const sessionPromiseRef = useRef(null)

  const ensureSession = async () => {
    if (sessionId) return sessionId
    if (sessionPromiseRef.current) return sessionPromiseRef.current
    sessionPromiseRef.current = (async () => {
      try {
        const res = await fetch(`${API}/api/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        })
        const data = await res.json()
        setSessionId(data.session_id)
        return data.session_id
      } finally {
        sessionPromiseRef.current = null
      }
    })()
    return sessionPromiseRef.current
  }

  const handleGenerate = async (data) => {
    if (containsBlockedContent(data.topic) || containsBlockedContent(data.learning_objective)) {
      setError('⚠️ Inappropriate content detected. Please enter an educational topic suitable for classroom use.')
      return
    }
    setLoading(true)
    setError(null)
    setStreamStatus('')
    setFormData(data)
    try {
      const sid = await ensureSession()
      const res = await fetch(`${API}/api/reading/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, session_id: sid })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Generation failed')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let evt
          try { evt = JSON.parse(line.slice(6)) } catch { continue }

          if (evt.type === 'progress' || evt.type === 'status') {
            setStreamStatus(evt.message)
          } else if (evt.type === 'retry') {
            setStreamStatus(`Retrying (attempt ${evt.attempt})…`)
          } else if (evt.type === 'complete') {
            setComprehension(evt.comprehension)
            setTabs(prev => {
              const label = `${data.topic} Reading Compr...`
              if (prev.find(t => t.label === label)) return prev
              return [...prev, { label, id: evt.comprehension_id }]
            })
            setView('result')
          } else if (evt.type === 'error') {
            throw new Error(evt.message)
          }
        }
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
      setStreamStatus('')
    }
  }

  return (
    <div className="min-h-screen" style={{ background: '#FAF9F7', fontFamily: 'Inter, sans-serif' }}>
      {view === 'landing' && (
        <Landing onEnter={() => setView('form')} />
      )}
      {view === 'form' && (
        <FormPage
          onGenerate={handleGenerate}
          onBack={() => setView('landing')}
          loading={loading}
          error={error}
          prefillData={prefillData}
        />
      )}
      {view === 'result' && comprehension && (
        <ResultPage
          comprehension={comprehension}
          formData={formData}
          tabs={tabs}
          onNewTab={() => { setPrefillData(null); setView('form') }}
          onAdapt={(data) => { setPrefillData(data); setView('form') }}
          onRemix={(data) => handleGenerate(data)}
          onLoadFromHistory={(item) => {
            setComprehension(item.content)
            setFormData({
              topic: item.topic,
              grade_level: item.grade_level,
              learning_objective: item.learning_objective,
            })
            setTabs(prev => {
              const label = `${item.topic} Reading Compr...`
              if (prev.find(t => t.label === label)) return prev
              return [...prev, { label, id: item.id }]
            })
          }}
          onCloseTab={(idx) => {
            const newTabs = tabs.filter((_, i) => i !== idx)
            setTabs(newTabs)
            if (newTabs.length === 0) setView('form')
          }}
          api={API}
        />
      )}
    </div>
  )
}
