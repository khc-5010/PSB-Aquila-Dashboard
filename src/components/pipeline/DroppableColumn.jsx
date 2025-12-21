import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'

function DroppableColumn({ stage, opportunities, children }) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
  })

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-72 rounded-lg p-4 transition-colors ${
        isOver ? 'bg-blue-100 ring-2 ring-blue-400' : stage.color
      }`}
    >
      {/* Column header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-700">{stage.name}</h2>
        <span className="bg-white px-2 py-0.5 rounded text-sm text-gray-500">
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
