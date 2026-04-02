import { useState, useEffect } from 'react'
import InfoTooltip from './InfoTooltip'

function OntologySummary({ stateCode }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!stateCode) return
    setLoading(true)
    setData(null)
    fetch(`/api/prospects?action=ontology-state-summary&state=${stateCode}`)
      .then(res => res.ok ? res.json() : null)
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [stateCode])

  if (loading) {
    return (
      <div className="px-5 py-4">
        <div className="flex items-center gap-1.5">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Ontology Summary</h3>
          <InfoTooltip text="Knowledge graph entities and relationships auto-derived from prospect data. Shows what certifications, technologies, and ownership patterns exist in this state's prospect pipeline." />
        </div>
        <div className="flex items-center justify-center py-6">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-[#041E42] rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  const isEmpty = !data ||
    (!data.top_certifications?.length &&
     !data.top_technologies?.length &&
     !data.ownership_breakdown?.length &&
     !data.companies_with_medical)

  if (isEmpty) {
    return (
      <div className="px-5 py-4">
        <div className="flex items-center gap-1.5 mb-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Ontology Summary</h3>
          <InfoTooltip text="Knowledge graph entities and relationships auto-derived from prospect data. Shows what certifications, technologies, and ownership patterns exist in this state's prospect pipeline." />
        </div>
        <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
          <svg className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <div>
            <p className="text-sm text-gray-500">Ontology data not yet generated.</p>
            <p className="text-xs text-gray-400 mt-0.5">An admin can trigger Layer 1 derivation from the settings.</p>
          </div>
        </div>
      </div>
    )
  }

  // Find max count for bar scaling
  const maxCertCount = data.top_certifications?.length > 0
    ? Math.max(...data.top_certifications.map(c => c.count))
    : 1

  return (
    <div className="px-5 py-4">
      <p className="text-xs text-gray-400 mb-1">Certifications, technologies, and ownership patterns from the knowledge graph</p>
      <div className="flex items-center gap-1.5 mb-3">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Ontology Summary</h3>
        <InfoTooltip text="Knowledge graph entities and relationships auto-derived from prospect data. Shows what certifications, technologies, and ownership patterns exist in this state's prospect pipeline." />
      </div>

      {/* Certification Landscape */}
      {data.top_certifications?.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-2">
            <p className="text-xs font-medium text-gray-600">Certification Landscape</p>
            <InfoTooltip text="Certifications held by companies in this state, derived from prospect key_certifications field." />
          </div>
          <div className="space-y-1.5">
            {data.top_certifications.slice(0, 5).map(cert => (
              <div key={cert.name} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs text-gray-700 truncate">{cert.name}</span>
                    <span className="text-xs font-medium text-[#041E42] ml-2 flex-shrink-0">{cert.count}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#2563EB] rounded-full transition-all"
                      style={{ width: `${(cert.count / maxCertCount) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Technology Signals */}
      {data.top_technologies?.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-2">
            <p className="text-xs font-medium text-gray-600">Technology Signals</p>
            <InfoTooltip text="Technologies detected from structured prospect fields. Currently includes RJG cavity pressure monitoring; more will be added in Layer 2." />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.top_technologies.map(tech => (
              <span
                key={tech.name}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-emerald-50 text-emerald-700 border border-emerald-200"
              >
                {tech.name}
                <span className="font-medium">{tech.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Ownership Mix */}
      {data.ownership_breakdown?.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-2">
            <p className="text-xs font-medium text-gray-600">Ownership Mix</p>
            <InfoTooltip text="Governance and capital structure breakdown of prospect companies in this state." />
          </div>
          <div className="space-y-1">
            {data.ownership_breakdown.map(own => (
              <div key={own.name} className="flex items-center justify-between">
                <span className="text-xs text-gray-600">{own.name}</span>
                <span className="text-xs font-medium text-[#041E42]">{own.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Medical + RJG quick stats */}
      {(data.companies_with_medical > 0 || data.companies_with_rjg > 0) && (
        <div className="flex gap-3">
          {data.companies_with_medical > 0 && (
            <div className="flex-1 px-3 py-2 bg-purple-50 border border-purple-100 rounded-lg">
              <p className="text-lg font-bold text-purple-700">{data.companies_with_medical}</p>
              <p className="text-xs text-purple-600">Medical Device Mfg</p>
            </div>
          )}
          {data.companies_with_rjg > 0 && (
            <div className="flex-1 px-3 py-2 bg-amber-50 border border-amber-100 rounded-lg">
              <p className="text-lg font-bold text-amber-700">{data.companies_with_rjg}</p>
              <p className="text-xs text-amber-600">RJG Technology</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default OntologySummary
