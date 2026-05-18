const ITEMS = [
  {
    label: 'Create',
    color: '#E85D04',
    bg: '#FFF4EE',
    title: 'New worksheet from scratch',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18">
        <rect x="4" y="3" width="12" height="14" rx="2"/>
        <line x1="10" y1="7" x2="10" y2="13"/>
        <line x1="7" y1="10" x2="13" y2="10"/>
      </svg>
    ),
  },
  {
    label: 'Adapt',
    color: '#7c3aed',
    bg: '#F5F3FF',
    title: 'Edit settings and regenerate',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18">
        <line x1="3" y1="6" x2="17" y2="6"/>
        <line x1="3" y1="10" x2="17" y2="10"/>
        <line x1="3" y1="14" x2="17" y2="14"/>
        <circle cx="7" cy="6" r="2" fill="currentColor" stroke="none"/>
        <circle cx="13" cy="10" r="2" fill="currentColor" stroke="none"/>
        <circle cx="9" cy="14" r="2" fill="currentColor" stroke="none"/>
      </svg>
    ),
  },
  {
    label: 'Remix',
    color: '#0891b2',
    bg: '#ECFEFF',
    title: 'Regenerate with same settings',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18">
        <path d="M4 10a6 6 0 0 1 6-6 6 6 0 0 1 4.2 1.7"/>
        <path d="M16 10a6 6 0 0 1-6 6 6 6 0 0 1-4.2-1.7"/>
        <polyline points="14.5,3.5 14.5,7.5 10.5,5.5"/>
        <polyline points="5.5,16.5 5.5,12.5 9.5,14.5"/>
      </svg>
    ),
  },
  {
    label: 'Evaluate',
    color: '#16a34a',
    bg: '#F0FDF4',
    title: 'Toggle answer sheet',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18">
        <circle cx="10" cy="10" r="7"/>
        <polyline points="7,10 9,12.5 13,8"/>
      </svg>
    ),
  },
  {
    label: 'Images',
    color: '#db2777',
    bg: '#FDF2F8',
    title: 'Add images (coming soon)',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18">
        <rect x="3" y="4" width="14" height="12" rx="1.5"/>
        <circle cx="7.5" cy="8.5" r="1.5"/>
        <polyline points="3,14 7,10 10,13 13,9 17,14"/>
      </svg>
    ),
  },
  {
    label: 'History',
    color: '#d97706',
    bg: '#FFFBEB',
    title: 'View session history',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18">
        <circle cx="10" cy="10" r="7"/>
        <polyline points="10,6 10,10 13,12"/>
      </svg>
    ),
  },
]

export default function Sidebar({ onAction, activeAction }) {
  return (
    <div
      className="flex flex-col items-center gap-1.5 py-4 border-r border-gray-200 bg-white flex-shrink-0"
      style={{ width: 68, minHeight: '100%' }}
    >
      {ITEMS.map(({ label, color, bg, title, icon }) => {
        const isActive = activeAction === label
        return (
          <button
            key={label}
            title={title}
            onClick={() => onAction?.(label)}
            style={isActive ? { color, background: bg, borderColor: color } : {}}
            className={`flex flex-col items-center justify-center gap-1 w-12 h-14 rounded-xl transition-all border ${
              isActive
                ? 'border opacity-100'
                : 'border-transparent text-gray-400 hover:bg-gray-50 hover:text-gray-600'
            }`}
          >
            <span style={isActive ? { color } : {}}>{icon}</span>
            <span className="text-[8px] font-semibold leading-none tracking-wide uppercase">
              {label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
