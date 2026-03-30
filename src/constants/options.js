// Legacy constants - kept for backward compatibility with OpportunityDetail/EditOpportunityModal
// New pipeline code should use src/constants/pipeline.js instead

export const PROJECT_TYPES = [
  { value: 'Pilot Project', label: 'Pilot Project' },
  { value: 'Research Agreement', label: 'Research Agreement' },
  { value: 'Senior Design', label: 'Senior Design' },
  { value: 'Strategic Membership', label: 'Strategic Membership' },
]

export const getProjectTypeLabel = (value) => {
  const type = PROJECT_TYPES.find(t => t.value === value)
  return type ? type.label : value || 'TBD'
}

export const getStageLabel = (value) => {
  const stage = STAGES.find(s => s.id === value)
  return stage ? stage.name : value
}

export const STAGES = [
  { id: 'channel_routing', name: 'Channel Routing' },
  { id: 'client_readiness', name: 'Client Readiness' },
  { id: 'project_setup', name: 'Project Setup' },
  { id: 'active', name: 'Active' },
  { id: 'complete', name: 'Complete' },
]

export const OWNERS = ['Kyle', 'Duane', 'Steve', 'Brett']
