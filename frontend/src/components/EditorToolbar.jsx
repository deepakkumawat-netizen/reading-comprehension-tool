import { useRef } from 'react'

export default function EditorToolbar({ onDone }) {
  const savedSel = useRef(null)

  const saveSelection = () => {
    const sel = window.getSelection()
    if (sel?.rangeCount) savedSel.current = sel.getRangeAt(0).cloneRange()
  }

  const restoreAndExec = (cmd, val = null) => {
    if (savedSel.current) {
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(savedSel.current)
    }
    document.execCommand(cmd, false, val)
  }

  const btn = (title, label, cmd, cls = '') => (
    <button
      key={cmd + label}
      title={title}
      onMouseDown={e => { e.preventDefault(); document.execCommand(cmd, false, null) }}
      className={`p-1.5 rounded hover:bg-orange-50 hover:text-orange-600 text-gray-700 text-sm min-w-[28px] text-center transition-colors ${cls}`}
    >{label}</button>
  )

  return (
    <div className="flex items-center gap-1 px-3 py-2 bg-white border border-orange-200 rounded-xl shadow-md flex-wrap mb-3 sticky top-2 z-30">
      {btn('Undo (Ctrl+Z)', '↩', 'undo')}
      {btn('Redo (Ctrl+Y)', '↪', 'redo')}
      <div className="w-px h-5 bg-gray-200 mx-1"/>
      {btn('Bold', 'B', 'bold', 'font-bold')}
      {btn('Italic', 'I', 'italic', 'italic')}
      {btn('Underline', 'U', 'underline', 'underline')}
      {btn('Strikethrough', 'S', 'strikeThrough', 'line-through')}
      <div className="w-px h-5 bg-gray-200 mx-1"/>

      <select
        title="Font size"
        defaultValue="3"
        onMouseDown={saveSelection}
        onChange={e => restoreAndExec('fontSize', e.target.value)}
        className="text-xs border border-gray-200 rounded px-1 py-1 text-gray-700 cursor-pointer"
      >
        <option value="1">Small</option>
        <option value="3">Normal</option>
        <option value="4">Large</option>
        <option value="5">X-Large</option>
        <option value="6">Huge</option>
      </select>

      <label title="Text color" className="flex items-center gap-0.5 cursor-pointer border border-gray-200 rounded px-1 py-0.5 hover:bg-orange-50">
        <span className="text-xs font-bold text-gray-600">A</span>
        <input type="color" defaultValue="#000000"
          onMouseDown={saveSelection}
          onChange={e => restoreAndExec('foreColor', e.target.value)}
          className="w-4 h-4 cursor-pointer rounded border-0 p-0"
        />
      </label>

      <label title="Highlight" className="flex items-center gap-0.5 cursor-pointer border border-gray-200 rounded px-1 py-0.5 hover:bg-orange-50">
        <span className="text-xs font-bold text-yellow-500">H</span>
        <input type="color" defaultValue="#ffff00"
          onMouseDown={saveSelection}
          onChange={e => restoreAndExec('hiliteColor', e.target.value)}
          className="w-4 h-4 cursor-pointer rounded border-0 p-0"
        />
      </label>

      <div className="w-px h-5 bg-gray-200 mx-1"/>
      <button title="Align left" onMouseDown={e => { e.preventDefault(); document.execCommand('justifyLeft') }}
        className="p-1.5 rounded hover:bg-orange-50 text-gray-600 text-xs">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="0" y="1" width="14" height="2"/><rect x="0" y="5" width="10" height="2"/><rect x="0" y="9" width="12" height="2"/></svg>
      </button>
      <button title="Center" onMouseDown={e => { e.preventDefault(); document.execCommand('justifyCenter') }}
        className="p-1.5 rounded hover:bg-orange-50 text-gray-600 text-xs">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="0" y="1" width="14" height="2"/><rect x="2" y="5" width="10" height="2"/><rect x="1" y="9" width="12" height="2"/></svg>
      </button>
      <button title="Align right" onMouseDown={e => { e.preventDefault(); document.execCommand('justifyRight') }}
        className="p-1.5 rounded hover:bg-orange-50 text-gray-600 text-xs">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="0" y="1" width="14" height="2"/><rect x="4" y="5" width="10" height="2"/><rect x="2" y="9" width="12" height="2"/></svg>
      </button>

      <button
        onMouseDown={e => { e.preventDefault(); onDone() }}
        className="ml-auto px-3 py-1.5 rounded-lg text-sm font-semibold text-white"
        style={{ background: '#E85D04' }}
      >
        ✓ Done Editing
      </button>
    </div>
  )
}
