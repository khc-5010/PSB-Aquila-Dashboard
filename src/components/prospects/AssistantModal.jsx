import { useState, useRef, useEffect } from 'react'
import { X, Send, Sparkles, Search, Copy, Check } from 'lucide-react'
import { authFetch, useAuth } from '../../context/AuthContext'
import ReportMarkdownRenderer from '../shared/ReportMarkdownRenderer'
import { copyText } from '../../utils/exportProspect'

// Read-only reasoning assistant chat panel, launched from ProspectDetail.
// Talks to POST /api/prospects?action=assistant (Together.ai tool-use loop over
// five SELECT-only tools). Non-streaming: one request per turn returns
// { answer, toolsUsed[] }. The full conversation is sent each turn so follow-ups
// stay coherent; the server prepends its own system prompt and the
// "currently viewing prospect #X" context from prospectId.
// Mirrors ExportJsonModal's z-[60] sub-modal shell + own-Escape pattern.

// Starter prompts: prospect-scoped (launched from a prospect) vs global
// (launched from the header — spans prospects + the live pipeline + state reports).
const PROSPECT_SUGGESTIONS = [
  'Summarize what we know about this company and why it matters.',
  'How does this company compare to similar prospects we track?',
  'What gaps or risks should I know before reaching out?',
]
const GLOBAL_SUGGESTIONS = [
  "What's in the pipeline right now, and what looks stalled?",
  'Which medical-device molders have ISO 13485 certification?',
  'Which prospects have a closing PE-acquisition window?',
]

// Plain-English names + tooltips for the read-only data sources the assistant
// consulted. Shown under each answer as a non-clickable "what I checked" footnote
// (the raw tool names like find_similar_prospects are jargon to end users).
const TOOL_LABELS = {
  search_prospects: 'Searched prospects',
  get_prospect: 'Company details',
  find_similar_prospects: 'Similar companies',
  query_ontology: 'Knowledge graph',
  get_research_brief: 'Research brief',
  search_pipeline: 'Searched pipeline',
  get_opportunity: 'Deal details',
  get_state_report: 'State report',
}
const TOOL_TIPS = {
  search_prospects: 'Searched the prospect database',
  get_prospect: "Pulled the company's full record",
  find_similar_prospects: 'Found companies with similar certifications, technologies, and markets',
  query_ontology: 'Searched the knowledge graph by capability (certifications, technology, markets)',
  get_research_brief: 'Read the saved research brief',
  search_pipeline: 'Searched the live Pipeline (active deals/opportunities)',
  get_opportunity: "Pulled a deal's full record + recent activity",
  get_state_report: 'Read the current state research report',
}
const labelForTool = (t) => TOOL_LABELS[t] || t.replace(/_/g, ' ')

