import { useState, useMemo, useEffect } from 'react'
import { Wrench } from 'lucide-react'
import { useAuth, authFetch } from '../../context/AuthContext'
import { US_STATES, OWNERSHIP_TYPES } from '../prospects/ProspectDetail'

// "Fill the Blanks" enrichment queue (Couch Mode Phase 3). Surfaces one
// missing high-value field at a time with an inline editor — perfect
// 30-second couch work. Saves go through the normal PATCH route, so priority
// score recalc and ontology rebuild happen server-side for free. Gap
// detection is entirely client-side over the prospects TodayView already
// fetched; rules are ordered by how much the missing field hurts.
const GAP_RULES = [
  {
    field: 'state',
    label: 'State',
    why: 'No state — invisible on the National Map and corridor analytics.',
    type: 'select',
    options: US_STATES,
    // Non-US rows keep free-text regions by design — only flag US/unknown.
    applies: p => !p.state && (!p.country || p.country === 'US'),
  },
  {
    field: 'category',
    label: 'Category',
    why: 'No category — excluded from category filters and charts.',
    type: 'text',
    placeholder: 'e.g. Converter, Mold Maker + Converter',
    applies: p => !p.category,
  },
  {
    field: 'ownership_type',
    label: 'Ownership type',
    why: 'Ownership unknown — PE/succession urgency can’t be scored (up to 15 pts).',
    type: 'select',
    options: OWNERSHIP_TYPES,
    applies: p => !p.ownership_type,
  },
  {
    field: 'press_count',
    label: 'Press count',
    why: 'No press count — Scale score falls back to employee data (25 pts dimension).',
    type: 'number',
    min: 0,
    max: 2000,
    applies: p => p.priority_score != null && p.press_count == null,
  },
  {
    field: 'employees_approx',
    label: 'Employees (approx)',
    why: 'No employee count — weakens the Scale dimension and the hover profile.',
    type: 'number',
    min: 1,
    max: 500000,
    applies: p => p.priority_score != null && p.employees_approx == null,
  },
  {
    field: 'year_founded',
    label: 'Year founded',
    why: 'No founding year — legacy/succession signals (30+ yrs) can’t trigger.',
    type: 'number',
    min: 1800,
    max: new Date().getFullYear(),
    applies: p => p.year_founded == null && p.years_in_business == null,
  },
]

// Higher-scored companies first within each rule; unscored last.
function byScoreDesc(a, b) {
  const as = a.priority_score ?? -1
  const bs = b.priority_score ?? -1
  return bs - as
}

function DataGapQueue({ prospects, onSaved, onOpenProspect }) {
  const { user } = useAuth()
  const [skipped, setSkipped] = useState(() => new Set()) // session-local `${id}:${field}`
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const queue = useMemo(() => {
    const items = []
    for (const rule of GAP_RULES) {
      const matches = prospects.filter(p => rule.applies(p) && !skipped.has(`${p.id}:${rule.field}`))
      matches.sort(byScoreDesc)
      for (const p of matches) items.push({ p, rule })
    }
    return items
  }, [prospects, skipped])

  const head = queue[0] || null
  const currentKey = head ? `${head.p.id}:${head.rule.field}` : null

  // Reset the editor whenever the head item changes — covers save, skip, and
  // any external prospects update, so a stale value never carries over to a
  // different company/field.
  useEffect(() => {
    setValue('')
    setError(null)
  }, [currentKey])

  if (!head) return null

  const { p, rule } = head

  const parsedValue = () => {
    if (rule.type === 'number') {
      const n = parseInt(value, 10)
      if (isNaN(n) || n < (rule.min ?? 0) || n > (rule.max ?? Infinity)) return undefined
      return n
    }
    return value.trim() || undefined
  }

  const handleSkip = () => {
    setSkipped(prev => new Set(prev).add(`${p.id}:${rule.field}`))
  }

  const handleSave = async () => {
    const parsed = parsedValue()
    if (parsed === undefined || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await authFetch(`/api/prospects?id=${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [rule.field]: parsed, last_edited_by: user?.name || 'Unknown' }),
      })
      if (!res.ok) throw new Error('Save failed')
      onSaved(p.id, rule.field, parsed) // parent updates its prospects state → item leaves the queue
    } catch {
      setError('Could not save — try again.')
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#041E42]/20 focus:border-[#041E42]'

  return (
    <div className="bg-white border border-gray-200 rounded-lg">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <Wrench className="w-4 h-4 text-[#041E42]" />
        <h2 className="text-sm font-semibold text-[#041E42]">Fill the Blanks</h2>
        <span className="text-xs font-semibold text-gray-400">{queue.length}</span>
        <span className="ml-auto text-[11px] text-gray-400">enrich one field at a time</span>
      </div>

      <div className="px-4 py-3">
        <button
          onClick={() => onOpenProspect(p.id)}
          className="text-sm font-medium text-[#041E42] hover:underline"
        >
          {p.company}
        </button>
        <p className="text-xs text-gray-500 mt-0.5">
          {[p.category, [p.city, p.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || '—'}
          {p.priority_score != null && ` · score ${p.priority_score}`}
        </p>
        <p className="text-xs text-gray-600 mt-2">{rule.why}</p>

        <div className="mt-2">
          <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1">{rule.label}</label>
          {rule.type === 'select' ? (
            <select value={value} onChange={e => setValue(e.target.value)} className={inputClass}>
              <option value="">— Select —</option>
              {rule.options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input
              type={rule.type === 'number' ? 'number' : 'text'}
              inputMode={rule.type === 'number' ? 'numeric' : undefined}
              min={rule.min}
              max={rule.max}
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              placeholder={rule.placeholder || ''}
              className={inputClass}
            />
          )}
        </div>

        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={handleSave}
            disabled={parsedValue() === undefined || saving}
            className="px-4 py-2 text-xs font-medium text-white bg-[#041E42] rounded-lg hover:bg-[#041E42]/90 disabled:opacity-40 transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={handleSkip}
            disabled={saving}
            className="px-4 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Skip
          </button>
          <span className="ml-auto text-[11px] text-gray-400">
            {queue.length - 1} more after this
          </span>
        </div>
      </div>
    </div>
  )
}

export default DataGapQueue
