import { useRef, useState } from 'react'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import Sidebar from '../components/Sidebar'
import ExportDropdown from '../components/ExportDropdown'

export default function ResultPage({ comprehension, formData, tabs, onNewTab, onCloseTab, onAdapt, onRemix, onLoadFromHistory, api }) {
  const [showAnswers, setShowAnswers] = useState(false)
  const [activeSidebar, setActiveSidebar] = useState(null)
  const [toast, setToast] = useState(null)
  const [history, setHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [showAllHistory, setShowAllHistory] = useState(false)
  const [loadingAnswer, setLoadingAnswer] = useState(null)
  const contentRef = useRef(null)
  const tdqRefs = useRef({})

  const formatDate = (iso) => {
    try {
      const d = new Date(iso)
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
        ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    } catch { return iso }
  }

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const handleCompleteAnswer = async (idx, q) => {
    setLoadingAnswer(idx)
    try {
      const res = await fetch(`${api}/api/reading/complete-answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q.question,
          passage_text: comp.passage?.text || '',
          grade_level: formData.grade_level,
          question_type: q.type,
          answer_hint: q.answer_hint,
        }),
      })
      const data = await res.json()
      if (data.answer && tdqRefs.current[idx]) {
        tdqRefs.current[idx].textContent = data.answer
      }
    } catch {
      showToast('Failed to generate answer. Please try again.')
    } finally {
      setLoadingAnswer(null)
    }
  }

  const handleSidebarAction = (label) => {
    if (label === 'Create') {
      onNewTab()
      setActiveSidebar(null)
      setShowHistory(false)
      return
    }
    if (label === 'Adapt') {
      onAdapt?.(formData)
      setActiveSidebar(null)
      setShowHistory(false)
      return
    }
    if (label === 'Remix') {
      onRemix?.(formData)
      setActiveSidebar(null)
      setShowHistory(false)
      return
    }
    if (label === 'Evaluate') {
      setShowAnswers(a => !a)
      setActiveSidebar(prev => prev === 'Evaluate' ? null : 'Evaluate')
      setShowHistory(false)
      return
    }
    if (label === 'Images') {
      showToast('AI image generation coming soon!')
      setActiveSidebar(null)
      return
    }
    if (label === 'History') {
      const next = !showHistory
      setShowHistory(next)
      setActiveSidebar(next ? 'History' : null)
      setShowAllHistory(false)
      if (next) {
        fetch(`${api}/api/comprehensions?limit=50`)
          .then(r => r.json())
          .then(d => setHistory(d.comprehensions || []))
          .catch(() => setHistory([]))
      }
      return
    }
  }

  const GRADE_WORD_LIMITS = {
    1: 5, 2: 8, 3: 12, 4: 15, 5: 20,
    6: 25, 7: 35, 8: 45, 9: 55, 10: 70, 11: 85, 12: 100,
  }
  const wordLimit = GRADE_WORD_LIMITS[formData.grade_level] || 35

  const comp = comprehension || {}
  const byr = comp.before_you_read || {}
  const ag = comp.annotation_guide || {}
  const passage = comp.passage || {}
  const tdq = comp.text_dependent_questions || {}
  const vic = comp.vocabulary_in_context || {}

  const handleCopy = () => {
    const text = contentRef.current?.innerText || ''
    navigator.clipboard.writeText(text)
    alert('Copied to clipboard!')
  }

  const handlePdf = async () => {
    const element = contentRef.current
    if (!element) return
    const canvas = await html2canvas(element, { scale: 2, useCORS: true })
    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF('p', 'mm', 'a4')
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const imgHeight = (canvas.height * pageWidth) / canvas.width
    let y = 0
    while (y < imgHeight) {
      pdf.addImage(imgData, 'PNG', 0, -y, pageWidth, imgHeight)
      if (y + pageHeight < imgHeight) pdf.addPage()
      y += pageHeight
    }
    pdf.save(`reading_${formData.topic || 'comprehension'}.pdf`)
  }

  const handleDocx = async () => {
    const res = await fetch(`${api}/api/reading/export/docx`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comprehension: comp, ...formData })
    })
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reading_${formData.topic || 'comprehension'}.docx`
    a.click()
  }

  const handleGoogleDrive = () => alert('Connect Google Drive coming soon!')

  return (
    <div className="flex flex-col h-screen" style={{ background: '#FAF9F7' }}>

      {/* Tab bar + Export — matches Screenshot 4 */}
      <div className="bg-white border-b border-gray-200 flex items-center px-4 gap-2" style={{ minHeight: 44 }}>
        <div className="flex items-center gap-0 flex-1 overflow-x-auto">
          {tabs.map((tab, idx) => (
            <div
              key={tab.id || idx}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium cursor-pointer border-b-2 transition-all whitespace-nowrap ${
                idx === 0
                  ? 'border-orange-500 text-gray-900'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              <span className="max-w-[200px] truncate">{tab.label}</span>
              <button
                onClick={() => onCloseTab(idx)}
                className="text-gray-300 hover:text-gray-500 leading-none"
              >
                ×
              </button>
            </div>
          ))}
          <button onClick={onNewTab} className="px-3 py-2 text-gray-300 hover:text-gray-600 text-sm">+</button>
        </div>

        <ExportDropdown
          onCopy={handleCopy}
          onPdf={handlePdf}
          onDocx={handleDocx}
          onGoogleDrive={handleGoogleDrive}
        />
      </div>

      {/* Toolbar */}
      <div className="bg-white border-b border-gray-100 flex items-center gap-0.5 px-4 py-1 text-gray-500 text-xs">
        {/* Undo / Redo */}
        <button title="Undo" onClick={() => document.execCommand('undo')} className="p-1.5 rounded hover:bg-gray-100 transition-colors">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 7H11a3 3 0 0 1 0 6H8"/><polyline points="6,4 3,7 6,10"/></svg>
        </button>
        <button title="Redo" onClick={() => document.execCommand('redo')} className="p-1.5 rounded hover:bg-gray-100 transition-colors">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M13 7H5a3 3 0 0 0 0 6h3"/><polyline points="10,4 13,7 10,10"/></svg>
        </button>

        <span className="w-px h-4 bg-gray-200 mx-1"/>

        {/* Formatting */}
        <button title="Bold" onClick={() => document.execCommand('bold')} className="px-1.5 py-1 rounded hover:bg-gray-100 transition-colors font-bold text-sm">B</button>
        <button title="Italic" onClick={() => document.execCommand('italic')} className="px-1.5 py-1 rounded hover:bg-gray-100 transition-colors italic text-sm">I</button>
        <button title="Underline" onClick={() => document.execCommand('underline')} className="px-1.5 py-1 rounded hover:bg-gray-100 transition-colors underline text-sm">U</button>
        <button title="Strikethrough" onClick={() => document.execCommand('strikeThrough')} className="px-1.5 py-1 rounded hover:bg-gray-100 transition-colors line-through text-sm">S</button>

        <span className="w-px h-4 bg-gray-200 mx-1"/>

        {/* Alignment — each icon shows distinct line pattern */}
        <button title="Align Left" onClick={() => document.execCommand('justifyLeft')} className="p-1.5 rounded hover:bg-gray-100 transition-colors">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
            <rect x="1" y="3" width="14" height="1.5" rx="0.75"/><rect x="1" y="7" width="9" height="1.5" rx="0.75"/><rect x="1" y="11" width="11" height="1.5" rx="0.75"/>
          </svg>
        </button>
        <button title="Align Center" onClick={() => document.execCommand('justifyCenter')} className="p-1.5 rounded hover:bg-gray-100 transition-colors">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
            <rect x="1" y="3" width="14" height="1.5" rx="0.75"/><rect x="3.5" y="7" width="9" height="1.5" rx="0.75"/><rect x="2.5" y="11" width="11" height="1.5" rx="0.75"/>
          </svg>
        </button>
        <button title="Align Right" onClick={() => document.execCommand('justifyRight')} className="p-1.5 rounded hover:bg-gray-100 transition-colors">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
            <rect x="1" y="3" width="14" height="1.5" rx="0.75"/><rect x="6" y="7" width="9" height="1.5" rx="0.75"/><rect x="4" y="11" width="11" height="1.5" rx="0.75"/>
          </svg>
        </button>
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => setShowAnswers(a => !a)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
              showAnswers
                ? 'border-orange-300 text-orange-600 bg-orange-50'
                : 'border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            📋 {showAnswers ? 'Student View' : 'Answer Sheet'}
          </button>
          <span className="text-gray-300">
            {passage.word_count ? `${passage.word_count} words` : ''}
          </span>
          {comp.rag_context_used && (
            <span className="px-2 py-0.5 rounded-full text-purple-600 bg-purple-50 font-medium">🧠 RAG</span>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 bg-gray-900 text-white text-sm rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar onAction={handleSidebarAction} activeAction={activeSidebar} />

        {/* History panel */}
        {showHistory && (
          <div className="w-72 border-r border-gray-200 bg-white flex flex-col flex-shrink-0" style={{ maxHeight: '100%' }}>
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <span className="text-sm font-semibold text-gray-800">
                {showAllHistory ? 'All History' : 'Recent (Last 7)'}
              </span>
              <button onClick={() => { setShowHistory(false); setActiveSidebar(null) }}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            </div>
            <div className="overflow-y-auto flex-1">
              {history.length === 0
                ? <p className="px-4 py-6 text-xs text-gray-400 text-center">No comprehensions generated yet.</p>
                : (showAllHistory ? history : history.slice(0, 7)).map((item, i) => (
                  <button
                    key={item.id || i}
                    onClick={() => { onLoadFromHistory?.(item); setShowHistory(false); setActiveSidebar(null) }}
                    className="w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-orange-50 transition-colors group"
                  >
                    <p className="text-xs font-semibold text-gray-800 truncate group-hover:text-orange-700">{item.topic || 'Untitled'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Grade {item.grade_level} · {formatDate(item.created_at)}</p>
                  </button>
                ))
              }
            </div>
            {history.length > 0 && (
              <div className="px-4 py-2 border-t border-gray-100 flex-shrink-0">
                <button onClick={() => setShowAllHistory(a => !a)} className="text-xs text-orange-600 hover:text-orange-700 font-medium w-full text-center">
                  {showAllHistory ? '↑ Show last 7 only' : `↓ View all ${history.length} comprehensions`}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-8 py-8">
          <div className="max-w-3xl mx-auto">
            <div
              key={showAnswers}
              ref={contentRef}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 min-h-[800px]"
            >
              {/* Title — matches Screenshot 4 "How Rain Happens" */}
              <h1 className="text-2xl font-bold text-gray-900 mb-6">
                {passage.title || formData.topic}
              </h1>

              {/* Before You Read */}
              {byr.questions && (
                <div className="mb-6">
                  <h2 className="text-base font-bold text-gray-800 mb-2 pb-1 border-b border-gray-200">
                    {byr.title || 'Before You Read'}
                  </h2>
                  <p className="text-sm text-gray-500 mb-3">{byr.instructions}</p>
                  {byr.questions.map((q, i) => (
                    <div key={i} className="mb-3">
                      <p className="text-sm text-gray-700">{q.question}</p>
                      <div className="mt-2">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-50 border border-orange-200" style={{ color: '#E85D04' }}>
                          Word limit: up to {wordLimit} words
                        </span>
                        <div
                          contentEditable
                          suppressContentEditableWarning
                          className="min-h-[32px] mt-2 px-1 text-sm text-gray-800 border-b-2 border-dashed border-gray-300 focus:outline-none focus:border-orange-400"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Annotation Guide — matches Screenshot 4 bullet list */}
              {ag.symbols && (
                <div className="mb-6">
                  <h2 className="text-base font-bold text-gray-800 mb-2 pb-1 border-b border-gray-200">
                    {ag.title || 'Annotation Guide'}
                  </h2>
                  <p className="text-sm text-gray-500 mb-3">{ag.instructions}</p>
                  <ul className="space-y-1.5">
                    {ag.symbols.map((s, i) => {
                      const SYMBOL_MAP = { '⭐': '★', '→': '→', 'circle': '○', '?': '?', '!': '!' }
                      const sym = SYMBOL_MAP[s.symbol] || s.symbol
                      return (
                      <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                        <span className="font-bold text-gray-900 min-w-[18px]">{sym}</span>
                        <span>{s.meaning}</span>
                      </li>
                      )
                    })}
                  </ul>
                  <p className="text-sm text-gray-500 mt-3 italic">
                    Read the passage twice. On your first read, follow the Annotation Guide above. On your second read, answer the questions on the next page.
                  </p>
                </div>
              )}

              {/* Passage */}
              {passage.text && (
                <div className="mb-6">
                  <h2 className="text-base font-bold text-gray-800 mb-3 pb-1 border-b border-gray-200">
                    Reading Passage
                  </h2>
                  <div className="space-y-3">
                    {passage.text.split('\n\n').filter(p => p.trim()).map((para, i) => (
                      <p key={i} className="text-sm text-gray-700 leading-relaxed">{para.trim()}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Text-Dependent Questions */}
              {tdq.questions && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2 pb-1 border-b border-gray-200">
                    <h2 className="text-base font-bold text-gray-800">
                      {tdq.title || 'Text-Dependent Questions'}
                    </h2>
                    {showAnswers && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-600">
                        Answer Key
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mb-3">{tdq.instructions}</p>
                  <ol className="space-y-4">
                    {tdq.questions.map((q, i) => (
                      <li key={i}>
                        <div className="flex items-start gap-2">
                          <span className="text-sm font-semibold text-gray-400 shrink-0">{q.number}.</span>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-800">{q.question}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              💡 {q.answer_hint} ·
                              <span className={`ml-1 px-1.5 py-0.5 rounded text-xs font-medium ${
                                q.type === 'literal' ? 'bg-green-100 text-green-700' :
                                q.type === 'inferential' ? 'bg-blue-100 text-blue-700' :
                                'bg-purple-100 text-purple-700'
                              }`}>{q.type}</span>
                            </p>
                            {showAnswers && q.answer_hint && (
                              <div className="mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                                <p className="text-xs font-semibold text-amber-700 mb-0.5">Suggested Answer:</p>
                                <p className="text-xs text-amber-800">{q.answer_hint}</p>
                              </div>
                            )}
                            {!showAnswers && (
                              <div className="mt-2">
                                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-50 border border-orange-200" style={{ color: '#E85D04' }}>
                                  Word limit: up to {wordLimit} words
                                </span>
                                <div
                                  ref={el => { tdqRefs.current[i] = el }}
                                  contentEditable
                                  suppressContentEditableWarning
                                  className="min-h-[32px] mt-2 px-1 text-sm text-gray-800 border-b-2 border-dashed border-gray-300 focus:outline-none focus:border-orange-400"
                                />
                                <button
                                  onClick={() => handleCompleteAnswer(i, q)}
                                  disabled={loadingAnswer === i}
                                  className="mt-2 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-orange-200 text-orange-600 hover:bg-orange-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                  {loadingAnswer === i ? (
                                    <>
                                      <span className="inline-block w-3 h-3 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                                      Generating answer...
                                    </>
                                  ) : '✨ Complete Answer'}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Vocabulary in Context */}
              {vic.items && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2 pb-1 border-b border-gray-200">
                    <h2 className="text-base font-bold text-gray-800">
                      {vic.title || 'Vocabulary in Context'}
                    </h2>
                    {showAnswers && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-600">
                        Answer Key
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mb-3">{vic.instructions}</p>
                  <ol className="space-y-5">
                    {vic.items.map((item, i) => (
                      <li key={i} className="border border-gray-100 rounded-lg p-4">
                        <p className="text-sm font-bold" style={{ color: '#E85D04' }}>
                          {i + 1}. "{item.word}"
                        </p>
                        <p className="text-xs text-gray-400 mt-1 italic">
                          From the text: "{item.sentence_from_passage}"
                        </p>
                        <p className="text-sm text-gray-700 mt-2">{item.activity}</p>
                        {showAnswers && item.answer && (
                          <div className="mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                            <p className="text-xs font-semibold text-amber-700 mb-0.5">Answer:</p>
                            <p className="text-xs text-amber-800">{item.answer}</p>
                          </div>
                        )}
                        {!showAnswers && (
                          <div className="mt-2">
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-50 border border-orange-200" style={{ color: '#E85D04' }}>
                              Word limit: up to {wordLimit} words
                            </span>
                            <div
                              contentEditable
                              suppressContentEditableWarning
                              className="min-h-[32px] mt-2 px-1 text-sm text-gray-800 border-b-2 border-dashed border-gray-300 focus:outline-none focus:border-orange-400"
                            />
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
