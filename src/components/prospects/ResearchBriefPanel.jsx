import { useState } from 'react'
import InfoTooltip from '../national-map/InfoTooltip'
import ReportMarkdownRenderer from '../shared/ReportMarkdownRenderer'

const SECTION_HEADERS = [
  'Pain Points & Opportunities',
  'Recommended Approach',
  'Cold Outreach Draft',
  'Key Risks & Considerations',
]

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

  // If no sections found, return the whole content as one section
  if (sections.length === 0) {
    return [{ title: 'Research Brief', content: markdown.trim() }]
  }
  return sections
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
        <div className="px-4 py-3">
          <ReportMarkdownRenderer content={content} />
        </div>
      )}
    </div>
  )
}

export default function ResearchBriefPanel({ attachment, onDelete, onEdit, onExtractOntology, onImportOntology }) {
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const sections = parseSections(attachment.content)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(attachment.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = attachment.content
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }

    try {
      await fetch(`/api/prospects?action=delete-attachment&attachmentId=${attachment.id}`, {
        method: 'DELETE',
      })
      onDelete()
    } catch (err) {
      console.error('Error deleting attachment:', err)
    }
  }

  const createdDate = attachment.created_at
    ? new Date(attachment.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div className="space-y-3">
      {/* Metadata */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          Added by {attachment.created_by || 'Unknown'}
          {createdDate && ` on ${createdDate}`}
        </p>
        <div className="flex items-center gap-2">
          {onEdit && (
            <>
              <button
                onClick={onEdit}
                className="text-xs text-[#041E42] hover:text-[#041E42]/70 font-medium"
              >
                Edit Brief
              </button>
              <span className="text-gray-300">|</span>
            </>
          )}
          <button
            onClick={handleCopy}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            {copied ? 'Copied!' : 'Copy Raw Markdown'}
          </button>
          <span className="text-gray-300">|</span>
          {onExtractOntology && (
            <>
              <span className="text-gray-300">|</span>
              <button
                onClick={onExtractOntology}
                className="text-xs text-emerald-600 hover:text-emerald-800 font-medium"
              >
                Extract Ontology
              </button>
              <InfoTooltip text="Generate a prompt to extract entities and relationships from this brief for the knowledge graph." />
            </>
          )}
          {onImportOntology && (
            <>
              <span className="text-gray-300">|</span>
              <button
                onClick={onImportOntology}
                className="text-xs text-purple-600 hover:text-purple-800 font-medium"
              >
                Import Extraction
              </button>
              <InfoTooltip text="Import JSON output from an ontology extraction session into the knowledge graph." />
            </>
          )}
          <span className="text-gray-300">|</span>
          <button
            onClick={handleDelete}
            className={`text-xs font-medium ${confirmDelete ? 'text-red-600 hover:text-red-800' : 'text-gray-400 hover:text-red-600'}`}
          >
            {confirmDelete ? 'Confirm Delete?' : 'Delete'}
          </button>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-2">
        {sections.map((section, i) => (
          <SectionAccordion
            key={i}
            title={section.title}
            content={section.content}
            defaultOpen={true}
          />
        ))}
      </div>
    </div>
  )
}
