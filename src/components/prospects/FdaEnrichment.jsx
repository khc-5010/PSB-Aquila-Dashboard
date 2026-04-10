import { useState, useEffect } from 'react'
import { Search, RefreshCw, CheckCircle } from 'lucide-react'
import InfoTooltip from '../national-map/InfoTooltip'
import { useAuth } from '../../context/AuthContext'

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

async function searchFda510k(name) {
  const encoded = encodeURIComponent(name)
  return fetchFda(`https://api.fda.gov/device/510k.json?search=applicant:${encoded}&limit=10`)
}

async function searchFdaRegistration(name) {
  const encoded = encodeURIComponent(name)
  return fetchFda(`https://api.fda.gov/device/registrationlisting.json?search=registration.owner_operator.firm_name:${encoded}&limit=10`)
}

async function runFdaCheck(prospect) {
  const namesToTry = [
    prospect.company,
    prospect.also_known_as,
    prospect.parent_company,
  ].filter(Boolean)

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

function FdaEnrichment({ prospect, onUpdate, attachments = [], onSnapshotSaved }) {
  const { user } = useAuth()
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('510k')
  const [retryName, setRetryName] = useState('')
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

  async function handleCheck() {
    setLoading(true)
    setError(null)
    setSnapshotMeta(null)
    try {
      const data = await runFdaCheck(p)
      setResults(data)
      setActiveTab(data.clearances.length > 0 ? '510k' : 'facilities')
    } catch (err) {
      setError('Failed to query FDA databases. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleRetry() {
    if (!retryName.trim()) return
    setLoading(true)
    setError(null)
    setSnapshotMeta(null)
    try {
      const [clearances, facilities] = await Promise.all([
        searchFda510k(retryName.trim()),
        searchFdaRegistration(retryName.trim()),
      ])
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
    try {
      const existing = attachments.find(a => a.attachment_type === 'fda_snapshot')
      if (existing) {
        await fetch(`/api/prospects?action=delete-attachment&attachmentId=${existing.id}`, { method: 'DELETE' })
      }

      const snapshotContent = JSON.stringify({
        clearances: results.clearances,
        facilities: results.facilities,
        searchedNames: [p.company, p.also_known_as, p.parent_company].filter(Boolean),
        checkedAt: new Date().toISOString(),
      })

      await fetch('/api/prospects?action=attach', {
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

    setConfirmed(true)
  }

  const totalResults = (results?.clearances?.length || 0) + (results?.facilities?.length || 0)
  const hasResults = totalResults > 0
  const alreadyConfirmed = p.medical_device_mfg === 'Yes (confirmed)'

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
        <InfoTooltip text="Searches the FDA's public databases for 510(k) device clearances and registered manufacturing facilities associated with this company." />
      </div>

      {/* Before check state */}
      {!results && !loading && (
        <div>
          <p className="text-xs text-gray-500 mb-3">
            Query the FDA's openFDA databases for 510(k) clearances and registered manufacturing establishments.
            {p.also_known_as && ` Will also search "${p.also_known_as}".`}
            {p.parent_company && ` Will also search parent "${p.parent_company}".`}
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

              {/* 510(k) clearances */}
              {activeTab === '510k' && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {results.clearances.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No 510(k) clearances found.</p>
                  ) : (
                    results.clearances.map((c, i) => (
                      <div key={c.k_number || i} className="p-2 bg-gray-50 rounded text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-900">{c.k_number}</span>
                          <span className="text-gray-400">{c.decision_date || c.date_received || ''}</span>
                        </div>
                        <p className="text-gray-600 mt-0.5 line-clamp-2">{c.device_name || c.openfda?.device_name || 'Unknown device'}</p>
                        {c.applicant && <p className="text-gray-400 mt-0.5">{c.applicant}</p>}
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Facilities */}
              {activeTab === 'facilities' && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {results.facilities.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No registered facilities found.</p>
                  ) : (
                    results.facilities.map((f, i) => {
                      const reg = f.registration || {}
                      const owner = reg.owner_operator || {}
                      const addr = reg.address_line_1 || ''
                      const city = reg.city || ''
                      const state = reg.state_code || ''
                      return (
                        <div key={reg.registration_number || i} className="p-2 bg-gray-50 rounded text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-gray-900">{owner.firm_name || 'Unknown'}</span>
                            <span className="text-gray-400">#{reg.registration_number || ''}</span>
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

              {/* Confirm bar */}
              {!alreadyConfirmed && !confirmed && (
                <div className="mt-3 p-2.5 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
                  <span className="text-xs text-green-800">FDA data found. Update medical device status?</span>
                  <button
                    onClick={handleConfirm}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                  >
                    <CheckCircle className="w-3 h-3" />
                    Update to Yes (confirmed)
                  </button>
                </div>
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
              <p className="text-xs text-gray-500 mb-2">
                No FDA records found for "{p.company}"
                {p.also_known_as ? ` or "${p.also_known_as}"` : ''}
                {p.parent_company ? ` or "${p.parent_company}"` : ''}.
                The company may use a different legal name in FDA filings.
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