export default function AssistantModal({ prospect, onClose, mode = 'chat', initialMessage = null }) {
  const { user } = useAuth()
  const [messages, setMessages] = useState([]) // { role: 'user'|'assistant', content, toolsUsed? }
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [copiedIdx, setCopiedIdx] = useState(null)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const seededRef = useRef(false)

  // Own Escape handler so this sub-modal closes first (ProspectDetail's Escape
  // is suppressed while showAssistantModal is open).
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Draft mode (and any caller that passes initialMessage): auto-send the seed
  // once on open so the user sees their request + the grounded draft. Ref-guarded
  // against StrictMode double-invoke.
  useEffect(() => {
    if (initialMessage && !seededRef.current) {
      seededRef.current = true
      send(initialMessage)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the latest message / thinking indicator in view.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  async function runRequest(convo) {
    setLoading(true)
    setError(null)
    try {
      const res = await authFetch('/api/prospects?action=assistant', {
        method: 'POST',
        body: JSON.stringify({
          messages: convo.map((m) => ({ role: m.role, content: m.content })),
          prospectId: prospect?.id ?? null,
          mode,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Request failed (${res.status})`)
      }
      const data = await res.json()
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.answer || '(no answer returned)', toolsUsed: data.toolsUsed || [] },
      ])
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  function send(text) {
    const content = (text ?? input).trim()
    if (!content || loading) return
    const next = [...messages, { role: 'user', content }]
    setMessages(next)
    setInput('')
    runRequest(next)
  }

  // Re-send the current conversation (its last turn is the user message that failed).
  function retry() {
    if (loading || !messages.length) return
    runRequest(messages)
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const empty = messages.length === 0
  // Global mode = launched from the header (no prospect context); prospect mode =
  // launched from a specific prospect. Drives copy + starter prompts.
  const isGlobal = !prospect
  const isDraft = mode === 'draft'
  const suggestions = isGlobal ? GLOBAL_SUGGESTIONS : PROSPECT_SUGGESTIONS
  const title = isDraft ? 'Draft message' : 'Ask AI'
  const subtitle = isDraft
    ? 'AI draft · review & edit before sending'
    : (isGlobal ? 'across prospects & pipeline' : prospect?.company)
  const askName = isGlobal ? 'your prospects or the pipeline' : (prospect?.company || 'this company')

  async function handleCopy(text, idx) {
    const ok = await copyText(text)
    if (ok) {
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx((c) => (c === idx ? null : c)), 2000)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-[#041E42] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#041E42]" />
              {title}
            </h3>
            <p className="text-sm text-gray-500 mt-0.5 truncate">
              {subtitle}
              <span className="text-gray-400"> · read-only · answers grounded in dashboard data</span>
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0" title="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {empty && !initialMessage ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <Sparkles className="w-7 h-7 text-gray-300 mb-3" />
              <p className="text-sm text-gray-500 max-w-sm">
                {isGlobal ? (
                  <>Ask about your prospects or the live pipeline. I can search prospects and deals, pull full
                  context, find similar companies, query the knowledge graph, and read research &amp; state reports —
                  but I can&apos;t change anything.</>
                ) : (
                  <>Ask about {prospect?.company || 'this company'} or your other prospects. I can search prospects, pull
                  full context, find similar companies, query the knowledge graph, and read research briefs — but I
                  can&apos;t change anything.</>
                )}
              </p>
              <div className="mt-5 w-full max-w-md space-y-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="w-full text-left text-sm text-[#041E42] bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] bg-[#041E42] text-white rounded-2xl rounded-br-sm px-4 py-2 text-sm whitespace-pre-wrap break-words">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={i} className="flex justify-start">
                  <div className="max-w-[90%] bg-gray-50 border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-gray-800">
                    <ReportMarkdownRenderer content={m.content} />
                    {m.toolsUsed && m.toolsUsed.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-gray-200 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-400">
                        <span className="inline-flex items-center gap-1 cursor-default" title="The dashboard data this answer is based on">
                          <Search className="w-3 h-3" />
                          Based on:
                        </span>
                        {m.toolsUsed.map((t) => (
                          <span
                            key={t}
                            title={TOOL_TIPS[t] || ''}
                            className="bg-gray-100 text-gray-500 rounded px-1.5 py-0.5 cursor-default"
                          >
                            {labelForTool(t)}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 flex justify-end">
                      <button
                        onClick={() => handleCopy(m.content, i)}
                        className="inline-flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600"
                        title="Copy this message"
                      >
                        {copiedIdx === i ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copiedIdx === i ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            )
          )}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-50 border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-gray-400 flex items-center gap-2">
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                </span>
                Thinking… (reading the data — may take a few seconds)
              </div>
            </div>
          )}

          {error && (
            <div className="flex justify-start">
              <div className="max-w-[90%] bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-600">
                {error}{' '}
                <button onClick={retry} className="underline font-medium hover:text-red-700">
                  Retry
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 p-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder={`Ask about ${askName}…`}
              className="flex-1 resize-none max-h-32 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#041E42]/30 focus:border-[#041E42]"
            />
            <button
              onClick={() => send()}
              disabled={loading || !input.trim()}
              className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#041E42] text-white hover:bg-[#041E42]/90 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
              title="Send"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-1.5 px-1">
            Enter to send · Shift+Enter for a new line{user?.name ? ` · ${user.name}` : ''}
          </p>
        </div>
      </div>
    </div>
  )
}
