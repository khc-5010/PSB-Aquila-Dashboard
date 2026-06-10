import { useState, useEffect, useMemo } from 'react'
import { Search, RefreshCw, CheckCircle } from 'lucide-react'
import InfoTooltip from '../national-map/InfoTooltip'
import { useAuth, authFetch } from '../../context/AuthContext'
import { scoreFdaCandidate, MATCH_LEVEL_ORDER } from '../../utils/fdaMatch'

async function fetchFda(url) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)
    if (!res.ok) return []
    const data = await res.json()
    return data.results || []
  } catch {
    clearTimeout(timeout)
    return []
  }
}

// Exact-phrase query first (higher precision — the 10-result cap means token
// noise can crowd out the real match), token search as fallback.
async function searchWithPrecision(buildUrl, name) {
  const cleaned = name.replace(/"/g, '')
  const exact = await fetchFda(buildUrl(encodeURIComponent(`"${cleaned}"`)))
  if (exact.length > 0) return exact
  return fetchFda(buildUrl(encodeURIComponent(name)))
}

function searchFda510k(name) {
  return searchWithPrecision(
    q => `https://api.fda.gov/device/510k.json?search=applicant:${q}&limit=10`,
    name
  )
}

function searchFdaRegistration(name) {
  return searchWithPrecision(
    q => `https://api.fda.gov/device/registrationlisting.json?search=registration.owner_operator.firm_name:${q}&limit=10`,
    name
  )
}

// All names this prospect is known by — includes the typed former_names list
// (absorbed entities often hold the actual FDA records) plus any manually
// retried names from this session.
function candidateNamesFor(prospect, manualNames = []) {
  const former = Array.isArray(prospect.former_names) ? prospect.former_names : []
  return [prospect.company, prospect.also_known_as, prospect.parent_company, ...former, ...manualNames]
    .filter(Boolean)
}

async function runFdaCheck(prospect) {
  const namesToTry = candidateNamesFor(prospect)

  let allClearances = []
  let allFacilities = []

  for (const name of namesToTry) {
    const [clearances, facilities] = await Promise.all([
      searchFda510k(name),
      searchFdaRegistration(name),
    ])
    allClearances.push(...clearances)
    allFacilities.push(...facilities)
  }

  const seen = new Set()
  allClearances = allClearances.filter(c => {
    if (seen.has(c.k_number)) return false
    seen.add(c.k_number)
    return true
  })

  const seenFac = new Set()
  allFacilities = allFacilities.filter(f => {
    const key = f.registration?.registration_number
    if (!key || seenFac.has(key)) return false
    seenFac.add(key)
    return true
  })

  return { clearances: allClearances, facilities: allFacilities }
}

const MATCH_BADGE = {
  strong: { label: 'Strong match', cls: 'bg-green-100 text-green-700' },
  possible: { label: 'Possible match', cls: 'bg-amber-100 text-amber-700' },
  weak: { label: 'Different company?', cls: 'bg-gray-100 text-gray-500' },
}

function MatchBadge({ match }) {
  if (!match) return null
  const cfg = MATCH_BADGE[match.level] || MATCH_BADGE.weak
  return (
    <span
      className={`inline-flex flex-shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${cfg.cls}`}
      title={match.reasons.join(' · ')}
    >
      {cfg.label}
    </span>
  )
}

function FdaEnrichment({ prospect, onUpdate, attachments = [], onSnapshotSaved }) {
  const { user } = useAuth()
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('510k')
  const [retryName, setRetryName] = useState('')
  const [manualNames, setManualNames] = useState([])
  const [confirmed, setConfirmed] = useState(false)
  const [snapshotMeta, setSnapshotMeta] = useState(null) // { checkedAt, createdBy, attachmentId }

  const p = prospect
  const snapshot = attachments.find(a => a.attachment_type === 'fda_snapshot')

  // Load saved snapshot into state
  useEffect(() => {
    if (snapshot && !results && !loading) {
      try {
        const parsed = JSON.parse(snapshot.content)
        setResults({ clearances: parsed.clearances || [], facilities: parsed.facilities || [] })
        setActiveTab((parsed.clearances || []).length > 0 ? '510k' : 'facilities')
        setSnapshotMeta({
          checkedAt: parsed.checkedAt || snapshot.created_at,
          createdBy: snapshot.created_by,
          attachmentId: snapshot.id,
        })
      } catch {
        // Corrupted snapshot — ignore, let user re-check
      }
    }
  }, [snapshot?.id])

  // Grade every result against the prospect's names + location. Annotation is
  // render-side only — snapshots persist the raw FDA records, never _match.
  const candidates = useMemo(() => candidateNamesFor(p, manualNames), [p, manualNames])
  const annotated = useMemo(() => {
    if (!results) return null
    const byLevel = (a, b) => MATCH_LEVEL_ORDER[a._match.level] - MATCH_LEVEL_ORDER[b._match.level]
    const grade = (name, state) =>
      scoreFdaCandidate({ resultName: name, resultState: state, candidateNames: candidates, prospectState: p.state })
    return {
      clearances: results.clearances
        .map(c => ({ ...c, _match: grade(c.applicant, c.state) }))
        .sort(byLevel),
      facilities: results.facilities
        .map(f => ({ ...f, _match: grade(f.registration?.owner_operator?.firm_name, f.registration?.state_code) }))
        .sort(byLevel),
    }
  }, [results, candidates, p.state])

  // Replace-pattern snapshot save, shared by the confirm flow and zero-hit
  // recording. Best-effort: failures log but never block the UI.
  async function saveSnapshot(data, { noRecords = false } = {}) {
    try {
      const existing = attachments.find(a => a.attachment_type === 'fda_snapshot')
      if (existing) {
        await authFetch(`/api/prospects?action=delete-attachment&attachmentId=${existing.id}`, { method: 'DELETE' })
      }

      const snapshotContent = JSON.stringify({
        clearances: data.clearances,
        facilities: data.facilities,
        searchedNames: candidateNamesFor(p, manualNames),
        checkedAt: new Date().toISOString(),
        ...(noRecords ? { noRecords: true } : {}),
      })

      await authFetch('/api/prospects?action=attach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospect_id: p.id,
          attachment_type: 'fda_snapshot',
          title: `FDA Snapshot — ${p.company}`,
          content: snapshotContent,
          created_by: user?.name || null,
        }),
      })

      setSnapshotMeta({
        checkedAt: new Date().toISOString(),
        createdBy: user?.name || null,
        attachmentId: null,
      })

      if (onSnapshotSaved) onSnapshotSaved()
    } catch (err) {
      console.error('Error saving FDA snapshot:', err)
    }
  }

  async function handleCheck() {
    setLoading(true)
    setError(null)
    setSnapshotMeta(null)
    try {
      const data = await runFdaCheck(p)
      setResults(data)
      setActiveTab(data.clearances.length > 0 ? '510k' : 'facilities')
      // Zero hits and nothing saved yet: record "checked, nothing found" so a
      // future FDA queue knows this company is done. Never overwrites an
      // existing snapshot (a flaky empty re-check must not clobber real data).
      const total = data.clearances.length + data.facilities.length
      if (total === 0 && !attachments.find(a => a.attachment_type === 'fda_snapshot')) {
        await saveSnapshot(data, { noRecords: true })
      }
    } catch (err) {
      setError('Failed to query FDA databases. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleRetry() {
    if (!retryName.trim()) return
    const name = retryName.trim()
    setLoading(true)
    setError(null)
    setSnapshotMeta(null)
    try {
      const [clearances, facilities] = await Promise.all([
        searchFda510k(name),
        searchFdaRegistration(name),
      ])
      setManualNames(prev => prev.includes(name) ? prev : [...prev, name]) // so grading recognizes the manual name
      setResults({ clearances, facilities })
      setActiveTab(clearances.length > 0 ? '510k' : 'facilities')
    } catch {
      setError('Retry failed. Check the company name and try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm() {
    // 1. Update medical_device_mfg field
    onUpdate(p.id, 'medical_device_mfg', 'Yes (confirmed)')

    // 2. Append 510(k) numbers to notes
    if (results?.clearances?.length > 0) {
      const kNumbers = results.clearances.map(c => c.k_number).filter(Boolean).join(', ')
      const dateStr = new Date().toISOString().slice(0, 10)
      const fdaNote = `[FDA ${dateStr}] 510(k): ${kNumbers}`
      const existingNotes = p.notes || ''
      const newNotes = existingNotes ? `${existingNotes}\n${fdaNote}` : fdaNote
      onUpdate(p.id, 'notes', newNotes)
    }

    // 3. Save FDA snapshot as attachment (replace existing)
    await saveSnapshot(results)

    setConfirmed(true)
  }

  const totalResults = (results?.clearances?.length || 0) + (results?.facilities?.length || 0)
  const hasResults = totalResults > 0
  const alreadyConfirmed = p.medical_device_mfg === 'Yes (confirmed)'

  // Gate the green confirm bar on at least one non-weak match — when every
  // result grades "different company?", confirming is opt-in with a warning
  // instead of an invitation.
  const hasConfidentMatch = annotated
    ? [...annotated.clearances, ...annotated.facilities].some(r => r._match.level !== 'weak')
    : false

  const badge = !results ? (
    <span className="text-xs text-gray-400 font-normal ml-2">Not checked</span>
  ) : hasResults ? (
    <span className="text-xs text-green-600 font-normal ml-2">
      {results.clearances.length} clearance{results.clearances.length !== 1 ? 's' : ''} · {results.facilities.length} facilit{results.facilities.length !== 1 ? 'ies' : 'y'}
    </span>
  ) : (
    <span className="text-xs text-amber-600 font-normal ml-2">No matches</span>
  )

  return (
    <div>
      <div className="flex items-center gap-1 mb-3">
        {badge}
        <InfoTooltip text="Searches the FDA's public databases for 510(k) device clearances and registered manufacturing facilities. Each result is graded against this company's names and location — only confirm Strong/Possible matches you recognize. No FDA records does NOT mean not-medical: component suppliers are exempt from registration." />
      </div>

      {/* Before check state */}
      {!results && !loading && (
        <div>
          <p className="text-xs text-gray-500 mb-3">
            Query the FDA's openFDA databases for 510(k) clearances and registered manufacturing establishments.
            {candidateNamesFor(p).length > 1 && ` Searches ${candidateNamesFor(p).length} known names (incl. AKA/parent/former names).`}
          </p>
          <button
            onClick={handleCheck}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#041E42] text-white rounded-lg hover:bg-[#041E42]/90 transition-colors"
          >
            <Search className="w-3.5 h-3.5" />
            Check FDA databases
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center gap-2 py-3">
          <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
          <span className="text-sm text-gray-600">Checking FDA databases...</span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <p className="text-xs text-red-600 mb-2">{error}</p>
      )}

      {/* Results */}
      {results && !loading && (
        <div>
          {hasResults ? (
            <>
              {/* Snapshot timestamp + re-check */}
              {snapshotMeta && (
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400">
                    Checked on {new Date(snapshotMeta.checkedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {snapshotMeta.createdBy ? ` by ${snapshotMeta.createdBy}` : ''}
                  </span>
                  <button
                    onClick={handleCheck}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded hover:bg-gray-50 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Re-check FDA
                  </button>
                </div>
              )}

              {/* Tab bar */}
              <div className="flex gap-1 mb-3 border-b border-gray-100">
                <button
                  onClick={() => setActiveTab('510k')}
                  className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                    activeTab === '510k'
                      ? 'border-[#041E42] text-[#041E42]'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  510(k) Clearances ({results.clearances.length})
                </button>
                <button
                  onClick={() => setActiveTab('facilities')}
                  className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                    activeTab === 'facilities'
                      ? 'border-[#041E42] text-[#041E42]'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Facilities ({results.facilities.length})
                </button>
                {!snapshotMeta && (
                  <button
                    onClick={handleCheck}
                    className="ml-auto px-2 py-1 text-xs text-gray-400 hover:text-gray-600"
                    title="Refresh"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* 510(k) clearances — sorted strongest match first */}
              {activeTab === '510k' && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {annotated.clearances.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No 510(k) clearances found.</p>
                  ) : (
                    annotated.clearances.map((c, i) => (
                      <div key={c.k_number || i} className="p-2 bg-gray-50 rounded text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span className="font-medium text-gray-900">{c.k_number}</span>
                            <MatchBadge match={c._match} />
                          </span>
                          <span className="text-gray-400 flex-shrink-0">{c.decision_date || c.date_received || ''}</span>
                        </div>
                        <p className="text-gray-600 mt-0.5 line-clamp-2">{c.device_name || c.openfda?.device_name || 'Unknown device'}</p>
                        {c.applicant && (
                          <p className="text-gray-400 mt-0.5">
                            {c.applicant}{c.state ? ` — ${c.city ? c.city + ', ' : ''}${c.state}` : ''}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Facilities — sorted strongest match first */}
              {activeTab === 'facilities' && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {annotated.facilities.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No registered facilities found.</p>
                  ) : (
                    annotated.facilities.map((f, i) => {
                      const reg = f.registration || {}
                      const owner = reg.owner_operator || {}
                      const addr = reg.address_line_1 || ''
                      const city = reg.city || ''
                      const state = reg.state_code || ''
                      return (
                        <div key={reg.registration_number || i} className="p-2 bg-gray-50 rounded text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 min-w-0">
                              <span className="font-medium text-gray-900 truncate">{owner.firm_name || 'Unknown'}</span>
                              <MatchBadge match={f._match} />
                            </span>
                            <span className="text-gray-400 flex-shrink-0">#{reg.registration_number || ''}</span>
                          </div>
                          {(addr || city) && (
                            <p className="text-gray-500 mt-0.5">{[addr, city, state].filter(Boolean).join(', ')}</p>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              )}

              {/* Confirm bar — green invitation only when something actually matches */}
              {!alreadyConfirmed && !confirmed && (
                hasConfidentMatch ? (
                  <div className="mt-3 p-2.5 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between gap-2">
                    <span className="text-xs text-green-800">FDA results match this company. Update medical device status?</span>
                    <button
                      onClick={handleConfirm}
                      className="inline-flex flex-shrink-0 items-center gap-1 px-2.5 py-1 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                    >
                      <CheckCircle className="w-3 h-3" />
                      Update to Yes (confirmed)
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-xs text-amber-800 mb-1.5">
                      These results don't look like {p.company} — names/locations don't line up. Confirm only if you recognize one as theirs.
                    </p>
                    <button
                      onClick={handleConfirm}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-amber-800 bg-white border border-amber-300 rounded hover:bg-amber-100 transition-colors"
                    >
                      <CheckCircle className="w-3 h-3" />
                      Confirm anyway
                    </button>
                  </div>
                )
              )}
              {(alreadyConfirmed || confirmed) && (
                <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded-lg">
                  <span className="text-xs text-green-700 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    Medical device status confirmed via FDA data
                  </span>
                </div>
              )}
            </>
          ) : (
            /* No results state */
            <div>
              {snapshotMeta && (
                <p className="text-[11px] text-gray-400 mb-1">
                  Recorded "no FDA records" on {new Date(snapshotMeta.checkedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {snapshotMeta.createdBy ? ` by ${snapshotMeta.createdBy}` : ''}
                </p>
              )}
              <p className="text-xs text-gray-500 mb-2">
                No FDA records found for {candidateNamesFor(p, manualNames).map(n => `"${n}"`).join(' or ')}.
                The company may use a different legal name in FDA filings — and no records does
                not mean not-medical (component suppliers don't have to register).
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={retryName}
                  onChange={(e) => setRetryName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRetry()}
                  placeholder="Try alternate name..."
                  className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#041E42]/20"
                />
                <button
                  onClick={handleRetry}
                  disabled={!retryName.trim()}
                  className="px-3 py-1.5 text-xs font-medium bg-[#041E42] text-white rounded hover:bg-[#041E42]/90 disabled:opacity-50 transition-colors"
                >
                  Retry
                </button>
                <button
                  onClick={handleCheck}
                  className="px-2 py-1.5 text-xs text-gray-400 hover:text-gray-600"
                  title="Re-check original names"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default FdaEnrichment
