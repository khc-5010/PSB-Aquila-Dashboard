import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import UploadStateReportModal from './UploadStateReportModal'

// Freshness thresholds (days) — easy to tune
const FRESHNESS_THRESHOLDS = { fresh: 30, aging: 90 }

function getFreshnessInfo(researchedAt) {
  if (!researchedAt) return { label: 'Unknown', color: 'gray', days: null }
  const days = Math.floor((Date.now() - new Date(researchedAt).getTime()) / (1000 * 60 * 60 * 24))
  if (days < FRESHNESS_THRESHOLDS.fresh) return { label: 'Fresh', color: 'green', days }
  if (days < FRESHNESS_THRESHOLDS.aging) return { label: 'Aging', color: 'yellow', days }
  return { label: 'Stale', color: 'red', days }
}

const FRESHNESS_STYLES = {
  green: 'bg-green-100 text-green-700',
  yellow: 'bg-amber-100 text-amber-700',
  red: 'bg-red-100 text-red-700',
  gray: 'bg-gray-100 text-gray-500',
}

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

  // Merge date-only section headers into the following section
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
        className="w-full flex items-center justify-between px-4 py-2.5 text-left bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span className="text-sm font-semibold text-[#041E42]">{title}</span>
        <span className="text-gray-400 text-xs">{open ? '\u25B2' : '\u25BC'}</span>
      </button>
      {open && (
        <div className="px-4 py-3 prose prose-sm max-w-none">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      )}
    </div>
  )
}

export default function StateReportSection({ stateCode, stateName, report, currentProspectCount, onReportSaved, onOpenPromptBuilder }) {
  const [showUpload, setShowUpload] = useState(false)
  const [copied, setCopied] = useState(false)
  const [allExpanded, setAllExpanded] = useState(null) // null = default behavior

  if (!report) {
    return (
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Research Report</h3>
        <div className="flex flex-col items-center justify-center p-6 rounded-lg bg-gray-50 border border-gray-200 border-dashed">
          <svg className="w-8 h-8 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm text-gray-600 mb-1">No research report for {stateName}</p>
          <p className="text-xs text-gray-400 mb-3">Run a state research sweep or upload an existing report.</p>
          <div className="flex items-center gap-2">
            {onOpenPromptBuilder && (
              <button
                onClick={onOpenPromptBuilder}
                className="px-4 py-2 text-sm font-medium text-[#041E42] bg-white border border-[#041E42]/30 rounded-lg hover:bg-[#041E42]/5"
              >
                Run State Research
              </button>
            )}
            <button
              onClick={() => setShowUpload(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-[#041E42] rounded-lg hover:bg-[#041E42]/90"
            >
              Upload Report
            </button>
          </div>
        </div>

        {showUpload && (
          <UploadStateReportModal
            stateCode={stateCode}
            stateName={stateName}
            onClose={() => setShowUpload(false)}
            onSaved={onReportSaved}
          />
        )}
      </div>
    )
  }

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

  return (
    <div className="px-5 py-4 border-b border-gray-100">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Research Report</h3>

      {/* Metadata bar */}
      <div className="flex items-center flex-wrap gap-2 mb-3">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${FRESHNESS_STYLES[freshness.color]}`}>
          {freshness.label}
          {freshness.days != null && ` (${freshness.days}d)`}
        </span>
        <span className="text-xs text-gray-500">
          Researched {researchedDate}
          {report.researched_by && ` by ${report.researched_by}`}
        </span>
        {report.prospect_count_at_time != null && (
          <span className="text-xs text-gray-400">
            · {report.prospect_count_at_time} prospects at time of research
          </span>
        )}
      </div>

      {/* New prospects indicator */}
      {prospectDelta > 0 && (
        <div className="flex items-center gap-1.5 mb-3 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg">
          <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <span className="text-xs text-amber-700 font-medium">
            +{prospectDelta} new prospect{prospectDelta !== 1 ? 's' : ''} added since this report
          </span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <button
          onClick={() => setShowUpload(true)}
          className="px-3 py-1.5 text-xs font-medium text-[#041E42] bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Upload New Report
        </button>
        {onOpenPromptBuilder && (
          <button
            onClick={onOpenPromptBuilder}
            className="px-3 py-1.5 text-xs font-medium text-[#041E42] bg-white border border-[#041E42]/30 rounded-lg hover:bg-[#041E42]/5"
          >
            Run State Research
          </button>
        )}
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
      </div>

      {/* Accordion sections */}
      <div className="space-y-2">
        {sections.map((section, i) => (
          <SectionAccordion
            key={`${section.title}-${allExpanded}`}
            title={section.title}
            content={section.content}
            defaultOpen={allExpanded === null ? i < 3 : allExpanded !== false}
          />
        ))}
      </div>

      {showUpload && (
        <UploadStateReportModal
          stateCode={stateCode}
          stateName={stateName}
          onClose={() => setShowUpload(false)}
          onSaved={onReportSaved}
        />
      )}
    </div>
  )
}

export { FRESHNESS_THRESHOLDS, getFreshnessInfo }
