import { useState } from 'react'
import InfoTooltip from '../national-map/InfoTooltip'

const VALID_ENTITY_TYPES = [
  'Technology / Software', 'Equipment Brand', 'Quality Method', 'Material',
  'Market Vertical', 'Manufacturing Process', 'Workforce Capability',
  'Company', 'Certification', 'Ownership Structure',
]

const VALID_RELATIONSHIP_TYPES = [
  'uses_technology', 'uses_equipment_brand', 'holds_certification', 'serves_market',
  'operates_process', 'employs_method', 'processes_material', 'has_workforce_capability',
  'acquired_by', 'subsidiary_of', 'partners_with', 'competes_with', 'supplies_to',
  'has_ownership_structure',
]

const VALID_CONFIDENCES = ['Confirmed', 'Likely', 'Inferred']

function validateImportData(data, prospectId) {
  const errors = []

  if (!data || typeof data !== 'object') {
    return ['Invalid JSON: expected an object with "entities" and "relationships" arrays.']
  }

  if (!Array.isArray(data.entities)) {
    errors.push('"entities" must be an array.')
  } else if (data.entities.length === 0) {
    errors.push('"entities" array is empty — nothing to import.')
  } else {
    for (let i = 0; i < data.entities.length; i++) {
      const e = data.entities[i]
      if (!e.type || !VALID_ENTITY_TYPES.includes(e.type)) {
        errors.push(`Entity ${i + 1}: invalid type "${e.type}". Must be one of: ${VALID_ENTITY_TYPES.join(', ')}`)
      }
      if (!e.name || typeof e.name !== 'string' || !e.name.trim()) {
        errors.push(`Entity ${i + 1}: "name" is required and must be a non-empty string.`)
      }
      if (e.confidence && !VALID_CONFIDENCES.includes(e.confidence)) {
        errors.push(`Entity ${i + 1} ("${e.name}"): invalid confidence "${e.confidence}".`)
      }
    }
  }

  if (!Array.isArray(data.relationships)) {
    errors.push('"relationships" must be an array.')
  } else {
    for (let i = 0; i < data.relationships.length; i++) {
      const r = data.relationships[i]
      if (!r.relationship_type || !VALID_RELATIONSHIP_TYPES.includes(r.relationship_type)) {
        errors.push(`Relationship ${i + 1}: invalid type "${r.relationship_type}".`)
      }
      if (!r.subject || typeof r.subject !== 'string') {
        errors.push(`Relationship ${i + 1}: "subject" is required.`)
      }
      if (!r.object || typeof r.object !== 'string') {
        errors.push(`Relationship ${i + 1}: "object" is required.`)
      }
    }
  }

  return errors
}

