import { useRef, useState, useEffect } from 'react'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import DOMPurify from 'dompurify'
import Sidebar from '../components/Sidebar'
import ExportDropdown from '../components/ExportDropdown'
import EditorToolbar from '../components/EditorToolbar'
import HistoryPopup from '../components/HistoryPopup'

// Sanitize HTML before passing it to dangerouslySetInnerHTML. The HTML comes
// from contentEditable serialization that includes LLM-generated text — a
// poisoned source PDF/URL could prompt-inject the model into emitting an
// <img onerror=...> inside a passage; once a teacher hits Save, that HTML
// becomes savedHTML and is re-rendered on every subsequent view. DOMPurify
// strips any active script vectors so the HTML can't execute.
const sanitizeHTML = (html) => DOMPurify.sanitize(html || '', { USE_PROFILES: { html: true } })

export default function ResultPage({ comprehension, formData, tabs, onNewTab, onCloseTab, onAdapt, onRemix, onLoadFromHistory, api }) {
  const [showAnswers, setShowAnswers] = useState(false)
  const [activeSidebar, setActiveSidebar] = useState(null)
  const [isEditMode, setIsEditMode] = useState(false)
  const [editableHTML, setEditableHTML] = useState(null)
  const [savedHTML, setSavedHTML] = useState(null)
  const editableRef = useRef(null)
  const [toast, setToast] = useState(null)
  const [history, setHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [showAllHistory, setShowAllHistory] = useState(false)
  const [loadingAnswer, setLoadingAnswer] = useState(null)
  const [generatedAnswers, setGeneratedAnswers] = useState({})
  const contentRef = useRef(null)

  // When a different passage is loaded (from history or a new generation),
  // clear frozen edited HTML and reset to student view so the Answer Key
  // toggle works on the freshly-loaded content.
  useEffect(() => {
    setSavedHTML(null)
    setShowAnswers(false)
    setIsEditMode(false)
    setEditableHTML(null)
    setGeneratedAnswers({})
  }, [comprehension])

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
          word_limit: wordLimit,
          question_type: q.type,
          answer_hint: q.answer_hint,
        }),
      })
      const data = await res.json()
      if (data.answer) {
        setGeneratedAnswers(prev => ({ ...prev, [idx]: data.answer }))
      }
    } catch {
      showToast('Failed to generate answer. Please try again.')
    } finally {
      setLoadingAnswer(null)
    }
  }

  // Capture whatever is currently in the contentEditable div and commit it
  // as savedHTML. Called whenever the user exits edit mode by any path
  // (sidebar action, Answer Key toggle, etc.) so edits are never silently
  // lost. Without this auto-save, the only way to persist edits was the
  // toolbar's "✓ Done Editing" button — easy to miss.
  const autoSaveEdits = () => {
    const currentEdit = editableRef.current?.innerHTML
    if (currentEdit) setSavedHTML(currentEdit)
  }

  const handleSidebarAction = (label) => {
    // Any action other than toggling Edit must first leave edit mode, otherwise
    // the editable overlay stays on top and the action appears to do nothing.
    // AUTO-SAVE the current edits before exiting.
    if (label !== 'Edit' && isEditMode) {
      autoSaveEdits()
      setIsEditMode(false)
    }

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
    if (label === 'Edit') {
      if (!isEditMode) {
        setEditableHTML(contentRef.current?.innerHTML || '')
        setIsEditMode(true)
        setActiveSidebar('Edit')
        setTimeout(() => { editableRef.current?.focus() }, 80)
      } else {
        // Toggling Edit OFF — auto-save first so the user doesn't lose work
        autoSaveEdits()
        setIsEditMode(false)
        setActiveSidebar(null)
      }
      return
    }
    if (label === 'Evaluate') {
      // Toggle answer-key view WITHOUT destroying savedHTML. The render
      // below now prefers the dynamic JSX when showAnswers=true, and the
      // saved (edited) HTML when showAnswers=false — so the teacher's
      // edits survive a flip to the answer key and back.
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
      // History now opens in a centered popup (with per-item Word-like editor + downloads).
      setShowHistory(true)
      setActiveSidebar('History')
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

  const handleCopy = async () => {
    const text = contentRef.current?.innerText || ''
    try {
      // navigator.clipboard is undefined on non-HTTPS origins (e.g. http://
      // LAN deploys). Fall back to a hidden textarea + execCommand so the
      // button doesn't silently fail.
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
      } else {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.focus(); ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      alert('Copied to clipboard!')
    } catch {
      alert('Copy failed — please select and copy manually.')
    }
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
    try {
      const res = await fetch(`${api}/api/reading/export/docx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comprehension: comp, ...formData })
      })
      // Previously we always treated the response as a blob, so when the
      // backend errored (e.g. KeyError on a missing field → 500 with JSON
      // body), the user downloaded an .docx file containing the JSON error
      // — Word reported it as corrupt. Bail out on !res.ok with the message.
      if (!res.ok) {
        let detail = `Export failed (HTTP ${res.status})`
        try { const j = await res.json(); if (j?.detail) detail = j.detail } catch {}
        alert(detail)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `reading_${formData.topic || 'comprehension'}.docx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert(`Export failed: ${e.message || e}`)
    }
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
      <div className="bg-white border-b border-gray-100 flex items-center gap-3 px-4 py-1 text-gray-500 text-xs">
        <button
          onClick={() => { if (isEditMode) autoSaveEdits(); setIsEditMode(false); setShowAnswers(a => !a) }}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
            showAnswers
              ? 'border-orange-300 text-orange-600 bg-orange-50'
              : 'border-gray-200 text-gray-500 hover:border-gray-300'
          }`}
        >
          📋 {showAnswers ? 'Student View' : 'Show Answer Key'}
        </button>
        {passage.word_count ? <span className="text-gray-400">{passage.word_count} words</span> : null}
        {comp.rag_context_used && (
          <span className="px-2 py-0.5 rounded-full text-purple-600 bg-purple-50 font-medium">🧠 RAG</span>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 bg-gray-900 text-white text-sm rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      {/* Editor toolbar — outside scroll area so it stays fixed while scrolling */}
      {isEditMode && (
        <EditorToolbar onDone={() => { setSavedHTML(editableRef.current?.innerHTML || editableHTML); setIsEditMode(false); setActiveSidebar(null) }} />
      )}

      {/* Centered History popup with per-item Word-like editor + downloads */}
      <HistoryPopup
        open={showHistory}
        onClose={() => { setShowHistory(false); setActiveSidebar(null) }}
        api={api}
        onLoadFromHistory={(item) => onLoadFromHistory?.(item)}
      />

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar onAction={handleSidebarAction} activeAction={activeSidebar} />

        <div className="flex-1 overflow-y-auto px-8 py-8">
          <div className="max-w-3xl mx-auto">
            {isEditMode ? (
              <div
                ref={editableRef}
                contentEditable
                suppressContentEditableWarning
                dangerouslySetInnerHTML={{ __html: sanitizeHTML(editableHTML) }}
                className="bg-white rounded-xl shadow-sm border-2 border-dashed border-orange-400 p-10 min-h-[800px] focus:outline-none"
              />
            ) : savedHTML ? (
              // Saved (edited) view — rendered in BOTH student AND answer
              // views once the teacher has saved an edit. This is what
              // teachers actually want: their edits persist everywhere.
              // Trade-off: the Answer Key toggle is a visual no-op once
              // edits are saved (teacher should include answer text in
              // their edits if they want answers shown).
              <div
                ref={contentRef}
                dangerouslySetInnerHTML={{ __html: sanitizeHTML(savedHTML) }}
                className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 min-h-[800px]"
              />
            ) : (
            <div
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
                  </div>
                  <p className="text-sm text-gray-500 mb-3">{tdq.instructions}</p>
                  <ol className="space-y-4">
                    {tdq.questions.map((q, i) => (
                      <li key={i}>
                        <div className="flex items-start gap-2">
                          <span className="text-sm font-semibold text-gray-400 shrink-0">{q.number}.</span>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-800">{q.question}</p>

                            {/* Hint + type badge */}
                            <p className="text-xs text-gray-400 mt-0.5">
                              💡 {q.answer_hint} ·
                              <span className={`ml-1 px-1.5 py-0.5 rounded text-xs font-medium ${
                                q.type === 'literal' ? 'bg-green-100 text-green-700' :
                                q.type === 'inferential' ? 'bg-blue-100 text-blue-700' :
                                'bg-purple-100 text-purple-700'
                              }`}>{q.type}</span>
                            </p>

                            {/* Answer Key view: paragraph hint → Complete Answer button → model answer */}
                            {showAnswers && (
                              <div className="mt-2">
                                {q.answer_hint && (
                                  <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg mb-2">
                                    <p className="text-xs font-semibold text-amber-700 mb-0.5">Paragraph Suggestion:</p>
                                    <p className="text-xs text-amber-800">{q.answer_hint}</p>
                                  </div>
                                )}
                                <button
                                  onClick={() => handleCompleteAnswer(i, q)}
                                  disabled={loadingAnswer === i}
                                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-orange-200 text-orange-600 hover:bg-orange-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                  {loadingAnswer === i ? (
                                    <>
                                      <span className="inline-block w-3 h-3 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                                      Generating answer...
                                    </>
                                  ) : '✨ Complete Answer'}
                                </button>
                                {generatedAnswers[i] && (
                                  <div
                                    className="mt-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900"
                                  >
                                    <p className="font-semibold text-blue-600 mb-1">Model Answer (read only)</p>
                                    <p>{generatedAnswers[i]}</p>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Student view: only word limit + answer blank */}
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
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
