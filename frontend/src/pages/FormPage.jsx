import { useState, useEffect, useRef } from 'react'

const GRADE_LEVELS = [
  '1st Grade Students', '2nd Grade Students', '3rd Grade Students', '4th Grade Students', '5th Grade Students',
  '6th Grade Students', '7th Grade Students', '8th Grade Students',
  '9th Grade Students', '10th Grade Students', '11th Grade Students', '12th Grade Students'
]

const GRADE_MAP = {
  '1st Grade Students': 1, '2nd Grade Students': 2,
  '3rd Grade Students': 3, '4th Grade Students': 4, '5th Grade Students': 5,
  '6th Grade Students': 6, '7th Grade Students': 7, '8th Grade Students': 8,
  '9th Grade Students': 9, '10th Grade Students': 10, '11th Grade Students': 11, '12th Grade Students': 12
}

// Resolve a grade value (string label, plain number, or "1st Grade Students")
// to its integer 1-12. Returns null if it can't be determined.
function resolveGradeNum(g) {
  if (typeof g === 'number' && g >= 1 && g <= 12) return g
  if (GRADE_MAP[g]) return GRADE_MAP[g]
  const m = String(g || '').match(/\d+/)
  const n = m ? parseInt(m[0], 10) : null
  return n && n >= 1 && n <= 12 ? n : null
}

// Convert a stored grade value back to its dropdown label so the <select> shows it
function gradeToLabel(g) {
  const n = resolveGradeNum(g)
  return n ? GRADE_LEVELS[n - 1] : ''
}

