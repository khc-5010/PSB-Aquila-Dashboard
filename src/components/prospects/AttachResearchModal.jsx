import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { useAuth } from '../../context/AuthContext'

export default function AttachResearchModal({ prospect, onClose, onSaved, existingAttachment = null }) {
  const { user } = useAuth()
  const isEditing = !!existingAttachment
  const [content, setContent] = useState(existingAttachment?.content || '')
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSave() {
    if (!content.trim()) return
    setSaving(true)
    setError(null)

    try {
      const url = isEditing
        ? '/api/prospects?action=update-attachment'
        : '/api/prospects?action=attach'

      const body = isEditing
        ? {
            attachment_id: existingAttachment.id,
            content: content.trim(),
            updated_by: user?.name || null,
          }
        : {
            prospect_id: prospect.id,
            attachment_type: 'research_brief',
            title: `Research Brief — ${prospect.company}`,
            content: content.trim(),
            created_by: user?.name || null,
          }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save')
      }

      onSaved()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-lg font-semibold text-[#041E42]">{isEditing ? 'Edit Research Brief' : 'Attach Research Brief'}</h3>
            <p className="text-sm text-gray-500 mt-0.5">{prospect.company}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Toggle */}
        <div className="flex px-5 pt-3 gap-2">
          <button
            onClick={() => setPreview(false)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg ${!preview ? 'bg-[#041E42] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            Edit
          </button>
          <button
            onClick={() => setPreview(true)}
            disabled={!content.trim()}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-40 ${preview ? 'bg-[#041E42] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            Preview
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {preview ? (
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          ) : (
            <textarea
              autoFocus
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste the research brief markdown here..."
              className="w-full h-full min-h-[300px] font-mono text-sm border border-gray-300 rounded-lg p-4 focus:outline-none focus:ring-2 focus:ring-[#041E42]/20 resize-none"
            />
          )}
          {error && (
            <p className="mt-2 text-sm text-red-600">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-200">
          {!isEditing ? (
            <p className="text-xs text-gray-400">
              Status will auto-advance to &ldquo;Outreach Ready&rdquo;
            </p>
          ) : (
            <div />
          )}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!content.trim() || saving}
              className="px-4 py-2 text-sm font-medium text-white bg-[#041E42] rounded-lg hover:bg-[#041E42]/90 disabled:opacity-50"
            >
              {saving ? 'Saving...' : isEditing ? 'Update Research Brief' : 'Save Research Brief'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
