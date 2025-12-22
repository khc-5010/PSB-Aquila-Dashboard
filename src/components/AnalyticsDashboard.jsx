import { useState, useEffect } from 'react'
import KPIBar from './analytics/KPIBar'
import PipelineValueChart from './analytics/PipelineValueChart'
import OwnerWorkload from './analytics/OwnerWorkload'
import ConversionFunnel from './analytics/ConversionFunnel'
import ProjectTypeMix from './analytics/ProjectTypeMix'
import AgingReport from './analytics/AgingReport'
import LeadSources from './analytics/LeadSources'
import ActivityHeatmap from './analytics/ActivityHeatmap'
import WinRateChart from './analytics/WinRateChart'
import DeadlineCalendar from './analytics/DeadlineCalendar'
import CycleTimeTrends from './analytics/CycleTimeTrends'

function AnalyticsDashboard() {
  const [dateRange, setDateRange] = useState('90')
  const [refreshKey, setRefreshKey] = useState(0)

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1)
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Date Range Selector */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-600">Date Range:</label>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="30">Last 30 Days</option>
              <option value="90">Last 90 Days</option>
              <option value="180">Last 180 Days</option>
              <option value="365">Last Year</option>
            </select>
          </div>
          <button
            onClick={handleRefresh}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Summary Bar */}
      <KPIBar key={`kpi-${refreshKey}`} />

      {/* Dashboard Grid */}
      <div className="p-6">
        <div className="grid grid-cols-12 gap-6">
          {/* Row 1: Pipeline Value (8 cols) + Owner Workload (4 cols) */}
          <div className="col-span-12 lg:col-span-8">
            <PipelineValueChart key={`pipeline-${refreshKey}`} />
          </div>
          <div className="col-span-12 lg:col-span-4">
            <OwnerWorkload key={`workload-${refreshKey}`} />
          </div>

          {/* Row 2: Conversion Funnel (6 cols) + Project Type Mix (6 cols) */}
          <div className="col-span-12 lg:col-span-6">
            <ConversionFunnel key={`funnel-${refreshKey}`} />
          </div>
          <div className="col-span-12 lg:col-span-6">
            <ProjectTypeMix key={`types-${refreshKey}`} />
          </div>

          {/* Row 3: Aging Report (6 cols) + Lead Sources (6 cols) */}
          <div className="col-span-12 lg:col-span-6">
            <AgingReport key={`aging-${refreshKey}`} />
          </div>
          <div className="col-span-12 lg:col-span-6">
            <LeadSources key={`sources-${refreshKey}`} />
          </div>

          {/* Row 4: Activity Heatmap (8 cols) + Win Rate (4 cols) */}
          <div className="col-span-12 lg:col-span-8">
            <ActivityHeatmap key={`heatmap-${refreshKey}`} />
          </div>
          <div className="col-span-12 lg:col-span-4">
            <WinRateChart key={`winrate-${refreshKey}`} />
          </div>

          {/* Row 5: Deadline Calendar (full width) */}
          <div className="col-span-12">
            <DeadlineCalendar key={`deadlines-${refreshKey}`} />
          </div>

          {/* Row 6: Cycle Time Trends (6 cols) */}
          <div className="col-span-12 lg:col-span-6">
            <CycleTimeTrends key={`cycle-${refreshKey}`} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default AnalyticsDashboard