const CONTENT_FLAGS = [
  { pattern: /https?:\/\//i,                                   label: 'URLs or links' },
  { pattern: /www\.[a-z]/i,                                    label: 'URLs or links' },
  { pattern: /\.(com|net|org|io|co|xyz)\b/i,                   label: 'URLs or links' },
  { pattern: /\b(porn|pornography|xxx|onlyfans)\b/i,           label: 'adult/pornographic content' },
  { pattern: /\b(nude|nudity|naked|topless)\b/i,               label: 'adult content' },
  { pattern: /\b(fuck|fucking|fucker|f+u+c+k)\b/i,            label: 'profanity' },
  { pattern: /\b(shit|bullshit|crap)\b/i,                      label: 'profanity' },
  { pattern: /\b(bitch|asshole|bastard|damn\s+you)\b/i,        label: 'abusive language' },
  { pattern: /\b(nigger|nigga|faggot|slut|whore|c+u+n+t)\b/i, label: 'hate speech' },
  { pattern: /\b(kill\s+yourself|kys|go\s+die)\b/i,            label: 'harmful content' },
  { pattern: /\b(rape|molest|abuse\s+child)\b/i,               label: 'harmful content' },
  { pattern: /\b(drug\s+deal|buy\s+drugs|cocaine|heroin|meth)\b/i, label: 'illegal content' },
  { pattern: /\b(hack|hacking|phishing|malware)\b/i,           label: 'illegal content' },
]

function checkContent(text) {
  for (const { pattern, label } of CONTENT_FLAGS) {
    if (pattern.test(text)) return label
  }
  return null
}

export default function FormPage({ onGenerate, onBack, loading, error, prefillData }) {
  const [objective, setObjective] = useState(prefillData?.learning_objective || '')
  const [topic, setTopic] = useState(prefillData?.topic || '')
  const [grade, setGrade] = useState(gradeToLabel(prefillData?.grade_level))
  const [activeTab, setActiveTab] = useState(null)
  const [additionalContext, setAdditionalContext] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [standardsText, setStandardsText] = useState('')
  const [fileStatus, setFileStatus] = useState('')
  const [blockedMsg, setBlockedMsg] = useState(null)
  const [listeningFor, setListeningFor] = useState(null)
  const dismissTimer = useRef(null)
  const recognitionRef = useRef(null)

  useEffect(() => {
    return () => {
      clearTimeout(dismissTimer.current)
      recognitionRef.current?.stop()
    }
  }, [])

  const startVoice = (field) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      showBlocked('Voice input requires Chrome or Edge browser')
      return
    }
    if (listeningFor === field) {
      recognitionRef.current?.stop()
      return
    }
    recognitionRef.current?.stop()
    const r = new SR()
    recognitionRef.current = r
    r.continuous = true
    r.interimResults = false
    r.lang = 'en-US'
    r.onstart = () => setListeningFor(field)
    r.onresult = (e) => {
      const transcript = Array.from(e.results).map(x => x[0].transcript).join(' ')
      const flagged = checkContent(transcript)
      if (flagged) {
        r.stop()
        showBlocked(flagged)
        return
      }
      if (field === 'objective') setObjective(t => (t ? t + ' ' : '') + transcript)
      else setTopic(t => (t ? t + ' ' : '') + transcript.slice(0, 2000))
    }
    r.onend = () => setListeningFor(null)
    r.onerror = () => setListeningFor(null)
    r.start()
  }

  const MicBtn = ({ field }) => (
    <button
      type="button"
      onClick={() => startVoice(field)}
      title={listeningFor === field ? 'Stop recording' : 'Speak your input'}
      className={`flex items-center justify-center w-7 h-7 rounded-lg transition-all flex-shrink-0 ${
        listeningFor === field
          ? 'bg-red-100 text-red-500 animate-pulse'
          : 'bg-gray-100 text-gray-400 hover:bg-orange-50 hover:text-orange-500'
      }`}
    >
      {listeningFor === field ? (
        <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
          <rect x="5" y="5" width="10" height="10" rx="2"/>
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" width="13" height="13">
          <rect x="7" y="1" width="6" height="10" rx="3"/>
          <path d="M4 10a6 6 0 0 0 12 0"/>
          <line x1="10" y1="16" x2="10" y2="19"/>
          <line x1="7" y1="19" x2="13" y2="19"/>
        </svg>
      )}
    </button>
  )

  const showBlocked = (reason) => {
    setBlockedMsg(reason)
    clearTimeout(dismissTimer.current)
    dismissTimer.current = setTimeout(() => setBlockedMsg(null), 5000)
  }

  const hasContent = topic.length > 0 || objective.length > 0

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setFileStatus('Uploading…')
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await fetch('/api/rag/add-file', { method: 'POST', body: fd })
      const data = await res.json()
      setFileStatus(`✓ ${file.name} added (${data.chars_indexed} chars indexed)`)
      setAdditionalContext(`Reference file: ${file.name}`)
    } catch (err) {
      setFileStatus(`Upload failed: ${err.message}`)
    }
  }

  const handleGenerate = () => {
    if (!objective.trim() && !topic.trim()) return
    const flagged = checkContent(`${objective} ${topic} ${additionalContext}`)
    if (flagged) {
      showBlocked(flagged)
      return
    }
    const gradeNum = resolveGradeNum(grade)
    if (!gradeNum) {
      showBlocked('Please select a Reading Level (grade) before generating.')
      return
    }
    onGenerate({
      topic: topic.trim(),
      grade_level: gradeNum,
      learning_objective: objective.trim(),
      additional_context: additionalContext || undefined,
    })
  }

  const handleExemplar = () => {
    setObjective('Students will explore information to describe climates in different regions of the world.')
    setTopic('Example: Climates in different regions of the world (e.g., equatorial, polar, coastal, mid-continental).')
  }

  const handleEnhance = () => {
    if (!objective.trim() && !topic.trim()) return
    const enhanced = objective.trim()
      ? `${objective.trim()} Students will cite textual evidence and use context clues to determine word meanings.`
      : objective
    setObjective(enhanced)
  }

  const toggleTab = (tab) => setActiveTab(activeTab === tab ? null : tab)

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#FAF9F7' }}>

      {/* Content safety popup */}
      {blockedMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden">
            <div className="bg-red-600 px-6 py-4 flex items-center gap-3">
              <span className="text-white text-2xl">🚫</span>
              <p className="text-white font-bold text-base">Content Not Allowed</p>
            </div>
            <div className="px-6 py-5">
              <p className="text-gray-800 text-sm font-medium mb-1">
                This tool is for educational use only.
              </p>
              <p className="text-gray-600 text-sm">
                Your input contains <span className="font-semibold text-red-600">{blockedMsg}</span>, which is not permitted. Please remove it and try again.
              </p>
              <div className="mt-4 h-1 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-1 bg-red-500 rounded-full animate-[shrink_5s_linear_forwards]" style={{ animation: 'width 5s linear forwards', width: '100%' }} />
              </div>
              <p className="text-xs text-gray-400 mt-2 text-center">This message closes automatically in 5 seconds</p>
            </div>
          </div>
        </div>
      )}

      <div className="px-6 pt-5 pb-2">
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-gray-700 flex items-center gap-1">
          ← Back
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center px-4 pb-32">
        <div className="text-center mb-8 mt-4">
          <h1 className="text-3xl font-extrabold text-gray-900">
            Let's finalize your{' '}
            <span style={{ color: '#E85D04' }}>Reading Comprehension</span>.
          </h1>
          <p className="text-gray-400 text-sm mt-2">
            Add a learning objective, a topic, or both, plus any extra context to tailor your resource.
          </p>
        </div>

        <div className="w-full max-w-2xl space-y-3">

          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="mb-4">
              <label className="flex items-center gap-1 text-sm font-semibold text-gray-700 mb-1.5">
                Learning Objective
                <span className="text-gray-300 text-xs cursor-help" title="What students should be able to do">ⓘ</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={objective}
                  onChange={e => setObjective(e.target.value)}
                  placeholder="Students will explore information to describe climates in different regions of the world."
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 placeholder-gray-300 focus:outline-none focus:ring-2"
                  style={{ '--tw-ring-color': '#E85D04' }}
                />
                <MicBtn field="objective" />
              </div>
            </div>

            <div className="mb-4">
              <label className="flex items-center gap-1 text-sm font-semibold text-gray-700 mb-1.5">
                Topic or Main Idea
                <span className="text-gray-300 text-xs cursor-help" title="Topic of the reading passage">ⓘ</span>
              </label>
              <div className="border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2" style={{ '--tw-ring-color': '#E85D04' }}>
                <textarea
                  value={topic}
                  onChange={e => setTopic(e.target.value.slice(0, 2000))}
                  placeholder="Example: Climates in different regions of the world (e.g., equatorial, polar, coastal, mid-continental)."
                  rows={4}
                  className="w-full px-3 pt-2.5 text-sm text-gray-700 placeholder-gray-300 focus:outline-none resize-none"
                />
                <div className="flex items-center justify-between px-3 pb-2">
                  <MicBtn field="topic" />
                  <span className="text-xs text-gray-300">{topic.length}/2000</span>
                </div>
              </div>
            </div>

            {/* Tabs + actions */}
            <div className="flex items-center gap-2 flex-wrap">
              {['File', 'Website', 'YouTube', 'Standards'].map(tab => (
                <button
                  key={tab}
                  onClick={() => toggleTab(tab)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    activeTab === tab
                      ? 'border-orange-300 text-orange-600 bg-orange-50'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {tab === 'File' && '📄'}
                  {tab === 'Website' && '🌐'}
                  {tab === 'YouTube' && '▶️'}
                  {tab === 'Standards' && '📋'}
                  {tab}
                </button>
              ))}

              <div className="ml-auto flex items-center gap-2">
                {hasContent ? (
                  <button
                    onClick={() => { setObjective(''); setTopic(''); setActiveTab(null); setAdditionalContext('') }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-500 hover:bg-gray-50"
                  >
                    Clear All
                  </button>
                ) : !activeTab ? (
                  <button
                    onClick={handleExemplar}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                    style={{ background: '#E85D04' }}
                  >
                    Use Exemplar
                  </button>
                ) : null}
                <button
                  onClick={handleEnhance}
                  disabled={!hasContent}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
                >
                  ✦ Enhance
                </button>
              </div>
            </div>

            {/* Tab panels */}
            {activeTab === 'File' && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-xs text-gray-500 mb-2">Upload a PDF, DOCX, or TXT file to use as reference material for the passage.</p>
                <input
                  type="file"
                  accept=".pdf,.docx,.txt"
                  onChange={handleFileUpload}
                  className="text-xs text-gray-600"
                />
                {fileStatus && (
                  <p className="text-xs mt-2" style={{ color: fileStatus.startsWith('✓') ? '#16a34a' : '#E85D04' }}>
                    {fileStatus}
                  </p>
                )}
              </div>
            )}

            {activeTab === 'Website' && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-xs text-gray-500 mb-2">Add a website URL — the AI will use it as additional context when generating the passage.</p>
                <input
                  type="url"
                  value={websiteUrl}
                  onChange={e => {
                    setWebsiteUrl(e.target.value)
                    setAdditionalContext(e.target.value ? `Website reference: ${e.target.value}` : '')
                  }}
                  placeholder="https://example.com/article"
                  className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-1"
                  style={{ '--tw-ring-color': '#E85D04' }}
                />
              </div>
            )}

            {activeTab === 'YouTube' && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-xs text-gray-500 mb-2">Add a YouTube video URL to align the passage with video content.</p>
                <input
                  type="url"
                  value={youtubeUrl}
                  onChange={e => {
                    setYoutubeUrl(e.target.value)
                    setAdditionalContext(e.target.value ? `YouTube reference: ${e.target.value}` : '')
                  }}
                  placeholder="https://youtube.com/watch?v=..."
                  className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-1"
                  style={{ '--tw-ring-color': '#E85D04' }}
                />
              </div>
            )}

            {activeTab === 'Standards' && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-xs text-gray-500 mb-2">Enter curriculum standards to align this activity (e.g., Common Core, NGSS).</p>
                <textarea
                  value={standardsText}
                  onChange={e => {
                    setStandardsText(e.target.value)
                    setAdditionalContext(e.target.value ? `Curriculum standards: ${e.target.value}` : '')
                  }}
                  placeholder="e.g., CCSS.ELA-LITERACY.RI.7.1 — Cite several pieces of textual evidence to support analysis..."
                  rows={3}
                  className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-700 focus:outline-none resize-none focus:ring-1"
                  style={{ '--tw-ring-color': '#E85D04' }}
                />
              </div>
            )}
          </div>

          {/* Reading Level */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Reading Level</label>
            <div className="relative">
              <select
                value={grade}
                onChange={e => setGrade(e.target.value)}
                className={`w-full border rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none appearance-none pr-8 ${grade ? 'border-gray-200 text-gray-700' : 'border-orange-300 text-gray-400'}`}
              >
                <option value="" disabled>— Select Grade Level —</option>
                {GRADE_LEVELS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">⌃⌄</span>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Sticky bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-500 hover:bg-gray-50">
              ✦ Fast <span className="text-gray-300">∨</span>
            </button>
            <button
              onClick={handleGenerate}
              disabled={loading || (!objective.trim() && !topic.trim()) || !grade}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
              style={{ background: '#E85D04' }}
            >
              {loading ? (
                <>
                  <div className="spinner" />
                  Generating...
                </>
              ) : (
                <>Generate →</>
              )}
            </button>
          </div>
          {!loading && (
            <p className="text-center text-xs text-gray-400 mt-2">
              AI can make mistakes. Always review content before using in the classroom. ⓘ
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
