import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import OpportunityCard from './OpportunityCard'

function SortableOpportunityCard({ opportunity, onClick }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: opportunity.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <OpportunityCard
        opportunity={opportunity}
        onClick={onClick}
        isDragging={isDragging}
      />
    </div>
  )
}

export default SortableOpportunityCard
