import { useState } from 'react'
import HomePage from './pages/HomePage'
import FormPage from './pages/FormPage'
import ResultPage from './pages/ResultPage'

const API = import.meta.env.DEV ? '' : ''

export default function App() {
  const [view, setView] = useState('home')
  const [sessionId, setSessionId] = useState(null)
  const [comprehension, setComprehension] = useState(null)
  const [formData, setFormData] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
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
    setLoading(true)
    setError(null)
    setFormData(data)
    try {
      const sid = await ensureSession()
      const res = await fetch(`${API}/api/reading/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, session_id: sid })
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.detail || 'Generation failed')
      setComprehension(result.comprehension)
      setTabs(prev => {
        const label = `${data.topic} Reading Compr...`
        if (prev.find(t => t.label === label)) return prev
        return [...prev, { label, id: result.comprehension_id }]
      })
      setView('result')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: '#FAF9F7', fontFamily: 'Inter, sans-serif' }}>
      {view === 'home' && <HomePage onStart={() => setView('form')} />}
      {view === 'form' && (
        <FormPage
          onGenerate={handleGenerate}
          onBack={() => setView('home')}
          loading={loading}
          error={error}
        />
      )}
      {view === 'result' && comprehension && (
        <ResultPage
          comprehension={comprehension}
          formData={formData}
          tabs={tabs}
          onNewTab={() => setView('form')}
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
