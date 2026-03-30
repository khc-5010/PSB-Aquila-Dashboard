import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { PIPELINE_STAGES } from '../../constants/pipeline'

// Build column colors from pipeline stages
const columnColors = {}
PIPELINE_STAGES.forEach(stage => {
  columnColors[stage.key] = {
    accent: stage.color,
    bg: '#F8FAFC',
    text: 'text-gray-700',
    countBg: 'bg-white/80',
    countText: 'text-gray-600',
    border: 'border-gray-200',
    hoverRing: `ring-2`,
    hoverBg: '#F1F5F9',
    isDark: false,
  }
})

const defaultColors = {
  accent: '#94A3B8',
  bg: '#F8FAFC',
  text: 'text-gray-700',
  countBg: 'bg-white/80',
  countText: 'text-gray-600',
  border: 'border-gray-200',
  hoverRing: 'ring-2',
  hoverBg: '#F1F5F9',
  isDark: false,
}

function DroppableColumn({ stage, opportunities, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key })
  const [showTooltip, setShowTooltip] = useState(false)

  const colors = columnColors[stage.key] || defaultColors
  const stageInfo = PIPELINE_STAGES.find(s => s.key === stage.key)

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-72 rounded-lg p-4 transition-all duration-200 border ${colors.border} ${
        isOver ? 'ring-2 ring-blue-400 shadow-md' : ''
      }`}
      style={{ backgroundColor: isOver ? colors.hoverBg : colors.bg }}
    >
      {/* Column header */}
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stageInfo?.color || '#94A3B8' }} />
            <h2 className={`font-semibold text-sm ${colors.text}`}>{stage.label}</h2>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`${colors.countBg} px-2 py-0.5 rounded-full text-xs ${colors.countText} font-medium`}>
              {opportunities.length}
            </span>
            {stageInfo?.timeline && (
              <div className="relative">
                <button
                  onMouseEnter={() => setShowTooltip(true)}
                  onMouseLeave={() => setShowTooltip(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
                {showTooltip && (
                  <div className="absolute right-0 top-6 z-20 w-56 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-lg">
                    <p className="font-medium mb-1">{stageInfo.description}</p>
                    <p className="text-gray-300 mt-2">
                      <span className="font-medium text-white">Gate:</span> {stageInfo.gate}
                    </p>
                    <p className="text-gray-300 mt-1">
                      <span className="font-medium text-white">Timeline:</span> {stageInfo.timeline}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cards container with sortable context */}
      <SortableContext
        items={opportunities.map(o => o.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-3 min-h-[200px]">
          {children}
        </div>
      </SortableContext>
    </div>
  )
}

export default DroppableColumn
export { columnColors, defaultColors }
