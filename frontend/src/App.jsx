import { useState } from 'react'
import HomePage from './pages/HomePage'
import FormPage from './pages/FormPage'
import ResultPage from './pages/ResultPage'
import Landing from './Landing'

const API = import.meta.env.DEV ? '' : ''

// Block only graphically explicit / abusive vocabulary. Each entry is a regex
// fragment that will be wrapped in word boundaries (\b...\b), so "ass" won't
// match "class/assassinate/embassy" and "kill" won't match "skill/skilled".
// Terms that have legit educational uses (violence in history, alcohol in
// chemistry, weapons in history, breast in biology, drug in pharmacology)
// are deliberately omitted — teachers should be able to build worksheets
// around those topics. The model itself rejects truly graphic asks at
// generation time as a second line of defence.
const BLOCKED_PATTERNS = [
  // Sexually explicit
  'porn(?:o|ography)?', 'pornographic', 'nude', 'nudity', 'naked',
  'masturbat\\w*', 'orgasm\\w*', 'erotic\\w*', 'fetish\\w*',
  'genitals?', 'vagina', 'penis', 'anal\\s+sex', 'oral\\s+sex',
  'sex\\s+(?:act|scene|tape|video|position)',
  // Abuse / non-consent
  'rape', 'raping', 'molest\\w*', 'pedophil\\w*', 'incest',
  'child\\s+(?:porn|abuse|sex)',
  'sexual\\s+(?:abuse|assault|harassment)',
  // Slurs / explicit profanity
  'fuck\\w*', 'shit\\w*', 'bitch\\w*', 'bastard\\w*',
  'cunt\\w*', 'dick\\w*', 'cock\\w*', 'pussy', 'whore', 'slut',
]

const BLOCKED_REGEX = new RegExp('\\b(?:' + BLOCKED_PATTERNS.join('|') + ')\\b', 'i')

const containsBlockedContent = (text = '') => BLOCKED_REGEX.test(text)

export default function App() {
  const [view, setView] = useState(() => localStorage.getItem('reading_seen_landing') ? 'home' : 'landing')
  const [sessionId, setSessionId] = useState(null)
  const [comprehension, setComprehension] = useState(null)
  const [formData, setFormData] = useState({})
  const [prefillData, setPrefillData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [streamStatus, setStreamStatus] = useState('')
  const [tabs, setTabs] = useState([])

  const ensureSession = async () => {
    if (sessionId) return sessionId
    const res = await fetch(`${API}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })
    const data = await res.json()
    setSessionId(data.session_id)
    return data.session_id
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
        <Landing onEnter={() => { localStorage.setItem('reading_seen_landing', '1'); setView('home') }} />
      )}
      {view === 'home' && <HomePage onStart={() => setView('form')} />}
      {view === 'form' && (
        <FormPage
          onGenerate={handleGenerate}
          onBack={() => setView('home')}
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
            if (newTabs.length === 0) setView('home')
          }}
          api={API}
        />
      )}
    </div>
  )
}
