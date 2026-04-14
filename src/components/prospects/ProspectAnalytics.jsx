import { useState, useEffect } from 'react'

import GroupSummary from './charts/GroupSummary'
import CategoryBreakdown from './charts/CategoryBreakdown'
import GeographyMap from './charts/GeographyMap'
import SignalAnalysis from './charts/SignalAnalysis'
import ReadinessScorecard from './charts/ReadinessScorecard'
import OwnershipProfile from './charts/OwnershipProfile'

function ProspectAnalytics({ filters, onFilterChange }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)

    // Build query params from filters (multi-select: arrays joined as comma-separated)
    const params = new URLSearchParams({ action: 'analytics' })
    if (filters.group && filters.group.length > 0) params.set('outreach_group', filters.group.join(','))
    if (filters.category && filters.category.length > 0) params.set('category', filters.category.join(','))
    if (filters.geo && filters.geo.length > 0) params.set('corridor', filters.geo.join(','))
    if (filters.priority && filters.priority.length > 0) params.set('priority', filters.priority.join(','))
    if (filters.preset === 'medical') params.set('medical_device_mfg', 'Yes')

    fetch(`/api/prospects?${params}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(setData)
      .catch(err => {
        console.error('Error fetching prospect analytics:', err)
        setError(err.message)
      })
      .finally(() => setLoading(false))
  }, [filters])

  const handleGroupClick = (group) => {
    onFilterChange({ group: [group], category: [], priority: [], geo: [], status: [], search: '', preset: null })
  }

  const handleCategoryClick = (category) => {
    onFilterChange({ group: [], category: [category], priority: [], geo: [], status: [], search: '', preset: null })
  }

  const handleGeoClick = (geo) => {
    onFilterChange({ group: [], category: [], priority: [], geo: [geo], status: [], search: '', preset: null })
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">Error loading analytics: {error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 pb-20">
      <div className="grid grid-cols-12 gap-6">
        {/* Row 1: Group Summary Cards (full width) */}
        <div className="col-span-12">
          <GroupSummary
            groups={data?.groups}
            groupTopCompanies={data?.groupTopCompanies}
            loading={loading}
            onGroupClick={handleGroupClick}
          />
        </div>

        {/* Row 2: Category Breakdown (6 cols) + Geography (6 cols) */}
        <div className="col-span-12 lg:col-span-6">
          <CategoryBreakdown
            categories={data?.categories}
            loading={loading}
            onCategoryClick={handleCategoryClick}
          />
        </div>
        <div className="col-span-12 lg:col-span-6">
          <GeographyMap
            corridors={data?.corridors}
            loading={loading}
            onGeoClick={handleGeoClick}
          />
        </div>

        {/* Row 3: Signal Analysis (full width) */}
        <div className="col-span-12">
          <SignalAnalysis
            signals={data?.signals}
            loading={loading}
          />
        </div>

        {/* Row 4: Readiness Scorecard (6 cols) + Ownership Profile (6 cols) */}
        <div className="col-span-12 lg:col-span-6">
          <ReadinessScorecard
            readiness={data?.readiness}
            readinessGoldCompanies={data?.readinessGoldCompanies}
            loading={loading}
          />
        </div>
        <div className="col-span-12 lg:col-span-6">
          <OwnershipProfile
            ownership={data?.ownership}
            recentMA={data?.recentMA}
            loading={loading}
          />
        </div>
      </div>
    </div>
  )
}

export default ProspectAnalytics
