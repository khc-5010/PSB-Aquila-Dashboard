import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'

const EXCEL_TO_DB = {
  'company': 'company',
  'also known as': 'also_known_as',
  'website': 'website',
  'category': 'category',
  'in-house tooling': 'in_house_tooling',
  'city': 'city',
  'state': 'state',
  'geography tier': 'geography_tier',
  'source report': 'source_report',
  'priority': 'priority',
  'employees (approx)': 'employees_approx',
  'year founded': 'year_founded',
  'years in business': 'years_in_business',
  'revenue known': 'revenue_known',
  'revenue est ($m)': 'revenue_est_m',
  'press count': 'press_count',
  'signal count': 'signal_count',
  'top signal': 'top_signal',
  'rjg cavity pressure': 'rjg_cavity_pressure',
  'medical device mfg': 'medical_device_mfg',
  'key certifications': 'key_certifications',
  'ownership type': 'ownership_type',
  'recent m&a': 'recent_ma',
  'parent company': 'parent_company',
  'decision location': 'decision_location',
  'cwp contacts': 'cwp_contacts',
  'psb connection notes': 'psb_connection_notes',
  'engagement type': 'engagement_type',
  'suggested next step': 'suggested_next_step',
  'legacy data potential': 'legacy_data_potential',
  'notes': 'notes',
}

// Fields that the server preserves via COALESCE — don't send in import payload
const PRESERVED_FIELDS = ['outreach_group', 'outreach_rank', 'group_notes', 'last_edited_by']

function cleanValue(val) {
  if (val === null || val === undefined) return null
  const s = String(val).trim()
  if (s === '' || s === 'N/A' || s === 'n/a' || s === '-') return null
  return s
}

function cleanInt(val) {
  const cleaned = cleanValue(val)
  if (cleaned === null) return null
  const n = parseInt(cleaned.replace(/,/g, ''), 10)
  return isNaN(n) ? null : n
}

function cleanNumeric(val) {
  const cleaned = cleanValue(val)
  if (cleaned === null) return null
  const n = parseFloat(cleaned.replace(/[,$]/g, ''))
  return isNaN(n) ? null : n
}

const INT_FIELDS = ['employees_approx', 'year_founded', 'years_in_business', 'press_count', 'signal_count', 'cwp_contacts']
const NUMERIC_FIELDS = ['revenue_est_m']

function parseRow(row, headerMap) {
  const prospect = {}
  for (const [colIdx, dbField] of Object.entries(headerMap)) {
    if (PRESERVED_FIELDS.includes(dbField)) continue
    const rawVal = row[parseInt(colIdx)]
    if (INT_FIELDS.includes(dbField)) {
      prospect[dbField] = cleanInt(rawVal)
    } else if (NUMERIC_FIELDS.includes(dbField)) {
      prospect[dbField] = cleanNumeric(rawVal)
    } else {
      prospect[dbField] = cleanValue(rawVal)
    }
  }
  return prospect
}

