import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { downloadJson, copyText, formatBytes, companySlug } from '../../utils/exportProspect'
import { authFetch } from "../../context/AuthContext"

// Preview + copy/download the full JSON export for one company. Fetches the
// server-assembled payload (GET /api/prospects?action=export-json&id=X), which
// includes the live company record, its 1-hop corporate links (parent / children /
// former-name entities) and each record's attachments, activity log, and tasks.
// Mirrors ResearchPromptModal (z-[60] sub-modal, fetch → preview → copy).
export default function ExportJsonModal({ prospect, onClose }) {
  const [json, setJson] = useState('')
  const [linkedCount, setLinkedCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await authFetch(`/api/prospects?action=export-json&id=${prospect.id}`)
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `Export failed (${res.status})`)
        }
        const data = await res.json()
        if (cancelled) return
        setJson(JSON.stringify(data, null, 2))
        setLinkedCount(Array.isArray(data.linked_entities) ? data.linked_entities.length : 0)
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [prospect.id])

  // Own Escape handler so this sub-modal closes first (ProspectDetail's Escape
  // handler is suppressed while showExportModal is open).
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleCopy() {
    const ok = await copyText(json)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } else {
      setError('Could not copy to clipboard — use Download .json instead.')
    }
  }

  function handleDownload() {
    const date = new Date().toISOString().slice(0, 10)
    downloadJson(json, `${companySlug(prospect.company)}-export-${date}.json`)
  }

  const sizeLabel = json ? formatBytes(json) : ''
  const linkedLabel = linkedCount === 1 ? '1 linked record' : `${linkedCount} linked records`

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-[#041E42]">Export JSON</h3>
            <p className="text-sm text-gray-500 mt-0.5 truncate">
              {prospect.company}
              {!loading && !error && (
                <span className="text-gray-400">
                  {' · '}
                  {sizeLabel} · {linkedLabel}
                </span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="text-center py-8 text-gray-500">Assembling export…</div>
          ) : error ? (
            <div className="text-center py-8 text-red-500">{error}</div>
          ) : (
            <pre className="whitespace-pre-wrap break-words font-mono text-xs text-gray-800 bg-gray-50 rounded-lg p-4 border border-gray-200 leading-relaxed">
              {json}
            </pre>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-gray-200">
          <p className="text-xs text-gray-400 hidden sm:block">
            Live record · paste into your AI assistant.
          </p>
          <div className="flex items-center gap-3 ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Close
            </button>
            <button
              onClick={handleDownload}
              disabled={loading || !!error}
              className="px-4 py-2 text-sm font-medium text-[#041E42] bg-white border border-[#041E42]/30 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Download .json
            </button>
            <button
              onClick={handleCopy}
              disabled={loading || !!error}
              className="px-4 py-2 text-sm font-medium text-white bg-[#041E42] rounded-lg hover:bg-[#041E42]/90 disabled:opacity-50 min-w-[150px]"
            >
              {copied ? 'Copied!' : 'Copy to clipboard'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
