import { useState, useEffect, useCallback } from 'react'
import UploadStateReportModal from './UploadStateReportModal'
import ReportMarkdownRenderer from '../shared/ReportMarkdownRenderer'
import { getFreshnessInfo } from './StateReportSection'

const FRESHNESS_STYLES = {
  green: 'bg-green-100 text-green-700',
  yellow: 'bg-amber-100 text-amber-700',
  red: 'bg-red-100 text-red-700',
  gray: 'bg-gray-100 text-gray-500',
}

// Re-use parseSections from StateReportSection
function parseSections(markdown) {
  const sections = []
  const lines = markdown.split('\n')
  let currentTitle = null
  let currentLines = []

  for (const line of lines) {
    const match = line.match(/^##\s+(.+)$/)
    if (match) {
      if (currentTitle) {
        sections.push({ title: currentTitle, content: currentLines.join('\n').trim() })
      }
      currentTitle = match[1]
      currentLines = []
    } else if (currentTitle) {
      currentLines.push(line)
    }
  }
  if (currentTitle) {
    sections.push({ title: currentTitle, content: currentLines.join('\n').trim() })
  }

  if (sections.length === 0) {
    return [{ title: 'Report Content', content: markdown.trim() }]
  }

  const datePattern = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}$/i
  const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/
  const merged = []
  for (let i = 0; i < sections.length; i++) {
    const title = sections[i].title.trim()
    if (datePattern.test(title) || isoDatePattern.test(title)) {
      if (i + 1 < sections.length) {
        const datePrefix = `*Report date: ${title}*\n\n`
        sections[i + 1].content = datePrefix + (sections[i].content ? sections[i].content + '\n\n' : '') + sections[i + 1].content
      } else {
        merged.push(sections[i])
      }
    } else {
      merged.push(sections[i])
    }
  }
  return merged.length > 0 ? merged : sections
}

function SectionAccordion({ title, content, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3 text-left bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span className="text-sm font-semibold text-[#041E42]">{title}</span>
        <span className="text-gray-400 text-xs">{open ? '\u25B2' : '\u25BC'}</span>
      </button>
      {open && (
        <div className="px-5 py-4">
          <ReportMarkdownRenderer content={content} />
        </div>
      )}
    </div>
  )
}

export default function StateReportModal({ report, stateCode, stateName, currentProspectCount, onClose, onReportSaved, onOpenPromptBuilder }) {
  const [showUpload, setShowUpload] = useState(false)
  const [copied, setCopied] = useState(false)
  const [allExpanded, setAllExpanded] = useState(null)

  // Close on Escape key
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (!report) return null

  const freshness = getFreshnessInfo(report.researched_at)
  const sections = parseSections(report.content)

  const researchedDate = report.researched_at
    ? new Date(report.researched_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null

  const prospectDelta = currentProspectCount != null && report.prospect_count_at_time != null
    ? currentProspectCount - report.prospect_count_at_time
    : null

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(report.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = report.content
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  function toggleAll() {
    setAllExpanded(prev => prev === null ? false : !prev)
  }

  function handleReportSaved() {
    if (onReportSaved) onReportSaved()
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-[60] transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex-shrink-0 bg-[#041E42] px-6 py-4 rounded-t-xl">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-white">{stateName}</h2>
                  <span className="text-white/60 text-sm">{stateCode}</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${FRESHNESS_STYLES[freshness.color]}`}>
                    {freshness.label}
                    {freshness.days != null && ` (${freshness.days}d)`}
                  </span>
                </div>
                <p className="text-sm text-white/70 mt-1">{report.title || 'Research Report'}</p>
                {researchedDate && (
                  <p className="text-xs text-white/50 mt-0.5">
                    Researched {researchedDate}
                    {report.researched_by && ` by ${report.researched_by}`}
                    {report.prospect_count_at_time != null && ` \u00B7 ${report.prospect_count_at_time} prospects at time`}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="text-white/70 hover:text-white ml-4 mt-1 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Action bar */}
          <div className="flex-shrink-0 flex items-center gap-2 px-6 py-3 border-b border-gray-200 flex-wrap">
            {prospectDelta > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 font-medium mr-2">
                <svg className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                +{prospectDelta} new prospect{prospectDelta !== 1 ? 's' : ''} since report
              </span>
            )}

            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={handleCopy}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {copied ? 'Copied!' : 'Copy Raw Markdown'}
              </button>
              <button
                onClick={toggleAll}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {allExpanded === false ? 'Expand All' : 'Collapse All'}
              </button>
              <button
                onClick={() => setShowUpload(true)}
                className="px-3 py-1.5 text-xs font-medium text-[#041E42] bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Upload New Report
              </button>
              {onOpenPromptBuilder && (
                <button
                  onClick={onOpenPromptBuilder}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-[#041E42] rounded-lg hover:bg-[#041E42]/90"
                >
                  Run State Research
                </button>
              )}
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
            <div className="space-y-3">
              {sections.map((section, i) => (
                <SectionAccordion
                  key={`${section.title}-${allExpanded}`}
                  title={section.title}
                  content={section.content}
                  defaultOpen={allExpanded === null ? i < 3 : allExpanded !== false}
                />
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-t border-gray-200">
            <p className="text-xs text-gray-400">
              {report.content ? `${report.content.split(/\s+/).length.toLocaleString()} words \u00B7 ${sections.length} section${sections.length !== 1 ? 's' : ''}` : ''}
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {showUpload && (
        <UploadStateReportModal
          stateCode={stateCode}
          stateName={stateName}
          onClose={() => setShowUpload(false)}
          onSaved={handleReportSaved}
        />
      )}
    </>
  )
}
