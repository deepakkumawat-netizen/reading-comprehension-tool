export default function HomePage({ onStart }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8" style={{ background: '#FAF9F7' }}>
      <div className="w-full max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">AI Tools</h1>

        {/* Tool Card — matches Screenshot 1 */}
        <div
          onClick={onStart}
          className="bg-white border border-gray-200 rounded-2xl p-6 cursor-pointer hover:shadow-md transition-all hover:border-orange-200 group"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl"
                style={{ background: '#EFF6FF' }}>
                📖
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ background: '#DCFCE7', color: '#16A34A' }}>
                NEW
              </span>
            </div>
            <button
              onClick={e => e.stopPropagation()}
              className="text-gray-300 hover:text-yellow-400 transition-colors text-xl"
            >
              ☆
            </button>
          </div>

          <h2 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-orange-600 transition-colors">
            Reading Comprehension
          </h2>
          <p className="text-gray-500 text-sm leading-relaxed">
            Create a grade-leveled passage with annotation guidance and sequenced text-dependent questions.
          </p>
        </div>

        <p className="text-center text-xs text-gray-400 mt-8">
          Powered By Codevidhya
        </p>
      </div>
    </div>
  )
}
