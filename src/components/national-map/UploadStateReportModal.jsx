import { useState, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { useAuth } from '../../context/AuthContext'
import { STATE_ABBR_TO_NAME } from '../../data/us-states'

const STATE_OPTIONS = Object.entries(STATE_ABBR_TO_NAME)
  .map(([abbr, name]) => ({ abbr, name }))
  .sort((a, b) => a.name.localeCompare(b.name))

const MAX_FILE_SIZE = 500 * 1024 // 500KB
const ALLOWED_EXTENSIONS = ['.md', '.txt', '.markdown']

export default function UploadStateReportModal({ stateCode, stateName, onClose, onSaved }) {
  const { user } = useAuth()
  const fileInputRef = useRef(null)
  const [selectedState, setSelectedState] = useState(stateCode || '')
  const [title, setTitle] = useState(
    stateName ? `Alliance Prospect Report — ${stateName}` : ''
  )
  const [researchDate, setResearchDate] = useState(new Date().toISOString().split('T')[0])
  const [content, setContent] = useState('')
  const [inputMode, setInputMode] = useState('paste') // 'paste' | 'upload'
  const [preview, setPreview] = useState(false)
  const [fileName, setFileName] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [dragOver, setDragOver] = useState(false)

  function handleStateChange(abbr) {
    setSelectedState(abbr)
    const name = STATE_ABBR_TO_NAME[abbr]
    if (name) {
      setTitle(`Alliance Prospect Report — ${name}`)
    }
  }

  function processFile(file) {
    setError(null)
    const ext = '.' + file.name.split('.').pop().toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setError(`Invalid file type. Accepted: ${ALLOWED_EXTENSIONS.join(', ')}`)
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setError(`File too large (${(file.size / 1024).toFixed(0)}KB). Max: 500KB.`)
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      setContent(e.target.result)
      setFileName(file.name)
    }
    reader.onerror = () => setError('Failed to read file')
    reader.readAsText(file)
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  function handleFileSelect(e) {
    const file = e.target.files[0]
    if (file) processFile(file)
  }

  async function handleSave() {
    if (!selectedState || !content.trim()) return
    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/prospects?action=save-state-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state_code: selectedState,
          state_name: STATE_ABBR_TO_NAME[selectedState] || selectedState,
          title: title.trim() || `Alliance Prospect Report — ${STATE_ABBR_TO_NAME[selectedState] || selectedState}`,
          content: content.trim(),
          researched_at: new Date(researchDate + 'T12:00:00Z').toISOString(),
          researched_by: user?.name || null,
          uploaded_by: user?.name || 'Unknown',
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save report')
      }

      onSaved()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const canSave = selectedState && content.trim()

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-lg font-semibold text-[#041E42]">Upload State Research Report</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Upload or paste a state-level research report
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form fields */}
        <div className="px-5 pt-4 space-y-3 flex-shrink-0">
          <div className="grid grid-cols-2 gap-3">
            {/* State selector */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
              <select
                value={selectedState}
                onChange={(e) => handleStateChange(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#041E42]/20"
              >
                <option value="">Select a state...</option>
                {STATE_OPTIONS.map((s) => (
                  <option key={s.abbr} value={s.abbr}>{s.name} ({s.abbr})</option>
                ))}
              </select>
            </div>

            {/* Research date */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Research Date</label>
              <input
                type="date"
                value={researchDate}
                onChange={(e) => setResearchDate(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#041E42]/20"
              />
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Report Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Alliance Prospect Report — State Name"
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#041E42]/20"
            />
          </div>

          {/* Input mode toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => { setInputMode('paste'); setPreview(false) }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg ${
                inputMode === 'paste' && !preview ? 'bg-[#041E42] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Paste
            </button>
            <button
              onClick={() => { setInputMode('upload'); setPreview(false) }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg ${
                inputMode === 'upload' && !preview ? 'bg-[#041E42] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Upload File
            </button>
            <button
              onClick={() => setPreview(true)}
              disabled={!content.trim()}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-40 ${
                preview ? 'bg-[#041E42] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Preview
            </button>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-5 min-h-0">
          {preview ? (
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          ) : inputMode === 'paste' ? (
            <textarea
              autoFocus
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste the state research report markdown here..."
              className="w-full h-full min-h-[250px] font-mono text-sm border border-gray-300 rounded-lg p-4 focus:outline-none focus:ring-2 focus:ring-[#041E42]/20 resize-none"
            />
          ) : (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center min-h-[250px] border-2 border-dashed rounded-lg transition-colors ${
                dragOver ? 'border-[#041E42] bg-blue-50' : 'border-gray-300 bg-gray-50'
              }`}
            >
              {fileName ? (
                <div className="text-center">
                  <svg className="w-10 h-10 text-green-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm font-medium text-gray-700">{fileName}</p>
                  <p className="text-xs text-gray-500 mt-1">{(content.length / 1024).toFixed(1)}KB loaded</p>
                  <button
                    onClick={() => { setFileName(null); setContent(''); if (fileInputRef.current) fileInputRef.current.value = '' }}
                    className="mt-2 text-xs text-red-600 hover:text-red-800 font-medium"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="text-center">
                  <svg className="w-10 h-10 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-sm text-gray-600 mb-1">Drag & drop a .md or .txt file here</p>
                  <p className="text-xs text-gray-400 mb-3">or</p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 text-sm font-medium text-[#041E42] bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Choose File
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".md,.txt,.markdown"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="mt-2 text-sm text-red-600">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-200 flex-shrink-0">
          <p className="text-xs text-gray-400">
            {content ? `${content.split(/\s+/).length.toLocaleString()} words` : 'No content yet'}
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave || saving}
              className="px-4 py-2 text-sm font-medium text-white bg-[#041E42] rounded-lg hover:bg-[#041E42]/90 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Report'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
