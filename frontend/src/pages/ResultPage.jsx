import { useRef, useState } from 'react'
import Sidebar from '../components/Sidebar'
import ExportDropdown from '../components/ExportDropdown'

export default function ResultPage({ comprehension, formData, tabs, onNewTab, onCloseTab, api }) {
  const [showAnswers, setShowAnswers] = useState(false)
  const [activeSidebar, setActiveSidebar] = useState(null)
  const contentRef = useRef(null)

  const handleSidebarAction = (label) => {
    setActiveSidebar(prev => prev === label ? null : label)
    if (label === 'Create') { onNewTab(); setActiveSidebar(null) }
    if (label === 'Remix')  { onNewTab(); setActiveSidebar(null) }
    if (label === 'Evaluate') setShowAnswers(a => !a)
  }

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

  const handlePdf = () => window.print()

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
      <div className="bg-white border-b border-gray-100 flex items-center gap-1 px-4 py-1.5 text-gray-400 text-xs">
        {[
          { label: '↩', cmd: () => document.execCommand('undo'), title: 'Undo' },
          { label: '↪', cmd: () => document.execCommand('redo'), title: 'Redo' },
          { label: '|', cmd: null },
          { label: 'B', cmd: () => document.execCommand('bold'), title: 'Bold' },
          { label: 'I', cmd: () => document.execCommand('italic'), title: 'Italic' },
          { label: 'U', cmd: () => document.execCommand('underline'), title: 'Underline' },
          { label: 'S', cmd: () => document.execCommand('strikeThrough'), title: 'Strikethrough' },
          { label: '|', cmd: null },
          { label: '≡', cmd: () => document.execCommand('justifyLeft'), title: 'Align Left' },
          { label: '≡', cmd: () => document.execCommand('justifyCenter'), title: 'Align Center' },
          { label: '≡', cmd: () => document.execCommand('justifyRight'), title: 'Align Right' },
        ].map((t, i) => t.label === '|'
          ? <span key={i} className="text-gray-200 select-none">|</span>
          : (
            <button key={i} title={t.title} onClick={t.cmd}
              className="px-1.5 py-1 rounded hover:bg-gray-100 active:bg-gray-200 transition-colors font-medium cursor-pointer">
              {t.label}
            </button>
          )
        )}
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

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar onAction={handleSidebarAction} activeAction={activeSidebar} />


        <div className="flex-1 overflow-y-auto px-8 py-8">
          <div className="max-w-3xl mx-auto">
            <div
              key={showAnswers}
              ref={contentRef}
              contentEditable
              suppressContentEditableWarning
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 min-h-[800px] focus:outline-none"
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
                      <div className="border-b border-dashed border-gray-200 mt-2 pb-3" />
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
                    {ag.symbols.map((s, i) => (
                      <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                        <span className="font-bold text-gray-900">{s.symbol}</span>
                        <span>{s.meaning}</span>
                      </li>
                    ))}
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
                            {!showAnswers && <div className="border-b border-dashed border-gray-200 mt-2 pb-4" />}
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
                        {!showAnswers && <div className="border-b border-dashed border-gray-200 mt-3 pb-2" />}
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