export default function ImportOntologyModal({ prospect, onClose, onImported }) {
  const [step, setStep] = useState('paste') // 'paste' | 'preview'
  const [rawJson, setRawJson] = useState('')
  const [parsed, setParsed] = useState(null)
  const [parseErrors, setParseErrors] = useState([])
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [error, setError] = useState(null)

  function handleParse() {
    setParseErrors([])
    setError(null)

    let data
    try {
      data = JSON.parse(rawJson.trim())
    } catch (err) {
      setParseErrors([`Invalid JSON: ${err.message}`])
      return
    }

    const validationErrors = validateImportData(data, prospect.id)
    if (validationErrors.length > 0) {
      setParseErrors(validationErrors)
      return
    }

    // Normalize: ensure prospect_id is set
    data.prospect_id = prospect.id
    setParsed(data)
    setStep('preview')
  }

  async function handleImport() {
    if (!parsed) return
    setImporting(true)
    setError(null)

    try {
      const res = await fetch('/api/prospects?action=import-ontology-extraction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospect_id: prospect.id,
          entities: parsed.entities,
          relationships: parsed.relationships,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')

      setImportResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setImporting(false)
    }
  }

  function handleDone() {
    if (onImported) onImported()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-lg font-semibold text-[#041E42]">
              Import Ontology Extraction
              <InfoTooltip text="Paste the JSON output from the ontology extraction Claude session to import entities and relationships into the knowledge graph." />
            </h3>
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
          {importResult ? (
            /* Success state */
            <div className="text-center py-8">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h4 className="text-lg font-semibold text-gray-900 mb-2">Import Complete</h4>
              <div className="text-sm text-gray-600 space-y-1">
                <p>Entities created: <span className="font-semibold text-green-700">{importResult.entities_created}</span></p>
                <p>Entities updated: <span className="font-semibold text-blue-700">{importResult.entities_updated}</span></p>
                <p>Relationships created: <span className="font-semibold text-green-700">{importResult.relationships_created}</span></p>
                <p>Relationships skipped: <span className="font-semibold text-gray-500">{importResult.relationships_skipped}</span></p>
              </div>
            </div>
          ) : step === 'paste' ? (
            /* Step 1: Paste JSON */
            <div>
              <textarea
                autoFocus
                value={rawJson}
                onChange={(e) => setRawJson(e.target.value)}
                placeholder='Paste the JSON output from the extraction Claude session here...'
                className="w-full min-h-[300px] font-mono text-sm border border-gray-300 rounded-lg p-4 focus:outline-none focus:ring-2 focus:ring-[#041E42]/20 resize-none"
              />
              {parseErrors.length > 0 && (
                <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-red-800 mb-1">Validation Errors:</p>
                  <ul className="text-xs text-red-700 space-y-1 list-disc list-inside">
                    {parseErrors.map((err, i) => <li key={i}>{err}</li>)}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            /* Step 2: Preview */
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex gap-4">
                <div className="flex-1 bg-blue-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-blue-700">{parsed.entities.length}</p>
                  <p className="text-xs text-blue-600">Entities</p>
                </div>
                <div className="flex-1 bg-purple-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-purple-700">{parsed.relationships.length}</p>
                  <p className="text-xs text-purple-600">Relationships</p>
                </div>
              </div>

              {/* Entities table */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Entities</h4>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">Type</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">Name</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">Confidence</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {parsed.entities.map((e, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-1.5 text-gray-600">{e.type}</td>
                          <td className="px-3 py-1.5 font-medium text-gray-900">{e.name}</td>
                          <td className="px-3 py-1.5">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
                              e.confidence === 'Confirmed' ? 'bg-green-100 text-green-700' :
                              e.confidence === 'Likely' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {e.confidence || 'Confirmed'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Relationships table */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Relationships</h4>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">Subject</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">Relationship</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">Object</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">Confidence</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {parsed.relationships.map((r, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-1.5 font-medium text-gray-900">{r.subject}</td>
                          <td className="px-3 py-1.5 text-purple-600 font-mono">{r.relationship_type}</td>
                          <td className="px-3 py-1.5 font-medium text-gray-900">{r.object}</td>
                          <td className="px-3 py-1.5">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
                              r.confidence === 'Confirmed' ? 'bg-green-100 text-green-700' :
                              r.confidence === 'Likely' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {r.confidence || 'Confirmed'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200">
          {importResult ? (
            <button
              onClick={handleDone}
              className="px-4 py-2 text-sm font-medium text-white bg-[#041E42] rounded-lg hover:bg-[#041E42]/90"
            >
              Done
            </button>
          ) : step === 'paste' ? (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleParse}
                disabled={!rawJson.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-[#041E42] rounded-lg hover:bg-[#041E42]/90 disabled:opacity-50"
              >
                Parse & Preview
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => { setStep('paste'); setParsed(null); setError(null) }}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={importing}
                className="px-4 py-2 text-sm font-medium text-white bg-[#041E42] rounded-lg hover:bg-[#041E42]/90 disabled:opacity-50"
              >
                {importing ? 'Importing...' : `Import ${parsed.entities.length} Entities & ${parsed.relationships.length} Relationships`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
