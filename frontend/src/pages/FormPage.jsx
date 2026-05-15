import { useState } from 'react'

const GRADE_LEVELS = [
  '3rd Grade Students', '4th Grade Students', '5th Grade Students',
  '6th Grade Students', '7th Grade Students', '8th Grade Students',
  '9th Grade Students', '10th Grade Students', '11th Grade Students', '12th Grade Students'
]

const GRADE_MAP = {
  '3rd Grade Students': 3, '4th Grade Students': 4, '5th Grade Students': 5,
  '6th Grade Students': 6, '7th Grade Students': 7, '8th Grade Students': 8,
  '9th Grade Students': 9, '10th Grade Students': 10, '11th Grade Students': 11, '12th Grade Students': 12
}

export default function FormPage({ onGenerate, onBack, loading, error }) {
  const [objective, setObjective] = useState('')
  const [topic, setTopic] = useState('')
  const [grade, setGrade] = useState('7th Grade Students')
  const [activeTab, setActiveTab] = useState(null)

  const hasContent = topic.length > 0 || objective.length > 0

  const handleGenerate = () => {
    if (!objective.trim() && !topic.trim()) return
    onGenerate({
      topic: topic.trim(),
      grade_level: GRADE_MAP[grade] || 7,
      learning_objective: objective.trim(),
    })
  }

  const handleExemplar = () => {
    setObjective('Students will explore information to describe climates in different regions of the world.')
    setTopic('Example: Climates in different regions of the world (e.g., equatorial, polar, coastal, mid-continental).')
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#FAF9F7' }}>
      <div className="px-6 pt-5 pb-2">
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-gray-700 flex items-center gap-1">
          ← Back
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center px-4 pb-32">
        {/* Header — matches Screenshot 3 */}
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

          {/* Card 1 */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="mb-4">
              <label className="flex items-center gap-1 text-sm font-semibold text-gray-700 mb-1.5">
                Learning Objective
                <span className="text-gray-300 text-xs cursor-help" title="What students should be able to do">ⓘ</span>
              </label>
              <input
                type="text"
                value={objective}
                onChange={e => setObjective(e.target.value)}
                placeholder="Students will explore information to describe climates in different regions of the world."
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 placeholder-gray-300 focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': '#E85D04' }}
              />
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
                <div className="flex justify-end px-3 pb-2">
                  <span className="text-xs text-gray-300">{topic.length}/2000</span>
                </div>
              </div>
            </div>

            {/* Tabs + actions */}
            <div className="flex items-center gap-2 flex-wrap">
              {['File', 'Website', 'YouTube', 'Standards'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(activeTab === tab ? null : tab)}
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
                    onClick={() => { setObjective(''); setTopic(''); setActiveTab(null) }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-500 hover:bg-gray-50"
                  >
                    Clear All
                  </button>
                ) : (
                  <button
                    onClick={handleExemplar}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                    style={{ background: '#E85D04' }}
                  >
                    Use Exemplar
                  </button>
                )}
                <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-500 hover:bg-gray-50">
                  ✦ Enhance
                </button>
              </div>
            </div>
          </div>

          {/* Card 2 — Reading Level */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Reading Level</label>
            <div className="relative">
              <select
                value={grade}
                onChange={e => setGrade(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 bg-white focus:outline-none appearance-none pr-8"
              >
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

      {/* Sticky bottom — matches Screenshot 4 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-500 hover:bg-gray-50">
              ✦ Fast <span className="text-gray-300">∨</span>
            </button>
            <button
              onClick={handleGenerate}
              disabled={loading || (!objective.trim() && !topic.trim())}
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
          <p className="text-center text-xs text-gray-400 mt-2">
            AI can make mistakes. Always review content before using in the classroom. ⓘ
          </p>
        </div>
      </div>
    </div>
  )
}
