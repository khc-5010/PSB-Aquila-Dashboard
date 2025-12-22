import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'

// Column color configuration for visual progression (light to dark)
const columnColors = {
  lead: {
    bg: '#f0f4f8',
    text: 'text-gray-700',
    countBg: 'bg-white/50',
    countText: 'text-gray-500',
    border: 'border-[#E2E8F0]',
    hoverRing: 'ring-blue-300',
    hoverBg: '#e3e8ed',
    isDark: false,
  },
  qualified: {
    bg: '#d9e2ec',
    text: 'text-gray-700',
    countBg: 'bg-white/50',
    countText: 'text-gray-500',
    border: 'border-[#c5d1de]',
    hoverRing: 'ring-blue-300',
    hoverBg: '#ccd6e2',
    isDark: false,
  },
  proposal: {
    bg: '#bcccdc',
    text: 'text-gray-700',
    countBg: 'bg-white/50',
    countText: 'text-gray-600',
    border: 'border-[#a8baca]',
    hoverRing: 'ring-blue-400',
    hoverBg: '#afc0d1',
    isDark: false,
  },
  negotiation: {
    bg: '#9fb3c8',
    text: 'text-gray-700',
    countBg: 'bg-white/40',
    countText: 'text-gray-600',
    border: 'border-[#8ba3b9]',
    hoverRing: 'ring-blue-400',
    hoverBg: '#92a7bd',
    isDark: false,
  },
  active: {
    bg: '#627d98',
    text: 'text-white',
    countBg: 'bg-white/20',
    countText: 'text-white',
    border: 'border-[#4a6a85]',
    hoverRing: 'ring-blue-200',
    hoverBg: '#5a7590',
    isDark: true,
  },
  complete: {
    bg: '#334e68',
    text: 'text-white',
    countBg: 'bg-white/20',
    countText: 'text-white',
    border: 'border-[#243b53]',
    hoverRing: 'ring-blue-200',
    hoverBg: '#3d5a76',
    isDark: true,
  },
}

// Default colors for any unknown stages
const defaultColors = {
  bg: '#f0f4f8',
  text: 'text-gray-700',
  countBg: 'bg-white/50',
  countText: 'text-gray-500',
  border: 'border-[#E2E8F0]',
  hoverRing: 'ring-blue-300',
  hoverBg: '#e3e8ed',
  isDark: false,
}

function DroppableColumn({ stage, opportunities, children }) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
  })

  // Get color configuration for this stage
  const colors = columnColors[stage.id] || defaultColors

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-72 rounded-lg p-4 transition-all duration-200 border ${colors.border} ${
        isOver ? `ring-2 ${colors.hoverRing}` : ''
      }`}
      style={{ backgroundColor: isOver ? colors.hoverBg : colors.bg }}
    >
      {/* Column header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className={`font-medium ${colors.text}`}>{stage.name}</h2>
        <span className={`${colors.countBg} px-2 py-0.5 rounded text-sm ${colors.countText} font-medium`}>
          {opportunities.length}
        </span>
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
