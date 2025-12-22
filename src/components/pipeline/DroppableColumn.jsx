import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'

function DroppableColumn({ stage, opportunities, children }) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
  })

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-72 rounded-lg p-4 transition-all duration-200 border border-[#E2E8F0] ${
        isOver ? 'bg-blue-50 ring-2 ring-blue-300' : 'bg-white'
      }`}
    >
      {/* Column header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-medium text-gray-700">{stage.name}</h2>
        <span className="bg-[#F1F5F9] px-2 py-0.5 rounded text-sm text-gray-500 font-medium">
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