function BulkImportModal({ onClose, onSuccess }) {
  const fileRef = useRef(null)
  const [step, setStep] = useState('upload') // 'upload' | 'preview' | 'result'
  const [dragOver, setDragOver] = useState(false)
  const [parsed, setParsed] = useState([])
  const [skipped, setSkipped] = useState(0)
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  const processFile = (file) => {
    setError(null)
    setFileName(file.name)

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: 'array' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 })

        if (rows.length < 2) {
          setError('File appears to be empty or has no data rows.')
          return
        }

        // Build header map: column index -> db field name (case-insensitive)
        const headers = rows[0]
        const headerMap = {}
        headers.forEach((h, idx) => {
          if (!h) return
          const key = String(h).trim().toLowerCase()
          if (EXCEL_TO_DB[key]) {
            headerMap[idx] = EXCEL_TO_DB[key]
          }
        })

        if (!Object.values(headerMap).includes('company')) {
          setError('Could not find a "Company" column in the file. Check the header row.')
          return
        }

        // Parse data rows
        const dataRows = rows.slice(1)
        const prospects = []
        let skipCount = 0

        for (const row of dataRows) {
          const prospect = parseRow(row, headerMap)
          if (!prospect.company || !prospect.company.trim()) {
            skipCount++
            continue
          }
          prospects.push(prospect)
        }

        setParsed(prospects)
        setSkipped(skipCount)
        setStep('preview')
      } catch (err) {
        setError('Failed to parse file: ' + err.message)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  const handleImport = async () => {
    setImporting(true)
    setError(null)

    try {
      const res = await fetch('/api/prospects?action=import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospects: parsed }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }

      const data = await res.json()
      setResult(data)
      setStep('result')
    } catch (err) {
      setError(err.message)
    } finally {
      setImporting(false)
    }
  }

  const handleClose = () => {
    if (step === 'result') onSuccess()
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={handleClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0" style={{ backgroundColor: '#041E42' }}>
            <h2 className="text-lg font-semibold text-white">Bulk Import Companies</h2>
            <p className="text-sm text-white/70 mt-0.5">
              {step === 'upload' && 'Upload an Excel or CSV file'}
              {step === 'preview' && 'Review before importing'}
              {step === 'result' && 'Import complete'}
            </p>
          </div>

          {/* Content */}
          <div className="px-6 py-4 overflow-y-auto flex-1">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Step 1: Upload */}
            {step === 'upload' && (
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  dragOver ? 'border-[#041E42] bg-blue-50' : 'border-gray-300 hover:border-gray-400'
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                <svg className="w-10 h-10 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-sm text-gray-600 mb-2">Drag and drop your file here, or</p>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="px-4 py-2 text-sm font-medium text-white rounded-lg hover:opacity-90"
                  style={{ backgroundColor: '#041E42' }}
                >
                  Choose File
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <p className="text-xs text-gray-400 mt-3">Supports .xlsx, .xls, .csv</p>
              </div>
            )}

            {/* Step 2: Preview */}
            {step === 'preview' && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{fileName}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {parsed.length} companies found
                      {skipped > 0 && <span className="text-amber-600"> ({skipped} rows missing company name — will be skipped)</span>}
                    </p>
                  </div>
                </div>

                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">#</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Company</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Category</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">City</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">State</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Priority</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {parsed.slice(0, 15).map((p, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-1.5 text-xs text-gray-400">{i + 1}</td>
                          <td className="px-3 py-1.5 text-xs font-medium text-gray-900">{p.company}</td>
                          <td className="px-3 py-1.5 text-xs text-gray-600">{p.category || '\u2014'}</td>
                          <td className="px-3 py-1.5 text-xs text-gray-600">{p.city || '\u2014'}</td>
                          <td className="px-3 py-1.5 text-xs text-gray-600">{p.state || '\u2014'}</td>
                          <td className="px-3 py-1.5 text-xs text-gray-600">{p.priority || '\u2014'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parsed.length > 15 && (
                    <div className="px-3 py-2 bg-gray-50 text-xs text-gray-500 border-t">
                      ... and {parsed.length - 15} more
                    </div>
                  )}
                </div>

                <p className="text-xs text-gray-500 mt-3">
                  Existing companies (matched by name) will be updated. User-edited fields (group, rank, notes) are preserved.
                </p>
              </>
            )}

            {/* Step 3: Result */}
            {step === 'result' && result && (
              <div className="text-center py-6">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-green-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-lg font-medium text-gray-900">Import Complete</p>
                <p className="text-sm text-gray-600 mt-1">
                  {result.upserted ?? result.count ?? parsed.length} companies added/updated
                  {skipped > 0 && `, ${skipped} skipped`}
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex-shrink-0 rounded-b-lg flex justify-between">
            {step === 'preview' && (
              <button
                onClick={() => { setStep('upload'); setParsed([]); setSkipped(0); setFileName(''); setError(null) }}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800"
              >
                Back
              </button>
            )}
            {step !== 'preview' && <div />}

            <div className="flex gap-3">
              <button onClick={handleClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                {step === 'result' ? 'Close' : 'Cancel'}
              </button>
              {step === 'preview' && (
                <button
                  onClick={handleImport}
                  disabled={importing || parsed.length === 0}
                  className="px-4 py-2 text-sm font-medium text-white rounded-lg hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: '#041E42' }}
                >
                  {importing ? 'Importing...' : `Import ${parsed.length} Companies`}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default BulkImportModal
