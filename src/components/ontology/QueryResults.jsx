import { ArrowLeft, Users, MapPin } from 'lucide-react'

export default function QueryResults({ results, similarData, onFindSimilar, onBackFromSimilar, loading }) {
  // Similar companies view
  if (similarData) {
    return (
      <div className="px-3 py-2">
        <button
          onClick={onBackFromSimilar}
          className="flex items-center gap-1 text-xs text-[#041E42] hover:underline mb-2"
        >
          <ArrowLeft className="w-3 h-3" />
          Back to results
        </button>
        <h4 className="text-xs font-semibold text-gray-800 mb-1">
          Companies similar to {similarData.sourceCompany}
        </h4>
        {similarData.target && (
          <p className="text-[11px] text-gray-500 mb-2">
            Based on shared certifications, technologies, and market verticals
          </p>
        )}
        {similarData.similar?.length > 0 ? (
          <div className="space-y-1.5">
            {similarData.similar.map((company, i) => (
              <CompanyCard
                key={company.prospect_id || company.id || i}
                company={company}
                isSimilar
              />
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-400 py-4 text-center">No similar companies found</p>
        )}
      </div>
    )
  }

  // No query run yet
  if (!results && !loading) {
    return (
      <div className="px-3 py-6 text-center">
        <p className="text-xs text-gray-400">Select filters and click "Find Companies" to search</p>
      </div>
    )
  }

  // Loading
  if (loading) {
    return (
      <div className="px-3 py-6 flex justify-center">
        <div className="w-5 h-5 border-2 border-gray-300 border-t-[#041E42] rounded-full animate-spin" />
      </div>
    )
  }

  // Results
  const companies = results?.results || []

  return (
    <div className="px-3 py-2">
      <p className="text-xs font-medium text-gray-600 mb-2">
        {companies.length} {companies.length === 1 ? 'company matches' : 'companies match'}
      </p>
      {companies.length > 0 ? (
        <div className="space-y-1.5">
          {companies.map((company, i) => (
            <CompanyCard
              key={company.prospect_id || company.id || i}
              company={company}
              onFindSimilar={onFindSimilar}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400 py-4 text-center">No companies match your criteria</p>
      )}
    </div>
  )
}

function CompanyCard({ company, onFindSimilar, isSimilar }) {
  // ontology-query returns matchCount / totalCriteria (+ matchScore as a 0-1
  // fraction); ontology-similar returns sharedEdges (count), similarity (0-1),
  // and sharedEntities[]. Earlier code rendered "0.67/?" (maxScore doesn't
  // exist) and showed the 0-1 similarity fraction as "N shared".
  const hookLine = buildHookLine(company)
  const matchBadge = !isSimilar && company.matchCount != null
    ? `${company.matchCount} of ${company.totalCriteria ?? '?'} criteria`
    : (!isSimilar && company.matchScore != null ? `${Math.round(company.matchScore * 100)}% match` : null)
  const sharedCount = company.sharedEdges ?? company.shared_count
  const similarityPct = company.similarity != null ? Math.round(company.similarity * 100) : null
  // Explanation tags: matchedEdges (query results) or sharedEntities (similar)
  const tags = (isSimilar ? company.sharedEntities : company.matchedEdges) || []

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h5 className="text-xs font-semibold text-gray-900 truncate">
            {company.company || company.company_name}
          </h5>
          {company.state && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-500 mt-0.5">
              <MapPin className="w-2.5 h-2.5" />
              {company.city ? `${company.city}, ` : ''}{company.state}
            </span>
          )}
        </div>
        {matchBadge && (
          <span className="shrink-0 bg-[#041E42] text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium">
            {matchBadge}
          </span>
        )}
        {isSimilar && sharedCount != null && (
          <span
            className="shrink-0 bg-purple-100 text-purple-700 text-[10px] px-1.5 py-0.5 rounded-full font-medium"
            title={similarityPct != null ? `${similarityPct}% of the source company's ontology edges` : undefined}
          >
            {sharedCount} shared{similarityPct != null ? ` · ${similarityPct}%` : ''}
          </span>
        )}
      </div>
      {hookLine && (
        <p className="text-[10px] text-gray-500 italic mt-1 line-clamp-2">{hookLine}</p>
      )}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {tags.slice(0, 6).map((edge, i) => (
            <span key={i} className="bg-blue-50 text-blue-700 text-[10px] px-1.5 py-0.5 rounded">
              {typeof edge === 'string' ? edge : (edge.label || edge.object_name)}
            </span>
          ))}
          {tags.length > 6 && (
            <span className="text-[10px] text-gray-400">+{tags.length - 6}</span>
          )}
        </div>
      )}
      {!isSimilar && onFindSimilar && (
        <button
          onClick={() => onFindSimilar(company.prospect_id || company.id, company.company || company.company_name)}
          className="mt-1.5 flex items-center gap-1 text-[10px] text-[#041E42] hover:underline"
        >
          <Users className="w-2.5 h-2.5" />
          Find similar companies
        </button>
      )}
    </div>
  )
}

// Company facts only — the matched/shared entities render as tags below, so
// repeating them here just duplicated the same labels twice per card.
function buildHookLine(company) {
  const parts = []
  if (company.category) parts.push(company.category)
  if (company.ownership_type) parts.push(company.ownership_type)
  return parts.join(' · ')
}
