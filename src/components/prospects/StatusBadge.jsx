const STATUS_CONFIG = {
  'Identified':        { color: 'bg-gray-100 text-gray-600' },
  'Prioritized':       { color: 'bg-blue-100 text-blue-700' },
  'Research Complete':  { color: 'bg-amber-100 text-amber-700' },
  'Outreach Ready':    { color: 'bg-green-100 text-green-700' },
  'Converted':         { color: 'bg-purple-100 text-purple-700' },
  'Nurture':           { color: 'bg-gray-100 text-gray-500 italic' },
}

function StatusBadge({ status }) {
  const label = status || 'Identified'
  const config = STATUS_CONFIG[label] || STATUS_CONFIG['Identified']

  return (
    <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${config.color}`}>
      {label}
    </span>
  )
}

export default StatusBadge
