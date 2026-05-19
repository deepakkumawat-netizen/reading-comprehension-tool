export default function EditorToolbar({ onDone }) {
  const exec = (cmd, val = null) => { document.execCommand(cmd, false, val); }

  return (
    <div className="flex items-center gap-1 px-3 py-2 bg-white border-b border-gray-200 flex-wrap sticky top-0 z-30 shadow-sm">
      {/* Undo/Redo */}
      <button onClick={() => exec('undo')} title="Undo" className="p-1.5 rounded hover:bg-gray-100 text-gray-600 font-bold text-sm">↩</button>
      <button onClick={() => exec('redo')} title="Redo" className="p-1.5 rounded hover:bg-gray-100 text-gray-600 font-bold text-sm">↪</button>
      <div className="w-px h-5 bg-gray-200 mx-1"/>
      {/* Formatting */}
      <button onClick={() => exec('bold')} title="Bold (Ctrl+B)" className="p-1.5 rounded hover:bg-gray-100 text-gray-700 font-bold text-sm w-7">B</button>
      <button onClick={() => exec('italic')} title="Italic (Ctrl+I)" className="p-1.5 rounded hover:bg-gray-100 text-gray-700 italic text-sm w-7">I</button>
      <button onClick={() => exec('underline')} title="Underline (Ctrl+U)" className="p-1.5 rounded hover:bg-gray-100 text-gray-700 underline text-sm w-7">U</button>
      <button onClick={() => exec('strikeThrough')} title="Strikethrough" className="p-1.5 rounded hover:bg-gray-100 text-gray-700 line-through text-sm w-7">S</button>
      <div className="w-px h-5 bg-gray-200 mx-1"/>
      {/* Font size */}
      <select onChange={e => exec('fontSize', e.target.value)} defaultValue="3"
        className="text-xs border border-gray-200 rounded px-1 py-1 text-gray-700 cursor-pointer">
        <option value="1">Small</option>
        <option value="3">Normal</option>
        <option value="4">Large</option>
        <option value="5">X-Large</option>
      </select>
      {/* Text color */}
      <input type="color" defaultValue="#000000" onChange={e => exec('foreColor', e.target.value)}
        title="Text color" className="w-7 h-7 rounded cursor-pointer border border-gray-200 p-0.5"/>
      {/* Highlight */}
      <input type="color" defaultValue="#ffff00" onChange={e => exec('hiliteColor', e.target.value)}
        title="Highlight color" className="w-7 h-7 rounded cursor-pointer border border-gray-200 p-0.5" style={{background:'#ffff00'}}/>
      <div className="w-px h-5 bg-gray-200 mx-1"/>
      {/* Alignment */}
      <button onClick={() => exec('justifyLeft')} title="Align left" className="p-1.5 rounded hover:bg-gray-100 text-gray-600 text-sm">⬛</button>
      <button onClick={() => exec('justifyCenter')} title="Align center" className="p-1.5 rounded hover:bg-gray-100 text-gray-600 text-sm">▣</button>
      <button onClick={() => exec('justifyRight')} title="Align right" className="p-1.5 rounded hover:bg-gray-100 text-gray-600 text-sm">▪</button>
      <div className="w-px h-5 bg-gray-200 mx-1"/>
      {/* Done */}
      <button onClick={onDone}
        className="ml-auto px-3 py-1.5 rounded-lg text-sm font-semibold text-white"
        style={{background:'#E85D04'}}>
        ✓ Done Editing
      </button>
    </div>
  )
}
