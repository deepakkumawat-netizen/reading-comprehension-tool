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

  const exec = (cmd, val = null) => document.execCommand(cmd, false, val)

  const applyBgColor = (color) => {
    if (savedSel.current) {
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(savedSel.current)
    }
    document.execCommand('styleWithCSS', false, true)
    document.execCommand('backColor', false, color)
    document.execCommand('styleWithCSS', false, false)
  }

  const btn = (title, content, cmd, val = null) => (
    <button
      key={title}
      title={title}
      onMouseDown={e => { e.preventDefault(); exec(cmd, val) }}
      className="p-1.5 rounded hover:bg-orange-50 hover:text-orange-600 text-gray-700 text-sm min-w-[26px] text-center transition-colors flex-shrink-0"
    >{content}</button>
  )

  const sep = () => <div className="w-px h-5 bg-gray-200 mx-0.5 flex-shrink-0" />

  return (
    <div className="flex items-center gap-0.5 px-3 py-2 bg-white border-b border-gray-200 shadow-sm flex-wrap">

      {/* Undo / Redo */}
      {btn('Undo (Ctrl+Z)', '↩', 'undo')}
      {btn('Redo (Ctrl+Y)', '↪', 'redo')}

      {sep()}

      {/* Font Family */}
      <select
        title="Font family"
        onMouseDown={saveSelection}
        onChange={e => restoreAndExec('fontName', e.target.value)}
        className="text-xs border border-gray-200 rounded px-1 py-1 text-gray-700 cursor-pointer w-[115px] flex-shrink-0"
      >
        <option value="">Font</option>
        <option value="Arial">Arial</option>
        <option value="Times New Roman">Times New Roman</option>
        <option value="Courier New">Courier New</option>
        <option value="Georgia">Georgia</option>
        <option value="Verdana">Verdana</option>
        <option value="Trebuchet MS">Trebuchet MS</option>
        <option value="Comic Sans MS">Comic Sans MS</option>
        <option value="Impact">Impact</option>
      </select>

      {/* Font Size */}
      <select
        title="Font size"
        defaultValue="3"
        onMouseDown={saveSelection}
        onChange={e => restoreAndExec('fontSize', e.target.value)}
        className="text-xs border border-gray-200 rounded px-1 py-1 text-gray-700 cursor-pointer w-[60px] flex-shrink-0"
      >
        <option value="1">8</option>
        <option value="2">10</option>
        <option value="3">12</option>
        <option value="4">14</option>
        <option value="5">18</option>
        <option value="6">24</option>
        <option value="7">36</option>
      </select>

      {sep()}

      {/* Basic Formatting */}
      {btn('Bold (Ctrl+B)', <b>B</b>, 'bold')}
      {btn('Italic (Ctrl+I)', <i>I</i>, 'italic')}
      {btn('Underline (Ctrl+U)', <u>U</u>, 'underline')}
      {btn('Strikethrough', <s>S</s>, 'strikeThrough')}
      {btn('Superscript', <span>x<sup>2</sup></span>, 'superscript')}
      {btn('Subscript', <span>x<sub>2</sub></span>, 'subscript')}

      {sep()}

      {/* Text Color */}
      <label title="Text color" className="flex items-center gap-0.5 cursor-pointer border border-gray-200 rounded px-1 py-0.5 hover:bg-orange-50 flex-shrink-0">
        <span className="text-xs font-bold text-gray-700 underline decoration-red-500">A</span>
        <input type="color" defaultValue="#000000"
          onMouseDown={saveSelection}
          onChange={e => restoreAndExec('foreColor', e.target.value)}
          className="w-4 h-4 cursor-pointer rounded border-0 p-0"
        />
      </label>

      {/* Highlight Color */}
      <label title="Highlight color" className="flex items-center gap-0.5 cursor-pointer border border-gray-200 rounded px-1 py-0.5 hover:bg-orange-50 flex-shrink-0">
        <span className="text-xs font-bold" style={{ color: '#E85D04' }}>H</span>
        <input type="color" defaultValue="#ffff00"
          onMouseDown={saveSelection}
          onChange={e => restoreAndExec('hiliteColor', e.target.value)}
          className="w-4 h-4 cursor-pointer rounded border-0 p-0"
        />
      </label>

      {/* Background Color */}
      <label title="Background color (fills box/element background)" className="flex items-center gap-0.5 cursor-pointer border border-gray-200 rounded px-1 py-0.5 hover:bg-orange-50 flex-shrink-0">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <rect x="1" y="1" width="11" height="8" rx="1.5" stroke="#888" strokeWidth="1.2" fill="#fde68a"/>
          <rect x="0" y="10" width="13" height="3" rx="1" fill="#f97316"/>
        </svg>
        <input type="color" defaultValue="#fff9c4"
          onMouseDown={saveSelection}
          onChange={e => applyBgColor(e.target.value)}
          className="w-4 h-4 cursor-pointer rounded border-0 p-0"
        />
      </label>

      {sep()}

      {/* Lists */}
      <button title="Bullet list" onMouseDown={e => { e.preventDefault(); exec('insertUnorderedList') }}
        className="p-1.5 rounded hover:bg-orange-50 hover:text-orange-600 text-gray-700 transition-colors flex-shrink-0">
        <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor">
          <circle cx="1.5" cy="3" r="1.5"/><rect x="4" y="2" width="11" height="2" rx="1"/>
          <circle cx="1.5" cy="7.5" r="1.5"/><rect x="4" y="6.5" width="11" height="2" rx="1"/>
          <circle cx="1.5" cy="12" r="1.5"/><rect x="4" y="11" width="11" height="2" rx="1"/>
        </svg>
      </button>

      <button title="Numbered list" onMouseDown={e => { e.preventDefault(); exec('insertOrderedList') }}
        className="p-1.5 rounded hover:bg-orange-50 hover:text-orange-600 text-gray-700 transition-colors flex-shrink-0">
        <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor">
          <text x="0" y="4" fontSize="4" fontFamily="Arial">1.</text>
          <rect x="4" y="2" width="11" height="2" rx="1"/>
          <text x="0" y="8.5" fontSize="4" fontFamily="Arial">2.</text>
          <rect x="4" y="6.5" width="11" height="2" rx="1"/>
          <text x="0" y="13" fontSize="4" fontFamily="Arial">3.</text>
          <rect x="4" y="11" width="11" height="2" rx="1"/>
        </svg>
      </button>

      {/* Indent / Outdent */}
      <button title="Decrease indent" onMouseDown={e => { e.preventDefault(); exec('outdent') }}
        className="p-1.5 rounded hover:bg-orange-50 hover:text-orange-600 text-gray-700 transition-colors flex-shrink-0">
        <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor">
          <rect x="0" y="1" width="15" height="2" rx="1"/>
          <rect x="4" y="5" width="11" height="2" rx="1"/>
          <rect x="4" y="9" width="11" height="2" rx="1"/>
          <rect x="0" y="13" width="15" height="2" rx="1"/>
          <polygon points="3,6 0,7.5 3,9"/>
        </svg>
      </button>

      <button title="Increase indent" onMouseDown={e => { e.preventDefault(); exec('indent') }}
        className="p-1.5 rounded hover:bg-orange-50 hover:text-orange-600 text-gray-700 transition-colors flex-shrink-0">
        <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor">
          <rect x="0" y="1" width="15" height="2" rx="1"/>
          <rect x="4" y="5" width="11" height="2" rx="1"/>
          <rect x="4" y="9" width="11" height="2" rx="1"/>
          <rect x="0" y="13" width="15" height="2" rx="1"/>
          <polygon points="0,6 3,7.5 0,9"/>
        </svg>
      </button>

      {sep()}

      {/* Alignment */}
      <button title="Align left" onMouseDown={e => { e.preventDefault(); exec('justifyLeft') }}
        className="p-1.5 rounded hover:bg-orange-50 hover:text-orange-600 text-gray-600 transition-colors flex-shrink-0">
        <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor">
          <rect x="0" y="1" width="15" height="2" rx="1"/><rect x="0" y="5" width="10" height="2" rx="1"/>
          <rect x="0" y="9" width="13" height="2" rx="1"/><rect x="0" y="13" width="8" height="2" rx="1"/>
        </svg>
      </button>
      <button title="Align center" onMouseDown={e => { e.preventDefault(); exec('justifyCenter') }}
        className="p-1.5 rounded hover:bg-orange-50 hover:text-orange-600 text-gray-600 transition-colors flex-shrink-0">
        <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor">
          <rect x="0" y="1" width="15" height="2" rx="1"/><rect x="2.5" y="5" width="10" height="2" rx="1"/>
          <rect x="1" y="9" width="13" height="2" rx="1"/><rect x="3.5" y="13" width="8" height="2" rx="1"/>
        </svg>
      </button>
      <button title="Align right" onMouseDown={e => { e.preventDefault(); exec('justifyRight') }}
        className="p-1.5 rounded hover:bg-orange-50 hover:text-orange-600 text-gray-600 transition-colors flex-shrink-0">
        <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor">
          <rect x="0" y="1" width="15" height="2" rx="1"/><rect x="5" y="5" width="10" height="2" rx="1"/>
          <rect x="2" y="9" width="13" height="2" rx="1"/><rect x="7" y="13" width="8" height="2" rx="1"/>
        </svg>
      </button>
      <button title="Justify" onMouseDown={e => { e.preventDefault(); exec('justifyFull') }}
        className="p-1.5 rounded hover:bg-orange-50 hover:text-orange-600 text-gray-600 transition-colors flex-shrink-0">
        <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor">
          <rect x="0" y="1" width="15" height="2" rx="1"/><rect x="0" y="5" width="15" height="2" rx="1"/>
          <rect x="0" y="9" width="15" height="2" rx="1"/><rect x="0" y="13" width="10" height="2" rx="1"/>
        </svg>
      </button>

      {sep()}

      {/* Clear Formatting */}
      <button title="Clear formatting" onMouseDown={e => { e.preventDefault(); exec('removeFormat') }}
        className="p-1.5 rounded hover:bg-orange-50 hover:text-orange-600 text-gray-700 text-xs transition-colors flex-shrink-0 font-bold">
        T<span className="text-red-400">✕</span>
      </button>

      {/* Done Editing */}
      <button
        onMouseDown={e => { e.preventDefault(); onDone() }}
        className="ml-auto px-3 py-1.5 rounded-lg text-sm font-semibold text-white flex-shrink-0"
        style={{ background: '#E85D04' }}
      >
        ✓ Done Editing
      </button>
    </div>
  )
}
