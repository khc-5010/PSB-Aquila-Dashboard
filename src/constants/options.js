export const PROJECT_TYPES = [
  { value: 'tbd', label: 'TBD' },
  { value: 'research', label: 'Research Agreement' },
  { value: 'senior_design', label: 'Senior Design' },
  { value: 'consulting', label: 'Consulting Engagement' },
  { value: 'workforce', label: 'Workforce Training' },
  { value: 'membership', label: 'Alliance Membership' },
  { value: 'does_not_fit', label: 'Does Not Fit' },
]

// Helper to get label from value
export const getProjectTypeLabel = (value) => {
  const type = PROJECT_TYPES.find(t => t.value === value)
  return type ? type.label : value
}

// Helper to get stage label from value
export const getStageLabel = (value) => {
  const stage = STAGES.find(s => s.id === value)
  return stage ? stage.name : value
}

export const STAGES = [
  { id: 'lead', name: 'Lead' },
  { id: 'qualified', name: 'Qualified' },
  { id: 'proposal', name: 'Proposal' },
  { id: 'negotiation', name: 'Negotiation' },
  { id: 'active', name: 'Active' },
  { id: 'complete', name: 'Complete' },
]

export const OWNERS = ['Kyle', 'Duane', 'Steve']
