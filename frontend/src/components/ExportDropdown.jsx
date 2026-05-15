import { useState, useRef, useEffect } from 'react'

export default function ExportDropdown({ onCopy, onPdf, onDocx, onGoogleDrive }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
        style={{ background: '#E85D04' }}
      >
        ↑ Export
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 bg-white border border-gray-200 rounded-xl shadow-lg w-52 z-50 overflow-hidden">
          {[
            { icon: '📋', label: 'Copy to Clipboard', action: onCopy },
            { icon: '📄', label: 'PDF', action: onPdf },
            { icon: '📝', label: 'Word Document', action: onDocx },
            { icon: '⚙️', label: 'Connect Google Drive', action: onGoogleDrive },
          ].map(({ icon, label, action }) => (
            <button
              key={label}
              onClick={() => { action?.(); setOpen(false) }}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 text-left transition-colors"
            >
              <span>{icon}</span>
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
