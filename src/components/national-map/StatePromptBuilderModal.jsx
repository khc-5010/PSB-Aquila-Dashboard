import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { STATE_ABBR_TO_NAME } from '../../data/us-states'

let templateCache = null

const CATEGORY_OPTIONS = [
  { key: 'converters', label: 'Converters' },
  { key: 'converter_tooling', label: 'Converter + In-House Tooling' },
  { key: 'mold_makers', label: 'Mold Makers' },
  { key: 'medical', label: 'Medical device focus' },
  { key: 'pe_ma', label: 'PE/M&A activity focus' },
]

const STATE_OPTIONS = Object.entries(STATE_ABBR_TO_NAME)
  .map(([code, name]) => ({ code, name }))
  .sort((a, b) => a.name.localeCompare(b.name))

export default function StatePromptBuilderModal({ stateCode, stateName, onClose }) {
  const { user } = useAuth()
  const [template, setTemplate] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  // Parameters
  const [selectedState, setSelectedState] = useState(stateCode || '')
  const [selectedStateName, setSelectedStateName] = useState(stateName || '')
  const [categories, setCategories] = useState(
    CATEGORY_OPTIONS.reduce((acc, c) => ({ ...acc, [c.key]: true }), {})
  )
  const [minEmployees, setMinEmployees] = useState(25)
  const [cwpEnabled, setCwpEnabled] = useState(true)
  const [excludeExisting, setExcludeExisting] = useState(true)

  // Prospects data for exclusion list
  const [prospects, setProspects] = useState(null)

  // Load template
  useEffect(() => {
    async function load() {
      try {
        if (templateCache) {
          setTemplate(templateCache)
          setLoading(false)
          return
        }
        const res = await fetch('/prompts/state-research-template.md')
        if (!res.ok) throw new Error('Failed to load template')
        const text = await res.text()
        templateCache = text
        setTemplate(text)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Fetch prospects for exclusion list
  useEffect(() => {
    fetch('/api/prospects')
      .then(res => res.ok ? res.json() : [])
      .then(data => setProspects(Array.isArray(data) ? data : []))
      .catch(() => setProspects([]))
  }, [])

  // Handle state change
  function handleStateChange(code) {
    setSelectedState(code)
    setSelectedStateName(STATE_ABBR_TO_NAME[code] || '')
  }

  // Get companies in selected state
  const stateCompanies = useMemo(() => {
    if (!prospects || !selectedState) return []
    return prospects
      .filter(p => p.state && p.state.toUpperCase() === selectedState.toUpperCase())
      .map(p => p.company)
      .sort()
  }, [prospects, selectedState])

  // Build focus instructions
  function buildFocusInstructions() {
    const allChecked = Object.values(categories).every(v => v)
    if (allChecked) {
      return 'Search across all plastics manufacturing categories as defined in the Target Company Profile section below. Apply standard priority ordering (Converter + In-House Tooling > Converter > Mold Maker > Medical > Other).'
    }
    const selected = CATEGORY_OPTIONS.filter(c => categories[c.key]).map(c => c.label)
    if (selected.length === 0) {
      return 'Search across all plastics manufacturing categories as defined in the Target Company Profile section below. Apply standard priority ordering.'
    }
    return `Prioritize companies in these categories: ${selected.join(', ')}. Other categories are lower priority but should still be surfaced if signals are strong.`
  }

  // Build CWP instructions
  function buildCwpInstructions() {
    if (cwpEnabled) {
      return 'Search for Penn State Behrend / CWP connections for each identified company. Check LinkedIn for Behrend alumni at these companies, cross-reference with Behrend advisory boards, and flag any existing training relationships. This is especially valuable for Tier 1 geographic states (PA, OH, NY, bordering states).'
    }
    return 'Skip the CWP/PSB connection search for this state — geographic distance makes existing Behrend training relationships unlikely. Focus research time on other signal categories instead.'
  }

  // Build geographic notes
  function buildGeoNotes() {
    const tier1 = ['PA', 'OH', 'NY', 'NJ', 'DE', 'MD', 'WV', 'VA']
    const tier2 = ['MI', 'IN', 'IL', 'WI']
    if (tier1.includes(selectedState)) {
      return `${selectedStateName} is in the Tier 1 geographic zone (bordering or near Erie, PA). Apply the benefit of the doubt — include companies with moderate signals that might not qualify in more distant states. PSB/CWP connections are likely.`
    }
    if (tier2.includes(selectedState)) {
      return `${selectedStateName} is in the Tier 2 geographic zone (Midwest manufacturing belt). Strong plastics manufacturing base expected. CWP connections possible but less common than Tier 1 states.`
    }
    return `${selectedStateName} is in the Tier 3 geographic zone (beyond the core Midwest/Northeast). Require multiple strong signals for inclusion. PSB/CWP connections are unlikely but should still be checked if the CWP cross-reference is enabled.`
  }

  // Build existing companies list
  function buildExistingList() {
    if (!excludeExisting || stateCompanies.length === 0) {
      return 'No exclusions — include all companies found.'
    }
    const list = stateCompanies.map(c => `- ${c}`).join('\n')
    return `${list}\n\n(${stateCompanies.length} companies total)`
  }

  // Assemble prompt
  const assembledPrompt = useMemo(() => {
    if (!template || !selectedState) return ''
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    const vars = {
      state_name: selectedStateName,
      state_code: selectedState,
      research_date: today,
      requested_by: user?.name || 'Alliance Team',
      existing_count: excludeExisting ? String(stateCompanies.length) : '0',
      existing_companies_list: buildExistingList(),
      focus_instructions: buildFocusInstructions(),
      min_employees: String(minEmployees),
      cwp_instructions: buildCwpInstructions(),
      geo_notes: buildGeoNotes(),
    }
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      if (key in vars) return vars[key]
      return match // leave unmatched variables as-is (they appear in the output format examples)
    })
  }, [template, selectedState, selectedStateName, categories, minEmployees, cwpEnabled, excludeExisting, stateCompanies, user])

  // Word count
  const wordCount = useMemo(() => {
    if (!assembledPrompt) return 0
    return assembledPrompt.split(/\s+/).filter(w => w.length > 0).length
  }, [assembledPrompt])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(assembledPrompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = assembledPrompt
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  function handleCategoryToggle(key) {
    setCategories(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-[#041E42]">Build State Research Prompt</h3>
            {selectedStateName && (
              <p className="text-sm text-gray-500 mt-0.5">{selectedStateName} ({selectedState})</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row min-h-0">
          {/* Parameters Panel */}
          <div className="lg:w-80 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-gray-200 overflow-y-auto p-5 space-y-5">
            {/* State selector */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Target State
              </label>
              <select
                value={selectedState}
                onChange={e => handleStateChange(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#041E42]/20 focus:border-[#041E42]"
              >
                <option value="">Select a state...</option>
                {STATE_OPTIONS.map(s => (
                  <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
                ))}
              </select>
              {selectedState && prospects && (
                <p className="text-xs text-gray-400 mt-1">
                  {stateCompanies.length} existing prospect{stateCompanies.length !== 1 ? 's' : ''} in {selectedStateName}
                </p>
              )}
            </div>

            {/* Industry focus */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Industry Focus
              </label>
              <div className="space-y-1.5">
                {CATEGORY_OPTIONS.map(c => (
                  <label key={c.key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={categories[c.key]}
                      onChange={() => handleCategoryToggle(c.key)}
                      className="rounded border-gray-300 text-[#041E42] focus:ring-[#041E42]/20"
                    />
                    <span className="text-sm text-gray-700">{c.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Min employees */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Minimum Employees
              </label>
              <input
                type="number"
                value={minEmployees}
                onChange={e => setMinEmployees(Math.max(1, parseInt(e.target.value) || 1))}
                min={1}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#041E42]/20 focus:border-[#041E42]"
              />
              <p className="text-xs text-gray-400 mt-1">Exclude companies below this size</p>
            </div>

            {/* CWP toggle */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cwpEnabled}
                  onChange={e => setCwpEnabled(e.target.checked)}
                  className="rounded border-gray-300 text-[#041E42] focus:ring-[#041E42]/20"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">CWP Cross-Reference</span>
                  <p className="text-xs text-gray-400">Search for PSB/Behrend connections</p>
                </div>
              </label>
            </div>

            {/* Exclude existing toggle */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={excludeExisting}
                  onChange={e => setExcludeExisting(e.target.checked)}
                  className="rounded border-gray-300 text-[#041E42] focus:ring-[#041E42]/20"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">Exclude Existing Companies</span>
                  <p className="text-xs text-gray-400">
                    {stateCompanies.length > 0
                      ? `${stateCompanies.length} companies will be excluded`
                      : 'No companies to exclude in this state'}
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Preview Panel */}
          <div className="flex-1 overflow-y-auto p-5 min-w-0">
            {loading ? (
              <div className="text-center py-8 text-gray-500">Loading template...</div>
            ) : error ? (
              <div className="text-center py-8 text-red-500">{error}</div>
            ) : !selectedState ? (
              <div className="text-center py-12 text-gray-400">
                <svg className="w-10 h-10 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                <p className="text-sm">Select a state to preview the prompt</p>
              </div>
            ) : (
              <pre className="whitespace-pre-wrap font-mono text-xs text-gray-800 bg-gray-50 rounded-lg p-4 border border-gray-200 leading-relaxed">
                {assembledPrompt}
              </pre>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-200 flex-shrink-0">
          <div className="text-xs text-gray-400">
            {selectedState && assembledPrompt && (
              <>~{wordCount.toLocaleString()} words &middot; Paste into Claude with web search enabled</>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Close
            </button>
            <button
              onClick={handleCopy}
              disabled={loading || !!error || !selectedState}
              className="px-4 py-2 text-sm font-medium text-white bg-[#041E42] rounded-lg hover:bg-[#041E42]/90 disabled:opacity-50 min-w-[160px]"
            >
              {copied ? 'Copied!' : 'Copy to Clipboard'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
