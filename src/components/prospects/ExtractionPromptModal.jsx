import { useState, useEffect } from 'react'

let templateCache = null

export default function ExtractionPromptModal({ prospect, attachment, onClose }) {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function loadAndAssemble() {
      try {
        // Fetch template and existing entities in parallel
        const [template, entities] = await Promise.all([
          loadTemplate(),
          fetchExistingEntities(),
        ])

        const assembled = injectVariables(template, prospect, attachment, entities)
        setPrompt(assembled)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    loadAndAssemble()
  }, [prospect, attachment])

  async function loadTemplate() {
    if (templateCache) return templateCache
    const res = await fetch('/prompts/ontology-extraction-template.md')
    if (!res.ok) throw new Error('Failed to load extraction template')
    const text = await res.text()
    templateCache = text
    return text
  }

  async function fetchExistingEntities() {
    try {
      const res = await fetch('/api/prospects?action=ontology-existing-entities')
      if (!res.ok) return {}
      return await res.json()
    } catch {
      return {}
    }
  }

  function formatExistingEntities(entities) {
    const types = Object.keys(entities).sort()
    if (types.length === 0) return '(No existing entities yet — this will be among the first extractions.)'

    return types.map(type => {
      const names = entities[type].join(', ')
      return `### ${type}\n${names}`
    }).join('\n\n')
  }

  function injectVariables(template, p, att, entities) {
    const vars = {
      company: p.company || 'Unknown',
      id: p.id,
      category: p.category || 'N/A',
      state: p.state || 'N/A',
      source_report: p.source_report || 'N/A',
      brief_content: att?.content || '(No research brief content available)',
      existing_entities: formatExistingEntities(entities),
    }

    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      const val = vars[key]
      if (val === null || val === undefined || val === '') return 'N/A'
      return String(val)
    })
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = prompt
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const wordCount = prompt ? prompt.split(/\s+/).filter(Boolean).length : 0

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-lg font-semibold text-[#041E42]">Ontology Extraction Prompt</h3>
            <p className="text-sm text-gray-500 mt-0.5">{prospect.company}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading template and existing entities...</div>
          ) : error ? (
            <div className="text-center py-8 text-red-500">{error}</div>
          ) : (
            <pre className="whitespace-pre-wrap font-mono text-sm text-gray-800 bg-gray-50 rounded-lg p-4 border border-gray-200 leading-relaxed">
              {prompt}
            </pre>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-200">
          <p className="text-xs text-gray-400">
            {wordCount > 0 && `${wordCount.toLocaleString()} words`}
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Close
            </button>
            <button
              onClick={handleCopy}
              disabled={loading || !!error}
              className="px-4 py-2 text-sm font-medium text-white bg-[#041E42] rounded-lg hover:bg-[#041E42]/90 disabled:opacity-50 min-w-[140px]"
            >
              {copied ? 'Copied!' : 'Copy to Clipboard'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
