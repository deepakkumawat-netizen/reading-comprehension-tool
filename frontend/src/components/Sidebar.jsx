const SIDEBAR_ITEMS = [
  { icon: '+', label: 'Create' },
  { icon: '✦', label: 'Adapt' },
  { icon: '↺', label: 'Remix' },
  { icon: '✓', label: 'Evaluate' },
  { icon: '🖼', label: 'Images' },
  { icon: '⏱', label: 'History' },
]

export default function Sidebar() {
  return (
    <div className="flex flex-col items-center gap-1 py-4 border-r border-gray-200 bg-white"
      style={{ width: 64, minHeight: '100%' }}>
      {SIDEBAR_ITEMS.map(({ icon, label }) => (
        <button
          key={label}
          title={label}
          className="flex flex-col items-center justify-center gap-0.5 w-12 h-12 rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-all"
        >
          <span className="text-base leading-none">{icon}</span>
          <span className="text-[9px] font-medium leading-none">{label}</span>
        </button>
      ))}
    </div>
  )
}
