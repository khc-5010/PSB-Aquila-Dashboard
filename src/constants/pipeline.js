export const PIPELINE_STAGES = [
  {
    key: 'channel_routing',
    label: 'Channel Routing',
    description: 'Discovery meeting, determine project type and fit',
    gate: 'Channel selected, stakeholders notified per communication matrix',
    timeline: '2-4 weeks',
    color: '#0891B2',
  },
  {
    key: 'client_readiness',
    label: 'Client Readiness',
    description: 'Client completes AI Readiness Modules — governance, data prep, internal alignment',
    gate: 'Client passes readiness checklist',
    timeline: '4-8 weeks',
    color: '#D97706',
  },
  {
    key: 'project_setup',
    label: 'Project Setup',
    description: 'SOW development, faculty matching, contract processing',
    gate: 'SOW signed, faculty/students assigned',
    timeline: '4-8 weeks',
    color: '#7C3AED',
  },
  {
    key: 'active',
    label: 'Active',
    description: 'Project executing, solution scaling',
    gate: 'Solution validated, data contributed to ontology',
    timeline: '6-18 months',
    color: '#059669',
  },
  {
    key: 'complete',
    label: 'Complete',
    description: 'Project delivered, marketplace listing approved',
    gate: 'Deliverables accepted, relationship preserved',
    timeline: '',
    color: '#6B7280',
  },
]

export const PROJECT_TYPES = [
  { value: 'Pilot Project', label: 'Pilot Project', lead: 'Aquila-Led' },
  { value: 'Research Agreement', label: 'Research Agreement', lead: 'Faculty-Led' },
  { value: 'Senior Design', label: 'Senior Design', lead: 'Student-Led' },
  { value: 'Strategic Membership', label: 'Strategic Membership', lead: 'Partner Access' },
]

export const getProjectTypeLabel = (value) => {
  const type = PROJECT_TYPES.find(t => t.value === value)
  return type ? type.label : value || 'TBD'
}

export const getProjectTypeLead = (value) => {
  const type = PROJECT_TYPES.find(t => t.value === value)
  return type ? type.lead : null
}

export const getStageLabel = (key) => {
  const stage = PIPELINE_STAGES.find(s => s.key === key)
  return stage ? stage.label : key
}
